export const transformers_connector = "var __defProp = Object.defineProperty;\nvar __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;\nvar __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== \"symbol\" ? key + \"\" : key, value);\n\n// ../smart-model/smart_model.js\nvar SmartModel = class {\n  /**\n   * Create a SmartModel instance.\n   * @param {Object} opts - Configuration options\n   * @param {Object} opts.adapters - Map of adapter names to adapter classes\n   * @param {Object} opts.settings - Model settings configuration\n   * @param {Object} opts.model_config - Model-specific configuration\n   * @param {string} opts.model_config.adapter - Name of the adapter to use\n   * @param {string} [opts.model_key] - Optional model identifier to override settings\n   * @throws {Error} If required options are missing\n   */\n  constructor(opts = {}) {\n    __publicField(this, \"scope_name\", \"smart_model\");\n    this.opts = opts;\n    this.validate_opts(opts);\n    this.state = \"unloaded\";\n    this._adapter = null;\n  }\n  /**\n   * Initialize the model by loading the configured adapter.\n   * @async\n   * @returns {Promise<void>}\n   */\n  async initialize() {\n    this.load_adapter(this.adapter_name);\n    await this.load();\n  }\n  /**\n   * Validate required options.\n   * @param {Object} opts - Configuration options\n   */\n  validate_opts(opts) {\n    if (!opts.adapters) throw new Error(\"opts.adapters is required\");\n    if (!opts.settings) throw new Error(\"opts.settings is required\");\n  }\n  /**\n   * Get the current settings\n   * @returns {Object} Current settings\n   */\n  get settings() {\n    if (!this.opts.settings) this.opts.settings = {\n      ...this.constructor.defaults\n    };\n    return this.opts.settings;\n  }\n  /**\n   * Get the current adapter name\n   * @returns {string} Current adapter name\n   */\n  get adapter_name() {\n    const adapter_key = this.opts.model_config?.adapter || this.opts.adapter || this.settings.adapter || Object.keys(this.adapters)[0];\n    if (!adapter_key || !this.adapters[adapter_key]) throw new Error(`Platform \"${adapter_key}\" not supported`);\n    return adapter_key;\n  }\n  /**\n   * Get adapter-specific settings.\n   * @returns {Object} Settings for current adapter\n   */\n  get adapter_settings() {\n    if (!this.settings[this.adapter_name]) this.settings[this.adapter_name] = {};\n    return this.settings[this.adapter_name];\n  }\n  get adapter_config() {\n    const base_config = this.adapters[this.adapter_name]?.defaults || {};\n    return {\n      ...base_config,\n      ...this.adapter_settings,\n      ...this.opts.adapter_config\n    };\n  }\n  /**\n   * Get available models.\n   * @returns {Object} Map of model objects\n   */\n  get models() {\n    return this.adapter.models;\n  }\n  /**\n   * Get the default model key to use\n   * @returns {string} Default model identifier\n   */\n  get default_model_key() {\n    throw new Error(\"default_model_key must be overridden in sub-class\");\n  }\n  /**\n   * Get the current model key\n   * @returns {string} Current model key\n   */\n  get model_key() {\n    return this.opts.model_key || this.adapter_config.model_key || this.settings.model_key || this.default_model_key;\n  }\n  /**\n   * Get the current model configuration\n   * @returns {Object} Combined base and custom model configuration\n   */\n  get model_config() {\n    const model_key = this.model_key;\n    const base_model_config = this.models[model_key] || {};\n    return {\n      ...this.adapter_config,\n      ...base_model_config,\n      ...this.opts.model_config\n    };\n  }\n  get model_settings() {\n    if (!this.settings[this.model_key]) this.settings[this.model_key] = {};\n    return this.settings[this.model_key];\n  }\n  /**\n   * Load the current adapter and transition to loaded state.\n   * @async\n   * @returns {Promise<void>}\n   */\n  async load() {\n    this.set_state(\"loading\");\n    if (!this.adapter?.loaded) {\n      await this.invoke_adapter_method(\"load\");\n    }\n    this.set_state(\"loaded\");\n  }\n  /**\n   * Unload the current adapter and transition to unloaded state.\n   * @async\n   * @returns {Promise<void>}\n   */\n  async unload() {\n    if (this.adapter?.loaded) {\n      this.set_state(\"unloading\");\n      await this.invoke_adapter_method(\"unload\");\n      this.set_state(\"unloaded\");\n    }\n  }\n  /**\n   * Set the model's state.\n   * @param {('unloaded'|'loading'|'loaded'|'unloading')} new_state - The new state\n   * @throws {Error} If the state is invalid\n   */\n  set_state(new_state) {\n    const valid_states = [\"unloaded\", \"loading\", \"loaded\", \"unloading\"];\n    if (!valid_states.includes(new_state)) {\n      throw new Error(`Invalid state: ${new_state}`);\n    }\n    this.state = new_state;\n  }\n  get is_loading() {\n    return this.state === \"loading\";\n  }\n  get is_loaded() {\n    return this.state === \"loaded\";\n  }\n  get is_unloading() {\n    return this.state === \"unloading\";\n  }\n  get is_unloaded() {\n    return this.state === \"unloaded\";\n  }\n  // ADAPTERS\n  /**\n   * Get the map of available adapters\n   * @returns {Object} Map of adapter names to adapter classes\n   */\n  get adapters() {\n    return this.opts.adapters || {};\n  }\n  /**\n   * Load a specific adapter by name.\n   * @async\n   * @param {string} adapter_name - Name of the adapter to load\n   * @throws {Error} If adapter not found or loading fails\n   * @returns {Promise<void>}\n   */\n  async load_adapter(adapter_name) {\n    this.set_adapter(adapter_name);\n    if (!this._adapter.loaded) {\n      this.set_state(\"loading\");\n      try {\n        await this.invoke_adapter_method(\"load\");\n        this.set_state(\"loaded\");\n      } catch (err) {\n        this.set_state(\"unloaded\");\n        throw new Error(`Failed to load adapter: ${err.message}`);\n      }\n    }\n  }\n  /**\n   * Set an adapter instance by name without loading it.\n   * @param {string} adapter_name - Name of the adapter to set\n   * @throws {Error} If adapter not found\n   */\n  set_adapter(adapter_name) {\n    const AdapterClass = this.adapters[adapter_name];\n    if (!AdapterClass) {\n      throw new Error(`Adapter \"${adapter_name}\" not found.`);\n    }\n    if (this._adapter?.constructor.name.toLowerCase() === adapter_name.toLowerCase()) {\n      return;\n    }\n    this._adapter = new AdapterClass(this);\n  }\n  /**\n   * Get the current active adapter instance\n   * @returns {Object} The active adapter instance\n   * @throws {Error} If adapter not found\n   */\n  get adapter() {\n    const adapter_name = this.adapter_name;\n    if (!adapter_name) {\n      throw new Error(`Adapter not set for model.`);\n    }\n    if (!this._adapter) {\n      this.load_adapter(adapter_name);\n    }\n    return this._adapter;\n  }\n  /**\n   * Ensure the adapter is ready to execute a method.\n   * @param {string} method - Name of the method to check\n   * @throws {Error} If adapter not loaded or method not implemented\n   */\n  ensure_adapter_ready(method) {\n    if (!this.adapter) {\n      throw new Error(\"No adapter loaded.\");\n    }\n    if (typeof this.adapter[method] !== \"function\") {\n      throw new Error(`Adapter does not implement method: ${method}`);\n    }\n  }\n  /**\n   * Invoke a method on the current adapter.\n   * @async\n   * @param {string} method - Name of the method to call\n   * @param {...any} args - Arguments to pass to the method\n   * @returns {Promise<any>} Result from the adapter method\n   * @throws {Error} If adapter not ready or method fails\n   */\n  async invoke_adapter_method(method, ...args) {\n    this.ensure_adapter_ready(method);\n    return await this.adapter[method](...args);\n  }\n  /**\n   * Get platforms as dropdown options.\n   * @returns {Array<Object>} Array of {value, name} option objects\n   */\n  get_platforms_as_options() {\n    console.log(\"get_platforms_as_options\", this.adapters);\n    return Object.entries(this.adapters).map(([key, AdapterClass]) => ({ value: key, name: AdapterClass.defaults.description || key }));\n  }\n  // SETTINGS\n  /**\n   * Get the settings configuration schema\n   * @returns {Object} Settings configuration object\n   */\n  get settings_config() {\n    return this.process_settings_config({\n      adapter: {\n        name: \"Model Platform\",\n        type: \"dropdown\",\n        description: \"Select a model platform to use with Smart Model.\",\n        options_callback: \"get_platforms_as_options\",\n        is_scope: true,\n        // trigger re-render of settings when changed\n        callback: \"adapter_changed\",\n        default: \"default\"\n      }\n    });\n  }\n  /**\n   * Process settings configuration with conditionals and prefixes.\n   * @param {Object} _settings_config - Raw settings configuration\n   * @param {string} [prefix] - Optional prefix for setting keys\n   * @returns {Object} Processed settings configuration\n   */\n  process_settings_config(_settings_config, prefix = null) {\n    return Object.entries(_settings_config).reduce((acc, [key, val]) => {\n      if (val.conditional) {\n        if (!val.conditional(this)) return acc;\n        delete val.conditional;\n      }\n      const new_key = (prefix ? prefix + \".\" : \"\") + this.process_setting_key(key);\n      acc[new_key] = val;\n      return acc;\n    }, {});\n  }\n  /**\n   * Process an individual setting key.\n   * Example: replace placeholders with actual adapter names.\n   * @param {string} key - The setting key with placeholders.\n   * @returns {string} Processed setting key.\n   */\n  process_setting_key(key) {\n    return key.replace(/\\[ADAPTER\\]/g, this.adapter_name);\n  }\n  re_render_settings() {\n    console.log(\"re_render_settings\", this.opts);\n    if (typeof this.opts.re_render_settings === \"function\") this.opts.re_render_settings();\n    else console.warn(\"re_render_settings is not a function (must be passed in model opts)\");\n  }\n  /**\n   * Reload model.\n   */\n  reload_model() {\n    console.log(\"reload_model\", this.opts);\n    if (typeof this.opts.reload_model === \"function\") this.opts.reload_model();\n    else console.warn(\"reload_model is not a function (must be passed in model opts)\");\n  }\n  adapter_changed() {\n    this.reload_model();\n    this.re_render_settings();\n  }\n  model_changed() {\n    this.reload_model();\n    this.re_render_settings();\n  }\n  // /**\n  //  * Render settings.\n  //  * @param {HTMLElement} [container] - Container element\n  //  * @param {Object} [opts] - Render options\n  //  * @returns {Promise<HTMLElement>} Container element\n  //  */\n  // async render_settings(container=this.settings_container, opts = {}) {\n  //   if(!this.settings_container || container !== this.settings_container) this.settings_container = container;\n  //   const model_type = this.constructor.name.toLowerCase().replace('smart', '').replace('model', '');\n  //   let model_settings_container;\n  //   if(this.settings_container) {\n  //     const container_id = `#${model_type}-model-settings-container`;\n  //     model_settings_container = this.settings_container.querySelector(container_id);\n  //     if(!model_settings_container) {\n  //       model_settings_container = document.createElement('div');\n  //       model_settings_container.id = container_id;\n  //       this.settings_container.appendChild(model_settings_container);\n  //     }\n  //     model_settings_container.innerHTML = '<div class=\"sc-loading\">Loading ' + this.adapter_name + ' settings...</div>';\n  //   }\n  //   const frag = await this.render_settings_component(this, opts);\n  //   if(model_settings_container) {\n  //     model_settings_container.innerHTML = '';\n  //     model_settings_container.appendChild(frag);\n  //     this.smart_view.on_open_overlay(model_settings_container);\n  //   }\n  //   return frag;\n  // }\n};\n__publicField(SmartModel, \"defaults\", {\n  // override in sub-class if needed\n});\n\n// smart_embed_model.js\nvar SmartEmbedModel = class extends SmartModel {\n  /**\n   * Create a SmartEmbedModel instance\n   * @param {Object} opts - Configuration options\n   * @param {Object} [opts.adapters] - Map of available adapter implementations\n   * @param {boolean} [opts.use_gpu] - Whether to enable GPU acceleration\n   * @param {number} [opts.gpu_batch_size] - Batch size when using GPU\n   * @param {number} [opts.batch_size] - Default batch size for processing\n   * @param {Object} [opts.model_config] - Model-specific configuration\n   * @param {string} [opts.model_config.adapter] - Override adapter type\n   * @param {number} [opts.model_config.dims] - Embedding dimensions\n   * @param {number} [opts.model_config.max_tokens] - Maximum tokens to process\n   * @param {Object} [opts.settings] - User settings\n   * @param {string} [opts.settings.api_key] - API key for remote models\n   * @param {number} [opts.settings.min_chars] - Minimum text length to embed\n   */\n  constructor(opts = {}) {\n    super(opts);\n    __publicField(this, \"scope_name\", \"smart_embed_model\");\n  }\n  /**\n   * Count tokens in an input string\n   * @param {string} input - Text to tokenize\n   * @returns {Promise<Object>} Token count result\n   * @property {number} tokens - Number of tokens in input\n   * \n   * @example\n   * ```javascript\n   * const result = await model.count_tokens(\"Hello world\");\n   * console.log(result.tokens); // 2\n   * ```\n   */\n  async count_tokens(input) {\n    return await this.invoke_adapter_method(\"count_tokens\", input);\n  }\n  /**\n   * Generate embeddings for a single input\n   * @param {string|Object} input - Text or object with embed_input property\n   * @returns {Promise<Object>} Embedding result\n   * @property {number[]} vec - Embedding vector\n   * @property {number} tokens - Token count\n   * \n   * @example\n   * ```javascript\n   * const result = await model.embed(\"Hello world\");\n   * console.log(result.vec); // [0.1, 0.2, ...]\n   * ```\n   */\n  async embed(input) {\n    if (typeof input === \"string\") input = { embed_input: input };\n    return (await this.embed_batch([input]))[0];\n  }\n  /**\n   * Generate embeddings for multiple inputs in batch\n   * @param {Array<string|Object>} inputs - Array of texts or objects with embed_input\n   * @returns {Promise<Array<Object>>} Array of embedding results\n   * @property {number[]} vec - Embedding vector for each input\n   * @property {number} tokens - Token count for each input\n   * \n   * @example\n   * ```javascript\n   * const results = await model.embed_batch([\n   *   { embed_input: \"First text\" },\n   *   { embed_input: \"Second text\" }\n   * ]);\n   * ```\n   */\n  async embed_batch(inputs) {\n    return await this.invoke_adapter_method(\"embed_batch\", inputs);\n  }\n  /**\n   * Get the current batch size based on GPU settings\n   * @returns {number} Current batch size for processing\n   */\n  get batch_size() {\n    return this.adapter.batch_size || 1;\n  }\n  /**\n   * Get settings configuration schema\n   * @returns {Object} Settings configuration object\n   */\n  get settings_config() {\n    const _settings_config = {\n      adapter: {\n        name: \"Embedding Model Platform\",\n        type: \"dropdown\",\n        description: \"Select an embedding model platform.\",\n        options_callback: \"get_platforms_as_options\",\n        callback: \"adapter_changed\",\n        default: this.constructor.defaults.adapter\n      },\n      ...this.adapter.settings_config || {}\n    };\n    return this.process_settings_config(_settings_config);\n  }\n  process_setting_key(key) {\n    return key.replace(/\\[ADAPTER\\]/g, this.adapter_name);\n  }\n  /**\n   * Get available embedding model options\n   * @returns {Array<Object>} Array of model options with value and name\n   */\n  get_embedding_model_options() {\n    return Object.entries(this.models).map(([key, model2]) => ({ value: key, name: key }));\n  }\n  /**\n   * Get embedding model options including 'None' option\n   * @returns {Array<Object>} Array of model options with value and name\n   */\n  get_block_embedding_model_options() {\n    const options = this.get_embedding_model_options();\n    options.unshift({ value: \"None\", name: \"None\" });\n    return options;\n  }\n};\n__publicField(SmartEmbedModel, \"defaults\", {\n  adapter: \"transformers\"\n});\n\n// ../smart-model/adapters/_adapter.js\nvar SmartModelAdapter = class {\n  /**\n   * Create a SmartModelAdapter instance.\n   * @param {SmartModel} model - The parent SmartModel instance\n   */\n  constructor(model2) {\n    this.model = model2;\n    this.state = \"unloaded\";\n  }\n  /**\n   * Load the adapter.\n   * @async\n   * @returns {Promise<void>}\n   */\n  async load() {\n    this.set_state(\"loaded\");\n  }\n  /**\n   * Unload the adapter.\n   * @returns {void}\n   */\n  unload() {\n    this.set_state(\"unloaded\");\n  }\n  /**\n   * Get all settings.\n   * @returns {Object} All settings\n   */\n  get settings() {\n    return this.model.settings;\n  }\n  /**\n   * Get the current model key.\n   * @returns {string} Current model identifier\n   */\n  get model_key() {\n    return this.model.model_key;\n  }\n  /**\n   * Get the current model configuration.\n   * @returns {Object} Model configuration\n   */\n  get model_config() {\n    return this.model.model_config;\n  }\n  /**\n   * Get model-specific settings.\n   * @returns {Object} Settings for current model\n   */\n  get model_settings() {\n    return this.model.model_settings;\n  }\n  /**\n   * Get adapter-specific configuration.\n   * @returns {Object} Adapter configuration\n   */\n  get adapter_config() {\n    return this.model.adapter_config;\n  }\n  /**\n   * Get adapter-specific settings.\n   * @returns {Object} Adapter settings\n   */\n  get adapter_settings() {\n    return this.model.adapter_settings;\n  }\n  /**\n   * Get the models.\n   * @returns {Object} Map of model objects\n   */\n  get models() {\n    if (typeof this.adapter_config.models === \"object\" && Object.keys(this.adapter_config.models || {}).length > 0) return this.adapter_config.models;\n    else {\n      return {};\n    }\n  }\n  /**\n   * Get available models from the API.\n   * @abstract\n   * @param {boolean} [refresh=false] - Whether to refresh cached models\n   * @returns {Promise<Object>} Map of model objects\n   */\n  async get_models(refresh = false) {\n    throw new Error(\"get_models not implemented\");\n  }\n  /**\n   * Validate the parameters for get_models.\n   * @returns {boolean|Array<Object>} True if parameters are valid, otherwise an array of error objects\n   */\n  validate_get_models_params() {\n    return true;\n  }\n  /**\n   * Get available models as dropdown options synchronously.\n   * @returns {Array<Object>} Array of model options.\n   */\n  get_models_as_options() {\n    const models = this.models;\n    const params_valid = this.validate_get_models_params();\n    if (params_valid !== true) return params_valid;\n    if (!Object.keys(models || {}).length) {\n      this.get_models(true);\n      return [{ value: \"\", name: \"No models currently available\" }];\n    }\n    return Object.values(models).map((model2) => ({ value: model2.id, name: model2.name || model2.id })).sort((a, b) => a.name.localeCompare(b.name));\n  }\n  /**\n   * Set the adapter's state.\n   * @param {('unloaded'|'loading'|'loaded'|'unloading')} new_state - The new state\n   * @throws {Error} If the state is invalid\n   */\n  set_state(new_state) {\n    const valid_states = [\"unloaded\", \"loading\", \"loaded\", \"unloading\"];\n    if (!valid_states.includes(new_state)) {\n      throw new Error(`Invalid state: ${new_state}`);\n    }\n    this.state = new_state;\n  }\n  // Replace individual state getters/setters with a unified state management\n  get is_loading() {\n    return this.state === \"loading\";\n  }\n  get is_loaded() {\n    return this.state === \"loaded\";\n  }\n  get is_unloading() {\n    return this.state === \"unloading\";\n  }\n  get is_unloaded() {\n    return this.state === \"unloaded\";\n  }\n};\n\n// adapters/_adapter.js\nvar SmartEmbedAdapter = class extends SmartModelAdapter {\n  /**\n   * Create adapter instance\n   * @param {SmartEmbedModel} model - Parent model instance\n   */\n  constructor(model2) {\n    super(model2);\n    this.smart_embed = model2;\n  }\n  /**\n   * Count tokens in input text\n   * @abstract\n   * @param {string} input - Text to tokenize\n   * @returns {Promise<Object>} Token count result\n   * @property {number} tokens - Number of tokens in input\n   * @throws {Error} If not implemented by subclass\n   */\n  async count_tokens(input) {\n    throw new Error(\"count_tokens method not implemented\");\n  }\n  /**\n   * Generate embeddings for single input\n   * @abstract\n   * @param {string|Object} input - Text to embed\n   * @returns {Promise<Object>} Embedding result\n   * @property {number[]} vec - Embedding vector\n   * @property {number} tokens - Number of tokens in input\n   * @throws {Error} If not implemented by subclass\n   */\n  async embed(input) {\n    throw new Error(\"embed method not implemented\");\n  }\n  /**\n   * Generate embeddings for multiple inputs\n   * @abstract\n   * @param {Array<string|Object>} inputs - Texts to embed\n   * @returns {Promise<Array<Object>>} Array of embedding results\n   * @property {number[]} vec - Embedding vector for each input\n   * @property {number} tokens - Number of tokens in each input\n   * @throws {Error} If not implemented by subclass\n   */\n  async embed_batch(inputs) {\n    throw new Error(\"embed_batch method not implemented\");\n  }\n  get settings_config() {\n    return {\n      \"[ADAPTER].model_key\": {\n        name: \"Embedding Model\",\n        type: \"dropdown\",\n        description: \"Select an embedding model.\",\n        options_callback: \"adapter.get_models_as_options\",\n        callback: \"model_changed\",\n        default: this.constructor.defaults.default_model\n      }\n    };\n  }\n  get dims() {\n    return this.model_config.dims;\n  }\n  get max_tokens() {\n    return this.model_config.max_tokens;\n  }\n  // get batch_size() { return this.model_config.batch_size; }\n  get use_gpu() {\n    if (typeof this._use_gpu === \"undefined\") {\n      if (typeof this.model.opts.use_gpu !== \"undefined\") this._use_gpu = this.model.opts.use_gpu;\n      else this._use_gpu = typeof navigator !== \"undefined\" && !!navigator?.gpu && this.model_settings.gpu_batch_size !== 0;\n    }\n    return this._use_gpu;\n  }\n  set use_gpu(value) {\n    this._use_gpu = value;\n  }\n  get batch_size() {\n    if (this.use_gpu && this.model_config?.gpu_batch_size) return this.model_config.gpu_batch_size;\n    return this.model.opts.batch_size || this.model_config.batch_size || 1;\n  }\n};\n/**\n * @override in sub-class with adapter-specific default configurations\n * @property {string} id - The adapter identifier\n * @property {string} description - Human-readable description\n * @property {string} type - Adapter type (\"API\")\n * @property {string} endpoint - API endpoint\n * @property {string} adapter - Adapter identifier\n * @property {string} default_model - Default model to use\n */\n__publicField(SmartEmbedAdapter, \"defaults\", {});\n\n// adapters/transformers.js\nvar transformers_defaults = {\n  adapter: \"transformers\",\n  description: \"Transformers (Local, built-in)\",\n  default_model: \"TaylorAI/bge-micro-v2\"\n};\nvar SmartEmbedTransformersAdapter = class extends SmartEmbedAdapter {\n  /**\n   * Create transformers adapter instance\n   * @param {SmartEmbedModel} model - Parent model instance\n   */\n  constructor(model2) {\n    super(model2);\n    this.pipeline = null;\n    this.tokenizer = null;\n  }\n  /**\n   * Load model and tokenizer\n   * @returns {Promise<void>}\n   */\n  async load() {\n    await this.load_transformers();\n    this.loaded = true;\n  }\n  /**\n   * Unload model and free resources\n   * @returns {Promise<void>}\n   */\n  async unload() {\n    if (this.pipeline) {\n      if (this.pipeline.destroy) await this.pipeline.destroy();\n      this.pipeline = null;\n    }\n    if (this.tokenizer) {\n      this.tokenizer = null;\n    }\n    this.loaded = false;\n  }\n  /**\n   * Initialize transformers pipeline and tokenizer\n   * @private\n   * @returns {Promise<void>}\n   */\n  async load_transformers() {\n    const { pipeline, env, AutoTokenizer } = await import(\"@huggingface/transformers\");\n    env.allowLocalModels = false;\n    const pipeline_opts = {\n      quantized: true\n    };\n    if (this.use_gpu) {\n      console.log(\"[Transformers] Using GPU\");\n      pipeline_opts.device = \"webgpu\";\n      pipeline_opts.dtype = \"fp32\";\n    } else {\n      console.log(\"[Transformers] Using CPU\");\n      env.backends.onnx.wasm.numThreads = 8;\n    }\n    this.pipeline = await pipeline(\"feature-extraction\", this.model_key, pipeline_opts);\n    this.tokenizer = await AutoTokenizer.from_pretrained(this.model_key);\n  }\n  /**\n   * Count tokens in input text\n   * @param {string} input - Text to tokenize\n   * @returns {Promise<Object>} Token count result\n   */\n  async count_tokens(input) {\n    if (!this.tokenizer) await this.load();\n    const { input_ids } = await this.tokenizer(input);\n    return { tokens: input_ids.data.length };\n  }\n  /**\n   * Generate embeddings for multiple inputs\n   * @param {Array<Object>} inputs - Array of input objects\n   * @returns {Promise<Array<Object>>} Processed inputs with embeddings\n   */\n  async embed_batch(inputs) {\n    if (!this.pipeline) await this.load();\n    const filtered_inputs = inputs.filter((item) => item.embed_input?.length > 0);\n    if (!filtered_inputs.length) return [];\n    if (filtered_inputs.length > this.batch_size) {\n      console.log(`Processing ${filtered_inputs.length} inputs in batches of ${this.batch_size}`);\n      const results = [];\n      for (let i = 0; i < filtered_inputs.length; i += this.batch_size) {\n        const batch = filtered_inputs.slice(i, i + this.batch_size);\n        const batch_results = await this._process_batch(batch);\n        results.push(...batch_results);\n      }\n      return results;\n    }\n    return await this._process_batch(filtered_inputs);\n  }\n  /**\n   * Process a single batch of inputs\n   * @private\n   * @param {Array<Object>} batch_inputs - Batch of inputs to process\n   * @returns {Promise<Array<Object>>} Processed batch results\n   */\n  async _process_batch(batch_inputs) {\n    const tokens = await Promise.all(batch_inputs.map((item) => this.count_tokens(item.embed_input)));\n    const embed_inputs = await Promise.all(batch_inputs.map(async (item, i) => {\n      if (tokens[i].tokens < this.max_tokens) return item.embed_input;\n      let token_ct = tokens[i].tokens;\n      let truncated_input = item.embed_input;\n      while (token_ct > this.max_tokens) {\n        const pct = this.max_tokens / token_ct;\n        const max_chars = Math.floor(truncated_input.length * pct * 0.9);\n        truncated_input = truncated_input.substring(0, max_chars) + \"...\";\n        token_ct = (await this.count_tokens(truncated_input)).tokens;\n      }\n      tokens[i].tokens = token_ct;\n      return truncated_input;\n    }));\n    try {\n      const resp = await this.pipeline(embed_inputs, { pooling: \"mean\", normalize: true });\n      return batch_inputs.map((item, i) => {\n        item.vec = Array.from(resp[i].data).map((val) => Math.round(val * 1e8) / 1e8);\n        item.tokens = tokens[i].tokens;\n        return item;\n      });\n    } catch (err) {\n      console.error(\"error_processing_batch\", err);\n      return Promise.all(batch_inputs.map(async (item) => {\n        try {\n          const result = await this.pipeline(item.embed_input, { pooling: \"mean\", normalize: true });\n          item.vec = Array.from(result[0].data).map((val) => Math.round(val * 1e8) / 1e8);\n          item.tokens = (await this.count_tokens(item.embed_input)).tokens;\n          return item;\n        } catch (single_err) {\n          console.error(\"error_processing_single_item\", single_err);\n          return {\n            ...item,\n            vec: [],\n            tokens: 0,\n            error: single_err.message\n          };\n        }\n      }));\n    }\n  }\n  /** @returns {Object} Settings configuration for transformers adapter */\n  get settings_config() {\n    return transformers_settings_config;\n  }\n  /**\n   * Get available models (hardcoded list)\n   * @returns {Promise<Object>} Map of model objects\n   */\n  get_models() {\n    return Promise.resolve(this.models);\n  }\n  get models() {\n    return transformers_models;\n  }\n};\n__publicField(SmartEmbedTransformersAdapter, \"defaults\", transformers_defaults);\nvar transformers_models = {\n  \"TaylorAI/bge-micro-v2\": {\n    \"id\": \"TaylorAI/bge-micro-v2\",\n    \"batch_size\": 1,\n    \"dims\": 384,\n    \"max_tokens\": 512,\n    \"name\": \"BGE-micro-v2\",\n    \"description\": \"Local, 512 tokens, 384 dim (recommended)\",\n    \"adapter\": \"transformers\"\n  },\n  \"TaylorAI/gte-tiny\": {\n    \"id\": \"TaylorAI/gte-tiny\",\n    \"batch_size\": 1,\n    \"dims\": 384,\n    \"max_tokens\": 512,\n    \"name\": \"GTE-tiny\",\n    \"description\": \"Local, 512 tokens, 384 dim\",\n    \"adapter\": \"transformers\"\n  },\n  \"Mihaiii/Ivysaur\": {\n    \"id\": \"Mihaiii/Ivysaur\",\n    \"batch_size\": 1,\n    \"dims\": 384,\n    \"max_tokens\": 512,\n    \"name\": \"Ivysaur\",\n    \"description\": \"Local, 512 tokens, 384 dim\",\n    \"adapter\": \"transformers\"\n  },\n  \"andersonbcdefg/bge-small-4096\": {\n    \"id\": \"andersonbcdefg/bge-small-4096\",\n    \"batch_size\": 1,\n    \"dims\": 384,\n    \"max_tokens\": 4096,\n    \"name\": \"BGE-small-4K\",\n    \"description\": \"Local, 4,096 tokens, 384 dim\",\n    \"adapter\": \"transformers\"\n  },\n  \"Xenova/jina-embeddings-v2-base-zh\": {\n    \"id\": \"Xenova/jina-embeddings-v2-base-zh\",\n    \"batch_size\": 1,\n    \"dims\": 768,\n    \"max_tokens\": 8192,\n    \"name\": \"Jina-v2-base-zh-8K\",\n    \"description\": \"Local, 8,192 tokens, 768 dim, Chinese/English bilingual\",\n    \"adapter\": \"transformers\"\n  },\n  \"Xenova/jina-embeddings-v2-small-en\": {\n    \"id\": \"Xenova/jina-embeddings-v2-small-en\",\n    \"batch_size\": 1,\n    \"dims\": 512,\n    \"max_tokens\": 8192,\n    \"name\": \"Jina-v2-small-en\",\n    \"description\": \"Local, 8,192 tokens, 512 dim\",\n    \"adapter\": \"transformers\"\n  },\n  \"nomic-ai/nomic-embed-text-v1.5\": {\n    \"id\": \"nomic-ai/nomic-embed-text-v1.5\",\n    \"batch_size\": 1,\n    \"dims\": 768,\n    \"max_tokens\": 2048,\n    \"name\": \"Nomic-embed-text-v1.5\",\n    \"description\": \"Local, 8,192 tokens, 768 dim\",\n    \"adapter\": \"transformers\"\n  },\n  \"Xenova/bge-small-en-v1.5\": {\n    \"id\": \"Xenova/bge-small-en-v1.5\",\n    \"batch_size\": 1,\n    \"dims\": 384,\n    \"max_tokens\": 512,\n    \"name\": \"BGE-small\",\n    \"description\": \"Local, 512 tokens, 384 dim\",\n    \"adapter\": \"transformers\"\n  },\n  \"nomic-ai/nomic-embed-text-v1\": {\n    \"id\": \"nomic-ai/nomic-embed-text-v1\",\n    \"batch_size\": 1,\n    \"dims\": 768,\n    \"max_tokens\": 2048,\n    \"name\": \"Nomic-embed-text\",\n    \"description\": \"Local, 2,048 tokens, 768 dim\",\n    \"adapter\": \"transformers\"\n  }\n};\nvar transformers_settings_config = {\n  \"[ADAPTER].gpu_batch_size\": {\n    name: \"GPU Batch Size\",\n    type: \"number\",\n    description: \"Number of embeddings to process per batch on GPU. Use 0 to disable GPU.\",\n    placeholder: \"Enter number ex. 10\"\n  },\n  \"[ADAPTER].legacy_transformers\": {\n    name: \"Legacy Transformers (no GPU)\",\n    type: \"toggle\",\n    description: \"Use legacy transformers (v2) instead of v3.\",\n    callback: \"embed_model_changed\",\n    default: true\n  }\n};\n\n// build/transformers_iframe_script.js\nvar model = null;\nasync function process_message(data) {\n  const { method, params, id, iframe_id } = data;\n  try {\n    let result;\n    switch (method) {\n      case \"init\":\n        console.log(\"init\");\n        break;\n      case \"load\":\n        console.log(\"load\", params);\n        model = new SmartEmbedModel({\n          ...params,\n          adapters: { transformers: SmartEmbedTransformersAdapter },\n          adapter: \"transformers\",\n          settings: {}\n        });\n        await model.load();\n        result = { model_loaded: true };\n        break;\n      case \"embed_batch\":\n        if (!model) throw new Error(\"Model not loaded\");\n        result = await model.embed_batch(params.inputs);\n        break;\n      case \"count_tokens\":\n        if (!model) throw new Error(\"Model not loaded\");\n        result = await model.count_tokens(params);\n        break;\n      default:\n        throw new Error(`Unknown method: ${method}`);\n    }\n    return { id, result, iframe_id };\n  } catch (error) {\n    console.error(\"Error processing message:\", error);\n    return { id, error: error.message, iframe_id };\n  }\n}\nprocess_message({ method: \"init\" });\n";