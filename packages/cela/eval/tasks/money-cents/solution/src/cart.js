'use strict';

const toCents = (dollars) => Math.round(dollars * 100);
const toDollars = (cents) => cents / 100;
// cents * basisPoints / 10000, rounded half up, for non-negative inputs
const applyBp = (cents, bp) => Math.floor((cents * bp + 5000) / 10000);

function subtotalCents(items) {
  return items.reduce((sum, item) => sum + toCents(item.price) * item.qty, 0);
}

function subtotal(items) {
  return toDollars(subtotalCents(items));
}

function discount(amount, percent) {
  return toDollars(applyBp(toCents(amount), Math.round(percent * 100)));
}

function tax(amount, rate) {
  return toDollars(applyBp(toCents(amount), Math.round(rate * 10000)));
}

function total(items, { discountPercent = 0, taxRate = 0 } = {}) {
  const s = subtotalCents(items);
  const after = s - applyBp(s, Math.round(discountPercent * 100));
  return toDollars(after + applyBp(after, Math.round(taxRate * 10000)));
}

module.exports = { subtotal, discount, tax, total };
