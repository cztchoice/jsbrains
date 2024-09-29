import { create_hash } from "./utils/create_hash.js";
import { SmartEntity } from "smart-entities";
import { sort_by_score } from "smart-entities/utils/sort_by_score.js";

export class SmartSource extends SmartEntity {
  static get defaults() {
    return {
      data: {
        history: [], // array of { mtime, hash, length, blocks[] }
      },
      _embed_input: null, // stored temporarily
      _queue_load: true,
    };
  }
  // moved logic from SmartSources import() method
  queue_import() { this._queue_import = true; }
  async import(){
    this._queue_import = false;
    try{
      if(this.file.stat.size > 1000000) {
        console.log(`Smart Connections: Skipping large file: ${this.data.path}`);
        return;
      }
      // if this.loaded_at more than 5 minutes ago
      if(this.loaded_at && Date.now() - this.loaded_at > 3 * 60 * 1000){
        const ajson_file_stat = await this.env.data_fs.stat(this.data_path);
        if(ajson_file_stat.mtime > (this.loaded_at + 3 * 60 * 1000)){
          console.warn(`Smart Connections: Re-loading data source for ${this.data.path} because it has been updated on disk`);
          return await this.load();
        }
      }
      const content = await this.read();
      if(this.block_collection) {
        await this.block_collection.create(content);
      }
      await this.parse_content();
      this.queue_embed();
    }catch(err){
      this.queue_import();
      console.error(err, err.stack);
    }
  }
  async parse_content() {
    const hash = await create_hash(content); // update hash
    const file_stat = await this.fs.stat(this.data.path);
    if (hash !== this.last_history?.hash) {
      if(!this.last_history) this.data.history = [];
      this.data.history.push({
        blocks: {},
        mtime: file_stat.mtime,
        size: file_stat.size,
        hash
      }); // add history entry
      this.data.embeddings = {}; // clear embeddings
      this._queue_embed = true;
    } else {
      this.last_history.mtime = file_stat.mtime; // update mtime
      this.last_history.size = file_stat.size; // update size
      if(!this.last_history.blocks) this.last_history.blocks = {};
    }
    const { blocks, outlinks } = await this.smart_chunks.parse(this);
    this.data.outlinks = outlinks;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const item = await this.env.smart_blocks.create_or_update(block);
      this.last_history.blocks[item.key] = true;
    }
    // remove blocks not in last_history.blocks
    const block_keys = Object.keys(this.last_history.blocks);
    Object.values(this.env.smart_blocks.items).forEach(block => {
      if(block.key.startsWith(this.key) && !block_keys.includes(block.key)) {
        delete this.env.smart_blocks.items[block.key];
      }
    });
  }
  find_connections(opts={}) {
    let connections = super.find_connections(opts);
    const {limit = 50} = this.filter_opts; // super modifies opts and sets this.find_connections_opts
    if(!opts.exclude_blocks_from_source_connections) {
      const vec_to_use = this.vec;
      
      if (vec_to_use) {
        const cache_key = this.key + JSON.stringify(opts) + "_blocks";
        if(!this.env.connections_cache[cache_key]){
          const nearest = this.env.smart_blocks.nearest(vec_to_use, this.filter_opts)
          nearest.sort(sort_by_score)
          this.env.connections_cache[cache_key] = nearest.slice(0, limit);
        }
        connections = [
          ...connections,
          ...this.env.connections_cache[cache_key],
        ].sort(sort_by_score).slice(0, limit);
      }
    }
    return connections;
  }
  async get_embed_input() {
    if (typeof this._embed_input === 'string' && this._embed_input.length) return this._embed_input; // return cached (temporary) input
    let content = await this.read(); // get content from file
    if(this.excluded_lines.length){
      const content_lines = content.split("\n");
      this.excluded_lines.forEach(lines => {
        const {start, end} = lines;
        for(let i = start; i <= end; i++){
          content_lines[i] = "";
        }
      });
      content = content_lines.filter(line => line.length).join("\n");
    }
    const breadcrumbs = this.data.path.split("/").join(" > ").replace(".md", "");
    const max_tokens = this.collection.smart_embed.max_tokens; // prevent loading too much content
    this._embed_input = `${breadcrumbs}:\n${content}`.substring(0, max_tokens * 4);
    return this._embed_input;
  }
  open() { this.env.smart_connections_plugin.open_note(this.data.path); }
  get_block_by_line(line) { return this.blocks.find(block => block.data.lines[0] <= line && block.data.lines[1] >= line); }
  /**
   * Checks if the source file exists in the file system.
   * @returns {Promise<boolean>} A promise that resolves to true if the file exists, false otherwise.
   */
  async has_source_file() { return await this.fs.exists(this.data.path); }

  // CRUD

  /**
   * FILTER/SEARCH METHODS
   */
  /**
   * Searches for keywords within the entity's data and content.
   * @param {Object} search_filter - The search filter object.
   * @param {string[]} search_filter.keywords - An array of keywords to search for.
   * @param {string} [search_filter.type='any'] - The type of search to perform. 'any' counts all matching keywords, 'all' counts only if all keywords match.
   * @returns {Promise<number>} A promise that resolves to the number of matching keywords.
   */
  async search(search_filter = {}) {
    const { keywords, type = 'any', limit } = search_filter;
    if (!keywords || !Array.isArray(keywords)) {
      console.warn("Entity.search: keywords not set or is not an array");
      return 0;
    }
    if(limit && this.collection.search_results_ct >= limit) return 0;
    const lowercased_keywords = keywords.map(keyword => keyword.toLowerCase());
    const content = await this.read();
    const lowercased_content = content.toLowerCase();
    const lowercased_path = this.data.path.toLowerCase();

    const matching_keywords = lowercased_keywords.filter(keyword => 
      lowercased_path.includes(keyword) || lowercased_content.includes(keyword)
    );

    if (type === 'all') {
      return matching_keywords.length === lowercased_keywords.length ? matching_keywords.length : 0;
    } else {
      return matching_keywords.length;
    }
  }

  /**
   * ADAPTER METHODS
   */
  /**
   * Appends content to the end of the source file.
   * @param {string} content - The content to append to the file.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async append(content) {
    await this.source_adapter.append(content);
    await this.parse_content();
  }

  /**
   * Updates the entire content of the source file.
   * @param {string} full_content - The new content to write to the file.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async update(full_content, opts = {}) {
    try {
      // console.log('Updating source:', this.data.path);
      await this.source_adapter.update(full_content, opts);
      // await this.parse_content();
      await this.import(); // also queues embed
      // console.log('Update completed');
    } catch (error) {
      console.error('Error during update:', error);
      throw error;
    }
  }
  // Add these underscore methods back
  async _update(content) {
    await this.source_adapter._update(content);
  }

  /**
   * Reads the entire content of the source file.
   * @returns {Promise<string>} A promise that resolves with the content of the file.
   */
  async read(opts = {}) {
    try {
      // console.log('Reading source:', this.data.path);
      const content = await this.source_adapter.read(opts);
      // console.log('Read completed');
      return content;
    } catch (error) {
      console.error('Error during read:', error);
      throw error;
    }
  }
  async _read() {
    return await this.source_adapter._read();
  }

  /**
   * Removes the source file from the file system and deletes the entity.
   * This is different from delete() because it also removes the source file.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async remove() {
    try {
      // console.log('Removing source:', this.data.path);
      await this.source_adapter.remove();
      // console.log('Remove completed');
    } catch (error) {
      console.error('Error during remove:', error);
      throw error;
    }
  }
  async destroy() { await this.remove(); }

  /**
   * Moves the current source to a new location.
   * Handles the destination as a string (new path) or entity (block or source).
   * 
   * @param {string|Object|SmartEntity} entity_ref - The destination path or entity to move to.
   * @throws {Error} If the entity reference is invalid.
   * @returns {Promise<void>} A promise that resolves when the move operation is complete.
   */
  async move_to(entity_ref) {
    try {
      // Log moving source
      await this.source_adapter.move_to(entity_ref);
      // Log move completion
    } catch (error) {
      console.error('error_during_move:', error);
      throw error;
    }
  }

  /**
   * Merges the given content into the current source.
   * Parses the content into blocks and either appends to existing blocks, replaces blocks, or replaces all content.
   * 
   * @param {string} content - The content to merge into the current source.
   * @param {Object} opts - Options object.
   * @param {string} opts.mode - The merge mode: 'append', 'replace_blocks', or 'replace_all'. Default is 'append'.
   * @returns {Promise<void>}
   */
  async merge(content, opts = {}) {
    try {
      // console.log('Merging content into source:', this.data.path);
      await this.source_adapter.merge(content, opts);
      await this.parse_content();
      // console.log('Merge completed');
    } catch (error) {
      console.error('Error during merge:', error);
      throw error;
    }
  }
  // SUBCLASS OVERRIDES
  async save() {
    if(this.deleted) return await super.save();
    const blocks_to_save = this.blocks.filter(block => block._queue_save);
    const ajson = [
      super.ajson,
      ...blocks_to_save.map(block => block.ajson).filter(ajson => ajson),
    ].join("\n");
    // console.log({ajson});
    await super.save(ajson);
    blocks_to_save.forEach(block => block._queue_save = false);
  }
  on_load_error(err){
    super.on_load_error(err);
    // if ENOENT
    if(err.code === "ENOENT"){
      this._queue_load = false; // don't queue load again (re-queued by CollectionItem)
      this.queue_import();
    }
  }

  // GETTERS
  get block_collection() { return this.collection.block_collections[this.file_type]; }
  get block_vecs() { return this.blocks.map(block => block.vec).filter(vec => vec); } // filter out blocks without vec
  get blocks() { return this.env.smart_blocks?.filter({key_starts_with: this.key}) || []; } // filter out blocks that don't exist
  get data_path() { return this.collection.data_dir + "/" + this.multi_ajson_file_name + '.ajson'; }
  get embed_input() { return this._embed_input ? this._embed_input : this.get_embed_input(); }
  get excluded() { return this.fs.is_excluded(this.data.path); }
  get excluded_lines() {
    return this.blocks.filter(block => block.excluded).map(block => block.lines);
  }
  get file() { return this.fs.files[this.data.path]; }
  get file_path() { return this.data.path; }
  get file_type() { return this.file_path.split(".").pop(); }
  get fs() { return this.collection.fs; }
  get inlinks() { return Object.keys(this.env.links?.[this.data.path] || {}); }
  get is_canvas() { return this.data.path.endsWith("canvas"); }
  get is_excalidraw() { return this.data.path.endsWith("excalidraw.md"); }
  get is_gone() { return !this.file; }
  get is_unembedded() {
    if(this.meta_changed) return true;
    return super.is_unembedded;
  }
  get last_history() { return this.data.history?.length ? this.data.history[this.data.history.length - 1] : null; }
  get meta_changed() {
    try {
      if (!this.last_history) return true;
      if (!this.file) return true;
      if ((this.last_history?.mtime || 0) < this.file.stat.mtime) {
        const size_diff = Math.abs(this.last_history.size - this.file.stat.size);
        const size_diff_ratio = size_diff / (this.last_history.size || 1);
        if (size_diff_ratio > 0.01) return true; // if size diff greater than 1% of last_history.size, assume file changed
        // else console.log(`Smart Connections: Considering change of <1% (${size_diff_ratio * 100}%) "unchanged" for ${this.data.path}`);
      }
      return false;
    } catch (e) {
      console.warn("error getting meta changed for ", this.data.path, ": ", e);
      return true;
    }
  }
  get mtime() { return this.last_history?.mtime || 0; }
  get multi_ajson_file_name() { return (this.path.split("#").shift()).replace(/[\s\/\.]/g, '_').replace(".md", ""); }
  get name() {
    if(this.should_show_full_path) return this.data.path.split("/").join(" > ").replace(".md", "");
    return this.data.path.split("/").pop().replace(".md", "");
  }
  get outlink_paths() {
    return (this.data.outlinks || [])
      .filter(link => !link.target.startsWith("http"))
      .map(link => {
        const link_path = this.fs.get_link_target_path(link.target, this.file_path);
        return link_path;
      })
      .filter(link_path => link_path);
  }
  get size() { return this.last_history?.size || 0; }
  get smart_change_adapter() { return this.env.settings.is_obsidian_vault ? "obsidian_markdown" : "markdown"; }
  get source_adapters() { return this.collection.source_adapters; }
  get source_adapter() {
    if(this._source_adapter) return this._source_adapter;
    if(this.source_adapters[this.file_type]) this._source_adapter = new this.source_adapters[this.file_type](this);
    else this._source_adapter = new this.source_adapters["default"](this);
    return this._source_adapter;
  }



  // currently unused, but useful for later
  get mean_block_vec() { return this._mean_block_vec ? this._mean_block_vec : this._mean_block_vec = this.block_vecs.reduce((acc, vec) => acc.map((val, i) => val + vec[i]), Array(384).fill(0)).map(val => val / this.block_vecs.length); }
  get median_block_vec() {
    if (this._median_block_vec) return this._median_block_vec;
    if (!this.block_vecs.length) return null;

    const vec_length = this.block_vecs[0].length;
    this._median_block_vec = new Array(vec_length);
    const mid = Math.floor(this.block_vecs.length / 2);

    for (let i = 0; i < vec_length; i++) {
      const values = this.block_vecs.map(vec => vec[i]).sort((a, b) => a - b);
      this._median_block_vec[i] = this.block_vecs.length % 2 !== 0
        ? values[mid]
        : (values[mid - 1] + values[mid]) / 2;
    }

    return this._median_block_vec;
  }



  // DEPRECATED methods
  /**
   * @deprecated Use this.read() instead
   */
  async get_content() { return await this.read(); }
  /**
   * @deprecated Use this.file instead
   */
  get t_file() {
    return this.fs.files[this.data.path];
  } 


}