const { SmartCollectionsAdapter } = require('./adapter.js');
const { ajson_merge } = require('../utils/ajson_merge.js');
/**
 * Adapter for Obsidian that handles multiple .ajson files.
 */
class ObsidianAdapter extends SmartCollectionsAdapter {
  /**
   * Creates an instance of ObsidianAdapter.
   * @param {Object} main - The main instance of the smart-collections-2 plugin.
   */
  constructor(main) {
    super(main);
    this.obsidian_adapter = this.main.env.plugin.app.vault.adapter;
  }
  async mkdir(path) { return await this.obsidian_adapter.mkdir(path); }
  async read(path) { return await this.obsidian_adapter.read(path); }
  async write(path, data) { return await this.obsidian_adapter.write(path, data); }
  async list(path) { return await this.obsidian_adapter.list(path); }
  async exists(path) { return await this.obsidian_adapter.exists(path); }
  async stat(path) { return await this.obsidian_adapter.stat(path); }
  async append(path, data) { return await this.obsidian_adapter.append(path, data); }
  async remove(path) { return await this.obsidian_adapter.remove(path); }
  /**
   * Asynchronously loads collection items from .ajson files within the specified data path.
   * It ensures that only .ajson files are processed and handles JSON parsing and item instantiation.
   */
  async load() {
    console.log("Loading collection items");
    const start = Date.now();
    if(!(await this.exists(this.data_path))) await this.mkdir(this.data_path);
    const files = (await this.list(this.data_path)).files; // List all files in the directory
    const vault_paths = this.main.env.all_files.reduce((acc, file) => {
      acc[file.path] = file;
      return acc;
    }, {});
    const item_types = Object.keys(this.env.item_types);
    for (const file_path of files) {
      let source_is_deleted = false;
      try {
        if (file_path.endsWith('.ajson')) { // Ensure it's an .ajson file
          const content = (await this.read(file_path)).trim();
          const data = content
            .split('\n')
            .reduce((acc, line) => {
              const parsed = JSON.parse(`{${line}}`);
              if(Object.values(parsed)[0] === null){
                if(acc[Object.keys(parsed)[0]]) delete acc[Object.keys(parsed)[0]];
                return acc;
              }
              return ajson_merge(acc, parsed);
            }, {})
          ;
          // const data = JSON.parse(`{${content.startsWith(',\n') ? content.slice(1) : content}}`);
          let main_entity;
          Object.entries(data)
            // // sort  by no # in key first, then by # in key
            // .sort(([ajson_key, value], [ajson_key2, value2]) => {
            //   if(ajson_key.includes("#") && !ajson_key2.includes("#")) return 1;
            //   if(!ajson_key.includes("#") && ajson_key2.includes("#")) return -1;
            //   return 0;
            // })
            .forEach(([ajson_key, value]) => {
              let is_main_entity = false;
              if(ajson_key.includes("AI computer")) console.log(ajson_key, value); // TEMP
              if(!value || source_is_deleted) return; // handle null values (deleted)
              let entity_key;
              let class_name = value.class_name; // DEPRECATED (moved to key so that multiple entities from different classes can have the same key)
              if(ajson_key.includes(":") && item_types.includes(ajson_key.split(":")[0])){
                class_name = ajson_key.split(":").shift();
                entity_key = ajson_key.split(":").slice(1).join(":"); // key is file path
              }else entity_key = ajson_key; // DEPRECATED: remove this
              if(!entity_key.includes("#")){ // if no #, it's a source item (i.e. Note, not block)
                is_main_entity = true;
                if(!vault_paths[entity_key]){ // if not in vault path, it's a deleted item
                  source_is_deleted = true;
                  return;
                }
              }
              const entity = new (this.env.item_types[class_name])(this.env, value);
              this.env[entity.collection_name].items[entity_key] = entity;
              if(is_main_entity) main_entity = entity;
            })
          ;
          if(source_is_deleted) await this.remove(file_path);
          else if(main_entity){
            if(main_entity.ajson !== content) {
              await this.write(file_path, main_entity.ajson);
              // console.log("Updated file: " + file_path);
            }
          }else console.warn("Main entity not found for file: " + file_path);
        }
      } catch (err) {
        console.log("Error loading file: " + file_path);
        console.log(err.stack); // stack trace
        // if parse error, remove file
        console.log(err.message);
        if(err.message.includes("Expected ")) await this.remove(file_path);
      }
    }
    const end = Date.now(); // log time
    const time = end - start;
    console.log("Loaded collection items in " + time + "ms");
  }

  /**
   * Schedules a save operation to prevent multiple saves happening at the same time.
   */
  save() {
    if(this.save_timeout) clearTimeout(this.save_timeout);
    this.save_timeout = setTimeout(() => { this._save(); }, 10000);
  }

  /**
   * Asynchronously saves modified collection items to their respective .ajson files.
   * @param {boolean} [force=false] - Forces the save operation even if it's currently flagged as saving.
   */
  async _save(key) {
    delete this.main.save_queue[key];
    const item = this.main.get(key);
    if(!item) return console.warn("Item not found: " + key);
    if(!(await this.exists(this.data_path))) await this.mkdir(this.data_path);
    try {
      const item_file_path = `${this.data_path}/${item.multi_ajson_file_name}.ajson`; // Use item.file_name for file naming
      const ajson = item.ajson;
      if(!ajson && (await this.exists(item_file_path))){
        await this.remove(item_file_path);
        delete this.main.items[key];
        console.log("Deleted item: " + key);
      } else {
        await this.append(item_file_path, '\n' + ajson);
      }
    } catch (err) {
      if(err.message.includes("ENOENT")) return; // already deleted
      console.warn("Error saving collection item: ", key);
      console.warn(err.stack);
      item.queue_save();
    }
  }
  async _save_queue() {
    if(this._saving) return console.log("Already saving");
    this._saving = true; // prevent multiple saves at once
    setTimeout(() => { this._saving = false; }, 10000); // set _saving to false after 10 seconds
    console.log("Saving collection items");
    const start = Date.now();
    const batch_items = [];
    for (const key of Object.keys(this.main.save_queue)) {
      batch_items.push(this._save(key));
    }
    await Promise.all(batch_items);
    this._saving = false;
    console.log(`Saved ${batch_items.length} collection items in ${Date.now() - start}ms`);
  }

  // /**
  //  * Validates the save operation by comparing the file sizes of the new and old files.
  //  * @param {string} new_file_path - Path to the new file.
  //  * @param {string} old_file_path - Path to the old file.
  //  * @returns {Promise<boolean>} - True if the new file size is at least 50% of the old file size, otherwise false.
  //  */
  // async validate_save(new_file_path, old_file_path) {
  //   const new_file_size = (await this.stat(new_file_path))?.size;
  //   const old_file_size = (await this.stat(old_file_path))?.size;
  //   if(!old_file_size) return true;
  //   console.log("New file size: " + new_file_size + " bytes");
  //   console.log("Old file size: " + old_file_size + " bytes");
  //   return new_file_size > (old_file_size * 0.5);
  // }
}

exports.ObsidianAdapter = ObsidianAdapter;