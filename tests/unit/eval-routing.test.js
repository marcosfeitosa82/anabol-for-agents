const { test } = require('node:test');
const assert = require('node:assert');
const { passesGate } = require('../../scripts/eval-routing');

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
