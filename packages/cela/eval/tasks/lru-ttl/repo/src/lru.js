'use strict';

class LRU {
  constructor(max) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError('max must be a positive integer');
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      this.map.delete(this.map.keys().next().value);
    }
    return this;
  }

  has(key) {
    return this.map.has(key);
  }

  get size() {
    return this.map.size;
  }
}

module.exports = { LRU };
