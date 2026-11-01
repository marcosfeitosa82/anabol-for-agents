'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSegment, readSegmentFile, locateByMarkers } = require('../../src/segment');

const CONTENT = [
  '---', // 1
  'name: testing', // 2
  '---', // 3
  '<!-- ANABOL:SEGMENTS -->', // 4
  '<!-- ANABOL:SEGMENT id=alpha desc=Alpha%20thing -->', // 5
  '## alpha', // 6
  '', // 7
  'Body alpha', // 8
  '<!-- /ANABOL:SEGMENT id=alpha -->', // 9
  '', // 10
  '<!-- ANABOL:SEGMENT id=beta -->', // 11
  '## beta', // 12
  '', // 13
  'Body beta', // 14
  '<!-- /ANABOL:SEGMENT id=beta -->', // 15
  '<!-- /ANABOL:SEGMENTS -->', // 16
].join('\n');

test('locateByMarkers returns the segment body range', () => {
  const lines = CONTENT.split('\n');
  assert.deepStrictEqual(locateByMarkers(lines, 'alpha'), { startLine: 6, endLine: 8 });
  assert.deepStrictEqual(locateByMarkers(lines, 'beta'), { startLine: 12, endLine: 14 });
  assert.strictEqual(locateByMarkers(lines, 'missing'), null);
});

test('readSegment uses the fast path when the stored lines are valid', () => {
  const result = readSegment(CONTENT, {
    id: 'alpha',
    startLine: 6,
    endLine: 8,
    anchor: '## alpha',
  });
  assert.strictEqual(result.usedFallback, false);
  assert.strictEqual(result.linesRead, 3);
  assert.strictEqual(result.text, '## alpha\n\nBody alpha');
});

test('readSegment falls back to markers when lines shifted', () => {
  // Simulate a user adding 10 lines at the top without reindexing.
  const shifted = Array(10).fill('extra').join('\n') + '\n' + CONTENT;
  const result = readSegment(shifted, {
    id: 'beta',
    startLine: 12, // stale
    endLine: 14, // stale
    anchor: '## beta',
  });
  assert.strictEqual(result.usedFallback, true);
  assert.strictEqual(result.text, '## beta\n\nBody beta');
  assert.strictEqual(result.startLine, 22);
  assert.strictEqual(result.endLine, 24);
});

test('readSegment falls back when the anchor no longer matches', () => {
  const edited = CONTENT.replace('## alpha', '## alpha-renamed');
  const result = readSegment(edited, {
    id: 'alpha',
    startLine: 6,
    endLine: 8,
    anchor: '## alpha',
  });
  assert.strictEqual(result.usedFallback, true);
  assert.ok(result.text.includes('## alpha-renamed'));
});

test('readSegment throws for an unknown id', () => {
  assert.throws(
    () => readSegment(CONTENT, { id: 'nope', startLine: 1, endLine: 2, anchor: 'x' }),
    /segment not found: nope/,
  );
});

test('readSegment reads only the segment, not the whole file', () => {
  const result = readSegment(CONTENT, { id: 'alpha', startLine: 6, endLine: 8, anchor: '## alpha' });
  const totalLines = CONTENT.split('\n').length;
  assert.ok(result.linesRead < totalLines);
  assert.ok(!result.text.includes('Body beta'));
});

test('readSegmentFile reads from disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-segment-'));
  const file = path.join(dir, 'SKILL.md');
  fs.writeFileSync(file, CONTENT, 'utf8');
  try {
    const result = readSegmentFile(file, { id: 'beta', startLine: 12, endLine: 14, anchor: '## beta' });
    assert.strictEqual(result.text, '## beta\n\nBody beta');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
