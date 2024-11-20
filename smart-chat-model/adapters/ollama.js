import { SmartChatModelApiAdapter } from "./_api.js";

/**
 * Adapter for Ollama's local API.
 * Handles communication with locally running Ollama instance.
 * @class SmartChatModelOllamaAdapter
 * @extends SmartChatModelApiAdapter
 */
export class SmartChatModelOllamaAdapter extends SmartChatModelApiAdapter {
  static defaults = {
    description: "Ollama (Local)",
    type: "API",
    models_endpoint: "http://localhost:11434/api/tags",
    endpoint: "http://localhost:11434/api/chat",
    api_key: 'na',
  }

  /**
   * Get parameters for models request - no auth needed for local instance
   * @returns {Object} Request parameters
   */
  get models_request_params() {
    return {
      url: this.adapter_config.models_endpoint,
    };
  }

  /**
   * Get available models from local Ollama instance
   * @param {boolean} [refresh=false] - Whether to refresh cached models
   * @returns {Promise<Object>} Map of model objects
   */
  async get_models(refresh=false) {
    console.log('get_models', refresh);
    if(!refresh
      && this.adapter_config?.models
      && typeof this.adapter_config.models === 'object'
      && Object.keys(this.adapter_config.models).length > 0
    ) return this.adapter_config.models; // return cached models if not refreshing
    try {
      console.log('models_request_params', this.models_request_params);
      const list_resp = await this.http_adapter.request(this.models_request_params);
      console.log('list_response', list_resp);
      const list_data = await list_resp.json();
      // get model details for each model in list
      const models_raw_data = [];
      for(const model of list_data.models){
        const model_details_resp = await this.http_adapter.request({
          url: `http://localhost:11434/api/show`,
          method: 'POST',
          body: JSON.stringify({model: model.name}),
        });
        console.log('model_details_response', model_details_resp);
        const model_details_data = await model_details_resp.json();
        console.log('model_details_data', model_details_data);
        models_raw_data.push({...model_details_data, name: model.name});
      }
      const model_data = this.parse_model_data(models_raw_data);
      console.log('model_data', model_data);
      this.adapter_settings.models = model_data; // set to adapter_settings to persist
      this.model.render_settings(); // re-render settings to update models dropdown
      return model_data;

    } catch (error) {
      console.error('Failed to fetch model data:', error);
      return {"_": {id: `Failed to fetch models from ${this.model.adapter_name}`}};
    }
  }

  /**
   * Parse model data from Ollama API response
   * @param {Object[]} model_data - Raw model data from Ollama
   * @returns {Object} Map of model objects with capabilities and limits
   */
  parse_model_data(model_data) {
    return model_data
      .reduce((acc, model) => {
        const out = {
          model_name: model.name,
          id: model.name,
          multimodal: false,
          max_input_tokens: Object.entries(model.model_info).find(m => m[0].includes('.context_length'))[1],
        };
        acc[model.name] = out;
        return acc;
      }, {})
    ;
  }

  /**
   * Override settings config to remove API key setting since not needed for local instance
   * @returns {Object} Settings configuration object
   */
  get settings_config() {
    const config = super.settings_config;
    delete config['[CHAT_ADAPTER].api_key'];
    return config;
  }
}

// Request
// curl http://localhost:11434/api/show -d '{
//   "model": "llama3.2"
// }'
// Response
// {
//   "modelfile": "# Modelfile generated by \"ollama show\"\n# To build a new Modelfile based on this one, replace the FROM line with:\n# FROM llava:latest\n\nFROM /Users/matt/.ollama/models/blobs/sha256:200765e1283640ffbd013184bf496e261032fa75b99498a9613be4e94d63ad52\nTEMPLATE \"\"\"{{ .System }}\nUSER: {{ .Prompt }}\nASSISTANT: \"\"\"\nPARAMETER num_ctx 4096\nPARAMETER stop \"\u003c/s\u003e\"\nPARAMETER stop \"USER:\"\nPARAMETER stop \"ASSISTANT:\"",
//   "parameters": "num_keep                       24\nstop                           \"<|start_header_id|>\"\nstop                           \"<|end_header_id|>\"\nstop                           \"<|eot_id|>\"",
//   "template": "{{ if .System }}<|start_header_id|>system<|end_header_id|>\n\n{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>\n\n{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>\n\n{{ .Response }}<|eot_id|>",
//   "details": {
//     "parent_model": "",
//     "format": "gguf",
//     "family": "llama",
//     "families": [
//       "llama"
//     ],
//     "parameter_size": "8.0B",
//     "quantization_level": "Q4_0"
//   },
//   "model_info": {
//     "general.architecture": "llama",
//     "general.file_type": 2,
//     "general.parameter_count": 8030261248,
//     "general.quantization_version": 2,
//     "llama.attention.head_count": 32,
//     "llama.attention.head_count_kv": 8,
//     "llama.attention.layer_norm_rms_epsilon": 0.00001,
//     "llama.block_count": 32,
//     "llama.context_length": 8192,
//     "llama.embedding_length": 4096,
//     "llama.feed_forward_length": 14336,
//     "llama.rope.dimension_count": 128,
//     "llama.rope.freq_base": 500000,
//     "llama.vocab_size": 128256,
//     "tokenizer.ggml.bos_token_id": 128000,
//     "tokenizer.ggml.eos_token_id": 128009,
//     "tokenizer.ggml.merges": [],            // populates if `verbose=true`
//     "tokenizer.ggml.model": "gpt2",
//     "tokenizer.ggml.pre": "llama-bpe",
//     "tokenizer.ggml.token_type": [],        // populates if `verbose=true`
//     "tokenizer.ggml.tokens": []             // populates if `verbose=true`
//   }
// }