'use strict';

class LRU {
  constructor(max, { ttlMs, now = Date.now } = {}) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError('max must be a positive integer');
    this.max = max;
    this.ttlMs = ttlMs;
    this.now = now;
    this.map = new Map();
  }

  expired(entry) {
    return this.ttlMs != null && this.now() - entry.at >= this.ttlMs;
  }

  purge() {
    for (const [key, entry] of this.map) {
      if (this.expired(entry)) this.map.delete(key);
    }
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this.expired(entry)) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, at: this.now() });
    this.purge();
    if (this.map.size > this.max) {
      this.map.delete(this.map.keys().next().value);
    }
    return this;
  }

  has(key) {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (this.expired(entry)) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  get size() {
    this.purge();
    return this.map.size;
  }
}

module.exports = { LRU };
