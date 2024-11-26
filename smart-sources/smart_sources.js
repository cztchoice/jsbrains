import { SmartEntities } from "smart-entities";
import { sort_by_score } from "smart-entities/utils/sort_by_score.js";

/**
 * @class SmartSources
 * @extends SmartEntities
 * @classdesc Manages a collection of SmartSource entities, handling initialization, pruning, importing, and searching of sources.
 */
export class SmartSources extends SmartEntities {
  /**
   * Creates an instance of SmartSources.
   * @constructor
   * @param {Object} env - The environment instance.
   * @param {Object} [opts={}] - Configuration options.
   */
  constructor(env, opts = {}) {
    super(env, opts);
    /** @type {number} Counter for search results */
    this.search_results_ct = 0;
    /** @type {Array<string>|null} Cached excluded headings */
    this._excluded_headings = null;
  }

  /**
   * Initializes the SmartSources instance by performing an initial scan of sources.
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    await super.init();
    this.notices?.show('initial scan', "Starting initial scan...", { timeout: 0 });
    await this.init_items();
    this.notices?.remove('initial scan');
    this.notices?.show('done initial scan', "Initial scan complete", { timeout: 3000 });
  }

  /**
   * Initializes items by setting up the file system and loading sources.
   * @async
   * @returns {Promise<void>}
   */
  async init_items() {
    this._fs = null; // Clear fs to reload exclusions
    // Initialize smart_fs
    await this.fs.init();
    // Initialize smart_sources
    Object.values(this.fs.files)
      .filter(file => this.source_adapters[file.extension]) // Skip files without source adapter
      .forEach(file => this.init_file_path(file.path));
    this.notices?.remove('initial scan');
    this.notices?.show('done initial scan', "Initial scan complete", { timeout: 3000 });
  }

  /**
   * Initializes a file path by creating a new SmartSource instance.
   * @param {string} file_path - The path of the file to initialize.
   * @returns {SmartSource} The initialized SmartSource instance.
   */
  init_file_path(file_path){
    return this.items[file_path] = new this.item_type(this.env, { path: file_path });
  }

  /**
   * Removes old data files by pruning sources and blocks.
   * @async
   * @returns {Promise<void>}
   */
  async prune() {
    await this.fs.refresh(); // Refresh source files in case they have changed
    this.notices?.show('pruning sources', "Pruning sources...", { timeout: 0 });
    
    // Identify sources to remove
    const remove_sources = Object.values(this.items)
      .filter(item => item.is_gone || item.excluded || !item.should_embed || !item.data.blocks);
    
    // Remove identified sources
    for(let i = 0; i < remove_sources.length; i++){
      const source = remove_sources[i];
      await this.data_fs.remove(source.data_path);
      source.delete();
    }
    
    await this.process_save_queue();
    
    // TEMP: Remove last_history from smart_sources
    Object.values(this.items).forEach(item => {
      if(item.data?.history?.length) item.data.history = null;
      item.queue_save();
    });
    
    this.notices?.remove('pruning sources');
    this.notices?.show('pruned sources', `Pruned ${remove_sources.length} sources`, { timeout: 5000 });
    this.notices?.show('pruning blocks', "Pruning blocks...", { timeout: 0 });
    
    // Identify blocks to remove
    const remove_smart_blocks = Object.values(this.block_collection.items)
      // .filter(item => item.vec && (item.is_gone || !item.should_embed || !item.data?.hash))
      .filter(item => {
        if(!item.vec) return false;
        if(item.is_gone) {
          item.reason = "is_gone";
          return true;
        }
        if(!item.should_embed) {
          item.reason = "!should_embed";
          return true;
        }
        if(!item.data?.hash) {
          item.reason = "!data.hash";
          return true;
        }
        return false;
      })
    ;
    
    // Remove identified blocks
    for(let i = 0; i < remove_smart_blocks.length; i++){
      const item = remove_smart_blocks[i];
      if(item.is_gone) item.delete();
      else item.remove_embeddings();
    }
    
    this.notices?.remove('pruning blocks');
    this.notices?.show('pruned blocks', `Pruned ${remove_smart_blocks.length} blocks`, { timeout: 5000 });
    console.log(`Pruned ${remove_smart_blocks.length} blocks:\n${remove_smart_blocks.map(item => `${item.reason} - ${item.key}`).join("\n")}`);
    
    await this.process_save_queue();
    
    // Queue embedding for items with changed metadata
    const items_w_vec = Object.values(this.items).filter(item => item.vec);
    for (const item of items_w_vec) {
      if (item.meta_changed) item.queue_import();
      else if (item.is_unembedded) item.queue_embed();
    }
  }

  /**
   * Builds a map of links between sources.
   * @returns {Object} An object mapping link paths to source keys.
   */
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

  /**
   * Refreshes the SmartSources by pruning, importing, and processing embed queues.
   * @async
   * @returns {Promise<void>}
   */
  async refresh(){
    await this.prune();
    await this.process_import_queue();
    await this.env.smart_blocks.process_embed_queue();
    await this.process_embed_queue();
  }

  /**
   * Creates a new source with the given key and content.
   * @async
   * @param {string} key - The key (path) of the new source.
   * @param {string} content - The content to write to the new source.
   * @returns {Promise<SmartSource>} The created SmartSource instance.
   */
  async create(key, content) {
    await this.fs.write(key, content);
    await this.fs.refresh();
    const source = await this.create_or_update({ path: key });
    await source.import();
    return source;
  }

  /**
   * Performs a lexical search for matching SmartSource content.
   * @async
   * @param {Object} search_filter - The filter criteria for the search.
   * @param {string[]} search_filter.keywords - An array of keywords to search for.
   * @param {number} [search_filter.limit] - The maximum number of results to return.
   * @returns {Promise<Array<SmartSource>>} A promise that resolves to an array of matching SmartSource entities.
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
    return search_results
      .sort((a, b) => b.score - a.score) // Sort by relevance 
      .map(result => result.item)
    ;
  }

  /**
   * Looks up entities based on the provided parameters.
   * @async
   * @param {Object} [params={}] - Parameters for the lookup.
   * @param {Object} [params.filter] - Filter options.
   * @param {number} [params.k] - Deprecated. Use `params.filter.limit` instead.
   * @returns {Promise<Array<SmartSource>>} A promise that resolves to an array of matching SmartSource entities.
   */
  async lookup(params={}) {
    const limit = params.filter?.limit
      || params.k // DEPRECATED: for backwards compatibility
      || this.env.settings.lookup_k
      || 10
    ;
    if(params.filter?.limit) delete params.filter.limit; // Remove to prevent limiting in initial filter (limit should happen after nearest for lookup)
    let results = await super.lookup(params);
    if(this.env.smart_blocks?.settings?.embed_blocks) {
      results = [
        ...results,
        ...(await this.block_collection.lookup(params)),
      ].sort(sort_by_score);
    }
    return results.slice(0, limit);
  }

  /**
   * Imports a file by adding it to the file system and initializing the corresponding SmartSource.
   * @async
   * @param {Object} file - The file object to import.
   * @param {string} file.path - The path of the file.
   * @returns {Promise<void>}
   */
  async import_file(file){
    // Add file to fs
    this.fs.files[file.path] = file;
    this.fs.file_paths.push(file.path);
    // Create source
    const source = await this.create_or_update({ path: file.path });
    // Import
    await source.import();
    // Process embed queue
    await this.process_embed_queue();
    // Process save queue
    await this.process_save_queue();
  }

  /**
   * Processes the load queue by loading items and optionally importing them.
   * @async
   * @returns {Promise<void>}
   */
  async process_load_queue(){
    await super.process_load_queue();
    if(this.collection_key === 'smart_sources'){ // Excludes sub-classes
      Object.values(this.env.smart_blocks.items).forEach(item => item.init()); // Sets _queue_embed if no vec
    }
    this.block_collection.loaded = Object.keys(this.block_collection.items).length;
    if(!this.opts.prevent_import_on_load){
      await this.process_import_queue();
    }
  }

  /**
   * Processes the import queue by importing queued items in batches.
   * @async
   * @returns {Promise<void>}
   */
  async process_import_queue(){
    const import_queue = Object.values(this.items).filter(item => item._queue_import);
    console.log("import_queue " + import_queue.length);
    if(import_queue.length){
      const time_start = Date.now();
      // Import 100 at a time
      for (let i = 0; i < import_queue.length; i += 100) {
        this.notices?.show('import progress', [`Importing...`, `Progress: ${i} / ${import_queue.length} files`], { timeout: 0 });
        await Promise.all(import_queue.slice(i, i + 100).map(item => item.import()));
      }
      this.notices?.remove('import progress');
      this.notices?.show('done import', [`Processed import queue in ${Date.now() - time_start}ms`], { timeout: 3000 });
    } else {
      this.notices?.show('no import queue', ["No items in import queue"]);
    }
    const start_time = Date.now();
    this.env.links = this.build_links_map();
    const end_time = Date.now();
    console.log(`Time spent building links: ${end_time - start_time}ms`);
    await this.process_embed_queue();
    await this.process_save_queue();
  }

  /**
   * Retrieves the source adapters based on the collection configuration.
   * @readonly
   * @returns {Object} An object mapping file extensions to adapter constructors.
   */
  get source_adapters() {
    if(!this._source_adapters){
      this._source_adapters = {
        ...(this.env.opts.collections?.[this.collection_key]?.source_adapters || {}),
      };
      if(!this.settings?.enable_image_adapter){
        delete this._source_adapters.png;
        delete this._source_adapters.jpg;
        delete this._source_adapters.jpeg;
      }
      if(!this.settings?.enable_pdf_adapter){
        delete this._source_adapters.pdf;
      }
    }
    return this._source_adapters;
  }
  reset_source_adapters(){
    this._source_adapters = null;
    this.render_settings();
  }

  /**
   * Retrieves the notices system from the environment.
   * @readonly
   * @returns {Object} The notices object.
   */
  get notices() { return this.env.smart_connections_plugin?.notices || this.env.main?.notices; }

  /**
   * Retrieves the currently active note.
   * @readonly
   * @returns {SmartSource|null} The current SmartSource instance or null if none.
   */
  get current_note() { return this.get(this.env.smart_connections_plugin.app.workspace.getActiveFile().path); }

  /**
   * Retrieves the file system instance, initializing it if necessary.
   * @readonly
   * @returns {SmartFS} The file system instance.
   */
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

  /**
   * Retrieves the settings configuration by combining superclass settings and adapter-specific settings.
   * @readonly
   * @returns {Object} The settings configuration object.
   */
  get settings_config(){
    const _settings_config = {
      ...super.settings_config,
      "enable_image_adapter": {
        "name": "Image Adapter",
        "description": "Enable image processing.",
        "type": "toggle",
        "default": false,
        "callback": "reset_source_adapters",
      },
      "enable_pdf_adapter": {
        "name": "PDF Adapter",
        "description": "Enable PDF processing.",
        "type": "toggle",
        "default": false,
        "callback": "reset_source_adapters",
      },
      ...this.process_settings_config(settings_config),
      ...Object.entries(this.source_adapters).reduce((acc, [file_extension, adapter_constructor]) => {
        if(acc[adapter_constructor]) return acc; // Skip if already added same adapter_constructor
        const item = this.items[Object.keys(this.items).find(i => i.endsWith(file_extension))];
        const adapter_instance = new adapter_constructor(item || new this.item_type(this.env, {}));
        if(adapter_instance.settings_config){
          acc[adapter_constructor.name] = {
            type: "html",
            value: `<h4>${adapter_constructor.name} adapter</h4>`
          };
          acc = { ...acc, ...adapter_instance.settings_config };
        }
        return acc;
      }, {}),
    };
    if(!['png', 'jpg', 'jpeg'].some(ext => this.env.opts.collections?.[this.collection_key]?.source_adapters?.[ext])) delete _settings_config.enable_image_adapter;
    if(!this.env.opts.collections?.[this.collection_key]?.source_adapters?.['pdf']) delete _settings_config.enable_pdf_adapter;
    return _settings_config;
  }

  /**
   * Retrieves the block collection associated with SmartSources.
   * @readonly
   * @returns {SmartBlocks} The block collection instance.
   */
  get block_collection() { return this.env.smart_blocks; }

  /**
   * @deprecated Use `block_collection` instead.
   * @readonly
   * @returns {SmartBlocks} The block collection instance.
   */
  get blocks(){ return this.env.smart_blocks; }

  get embed_model() {
    if (this.embed_model_key === "None") return null;
    if (!this.env._embed_model && this.env.opts.modules.smart_embed_model?.class) this.env._embed_model = new this.env.opts.modules.smart_embed_model.class({
      settings: this.env.settings.smart_sources.embed_model,
      adapters: this.env.opts.modules.smart_embed_model?.adapters,
    });
    return this.env._embed_model;
  }
  /**
   * Retrieves the embed queue containing items and their blocks to be embedded.
   * @readonly
   * @returns {Array<Object>} The embed queue.
   */
  get embed_queue() {
    try{
      const embed_blocks = this.block_collection.settings.embed_blocks;
      return Object.values(this.items).reduce((acc, item) => {
        if(item._queue_embed) acc.push(item);
        if(embed_blocks) item.blocks.forEach(block => {
          if(block._queue_embed && block.should_embed) acc.push(block);
        });
        return acc;
      }, []);
    }catch(e){
      console.error(`Error getting embed queue: ` + JSON.stringify((e || {}), null, 2));
    }
  }

  /**
   * Retrieves the SmartChange instance if enabled and active.
   * @readonly
   * @returns {SmartChange|undefined} The SmartChange instance or undefined if not enabled.
   */
  get smart_change() {
    if(!this.opts.smart_change) return; // Disabled at config level
    if(typeof this.settings?.smart_change?.active !== 'undefined' && !this.settings.smart_change.active) return console.warn('smart_change disabled by settings');
    if(!this._smart_change){
      this._smart_change = new this.opts.smart_change.class(this.opts.smart_change);
    }
    return this._smart_change;
  }

  /**
   * Runs the load process by invoking superclass methods and rendering settings.
   * @async
   * @returns {Promise<void>}
   */
  async run_load() {
    await super.run_load();
    this.blocks.render_settings();
    this.render_settings(); // Re-render settings to update buttons
  }

  /**
   * Runs the import process by queuing imports for changed items and processing the import queue.
   * @async
   * @returns {Promise<void>}
   */
  async run_import(){
    const start_time = Date.now();
    // Queue import for items with changed metadata
    Object.values(this.items).forEach(item => {
      if (item.meta_changed) item.queue_import();
    });
    await this.process_import_queue();
    const end_time = Date.now();
    console.log(`Time spent importing: ${end_time - start_time}ms`);
    this.render_settings();
    this.blocks.render_settings();
  }

  /**
   * Runs the prune process to clean up sources and blocks.
   * @async
   * @returns {Promise<void>}
   */
  async run_prune(){
    await this.prune();
    await this.process_save_queue();
    this.render_settings();
    this.blocks.render_settings();
  }

  /**
   * Clears all data by removing sources and blocks, reinitializing the file system, and reimporting items.
   * @async
   * @returns {Promise<void>}
   */
  async run_clear_all(){
    this.notices?.show('clearing all', "Clearing all data...", { timeout: 0 });
    this.clear();
    this.block_collection.clear();
    this._fs = null;
    await this.fs.init();
    await this.init_items();
    this._excluded_headings = null;
    
    Object.values(this.items).forEach(item => {
      item.queue_import();
      item.queue_embed();
      item.loaded_at = Date.now() + 9999999999; // Prevent re-loading during import
    });
    
    await this.process_import_queue();
    this.notices?.remove('clearing all');
    this.notices?.show('cleared all', "All data cleared and reimported", { timeout: 3000 });
  }

  /**
   * Retrieves the patterns used to exclude files and folders from processing.
   * @readonly
   * @returns {Array<string>} An array of exclusion patterns.
   */
  get excluded_patterns() {
    return [
      ...(this.file_exclusions?.map(file => `${file}**`) || []),
      ...(this.folder_exclusions || []).map(folder => `${folder}**`),
      this.env.env_data_dir + "/**",
    ];
  }

  /**
   * Retrieves the file exclusion patterns from settings.
   * @readonly
   * @returns {Array<string>} An array of file exclusion patterns.
   */
  get file_exclusions() {
    return (this.env.settings?.file_exclusions?.length) ? this.env.settings.file_exclusions.split(",").map((file) => file.trim()) : [];
  }

  /**
   * Retrieves the folder exclusion patterns from settings.
   * @readonly
   * @returns {Array<string>} An array of folder exclusion patterns.
   */
  get folder_exclusions() {
    return (this.env.settings?.folder_exclusions?.length) ? this.env.settings.folder_exclusions.split(",").map((folder) => {
      folder = folder.trim();
      if (folder.slice(-1) !== "/") return folder + "/";
      return folder;
    }) : [];
  }

  /**
   * Retrieves the excluded headings from settings.
   * @readonly
   * @returns {Array<string>} An array of excluded headings.
   */
  get excluded_headings() {
    if (!this._excluded_headings){
      this._excluded_headings = (this.env.settings?.excluded_headings?.length) ? this.env.settings.excluded_headings.split(",").map((heading) => heading.trim()) : [];
    }
    return this._excluded_headings;
  }

  /**
   * Retrieves the count of included files that are not excluded.
   * @readonly
   * @returns {number} The number of included files.
   */
  get included_files() {
    return this.fs.file_paths
      .filter(file => file.endsWith(".md") || file.endsWith(".canvas"))
      .filter(file => !this.fs.is_excluded(file))
      .length;
  }

  /**
   * Retrieves the total number of files, regardless of exclusion.
   * @readonly
   * @returns {number} The total number of files.
   */
  get total_files() {
    return this.env.fs.file_paths
      .filter(file => file.endsWith(".md") || file.endsWith(".canvas"))
      .length;
  }

}

export const settings_config = {
  "smart_change.active": {
    "name": "Smart Change (change safety)",
    "description": "Enable Smart Changes (prevents accidental deletions/overwrites).",
    "type": "toggle",
    "default": true,
  },
};