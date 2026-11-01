const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { passesGate } = require('../../scripts/eval-routing');

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const HOLDOUT = path.join(SCRIPTS, 'routing-cases-holdout.json');
const HOLDOUT_SHA256 = '2851a76fad4bfbe18ec19ee974e17272983f2ee9267339424a91c60ce9e44466';
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

test('a holdout floor of 0.875 rejects 6/8 but accepts 7/8', () => {
  assert.strictEqual(passesGate({ top1: '6/8', offDomain: '4/4' }, { minAccuracy: 0.875 }), false);
  assert.strictEqual(passesGate({ top1: '7/8', offDomain: '4/4' }, { minAccuracy: 0.875 }), true);
});

test('the gate can require a minimum number of labeled cases', () => {
  assert.strictEqual(passesGate({ top1: '0/0', offDomain: '0/0', cases: 0 }, { minCases: 8 }), false);
  assert.strictEqual(passesGate({ top1: '7/8', offDomain: '4/4', cases: 8 }, { minCases: 8 }), true);
});

test('the holdout is frozen and disjoint from the in-sample set', () => {
  const inSample = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'routing-cases.json'), 'utf8'));
  const holdoutBytes = fs.readFileSync(HOLDOUT);
  const holdout = JSON.parse(holdoutBytes);

  const sampleQueries = new Set(
    [...inSample.cases, ...(inSample.taskQueries || [])].map((c) => normalize(c.query)),
  );
  const holdoutQueries = [...holdout.cases, ...(holdout.taskQueries || [])];
  const sampleOffDomain = new Set(inSample.offDomain.map(normalize));

  assert.strictEqual(holdout.cases.length, 8, 'frozen holdout has exactly eight labeled cases');
  assert.strictEqual(holdout.offDomain.length, 4, 'frozen holdout has exactly four off-domain queries');
  assert.strictEqual(
    crypto.createHash('sha256').update(holdoutBytes).digest('hex'),
    HOLDOUT_SHA256,
    'holdout changed; record a new measurement instead of retuning it',
  );

  for (const c of holdoutQueries) {
    assert.ok(!sampleQueries.has(normalize(c.query)), `holdout query leaked from in-sample: ${c.query}`);
    assert.ok(!sampleOffDomain.has(normalize(c.query)), `holdout query is an in-sample off-domain query: ${c.query}`);
  }
  for (const query of holdout.offDomain) {
    assert.ok(!sampleOffDomain.has(normalize(query)), `holdout off-domain leaked from in-sample: ${query}`);
    assert.ok(!sampleQueries.has(normalize(query)), `holdout off-domain is an in-sample case: ${query}`);
  }
});
