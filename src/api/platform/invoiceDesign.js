// Closed-set, tenant-owned invoice styles. No arbitrary HTML, CSS, scripts or
// external asset URLs enter the PDF renderer or the historical document ledger.
export const INVOICE_TEMPLATES = Object.freeze({
  modern: { label: 'Modern', accent: '#215995', dark: '#193451', pale: '#f2f6fa' },
  classic: { label: 'Classic', accent: '#71562b', dark: '#292e36', pale: '#f9f6ef' },
  minimal: { label: 'Minimal', accent: '#343a40', dark: '#1b2530', pale: '#f7f8f9' },
  corporate: { label: 'Corporate', accent: '#303d82', dark: '#182e55', pale: '#f2f3fa' }
});
export const DEFAULT_INVOICE_DESIGN = Object.freeze({
  template: 'modern',
  primaryColor: '',
  paperFormat: 'A4',
  showPropertyAddress: true,
  showIssuerContact: true,
  footerText: ''
});
const reject = (field, message) => {
  const error = new Error(message);
  error.code = 'INVALID_INVOICE_DESIGN';
  error.status = 400;
  error.details = { field };
  throw error;
};
export const normalizeInvoiceDesign = (value = {}) => {
  if (value === null || value === undefined) value = {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    reject('design', 'Invoice design must be a structured object.');
  }
  const allowed = Object.keys(DEFAULT_INVOICE_DESIGN);
  const extra = Object.keys(value).find(k => !allowed.includes(k));
  if (extra) reject(extra, 'Unsupported invoice design field.');
  const template = value.template ?? DEFAULT_INVOICE_DESIGN.template;
  if (!Object.hasOwn(INVOICE_TEMPLATES, template)) {
    reject('template', 'Choose a curated invoice layout.');
  }
  const color = value.primaryColor ?? '';
  if (typeof color !== 'string' || (color && !/^#[0-9a-f]{6}$/i.test(color))) {
    reject('primaryColor', 'Use a six-digit hexadecimal brand color.');
  }
  // Limit custom heading colors to dark enough values for white text and
  // legible grayscale printing. White, high-luminance and transparent colors
  // cannot be used to make invoice labels effectively invisible.
  if (color) {
    const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
    const linear = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    if (linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 > 0.18) {
      reject('primaryColor', 'Use a darker color for accessible invoice headings.');
    }
  }
  const paperFormat = value.paperFormat ?? 'A4';
  if (!['A4', 'Letter'].includes(paperFormat)) reject('paperFormat', 'Choose A4 or Letter paper.');
  const showPropertyAddress = value.showPropertyAddress ?? true;
  const showIssuerContact = value.showIssuerContact ?? true;
  if (typeof showPropertyAddress !== 'boolean' || typeof showIssuerContact !== 'boolean') {
    reject('visibility', 'Optional detail visibility must be true or false.');
  }
  const footerText = value.footerText ?? '';
  if (typeof footerText !== 'string' || footerText.length > 160 ||
    /[^\x20-\x7e]/.test(footerText)) {
    reject('footerText', 'Use up to 160 printable Latin characters for the footer.');
  }
  return { template, primaryColor: color.toLowerCase(), paperFormat,
    showPropertyAddress, showIssuerContact, footerText: footerText.trim() };
};
