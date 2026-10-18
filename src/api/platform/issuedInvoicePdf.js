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
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, L = 44, R = W - L, BOTTOM = 80;
    const navy = rgb(0.10, 0.19, 0.33);
    const blue = rgb(0.17, 0.36, 0.61);
    const grey = rgb(0.38, 0.45, 0.54);
    const border = rgb(0.84, 0.88, 0.92);
    const light = rgb(0.95, 0.97, 0.99);
    const cream = rgb(1.0, 0.97, 0.88);
    const white = rgb(1, 1, 1);
    const red = rgb(0.72, 0.15, 0.23);
    let page, y;

    const measure = (value, font, size) => font.widthOfTextAtSize(String(value), size);
    const rightText = (value, xRight, baseline, opts = {}) => {
      const size = opts.size || 10, font = opts.font || regular, minX = opts.minX || L;
      const valueText = ascii(value, 350);
      let actualSize = size;
      while (actualSize > 7 && measure(valueText, font, actualSize) > xRight - minX) actualSize -= 0.5;
      page.drawText(valueText, { x: Math.max(minX, xRight - measure(valueText, font, actualSize)),
        y: baseline, size: actualSize, font, color: opts.color || navy });
    };
    const wrap = (value, maxWidth, font = regular, size = 10) => {
      const words = ascii(value, 450).split(/\s+/).filter(Boolean);
      if (!words.length) return ['-'];
      const lines = [];
      let current = '';
      for (const word of words) {
        let part = '';
        const segments = [];
        for (const char of word) {
          if (part && measure(part + char, font, size) > maxWidth) {
            segments.push(part); part = char;
          } else part += char;
        }
        if (part) segments.push(part);
        for (const segment of segments) {
          const next = current ? current + ' ' + segment : segment;
          if (current && measure(next, font, size) > maxWidth) {
            lines.push(current);
            current = segment;
          } else current = next;
        }
      }
      if (current) lines.push(current);
      return lines;
    };
    const drawLines = (lines, x, top, options = {}) => {
      const font = options.font || regular, size = options.size || 10;
      const leading = options.leading || 14;
      lines.forEach((s, i) => page.drawText(s, {
        x, y: top - i * leading, font, size, color: options.color || navy
      }));
    };
    const rule = baseline => page.drawLine({
      start: {x:L, y:baseline}, end: {x:R, y:baseline}, color:border, thickness:0.8
    });
    const beginPage = (continued = false) => {
      page = pdf.addPage([W, H]);
      if (continued) {
        page.drawRectangle({x:0, y:H-8, width:W, height:8, color:blue});
        page.drawText('KH RENTALS  /  INVOICE CONTINUED', {
          x:L, y:H-47, font:bold, size:10, color:navy
        });
        y = H - 72;
      } else {
        // A simple vector house mark; no invented physical address or logo asset.
        const x = L + 4, yy = H - 73;
        page.drawLine({start:{x, y:yy},end:{x:x+19,y:yy+18},color:blue,thickness:3});
        page.drawLine({start:{x:x+19,y:yy+18},end:{x:x+38,y:yy},color:blue,thickness:3});
        page.drawRectangle({x:x+9,y:yy-16,width:21,height:16,borderWidth:2,borderColor:blue});
        page.drawRectangle({x:x+17,y:yy-16,width:6,height:12,color:blue});
        page.drawText('KH RENTALS',{x:L+58,y:H-66,font:bold,size:20,color:navy});
        page.drawText('PROPERTY MANAGEMENT',{x:L+58,y:H-82,font:regular,size:8.5,color:grey});
        page.drawRectangle({x:R-173,y:H-91,width:173,height:56,color:light});
        rightText('RENTAL INVOICE',R-12,H-65,{font:bold,size:15,minX:R-163,color:navy});
        rightText('Monthly rental statement',R-12,H-82,{size:8.5,minX:R-163,color:grey});
        rule(H-113);
        y=H-131;
      }
    };
    const ensure = (height, tableContinuation = false) => {
      if (y - height >= BOTTOM) return;
      beginPage(true);
      if (tableContinuation) tableHeader();
    };

    beginPage();
    page.drawText('INVOICE REFERENCE', {x:L,y,font:bold,size:8,color:grey});
    drawLines(wrap(model.id,290,bold,10),L,y-20,{font:bold,size:10});
    page.drawText('BILLING PERIOD', {x:L,y:y-51,font:bold,size:8,color:grey});
    page.drawText(model.billingPeriod,{x:L,y:y-69,font:bold,size:11,color:navy});
    page.drawText('ISSUED ON', {x:L+143,y:y-51,font:bold,size:8,color:grey});
    page.drawText(model.issueDate,{x:L+143,y:y-69,font:bold,size:11,color:navy});
    const dueX = R-177, dueTop = y+4;
    page.drawRectangle({x:dueX,y:dueTop-87,width:177,height:87,color:light});
    page.drawText('PAYMENT DUE', {x:dueX+14,y:dueTop-23,font:bold,size:9,color:grey});
    drawLines(wrap(model.dueDate,151,bold,17),dueX+14,dueTop-50,{
      font:bold,size:17,color:red,leading:19
    });
    page.drawText('Please pay by this date', {
      x:dueX+14,y:dueTop-72,font:regular,size:8,color:grey
    });
    y-=105;

    const cardsGap=12, cardWidth=(R-L-cardsGap)/2;
    const tenantLines=wrap(model.renterName,cardWidth-26,bold,11);
    const propertyLines=wrap(model.propertyName,cardWidth-26,bold,11);
    const maxLines=Math.max(tenantLines.length,propertyLines.length);
    const cardHeight=Math.max(75,49 + 14 * maxLines);
    const card=(x,label,lines)=>{
      page.drawRectangle({x,y:y-cardHeight,width:cardWidth,height:cardHeight,
        color:light,borderColor:border,borderWidth:0.6});
      page.drawText(label,{x:x+13,y:y-22,font:bold,size:8,color:grey});
      drawLines(lines,x+13,y-43,{font:bold,size:11,leading:14});
    };
    card(L,'BILL TO',tenantLines);
    card(L+cardWidth+cardsGap,'PROPERTY',propertyLines);
    y-=cardHeight+20;

    page.drawText('ITEMIZED CHARGES',{x:L,y,font:bold,size:12,color:navy});
    y-=17;rule(y);y-=12;
    function tableHeader(){
      page.drawRectangle({x:L,y:y-30,width:R-L,height:30,color:light});
      page.drawText('DESCRIPTION',{x:L+12,y:y-20,font:bold,size:9,color:navy});
      rightText('AMOUNT (LKR)',R-12,y-20,{font:bold,size:9,color:navy,minX:L+310});
      y-=30;
    }
    tableHeader();
    const descriptionWidth=R-L-163;
    model.lines.forEach((item,index)=>{
      const description=wrap(item.description,descriptionWidth,regular,10);
      const h=Math.max(37,17 + description.length*14);
      ensure(h+3,true);
      if(index%2===1)page.drawRectangle({x:L,y:y-h,width:R-L,height:h,color:light});
      drawLines(description,L+12,y-22,{size:10,leading:14,color:navy});
      rightText(item.amount,R-12,y-22,{font:bold,size:10,minX:L+descriptionWidth+15});
      page.drawLine({start:{x:L,y:y-h},end:{x:R,y:y-h},color:border,thickness:0.5});
      y-=h;
    });

    ensure(100);
    y-=18;
    const totalH=59;
    page.drawRectangle({x:L,y:y-totalH,width:R-L,height:totalH,color:light});
    page.drawText('INVOICE TOTAL',{x:L+18,y:y-36,font:bold,size:12,color:navy});
    rightText(model.total,R-16,y-37,{font:bold,size:18,minX:L+220,color:blue});
    y-=totalH+14;

    const bank=model.bank;
    const boxW=R-L;
    const innerWidth=(boxW-54)/2;
    const first=bank ? [
      wrap(bank.bankName,innerWidth,regular,10),
      wrap(bank.branch,innerWidth,regular,10)
    ] : [];
    const second=bank ? [
      wrap(bank.accountNumber,innerWidth,regular,10),
      wrap(model.id,innerWidth,regular,9)
    ] : [];
    const firstH=bank ? 34+14*Math.max(first[0].length,first[1].length):0;
    const secondH=bank ? 34+14*Math.max(second[0].length,second[1].length):0;
    const paymentHeight=bank ? 48+firstH+secondH+23:114;
    ensure(paymentHeight+15);
    page.drawRectangle({x:L,y:y-paymentHeight,width:boxW,height:paymentHeight,
      color:bank?light:cream,borderColor:border,borderWidth:0.7});
    page.drawRectangle({x:L,y:y-paymentHeight,width:4,height:paymentHeight,color:bank?blue:rgb(0.70,0.48,0.17)});
    page.drawText('PAYMENT INSTRUCTIONS',{
      x:L+18,y:y-24,font:bold,size:11,color:navy
    });
    if(bank){
      const field=(x,top,label,lines,size=10)=>{
        page.drawText(label,{x,y:top,font:bold,size:8,color:grey});
        drawLines(lines,x,top-18,{size,leading:14,color:navy});
      };
      field(L+18,y-50,'BANK',first[0]);
      field(L+30+innerWidth,y-50,'BRANCH',first[1]);
      const secondY=y-50-firstH;
      field(L+18,secondY,'ACCOUNT NUMBER',second[0]);
      field(L+30+innerWidth,secondY,'PAYMENT REFERENCE',second[1],9);
      page.drawText('Confirm the beneficiary name with your property manager before paying.',{
        x:L+18,y:y-paymentHeight+13,font:regular,size:8.2,color:grey
      });
    }else{
      drawLines(wrap('Bank transfer details were not recorded when this invoice was issued.',
        boxW-36,regular,10),L+18,y-49,{size:10,color:navy});
      drawLines(wrap('Contact your property manager to confirm the payment destination.',
        boxW-36,regular,9),L+18,y-79,{size:9,color:grey});
    }
    // Keep mandatory record-keeping note in a footer, on each page.
    const pages=pdf.getPages();
    pages.forEach((p,i)=>{
      p.drawLine({start:{x:L,y:54},end:{x:R,y:54},color:border,thickness:0.7});
      p.drawText('KH Rentals  |  Keep this invoice for your records. Payments verified separately.',{
        x:L,y:36,font:regular,size:7.6,color:grey
      });
      const label='Page '+(i+1)+' of '+pages.length;
      p.drawText(label,{
        x:R-measure(label,regular,8),y:36,font:regular,size:8,color:grey
      });
    });

    pdf.setTitle('KH Rentals Invoice ' + model.id);
    pdf.setAuthor('KH Rentals');
    pdf.setSubject('Issued rental invoice');
    const bytes=Buffer.from(await pdf.save());
    if(bytes.length<100||bytes.length>5*1024*1024||
      bytes.subarray(0,5).toString('ascii')!=='%PDF-'){
      throw new Error('Invoice PDF was invalid or too large.');
    }
    return{
      content:bytes.toString('base64'),
      filename:'KH-Rentals-Invoice-'+model.id.replace(/[^A-Za-z0-9_-]/g,'_')+'.pdf',
      type:'application/pdf',
      disposition:'attachment'
    };
  }catch(_error){
    const err=new Error('Unable to generate the issued invoice PDF.');
    err.code='INVOICE_PDF_GENERATION_FAILED';
    throw err;
  }
};
