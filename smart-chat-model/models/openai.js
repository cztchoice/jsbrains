const model_context = {
  "gpt-3.5-turbo": {
    "context": 16385,
    "max_out": 4096
  },
  "gpt-3.5-turbo-0125": {
    "context": 16385,
    "max_out": 4096
  },
  "gpt-3.5-turbo-0301": {
    "context": 4097,
    "max_out": 4097
  },
  "gpt-3.5-turbo-0613": {
    "context": 4097,
    "max_out": 4097
  },
  "gpt-3.5-turbo-1106": {
    "context": 16385,
    "max_out": 4096
  },
  "gpt-3.5-turbo-16k": {
    "context": 16385,
    "max_out": 16385
  },
  "gpt-3.5-turbo-16k-0613": {
    "context": 16385,
    "max_out": 16385
  },
  "gpt-4": {
    "context": 8192,
    "max_out": 8192
  },
  "gpt-4-0125-preview": {
    "context": 128000,
    "max_out": 4096
  },
  "gpt-4-0314": {
    "context": 8192,
    "max_out": 8192
  },
  "gpt-4-0613": {
    "context": 8192,
    "max_out": 8192
  },
  "gpt-4-1106-preview": {
    "context": 128000,
    "max_out": 4096
  },
  "gpt-4-1106-vision-preview": {
    "context": 128000,
    "max_out": 4096
  },
  "gpt-4-32k": {
    "context": 32768,
    "max_out": 32768
  },
  "gpt-4-32k-0314": {
    "context": 32768,
    "max_out": 32768
  },
  "gpt-4-32k-0613": {
    "context": 32768,
    "max_out": 32768
  },
  "gpt-4-turbo": {
    "context": 128000,
    "max_out": 4096
  },
  "gpt-4-turbo-preview": {
    "context": 128000,
    "max_out": 4096
  },
  "gpt-4-vision-preview": {
    "context": 128000,
    "max_out": 4096
  }
}
async function fetch_openai_models(api_key) {
  if (!api_key) {
    console.error('No API key provided');
    return [];
  }
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${api_key}`,
      },
    });
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    console.log('Model data retrieved:', data);
    return data.data
      .filter(model => model.id.startsWith('gpt-') && !model.id.includes('-instruct'))
      .map(model => {
        const out = {model_name: model.id, key: model.id};
        if(model_context[model.id]) {
          out.max_input_tokens = model_context[model.id].context;
          out.description = `context: ${model_context[model.id].context}, output: ${model_context[model.id].max_out}`;
        }
        return out;
      })
    ;
  } catch (error) {
    console.error('Failed to fetch model data:', error);
    return [];
  }
}
exports.fetch_openai_models = fetch_openai_models;