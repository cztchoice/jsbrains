const test = require('ava');
const { chatml_to_anthropic } = require('./anthropic');

test('filters out system messages and formats correctly', t => {
  const input = {
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'How are you?' }
    ],
    model: 'test-model',
    max_tokens: 100,
    temperature: 0.5
  };

  const expected = {
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'How are you?' }
    ],
    model: 'test-model',
    max_tokens: 100,
    temperature: 0.5
  };

  const result = chatml_to_anthropic(input);
  t.deepEqual(result, expected);
});

test('adds system message context correctly', t => {
  const input = {
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'system', content: '---BEGIN NOTE---\nImportant info\n---END NOTE---' },
      { role: 'user', content: 'How are you?' }
    ],
    model: 'test-model',
    max_tokens: 100,
    temperature: 0.5
  };

  const expectedContent = '<context>\n---BEGIN NOTE---\nImportant info\n---END NOTE---\n</context>\nHow are you?';
  const result = chatml_to_anthropic(input);

  t.is(result.messages[result.messages.length - 1].content, expectedContent);
});

test('should handle tools', t => {
  const input = {
    messages: [
      { role: 'user', content: 'Hello' },
    ],
    model: 'test-model',
    max_tokens: 100,
    temperature: 0.5,
    tools: [{
      "type": "function",
      "function": {
        "name": "lookup",
        "description": "Semantic search",
        "parameters": {
          "type": "object",
          "properties": {
            "hypotheticals": {
              "type": "array",
              "items": {"type": "string"}
            }
          },
          "required": ["hypotheticals"]
        }
      }
    }]
  };
  const expected = {
    messages: [
      { role: 'user', content: 'Hello\nUse the "lookup" tool!' },
    ],
    model: 'test-model',
    system: 'Required: use the "lookup" tool!',
    max_tokens: 100,
    temperature: 0.5,
    tools: [{
      "name": "lookup",
      "description": "Semantic search",
      "input_schema": {
        "type": "object",
        "properties": {
          "hypotheticals": {
            "type": "array",
            "items": {"type": "string"}
          }
        },
        "required": ["hypotheticals"]
      }
    }]
  };
  t.deepEqual(chatml_to_anthropic(input), expected);
});


test('adds non-context system message correctly', t => {
  const input = {
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'system', content: 'Respond as if you are a helpful assistant' },
    ],
    model: 'test-model',
    max_tokens: 100,
    temperature: 0.5
  };

  const expected = {
    messages: [
      { role: 'user', content: 'Hello' },
    ],
    system: 'Respond as if you are a helpful assistant',
    model: 'test-model',
    max_tokens: 100,
    temperature: 0.5
  };

  const result = chatml_to_anthropic(input);
  t.deepEqual(result, expected);
});

test('handles message content as an array', t => {
  const input = {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "Hello"
          }
        ]
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hi!'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'How are you?'
          }
        ]
      }
    ],
    model: 'test-model',
    max_tokens: 100,
    temperature: 0.5
  };


  const expected = {
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'How are you?' }
    ],
    model: 'test-model',
    max_tokens: 100,
    temperature: 0.5
  };


  const result = chatml_to_anthropic(input);
  t.deepEqual(result, expected);
});
