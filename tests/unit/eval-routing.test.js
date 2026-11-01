const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { passesGate } = require('../../scripts/eval-routing');

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const normalize = (value) => value.toLowerCase().trim();

const summary = (top1, offDomain) => ({ top1, offDomain });

test('the gate passes only when accuracy and off-domain rejection meet the minimum', () => {
  assert.strictEqual(passesGate(summary('12/12', '4/4'), { minAccuracy: 1, minOffDomain: 1 }), true);
  assert.strictEqual(passesGate(summary('11/12', '4/4'), { minAccuracy: 1, minOffDomain: 1 }), false);
  assert.strictEqual(passesGate(summary('12/12', '3/4'), { minAccuracy: 1, minOffDomain: 1 }), false);
});

test('the gate defaults to no minimum and supports fractional minimums', () => {
  assert.strictEqual(passesGate(summary('0/12', '0/4'), {}), true);
  assert.strictEqual(passesGate(summary('6/12', '2/4'), { minAccuracy: 0.5, minOffDomain: 0.5 }), true);
  assert.strictEqual(passesGate(summary('5/12', '3/4'), { minAccuracy: 0.5, minOffDomain: 0.5 }), false);
});

test('an empty case set does not fail the accuracy gate', () => {
  assert.strictEqual(passesGate(summary('0/0', '0/0'), { minAccuracy: 1, minOffDomain: 1 }), true);
});

test('the holdout set is disjoint from the in-sample set', () => {
  const inSample = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'routing-cases.json'), 'utf8'));
  const holdout = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'routing-cases-holdout.json'), 'utf8'));

  const sampleQueries = new Set(
    [...inSample.cases, ...(inSample.taskQueries || [])].map((c) => normalize(c.query)),
  );
  const holdoutQueries = [...holdout.cases, ...(holdout.taskQueries || [])];
  const sampleOffDomain = new Set(inSample.offDomain.map(normalize));

  assert.ok(holdout.cases.length >= 6, 'holdout needs at least six labeled cases');
  assert.ok(holdout.offDomain.length >= 4, 'holdout needs at least four off-domain queries');

  for (const c of holdoutQueries) {
    assert.ok(!sampleQueries.has(normalize(c.query)), `holdout query leaked from in-sample: ${c.query}`);
  }
  for (const query of holdout.offDomain) {
    assert.ok(!sampleOffDomain.has(normalize(query)), `holdout off-domain leaked from in-sample: ${query}`);
  }
});
