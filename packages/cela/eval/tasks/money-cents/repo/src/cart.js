'use strict';

const round = (x) => Math.round(x * 100) / 100;

// items: [{ price: dollars, qty: integer }]
function subtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

// percent: 12.5 means 12.5%
function discount(amount, percent) {
  return round((amount * percent) / 100);
}

// rate: 0.0825 means 8.25%
function tax(amount, rate) {
  return round(amount * rate);
}

function total(items, { discountPercent = 0, taxRate = 0 } = {}) {
  const s = subtotal(items);
  const afterDiscount = s - discount(s, discountPercent);
  return round(afterDiscount + tax(afterDiscount, taxRate));
}

module.exports = { subtotal, discount, tax, total };
