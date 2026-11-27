import { v5 as uuidv5 } from 'uuid';

const columns = ['reference', 'name', 'type', 'country', 'parent_reference'];
const propertyTypes = new Set(['house', 'condo', 'condominium', 'apartment', 'apartment complex']);

function readRows(text) {
  const rows = [];
  let row = [];
  // Match one complete CSV cell and its delimiter. Sticky matching rejects malformed quoting.
  const cell = /("(?:[^"]|"")*"|[^",\r\n]*)(,|\r\n|\r|\n)/y;
  const input = text.replace(/^\uFEFF/, '') + '\n';
  while (cell.lastIndex < input.length) {
    const match = cell.exec(input);
    if (!match) { throw new Error(`Check quotation marks in record ${rows.length + 1}.`); }
    const value = match[1].startsWith('"') ? match[1].slice(1, -1).replace(/""/g, '"') : match[1];
    row.push(value.trim());
    if (match[2] !== ',') {
      if (row.length > 1 || row[0]) { rows.push(row); }
      row = [];
      if (rows.length > 101) { throw new Error('Import up to 100 records at a time.'); }
    }
  }
  return rows;
}

export function readStockImport(text, tenantId) {
  const [header, ...rows] = readRows(text);
  if (header?.length !== columns.length || !columns.every((field, index) => header[index].toLowerCase() === field)) {
    throw new Error('Use the column headings and order in the CSV template.');
  }
  if (!rows.length) { throw new Error('Add at least one property or unit to the file.'); }
  const seen = new Set();
  const recordId = reference => uuidv5('quixo-stock-import:' + reference.toLowerCase(), tenantId);
  return rows.map((row, index) => {
    const [reference, name, typeText, countryText, parent] = row;
    const fail = message => { throw new Error(`Record ${index + 1}: ${message}`); };
    if (row.length !== columns.length) { fail('Use all five columns from the template.'); }
    if (!reference || seen.has(reference.toLowerCase())) { fail('Give each row a unique reference.'); }
    seen.add(reference.toLowerCase());
    const type = typeText.toLowerCase();
    const country = countryText.toUpperCase();
    const id = recordId(reference);
    if (!name || name.length > (type === 'unit' ? 100 : 255)) { fail('Enter a valid property or unit name.'); }
    if (type === 'unit') {
      if (country || !parent || parent.toLowerCase() === reference.toLowerCase()) {
        fail('Give the unit its parent property reference and leave its country blank.');
      }
      return {kind: 'unit', payload: {id, propertyid: recordId(parent), unitnumber: name}};
    }
    if (!propertyTypes.has(type) || !['LK', 'BN'].includes(country) || parent) {
      fail('Use a residential property type, LK or BN, and leave the parent reference blank.');
    }
    return {kind: 'property', payload: {id, name, propertytype: type, country_code: country, rentalvalues: {listingCategory: 'residential'}}};
  });
}
