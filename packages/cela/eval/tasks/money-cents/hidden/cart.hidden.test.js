'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { subtotal, discount, tax, total } = require('../src/cart');

test('subtotal is exact', () => {
  assert.equal(subtotal([{ price: 0.1, qty: 3 }]), 0.3);
  assert.equal(subtotal([{ price: 19.99, qty: 3 }, { price: 0.01, qty: 1 }]), 59.98);
  assert.equal(subtotal([{ price: 4.35, qty: 100 }]), 435);
});
test('discount rounds half up', () => {
  assert.equal(discount(1.15, 50), 0.58);
  assert.equal(discount(0.05, 10), 0.01);
  assert.equal(discount(80.45, 12.5), 10.06);
});
test('tax rounds half up', () => {
  assert.equal(tax(10, 0.0825), 0.83);
  assert.equal(tax(1.3, 0.05), 0.07);
  assert.equal(tax(2.01, 0.075), 0.15);
});
test('total is exact end to end', () => {
  assert.equal(total([{ price: 19.99, qty: 3 }], { discountPercent: 12.5, taxRate: 0.0825 }), 56.8);
  assert.equal(total([{ price: 0.1, qty: 3 }, { price: 0.2, qty: 1 }]), 0.5);
  assert.equal(total([{ price: 1.15, qty: 1 }], { discountPercent: 50 }), 0.57);
});
