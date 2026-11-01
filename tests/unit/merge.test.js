'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  segmentOpen,
  segmentClose,
  renderSegment,
  mergeIntoCategory,
  removeSegment,
  mergeAll,
} = require('../../src/merge');
const { SEGMENTS_OPEN, SEGMENTS_CLOSE } = require('../../src/lib');

const EMPTY_CATEGORY = [
  '---',
  'name: testing',
  'description: Testing category.',
  '---',
  '',
  '## Segments',
  '',
  SEGMENTS_OPEN,
  SEGMENTS_CLOSE,
  '',
].join('\n');

test('segment markers round-trip an id and description', () => {
  assert.strictEqual(segmentOpen('unit-test-writer'), '<!-- ANABOL:SEGMENT id=unit-test-writer -->');
  assert.strictEqual(
    segmentOpen('unit-test-writer', 'Write focused unit tests'),
    '<!-- ANABOL:SEGMENT id=unit-test-writer desc=Write%20focused%20unit%20tests -->',
  );
  assert.strictEqual(segmentClose('unit-test-writer'), '<!-- /ANABOL:SEGMENT id=unit-test-writer -->');
});

test('renderSegment wraps the body in open/heading/close markers', () => {
  const rendered = renderSegment({ id: 'alpha', body: 'Do alpha.', description: 'Alpha thing' });
  assert.match(rendered, /^<!-- ANABOL:SEGMENT id=alpha desc=Alpha%20thing -->\n## alpha\n\nDo alpha\.\n<!-- \/ANABOL:SEGMENT id=alpha -->\n$/);
});

test('mergeIntoCategory inserts before the closing SEGMENTS marker', () => {
  const out = mergeIntoCategory(EMPTY_CATEGORY, [{ id: 'alpha', body: 'Do alpha.' }]);
  const closeIdx = out.indexOf(SEGMENTS_CLOSE);
  const openIdx = out.indexOf(segmentOpen('alpha'));
  assert.ok(openIdx > -1, 'segment open marker present');
  assert.ok(openIdx < closeIdx, 'segment is inside the segments block');
  assert.ok(out.indexOf(segmentClose('alpha')) < closeIdx, 'segment close is inside the block');
});

test('mergeIntoCategory appends when the SEGMENTS marker is missing', () => {
  const out = mergeIntoCategory('# no markers\n', [{ id: 'alpha', body: 'Do alpha.' }]);
  assert.match(out, /# no markers[\s\S]*ANABOL:SEGMENT id=alpha/);
});

test('mergeIntoCategory keeps multiple sub-skills in order', () => {
  const out = mergeIntoCategory(EMPTY_CATEGORY, [
    { id: 'alpha', body: 'A' },
    { id: 'beta', body: 'B' },
  ]);
  assert.ok(out.indexOf('id=alpha') < out.indexOf('id=beta'));
});

test('removeSegment deletes a block even when it has a desc attribute', () => {
  const merged = mergeIntoCategory(EMPTY_CATEGORY, [
    { id: 'alpha', body: 'A', description: 'Alpha thing' },
    { id: 'beta', body: 'B' },
  ]);
  const out = removeSegment(merged, 'alpha');
  assert.ok(!out.includes('id=alpha'), 'alpha open marker removed');
  assert.ok(!out.includes('/ANABOL:SEGMENT id=alpha'), 'alpha close marker removed');
  assert.ok(!out.includes('## alpha'), 'alpha heading removed');
  assert.ok(out.includes('id=beta'), 'beta is untouched');
});

test('removeSegment is a no-op for an unknown id', () => {
  assert.strictEqual(removeSegment(EMPTY_CATEGORY, 'nope'), EMPTY_CATEGORY);
});

test('mergeAll rejects an unknown category', () => {
  assert.throws(
    () => mergeAll({ testing: EMPTY_CATEGORY }, [{ id: 'alpha', body: 'A', category: 'security' }]),
    /unknown category: security/,
  );
});

test('mergeAll merges into each declared category', () => {
  const { contents, merged } = mergeAll(
    { testing: EMPTY_CATEGORY, security: EMPTY_CATEGORY },
    [
      { id: 'alpha', body: 'A', category: 'testing' },
      { id: 'beta', body: 'B', category: 'security' },
    ],
  );
  assert.ok(contents.testing.includes('id=alpha'));
  assert.ok(!contents.testing.includes('id=beta'));
  assert.ok(contents.security.includes('id=beta'));
  assert.deepStrictEqual(merged, [
    { id: 'alpha', category: 'testing' },
    { id: 'beta', category: 'security' },
  ]);
});
