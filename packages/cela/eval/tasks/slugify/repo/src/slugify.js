'use strict';

function slugify(text) {
  return text.toLowerCase().replace(/ /g, '-');
}

module.exports = { slugify };
