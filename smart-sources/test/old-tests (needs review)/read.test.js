import test from 'ava';
import { load_test_env } from './_env.js';
import { increase_heading_depth } from '../../smart-sources/utils/increase_heading_depth.js';

test.beforeEach(async t => {
  await load_test_env(t);
});

const initial_content = `# Heading 1
## Heading 2
Some content
### Heading 3
More content`;

test('SmartSource read - default behavior', async t => {
  const env = t.context.env;
  await t.context.fs.write('test.md', 'Test content');
  const source = await env.smart_sources.create_or_update({ path: 'test.md' });
  try {
    const content = await source.read();
    t.is(content, 'Test content', 'Read content should match written content');
  } catch (error) {
    console.error('Error during read:', error);
    t.fail(`Read failed: ${error.message}`);
  }
});


test.serial('SmartSource read - with add_depth option', async t => {
  const env = t.context.env;
  await t.context.fs.write('test_depth.md', initial_content);
  const source = await env.smart_sources.create_or_update({ path: 'test_depth.md' });
  const block = source.blocks[0];

  const content_depth_1 = await block.read({ add_depth: 1, headings: 'all' });
  const expected_depth_1 = `## Heading 1
### Heading 2
Some content`;
  t.is(content_depth_1, expected_depth_1, 'Should increase heading depth by 1');

  const content_depth_2 = await block.read({ add_depth: 2, headings: 'all' });
  const expected_depth_2 = `### Heading 1
#### Heading 2
Some content`;
  t.is(content_depth_2, expected_depth_2, 'Should increase heading depth by 2');
});

test.serial('SmartSource read - with headings option (all)', async t => {
  const env = t.context.env;
  const some_content = `Some content`;
  const block = await env.smart_blocks.create('test_headings.md#Section 1#Subsection A', some_content);
  const content_all_headings = await block.read({ headings: 'all' });
  const expected_all_headings = `# Section 1
## Subsection A
${some_content}`;
  t.is(content_all_headings, expected_all_headings, 'Should prepend all headings');
});

test.serial('SmartSource read - with headings option (last)', async t => {
  const env = t.context.env;
  const some_content = `Some content`;
  const block = await env.smart_blocks.create('test_headings_last.md#Section 1#Subsection A', some_content);

  const content_last_heading = await block.read({ headings: 'last' });
  const expected_last_heading = `## Subsection A
${some_content}`;
  t.is(content_last_heading, expected_last_heading, 'Should prepend only the last heading');
});

test.serial('increase_heading_depth', async t => {
  const content = `# Heading 1
## Heading 2
Some content
### Heading 3
More content`;
  const depth = 1;
  const expected_content = `## Heading 1
### Heading 2
Some content
#### Heading 3
More content`;
  t.is(increase_heading_depth(content, depth), expected_content, 'Should increase heading depth by 1');
});