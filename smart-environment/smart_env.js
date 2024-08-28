// Copyright (c) Brian Joseph Petro

// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:

// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { SmartEnvSettings } from './smart_env_settings.js';
import { SmartChange } from 'smart-change/smart_change.js';
import { DefaultAdapter } from 'smart-change/adapters/default.js';
import { MarkdownAdapter } from 'smart-change/adapters/markdown.js';
import { ObsidianMarkdownAdapter } from 'smart-change/adapters/obsidian_markdown.js';
export class SmartEnv {
  constructor(main, opts={}) {
    if(opts.global_ref) this._global_ref = opts.global_ref;
    delete opts.global_ref;
    this.opts = opts;
    const main_name = camel_case_to_snake_case(main.constructor.name);
    this[main_name] = main; // ex. smart_connections_plugin
    this[main_name+"_opts"] = opts;
    this.mains = [main_name];
    /**
     * @deprecated Use this.main_class_name instead of this.plugin
     */
    this.main = main; // DEPRECATED in favor of main class name converted to snake case
    /**
     * @deprecated Use this.main_class_name instead of this.plugin
     */
    this.plugin = this.main; // DEPRECATED in favor of main
    Object.assign(this, opts); // DEPRECATED in favor using via this.opts
    this.loading_collections = false;
    this.collections_loaded = false;
    this.smart_embed_active_models = {};
  }
  get global_ref() {
    if(!this._global_ref) this._global_ref = (typeof window !== 'undefined' ? window : global);
    return this._global_ref;
  }
  get fs() {
    if(!this.smart_fs) this.smart_fs = new this.smart_fs_class(this, {
      adapter: this.opts.smart_fs_adapter_class,
      fs_path: this.opts.env_path || '',
      exclude_patterns: this.excluded_patterns || [],
    });
    return this.smart_fs;
  }
  get settings() { return this.smart_env_settings._settings; }
  set settings(settings) { this.smart_env_settings._settings = settings; }
  /**
   * Creates or updates a SmartEnv instance.
   * @param {Object} main - The main object to be added to the SmartEnv instance.
   * @param {Object} [opts={}] - Options for configuring the SmartEnv instance.
   * @returns {SmartEnv} The SmartEnv instance.
   * @throws {TypeError} If an invalid main object is provided.
   * @throws {Error} If there's an error creating or updating the SmartEnv instance.
   */
  static async create(main, opts = {}) {
    if (!main || typeof main !== 'object'){ // || typeof main.constructor !== 'function') {
      throw new TypeError('SmartEnv: Invalid main object provided');
    }

    main.env = opts.global_ref?.smart_env;

    try {
      if (!main.env) {
        main.env = new main.smart_env_class(main, opts);
        main.env.global_ref.smart_env = main.env;
        await main.env.init(main);
      } else {
        // wait a second for any other plugins to finish initializing
        await new Promise(resolve => setTimeout(resolve, 1000));
        await main.env.add_main(main, opts);
      }

      return main.env;
    } catch (error) {
      console.error('SmartEnv: Error creating or updating SmartEnv instance', error);
      // throw error;
      return main.env;
    }
  }

  /**
   * Adds a new main object to the SmartEnv instance.
   * @param {Object} main - The main object to be added.
   * @param {Object} [opts={}] - Options to be merged into the SmartEnv instance.
   */
  async add_main(main, opts = {}) {
    const main_name = camel_case_to_snake_case(main.constructor.name);
    this[main_name] = main;
    this.mains.push(main_name);
    delete opts.global_ref;
    this.merge_options(opts);
    // TODO: should special init be called (only init collections/modules not already initialized)
    await this.init(main);
  }

  /**
   * Merges provided options into the SmartEnv instance, performing a deep merge for objects.
   * @param {Object} opts - Options to be merged.
   */
  merge_options(opts) {
    for (const [key, value] of Object.entries(opts)) {
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          this.opts[key] = [...(this.opts[key] || []), ...value];
        } else {
          if(!this.opts[key]) this.opts[key] = {};
          deep_merge_no_overwrite(this.opts[key], value);
        }
      } else {
        if (this.opts[key] !== undefined) {
          // console.warn(`SmartEnv: Overwriting existing property ${key} with ${value}`);
          console.warn(`SmartEnv: Overwriting existing property ${key} with ${this.mains[this.mains.length-1]} smart_env_opts`);
        }
        this.opts[key] = value;
      }
    }
  }


  async init(main) {
    this.smart_env_settings = new SmartEnvSettings(this, this.opts);
    await this.smart_env_settings.load();
    await this.ready_to_load_collections(main);
    await this.load_collections();
    this.init_smart_change();
  }
  async ready_to_load_collections(main) {
    if(typeof main?.ready_to_load_collections === 'function') await main.ready_to_load_collections();
    return true;
  } // override in subclasses with env-specific logic
  async load_collections(){
    this.loading_collections = true;
    for(const key of Object.keys(this.collections)){
      if(!this[key]){
        await this.collections[key].load(this, this.opts);
      }
    }
    this.loading_collections = false;
    this.collections_loaded = true;
  }
  // async load_smart_sources(){
  //   const source_collection_opts = {
  //     adapter_class: this.main.smart_env_opts.smart_collection_adapter_class,
  //     custom_collection_name: 'smart_sources',
  //   };
  //   if(this.opts.env_path) source_collection_opts.env_path = this.opts.env_path;
  //   this.smart_sources = new this.collections.smart_sources(this, source_collection_opts);
  //   await this.smart_sources.init();
  //   await this.smart_sources.process_load_queue();
  //   await this.smart_sources.process_import_queue();
  // }
  unload_main(main_key) {
    this.unload_collections(main_key);
    this.unload_opts(main_key);
    this[main_key] = null;
    this.mains = this.mains.filter(key => key !== main_key);
    if(this.mains.length === 0) this.global_ref.smart_env = null;
  }
  unload_collections(main_key) {
    for(const key of Object.keys(this.collections)){
      if(!this[main_key]?.smart_env_opts?.collections[key]) continue;
      this[key]?.unload();
      this[key] = null;
    }
  }
  unload_opts(main_key) {
    for(const opts_key of Object.keys(this.opts)){
      if(!this[main_key]?.smart_env_opts?.[opts_key]) continue;
      // if exists in another main, don't delete it
      if(this.mains.filter(m => m !== main_key).some(m => this[m]?.smart_env_opts?.[opts_key])) continue;
      this.opts[opts_key] = null;
    }
  }
  save() {
    for(const key of Object.keys(this.collections)){
      this[key].process_save_queue();
    }
  }

  // should probably be moved
  // smart-change
  init_smart_change() {
    this.smart_change = new SmartChange(this, { adapters: this.smart_change_adapters });
  }
  get smart_change_adapters() {
    return {
      default: new DefaultAdapter(),
      markdown: new MarkdownAdapter(),
      obsidian_markdown: new ObsidianMarkdownAdapter(),
    };
  }
}

function camel_case_to_snake_case(str) {
  const result = str
    .replace(/([A-Z])/g, (match) => `_${match.toLowerCase()}`)
    .replace(/^_/, '') // remove leading underscore
    .replace(/2$/, '') // remove trailing 2 (bundled subclasses)
  ;
  return result;
}

/**
 * Deeply merges two objects without overwriting existing properties in the target object.
 * @param {Object} target - The target object to merge properties into.
 * @param {Object} source - The source object from which properties are sourced.
 * @returns {Object} The merged object.
 */
export function deep_merge_no_overwrite(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (is_obj(source[key])) {
        if (!target.hasOwnProperty(key) || !is_obj(target[key])) {
          target[key] = {};
        }
        deep_merge_no_overwrite(target[key], source[key]);
      } else if (!target.hasOwnProperty(key)) {
        target[key] = source[key];
      }
    }
  }
  return target;

  function is_obj(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }
}