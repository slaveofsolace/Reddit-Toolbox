(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  function parseCsv(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];

      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        quoted = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (char !== '\r') {
        field += char;
      }
    }

    if (quoted) throw new Error('The CSV file ends inside a quoted field.');
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    while (rows.length && rows[rows.length - 1].every((value) => value === '')) {
      rows.pop();
    }
    if (!rows.length) return [];

    const headers = rows.shift().map((header, index) => {
      const normalized = header.trim().toLowerCase().replace(/\s+/g, '_');
      return normalized || `column_${index + 1}`;
    });

    return rows
      .filter((values) => values.some((value) => value !== ''))
      .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
  }

  function toCsv(rows, columns) {
    const keys = columns || Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const encode = (value) => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return [
      keys.map(encode).join(','),
      ...rows.map((row) => keys.map((key) => encode(row[key])).join(','))
    ].join('\n');
  }

  Core.parseCsv = parseCsv;
  Core.toCsv = toCsv;
})();
