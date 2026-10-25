'use strict';

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  if (text === '') return rows;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (c === '"') {
        quoted = false;
        i += 1;
      } else {
        field += c;
        i += 1;
      }
    } else if (c === '"') {
      quoted = true;
      i += 1;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += c === '\r' ? 2 : 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (!text.endsWith('\n')) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

module.exports = { parseCSV };
