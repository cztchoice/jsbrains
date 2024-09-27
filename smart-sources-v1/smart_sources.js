import { create_hash } from "./utils/create_hash.js";
import { SmartEntities } from "smart-entities";
export class SmartSources extends SmartEntities {
  constructor(env, opts = {}) {
    super(env, opts);
    this.search_results_ct = 0;
    this._excluded_headings = null;
  }
  get source_adapters() { return this.env.opts.collections?.[this.collection_key]?.source_adapters || {}; }
  get notices() { return this.env.smart_connections_plugin?.notices || this.env.main?.notices; }
  async init() {
    await super.init();
    this.notices?.show('initial scan', "Starting initial scan...", { timeout: 0 });
    console.log("init smart_sources", this.env, this.env.main);
    // init smart_fs
    await this.fs.init();
    // init smart_sources
    Object.values(this.fs.files)
      .filter(file => this.source_adapters[file.extension]) // skip files without source adapter
      .forEach(file => this.init_file_path(file.path))
    ;
    this.notices?.remove('initial scan');
    this.notices?.show('done initial scan', "Initial scan complete", { timeout: 3000 });
  }
  init_file_path(file_path){
    this.items[file_path] = new this.item_type(this.env, { path: file_path });
  }
  get smart_change() {
    if(!this.opts.smart_change) return; // disabled at config level
    if(typeof this.settings?.smart_change?.active !== 'undefined' && !this.settings.smart_change.active) return console.warn('smart_change disabled by settings');
    if(!this._smart_change){
      this._smart_change = new this.opts.smart_change.class(this.opts.smart_change);
    }
    return this._smart_change;
  }

  // removes old data files
  async prune() {
    await this.fs.refresh(); // refresh source files in case they have changed
    const remove_sources = Object.values(this.items)
      .filter(item => item.is_gone || item.excluded)
    ;
    for(let i = 0; i < remove_sources.length; i++){
      const source = remove_sources[i];
      await this.fs.remove(source.data_path);
      delete this.items[source.key];
    }
    const data_files = await this.data_fs.list_files_recursive(this.data_adapter.data_folder);
    const ajson_file_path_map = Object.values(this.items).reduce((acc, item) => {
      acc[item.data_path] = item.key;
      return acc;
    }, {});
    // get data_files where ajson_file_paths don't exist
    const remove_data_files = data_files.filter(file => !ajson_file_path_map[file.path]);
    for(let i = 0; i < remove_data_files.length; i++){
      await this.data_fs.remove(remove_data_files[i].path);
    }
    const remove_smart_blocks = Object.values(this.env.smart_blocks.items).filter(item => item.is_gone);
    for(let i = 0; i < remove_smart_blocks.length; i++){
      delete this.env.smart_blocks.items[remove_smart_blocks[i].key];
    }
    // queue_embed for meta_changed
    const items_w_vec = Object.values(this.items).filter(item => item.vec);
    for (const item of items_w_vec) {
      if (item.meta_changed) item.queue_import();
      else if (item.is_unembedded) item.queue_embed();
    }
  }
  get current_note() { return this.get(this.env.smart_connections_plugin.app.workspace.getActiveFile().path); }
  build_links_map() {
    const links_map = {};
    for (const source of Object.values(this.items)) {
      for (const link of source.outlink_paths) {
        if (!links_map[link]) links_map[link] = {};
        links_map[link][source.key] = true;
      }
    }
    return links_map;
  }
  // CRUD
  async create(key, content) {
    await this.env.smart_sources.fs.write(key, content);
    await this.env.smart_sources.fs.refresh();
    const source = await this.create_or_update({ path: key });
    await source.import();
    return source;
  }
  // SEARCH
  /**
   * Lexical search for matching SmartSource content.
   * @param {Object} search_filter - The filter criteria for the search.
   * @returns {Promise<Array<Entity>>} A promise that resolves to an array of matching entities.
   */
  async search(search_filter = {}) {
    const {
      keywords,
      limit,
      ...filter_opts
    } = search_filter;
    if(!keywords){
      console.warn("search_filter.keywords not set");
      return [];
    }
    console.log("search_filter", search_filter);
    this.search_results_ct = 0;
    const initial_results = this.filter(filter_opts);
    const search_results = [];
    for (let i = 0; i < initial_results.length; i += 10) {
      const batch = initial_results.slice(i, i + 10);
      const batch_results = await Promise.all(
        batch.map(async (item) => {
          try {
            const matches = await item.search(search_filter);
            if (matches) {
              this.search_results_ct++;
              return { item, score: matches };
            } else return null;
          } catch (error) {
            console.error(`Error searching item ${item.id || 'unknown'}:`, error);
            return null;
          }
        })
      );
      search_results.push(...batch_results.filter(Boolean));
    }
    console.log("search_results_ct", this.search_results_ct);
    return search_results
      .sort((a, b) => b.score - a.score) // sort by relevance 
      .map(result => result.item)
    ;
  }

  async import_file(file){
    // add file to fs
    this.fs.files[file.path] = file;
    this.fs.file_paths.push(file.path);
    // create source
    const source = await this.create_or_update({ path: file.path });
    // import
    await source.import();
    // process embed queue
    await this.env.smart_blocks.process_embed_queue();
    await this.process_embed_queue();
    // process save queue
    await this.process_save_queue();
  }

  async process_load_queue(){
    await super.process_load_queue();
    if(this.collection_key === 'smart_sources'){ // excludes sub-classes
      Object.values(this.env.smart_blocks.items).forEach(item => item.init()); // sets _queue_embed if no vec
    }
    this.blocks.loaded = true;
    if(!this.opts.prevent_import_on_load){
      await this.process_import_queue();
    }
  }

  async process_import_queue(){
    const import_queue = Object.values(this.items).filter(item => item._queue_import);
    if(import_queue.length){
      console.log(`Smart Connections: Processing import queue: ${import_queue.length} items`);
      const time_start = Date.now();
      // import 100 at a time
      for (let i = 0; i < import_queue.length; i += 100) {
        this.notices?.show('import progress', [`Importing...`, `Progress: ${i} / ${import_queue.length} files`], { timeout: 0 });
        await Promise.all(import_queue.slice(i, i + 100).map(item => item.import()));
      }
      this.notices?.remove('import progress');
      this.notices?.show('done import', [`Importing...`, `Completed import.`], { timeout: 3000 });
      console.log(`Smart Connections: Processed import queue in ${Date.now() - time_start}ms`);
    }else console.log("Smart Connections: No items in import queue");
    this.env.links = this.build_links_map();
    await this.env.smart_blocks?.process_embed_queue(); // may need to be first
    await this.process_embed_queue();
    await this.process_save_queue();
  }
  async run_load(){
    await super.run_load();
    this.blocks.render_settings();
  }
  async run_import(){
    await this.process_import_queue();
    Object.values(this.env.smart_blocks.items).forEach(item => item.init());
    await this.env.smart_blocks.process_embed_queue();
    await this.process_embed_queue();
    await this.process_save_queue();
    this.render_settings();
    this.blocks.render_settings();
  }
  async run_refresh(){
    await this.prune();
    await this.process_import_queue();
    await this.env.smart_blocks.process_embed_queue();
    await this.process_embed_queue();
    this.render_settings();
    this.blocks.render_settings();
  }
  get blocks(){ return this.env.smart_blocks; }

  get settings_config(){
    return {
      ...super.settings_config,
      // ...this.process_settings_config(settings_config),
      ...settings_config,
    };
  }

  get fs() {
    if(!this._fs){
      this._fs = new this.env.opts.modules.smart_fs.class(this.env, {
        adapter: this.env.opts.modules.smart_fs.adapter,
        fs_path: this.env.opts.env_path || '',
        exclude_patterns: this.excluded_patterns || [],
      });
    }
    return this._fs;
  }
  // DO move these exclusion settings to SmartSources settings_config
  get excluded_patterns() {
    return [
      ...(this.file_exclusions?.map(file => `${file}**`) || []),
      ...(this.folder_exclusions || []).map(folder => `${folder}**`),
      this.env.env_data_dir + "/**",
    ];
  }
  get file_exclusions() {
    return (this.env.settings?.file_exclusions?.length) ? this.env.settings.file_exclusions.split(",").map((file) => file.trim()) : [];
  }
  get folder_exclusions() {
    return (this.env.settings?.folder_exclusions?.length) ? this.env.settings.folder_exclusions.split(",").map((folder) => {
      folder = folder.trim();
      if (folder.slice(-1) !== "/") return folder + "/";
      return folder;
    }) : [];
  }
  get excluded_headings() {
    if (!this._excluded_headings){
      this._excluded_headings = (this.env.settings?.excluded_headings?.length) ? this.env.settings.excluded_headings.split(",").map((heading) => heading.trim()) : [];
    }
    return this._excluded_headings;
  }

}

export const settings_config = {
  "smart_change.active": {
    "name": "Smart Change (change safety)",
    "description": "Enable Smart Changes (prevents accidental deletions/overwrites).",
    "type": "toggle",
    "default": true,
  },
  // TODO: implement in getters (use this.settings not this.env.settings)
  // "file_exclusions": {
  //   "name": "File Exclusions",
  //   "description": "Comma-separated list of files to exclude.",
  //   "type": "text",
  //   "default": "",
  // },
  // "folder_exclusions": {
  //   "name": "Folder Exclusions",
  //   "description": "Comma-separated list of folders to exclude.",
  //   "type": "folder-csv",
  //   "default": "",
  // },
  // "excluded_headings": {
  //   "name": "Excluded Headings",
  //   "description": "Comma-separated list of headings to exclude.",
  //   "type": "text",
  //   "default": "",
  // },
};