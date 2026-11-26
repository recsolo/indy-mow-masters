const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'luxe.js'), 'utf8');
const marker = '/* Carry a selected mowing package';
const start = source.indexOf(marker);
assert.ok(start >= 0, 'mowing estimate script exists');
const script = source.slice(start);

function estimate(frequency, grass = 'No', city = 'Indianapolis', rate = 40) {
  const form = { elements: {
    service: { value: 'Lawn Mowing' },
    yard_size: { selectedOptions: [{ dataset: { rate: String(rate) } }] },
    service_plan: { selectedIndex: 0 },
    city: { value: city },
    overgrown_grass: { value: grass },
    mowing_frequency: { value: frequency },
  }, addEventListener() {} };
  const output = { textContent: '', closest: () => form };
  vm.runInNewContext(script, {
    document: { getElementById: () => output, querySelectorAll: () => [] },
    window: { addEventListener() {} },
  });
  return output.textContent;
}

test('regular weekly visit is not discounted', () => {
  assert.match(estimate('Weekly'), /\$40 per visit/);
});
test('monthly weekly prepay saves $20', () => {
  assert.match(estimate('Weekly prepaid (4 cuts)'), /\$140 for 4 cuts \(\$20 savings\)/);
});
test('monthly biweekly prepay saves $10', () => {
  assert.match(estimate('Biweekly prepaid (2 cuts)'), /\$70 for 2 cuts \(\$10 savings\)/);
});
test('overgrowth surcharge is $35 once per package', () => {
  assert.match(estimate('Weekly prepaid (4 cuts)', 'Yes (starting +$35)'), /\$175 for 4 cuts/);
  assert.match(estimate('Weekly', 'Yes (starting +$35)'), /First visit starts at \$75/);
});
test('outside-area fee is applied on each prepaid visit', () => {
  assert.match(estimate('Biweekly prepaid (2 cuts)', 'No', 'Other'), /\$90 for 2 cuts/);
});
test('one-time cut is quoted separately without a prepay discount', () => {
  const text = estimate('One-time quote');
  assert.match(text, /quoted separately at a higher rate/);
  assert.doesNotMatch(text, /savings|prepaid package/);
});
