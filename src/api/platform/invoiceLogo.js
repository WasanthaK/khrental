// Strict PNG-only invoice-branding asset. Stored in the authorized, audited
// tenant issuer profile and captured in issued snapshots. No remote URLs,
// SVG, HTML, dynamic CSS or executable document assets are permitted.
const MAX_BYTES = 128 * 1024;
const MAX_DIMENSION = 1024;
const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const reject = message => {
  const error = new Error(message);
  error.status = 400;
  error.code = 'INVALID_INVOICE_LOGO';
  throw error;
};
export const normalizeInvoiceLogo = value => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,')) {
    reject('Invoice logo must be an uploaded PNG image.');
  }
  const encoded = value.slice('data:image/png;base64,'.length);
  if (!encoded || encoded.length > Math.ceil(MAX_BYTES / 3) * 4 + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    reject('Invoice logo has invalid PNG bytes or exceeds 128 KB.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_BYTES) reject('Invoice logo exceeds 128 KB.');
  if (bytes.length < 45 ||
      bytes.toString('base64') !== encoded ||
      !bytes.subarray(0, 8).equals(SIGNATURE) ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString('ascii', 12, 16) !== 'IHDR') {
    reject('Invoice logo must contain a valid PNG header.');
  }
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION ||
      bytes[24] !== 8 || ![2, 6].includes(bytes[25]) ||
      bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) {
    reject('Upload an 8-bit RGB/RGBA PNG up to 1024 pixels per side.');
  }
  if (bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') {
    reject('Invoice logo PNG is incomplete.');
  }
  return 'data:image/png;base64,' + encoded;
};
export const invoiceLogoBytes = value => {
  const normalized = normalizeInvoiceLogo(value);
  return normalized ? Buffer.from(normalized.slice('data:image/png;base64,'.length), 'base64') : null;
};
