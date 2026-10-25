'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { total, discount, tax } = require('../src/cart');

test('total applies discount then tax', () => {
  assert.equal(total([{ price: 10, qty: 2 }], { discountPercent: 10, taxRate: 0.05 }), 18.9);
});
test('discount and tax on round numbers', () => {
  assert.equal(discount(200, 25), 50);
  assert.equal(tax(100, 0.07), 7);
});
