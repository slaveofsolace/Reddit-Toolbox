(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  function* csvRecords(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    let row = [];
    let field = '';
    let quoted = false;
    let closedQuote = false;

    for (let index = 0; index < source.length; index += 1) {
      if (index && index % 32_768 === 0) yield { progress: index };
      const char = source[index];

      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
          closedQuote = true;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        if (field || closedQuote) throw new Error('Unexpected quote in a CSV field.');
        quoted = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
        closedQuote = false;
      } else if (char === '\n') {
        row.push(field);
        if (row.some((value) => value !== '')) yield { values: row };
        row = [];
        field = '';
        closedQuote = false;
      } else if (char !== '\r') {
        if (closedQuote) throw new Error('Unexpected text after a quoted CSV field.');
        field += char;
      }
    }

    if (quoted) throw new Error('The CSV file ends inside a quoted field.');
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      if (row.some((value) => value !== '')) yield { values: row };
    }
  }

  function csvHeaders(values) {
    const headers = values.map((header, index) => {
      const normalized = header.trim().toLowerCase().replace(/\s+/g, '_');
      return normalized || `column_${index + 1}`;
    });
    if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV headers.');
    return headers;
  }

  function csvObject(headers, values) {
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  }

  function parseCsv(text) {
    let headers;
    const rows = [];
    for (const record of csvRecords(text)) {
      if (!record.values) continue;
      if (!headers) headers = csvHeaders(record.values);
      else rows.push(csvObject(headers, record.values));
    }
    return rows;
  }

  async function readCsvAsync(text, options = {}) {
    let headers;
    let count = 0;
    const yieldTask = options.yieldTask || (() => new Promise((resolve) => setTimeout(resolve, 0)));
    for (const record of csvRecords(text)) {
      if (options.signal?.aborted) throw new Error('Archive import cancelled.');
      if (!record.values) {
        options.onProgress?.(count);
        await yieldTask();
      } else if (!headers) {
        headers = csvHeaders(record.values);
        options.onHeaders?.(headers);
      } else {
        count += 1;
        options.onRow?.(csvObject(headers, record.values), record.values.length === headers.length);
      }
    }
    if (!headers) throw new Error('The CSV file is empty.');
    options.onProgress?.(count);
    return count;
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
  Core.readCsvAsync = readCsvAsync;
  Core.toCsv = toCsv;
})();
