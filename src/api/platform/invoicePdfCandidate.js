import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { INVOICE_TEMPLATES, normalizeInvoiceDesign } from './invoiceDesign.js';
import { normalizeInvoiceLogo, invoiceLogoBytes } from './invoiceLogo.js';

// Draft-only renderer: accepts a complete, issue-time document snapshot.
// Do not pass mutable tenant/property records to this renderer, or wire it
// into delivery until authoritative issuance capture and archived bytes exist.
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clean = (v, max = 300) => typeof v === 'string'
  ? v.replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, max) : '';
const required = (v, field, max = 300) => {
  const value = clean(v, max);
  if (!value) throw new Error('Missing issued document field: ' + field);
  return value;
};
const positiveCents = (v, field, allowZero = false) => {
  if (!Number.isSafeInteger(v) || v < (allowZero ? 0 : 1) || v > 1e14) {
    throw new Error('Invalid issued amount: ' + field);
  }
  return v;
};
const dateString = (v, field) => {
  const value = required(v, field, 40);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Invalid issued date: ' + field);
  return parsed.toISOString().slice(0, 10);
};
const amount = cents => 'LKR ' + (cents / 100).toFixed(2);

export const normalizeInvoiceDocumentSnapshot = source => {
  if (!obj(source) || source.version !== 1 || source.kind !== 'invoice_issued') {
    throw new Error('An immutable invoice_issued version 1 snapshot is required.');
  }
  const issuer = source.issuer;
  if (!obj(issuer) || !['organization', 'owner', 'manager'].includes(issuer.role)) {
    throw new Error('Verified legal invoice issuer is missing.');
  }
  const legalName = required(issuer.legalName, 'issuer.legalName', 200);
  const postalAddress = required(issuer.postalAddress, 'issuer.postalAddress', 500);
  if (issuer.role !== 'organization' && issuer.authorityConfirmed !== true) {
    throw new Error('Alternative legal issuer authority must be confirmed at issuance.');
  }
  if (issuer.authorityConfirmed !== undefined && typeof issuer.authorityConfirmed !== 'boolean') {
    throw new Error('Issuer authority confirmation must be a boolean.');
  }
  const invoiceId = required(source.invoiceId, 'invoiceId', 100);
  const tenantId = required(source.tenantId, 'tenantId', 100);
  const renterName = required(source.renter?.name, 'renter.name', 200);
  const propertyName = required(source.property?.name, 'property.name', 200);
  if (!Array.isArray(source.lines) || !source.lines.length || source.lines.length > 300) {
    throw new Error('Issued invoice must have 1-300 lines.');
  }
  const lines = source.lines.map((line, index) => {
    if (!obj(line)) throw new Error('Invalid issued line: ' + index);
    const cents = line.amountCents;
    if (!Number.isSafeInteger(cents) || Math.abs(cents) > 1e14) {
      throw new Error('Invalid issued line amount: ' + index);
    }
    return { description: required(line.description, 'line.description', 320), amountCents: cents };
  });
  const totalCents = positiveCents(source.totalCents, 'totalCents');
  const sum = lines.reduce((a, b) => a + b.amountCents, 0);
  if (!Number.isSafeInteger(sum) || sum !== totalCents) {
    throw new Error('Issued lines do not reconcile to invoice total.');
  }
  let payment = null;
  if (source.payment !== null && source.payment !== undefined) {
    if (!obj(source.payment) || !['property', 'unit'].includes(source.payment.source)) {
      throw new Error('Issued payment destination is invalid.');
    }
    payment = {
      source: source.payment.source,
      beneficiaryName: required(source.payment.beneficiaryName, 'payment.beneficiaryName', 255),
      bankName: required(source.payment.bankName, 'payment.bankName', 180),
      branch: required(source.payment.branch, 'payment.branch', 180),
      accountNumber: required(source.payment.accountNumber, 'payment.accountNumber', 180)
    };
  }
  return {
    version: 1, kind: 'invoice_issued', invoiceId, tenantId,
    paymentReference: required(source.paymentReference, 'paymentReference', 80),
    billingPeriod: required(source.billingPeriod, 'billingPeriod', 80),
    issuedAt: dateString(source.issuedAt, 'issuedAt'),
    dueAt: dateString(source.dueAt, 'dueAt'),
    issuer: {
      role: issuer.role, legalName, postalAddress,
      contactEmail: clean(issuer.contactEmail, 320),
      contactPhone: clean(issuer.contactPhone, 100),
      authorityConfirmed: issuer.authorityConfirmed === true,
      logoPng: normalizeInvoiceLogo(issuer.logoPng)
    },
    renter: { name: renterName },
    property: { name: propertyName, address: clean(source.property?.address, 320) },
    lines, totalCents, payment, design: normalizeInvoiceDesign(source.design)
  };
};

// The renderer is side-effect free. Archiving, authorization and immutable
// resend/download are separate, required release gates.
export const createInvoiceDocumentPdfCandidate = async (issuedSnapshot, { preview = false } = {}) => {
  const model = normalizeInvoiceDocumentSnapshot(issuedSnapshot);
  const documentHash = crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex');
  const pdf = await PDFDocument.create();
  // A recovery attempt after a crash must render the *same PDF bytes*, not
  // introduce a new wall-clock creation timestamp for the same issue event.
  const issueDate = new Date(model.issuedAt + 'T00:00:00.000Z');
  pdf.setCreationDate(issueDate);
  pdf.setModificationDate(issueDate);
  pdf.setCreator('KH Rentals Invoice Renderer v1');
  pdf.setProducer('KH Rentals Invoice Renderer v1');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoImage = model.issuer.logoPng
    ? await pdf.embedPng(invoiceLogoBytes(model.issuer.logoPng)) : null;
  const W = 595.28, H = model.design.paperFormat === 'Letter' ? 792 : 841.89;
  const LEFT = 42, RIGHT = W - 42, BOTTOM = 69;
  const palette = INVOICE_TEMPLATES[model.design.template];
  const color = hex => rgb(...[1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255));
  const navy = color(palette.dark);
  const blue = color(model.design.primaryColor || palette.accent);
  const muted = rgb(.38,.43,.49), pale = color(palette.pale);
  const lineColor = rgb(.83,.86,.90), white = rgb(1,1,1);
  let page, y;
  const width = (str, font, size) => font.widthOfTextAtSize(str, size);
  const wrap = (text, maxWidth, font = regular, size = 9.5) => {
    const result = [];
    let current = '';
    const words = String(text).split(/\s+/).filter(Boolean);
    for (const word of words) {
      let token = '';
      for (const char of word) {
        if (token && width(token + char, font, size) > maxWidth) {
          if (current) { result.push(current); current = ''; }
          result.push(token);
          token = '';
        }
        token += char;
      }
      if (!token) continue;
      const next = current ? current + ' ' + token : token;
      if (current && width(next, font, size) > maxWidth) {
        result.push(current); current = token;
      } else current = next;
    }
    if (current) result.push(current);
    return result.length ? result : ['-'];
  };
  const draw = (text, x, baseline, font=regular, size=9.5, color=navy) =>
    page.drawText(String(text), {x, y:baseline, font, size, color});
  const drawWrapped = (text, x, baseline, maxWidth, font=regular, size=9.5, leading=12) => {
    const parts = wrap(text, maxWidth, font, size);
    parts.forEach((part, i) => draw(part, x, baseline - i*leading, font, size));
    return parts.length * leading;
  };
  const right = (text, rightX, baseline, font=regular, size=9.5) => {
    let actual = size;
    while (actual > 7 && width(text,font,actual) > RIGHT-LEFT-30) actual -= .5;
    draw(text, rightX-width(text,font,actual), baseline,font,actual);
  };
  const line = baseline => page.drawLine({
    start:{x:LEFT,y:baseline},end:{x:RIGHT,y:baseline},color:lineColor,thickness:.65
  });
  const header = continuation => {
    page = pdf.addPage([W,H]);
    if (model.design.template === 'corporate') {
      page.drawRectangle({x:0,y:H-9,width:W,height:9,color:blue});
    } else if (model.design.template === 'classic') {
      page.drawLine({start:{x:LEFT,y:H-43},end:{x:RIGHT,y:H-43},thickness:2,color:blue});
    } else if (model.design.template === 'modern') {
      page.drawRectangle({x:LEFT,y:H-43,width:4,height:23,color:blue});
    }
    if (logoImage) {
      const scale=Math.min(42/logoImage.width,26/logoImage.height);
      page.drawImage(logoImage,{
        x:LEFT+3,y:H-51,
        width:logoImage.width*scale,height:logoImage.height*scale
      });
    }
    draw(model.design.template === 'classic' ? 'STATEMENT OF RENT' : 'RENTAL INVOICE',
      (model.design.template === 'minimal' ? LEFT : LEFT+13)+(logoImage ? 50 : 0),
      H-34,bold,15);
    right(model.paymentReference,RIGHT,H-33,bold,10);
    if (continuation) draw('CHARGES CONTINUED',LEFT+13,H-51,regular,8.5,muted);
    line(H-62);
    y=H-83;
  };
  const tableHeader = () => {
    page.drawRectangle({x:LEFT,y:y-25,width:RIGHT-LEFT,height:25,color:pale});
    draw('DESCRIPTION',LEFT+10,y-17,bold,8.5);
    right('AMOUNT (LKR)',RIGHT-10,y-17,bold,8.5);
    y -= 25;
  };
  const ensure = needed => {
    if (y-needed >= BOTTOM) return;
    header(true);
    tableHeader();
  };
  header(false);
  draw('ISSUED BY',LEFT,y,bold,8,muted);
  draw('BILL TO',LEFT+270,y,bold,8,muted);
  const leftIssuer = [model.issuer.legalName,model.issuer.postalAddress,
    model.design.showIssuerContact
      ? [model.issuer.contactEmail,model.issuer.contactPhone].filter(Boolean).join('  |  ')
      : ''].filter(Boolean);
  const leftHeight = leftIssuer.reduce((acc,val,i)=>acc+wrap(val,240,i===0?bold:regular,i===0?10:9).length*11,0);
  let yy=y-18;
  for (const [i,v] of leftIssuer.entries()) yy -= drawWrapped(v,LEFT,yy,240,i===0?bold:regular,i===0?10:9,11);
  drawWrapped(model.renter.name,LEFT+270,y-18,RIGHT-LEFT-280,bold,10,12);
  y -= Math.max(62,leftHeight+29);
  line(y+8);
  draw('PROPERTY',LEFT,y-9,bold,8,muted);
  drawWrapped(model.property.name,LEFT,y-25,225,bold,10);
  if (model.design.showPropertyAddress && model.property.address) drawWrapped(model.property.address,LEFT,y-40,225,regular,8.5,10);
  draw('BILLING PERIOD',LEFT+270,y-9,bold,8,muted);
  draw(model.billingPeriod,LEFT+270,y-25,bold,10);
  draw('ISSUED',LEFT+270,y-47,bold,8,muted);
  draw(model.issuedAt,LEFT+270,y-61,regular,9);
  draw('DUE',LEFT+395,y-47,bold,8,muted);
  draw(model.dueAt,LEFT+395,y-61,bold,9);
  y -= 93;
  line(y+6);
  draw('ITEMIZED CHARGES',LEFT,y-11,bold,10);
  y -= 20;
  tableHeader();

  for (let i=0;i<model.lines.length;i++) {
    const entry=model.lines[i];
    const wrapped=wrap(entry.description,RIGHT-LEFT-170,regular,9.5);
    const h=Math.max(30,10+wrapped.length*12);
    ensure(h+2);
    if (i%2) page.drawRectangle({x:LEFT,y:y-h,width:RIGHT-LEFT,height:h,color:pale});
    wrapped.forEach((part,j)=>draw(part,LEFT+10,y-17-j*12));
    right(amount(entry.amountCents),RIGHT-10,y-17,bold,9);
    y -= h;
    line(y);
  }
  const bank=model.payment;
  const boxW=RIGHT-LEFT, colW=(boxW-42)/2;
  const entries=bank? [
    [['BENEFICIARY',bank.beneficiaryName],['BANK',bank.bankName]],
    [['BRANCH',bank.branch],['ACCOUNT NUMBER',bank.accountNumber]],
    [['PAYMENT REFERENCE',model.paymentReference]]
  ] : [];
  const rowHeights=bank?entries.map(row=>Math.max(...row.map(([,value])=>
    wrap(value,colW-8,regular,9).length))*11+20):[];
  const paymentHeight=bank?35+rowHeights.reduce((a,b)=>a+b,0)+8:76;
  const finalH=14+49+10+paymentHeight+8;
  if (y-finalH < BOTTOM) header(true);
  y -= 12;
  page.drawRectangle({x:LEFT,y:y-49,width:boxW,height:49,color:pale});
  draw('TOTAL DUE',LEFT+14,y-30,bold,12);
  right(amount(model.totalCents),RIGHT-14,y-31,bold,15);
  y -= 59;
  page.drawRectangle({x:LEFT,y:y-paymentHeight,width:boxW,height:paymentHeight,
    color:white,borderColor:lineColor,borderWidth:.8});
  page.drawRectangle({x:LEFT,y:y-paymentHeight,width:3,height:paymentHeight,color:blue});
  draw('PAYMENT INSTRUCTIONS',LEFT+14,y-20,bold,10);
  if (bank) {
    let rowTop = y-41;
    entries.forEach((entry, index) => {
      entry.forEach(([label,value],col) => {
        const x=LEFT+14+col*(colW+14);
        draw(label,x,rowTop,bold,7.6,muted);
        drawWrapped(value,x,rowTop-13,colW-8,regular,9,11);
      });
      rowTop-=rowHeights[index];
    });
  } else {
    drawWrapped('Bank details were not verified at issuance. Contact the issuer before paying.',
      LEFT+14,y-42,boxW-28,regular,9,12);
  }
  y -= paymentHeight;
  pdf.getPages().forEach((p,i,pages)=>{
    p.drawLine({start:{x:LEFT,y:49},end:{x:RIGHT,y:49},color:lineColor,thickness:.6});
    p.drawText(model.design.footerText || 'Keep this issued invoice for your records.',{
      x:LEFT,y:33,font:regular,size:7.3,color:muted});
    if (preview) {
      p.drawRectangle({x:RIGHT-143,y:H-86,width:143,height:16,color:blue});
      p.drawText('SAMPLE - NOT ISSUED',{
        x:RIGHT-136,y:H-81,font:bold,size:8.7,color:white
      });
    }
    const pageLabel='Page '+(i+1)+' of '+pages.length;
    p.drawText(pageLabel,{
      x:RIGHT-width(pageLabel,regular,8),y:33,font:regular,size:8,color:muted});
  });
  pdf.setTitle('Rental Invoice '+model.paymentReference);
  pdf.setAuthor(model.issuer.legalName);
  pdf.setSubject('Issued rental invoice snapshot');
  const bytes=Buffer.from(await pdf.save());
  if (bytes.length<100 || bytes.length>5*1024*1024 ||
      bytes.subarray(0,5).toString('ascii')!=='%PDF-') {
    throw new Error('Generated invoice PDF is invalid or too large.');
  }
  return {
    content:bytes.toString('base64'),
    filename:'Invoice-'+model.invoiceId.replace(/[^A-Za-z0-9_-]/g,'_')+'.pdf',
    type:'application/pdf',disposition:'attachment',
    sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    snapshotSha256:documentHash,
    pageCount:pdf.getPageCount()
  };
};
