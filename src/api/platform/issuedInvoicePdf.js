import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Render only the server-side, tenant-authorized issued invoice. The PDF is
// attached to the controlled invoice email, never made into a public URL.
const ascii = (value, max = 400) => String(value ?? '')
  .replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E]/g, '?')
  .trim().slice(0, max);

const money = (amount, { allowNegative = false } = {}) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || (value < 0 && !allowNegative) || Math.abs(value) > 1e12) {
    throw new Error('Invoice has an invalid amount.');
  }
  return 'LKR ' + value.toFixed(2);
};

const displayDate = value => {
  if (!value) return 'Not specified';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not specified' : date.toISOString().slice(0, 10);
};

export const normalizeIssuedInvoicePdf = ({ invoice, components, paymentInstructions }) => {
  if (!invoice?.id || !invoice?.tenant_id || !invoice?.renteeid || !invoice?.propertyid
    || String(invoice?.status || '').toLowerCase() === 'draft') {
    throw new Error('Only a tenant-scoped issued invoice may be rendered.');
  }
  if (!Array.isArray(components) || components.length === 0 || components.length > 300) {
    throw new Error('Issued invoice components are unavailable.');
  }
  const lines = components.map(c => ({
    description: ascii(c.description || c.component_type || 'Charge', 150),
    amount: money(c.amount, { allowNegative: String(c.component_type || '').toLowerCase() === 'adjustment' })
  }));
  const total = Number(invoice.totalamount);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Issued invoice total is invalid.');
  const sum = components.reduce((acc, row) => acc + Math.round(Number(row.amount) * 100), 0);
  if (!Number.isFinite(sum) || Math.abs(sum - Math.round(total * 100)) > 1) {
    throw new Error('Invoice components do not reconcile with the issued total.');
  }
  const bank = paymentInstructions && ['unit','property'].includes(paymentInstructions.source) &&
    paymentInstructions.bankName && paymentInstructions.branch && paymentInstructions.accountNumber
    ? {
      bankName: ascii(paymentInstructions.bankName, 180),
      branch: ascii(paymentInstructions.branch, 180),
      accountNumber: ascii(paymentInstructions.accountNumber, 180)
    } : null;
  return {
    id: ascii(invoice.id, 80),
    billingPeriod: ascii(invoice.billingperiod || 'Not specified', 100),
    propertyName: ascii(invoice.property_name || 'Not specified', 160),
    renterName: ascii(invoice.rentee_name || 'Not specified', 160),
    issueDate: displayDate(invoice.issued_at || invoice.createdat),
    dueDate: displayDate(invoice.duedate),
    lines,
    total: money(total),
    bank
  };
};

export const createIssuedInvoicePdfAttachment = async args => {
  try {
    const model = normalizeIssuedInvoicePdf(args);
    const pdf = await PDFDocument.create();
    const normal = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const size = { width: 595.28, height: 841.89 }; // A4
    const margin = 48;
    let page = pdf.addPage([size.width, size.height]);
    let y = size.height - margin;

    const newline = (count = 1) => { y -= count * 18; };
    const nextPage = () => {
      page = pdf.addPage([size.width, size.height]);
      y = size.height - margin;
    };
    const write = (value, opts = {}) => {
      const { strong = false, fontSize = 10, indent = 0, allowWrap = true } = opts;
      const font = strong ? bold : normal;
      const str = ascii(value, 500);
      const width = size.width - margin * 2 - indent;
      const pieces = [];
      let current = '';
      for (const word of (str.split(/\s+/).filter(Boolean))) {
        const candidate = current ? current + ' ' + word : word;
        if (allowWrap && current && font.widthOfTextAtSize(candidate, fontSize) > width) {
          pieces.push(current); current = word;
        } else current = candidate;
      }
      if (current) pieces.push(current);
      for (let piece of pieces.length ? pieces : ['']) {
        // Very long unbroken identifiers must not overflow the page.
        while (font.widthOfTextAtSize(piece, fontSize) > width && piece.length > 1) {
          piece = piece.slice(0, -1);
        }
        if (y < margin + 42) nextPage();
        page.drawText(piece, { x: margin + indent, y, font, size: fontSize, color: rgb(0.12,0.16,0.24) });
        newline();
      }
    };
    const rule = () => {
      if (y < margin + 28) nextPage();
      page.drawLine({start:{x:margin,y},end:{x:size.width-margin,y},thickness:0.75,color:rgb(0.82,0.85,0.9)});
      newline();
    };

    write('KH RENTALS', { strong: true, fontSize: 17 });
    write('RENTAL INVOICE', { strong: true, fontSize: 15 });
    rule();
    write('Invoice reference: ' + model.id, { strong: true });
    write('Billing period: ' + model.billingPeriod);
    write('Issue date: ' + model.issueDate);
    write('Due date: ' + model.dueDate);
    write('Property: ' + model.propertyName);
    write('Tenant: ' + model.renterName);
    newline(); write('ITEMIZED CHARGES', { strong: true }); rule();
    for (const row of model.lines) {
      write(row.description);
      write(row.amount, { strong: true, indent: 16 });
    }
    rule();
    write('INVOICE TOTAL: ' + model.total, { strong: true, fontSize: 13 });
    newline();
    write('PAYMENT INSTRUCTIONS', { strong: true });
    if (model.bank) {
      write('Bank: ' + model.bank.bankName);
      write('Branch: ' + model.bank.branch);
      write('Account number: ' + model.bank.accountNumber);
      write('Payment reference: ' + model.id);
      write('Confirm account holder details with your property manager before paying.');
    } else {
      write('Bank transfer details were not recorded when this invoice was issued.');
      write('Contact your property manager to confirm the payment destination.');
    }
    newline();
    write('Keep this invoice for your records. Payments are recorded and verified separately.', { fontSize: 9 });

    pdf.setTitle('KH Rentals Invoice ' + model.id);
    pdf.setAuthor('KH Rentals');
    pdf.setSubject('Issued rental invoice');
    const bytes = Buffer.from(await pdf.save());
    if (bytes.length < 100 || bytes.length > 5 * 1024 * 1024 ||
        bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('The rendered invoice PDF is invalid or too large.');
    }
    return {
      content: bytes.toString('base64'),
      filename: 'KH-Rentals-Invoice-' + model.id.replace(/[^A-Za-z0-9_-]/g, '_') + '.pdf',
      type: 'application/pdf',
      disposition: 'attachment'
    };
  } catch (_error) {
    // Pre-provider failure: safe to mark delivery rejected and allow deliberate
    // retry under existing ledger policy. Never fall back to email without PDF.
    const failure = new Error('Unable to generate the issued invoice PDF.');
    failure.code = 'INVOICE_PDF_GENERATION_FAILED';
    throw failure;
  }
};
