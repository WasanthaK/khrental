import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase, enhancedUploadFile, binaryUpload } from './supabaseClient';
import { toast } from 'react-toastify';
import { STORAGE_BUCKETS, BUCKET_FOLDERS } from './fileService';

/**
 * Simple HTML to structured content parser
 * @param {string} html - HTML content
 * @returns {Array} - Array of structured content objects
 */
const parseHtmlContent = (html) => {
  // Clean up the HTML
  const cleanHtml = html
    .replace(/<style[^>]*>.*?<\/style>/gs, '')
    .replace(/<script[^>]*>.*?<\/script>/gs, '');
  
  // Create an array to store content pieces in the order they appear
  const contentPieces = [];
  
  try {
    // Attempt DOM-based parsing first
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cleanHtml;
    
    // Helper function to recursively process nodes
    const processNode = (node, listLevel = 0, listType = null, listCounter = 0) => {
      if (!node) return { listCounter };
      
      // Skip empty text nodes and comments
      if ((node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) || 
          node.nodeType === Node.COMMENT_NODE) {
        return { listCounter };
      }
      
      if (node.nodeType === Node.TEXT_NODE) {
        // Process text nodes that have content
        const text = node.textContent.trim();
        if (text && listLevel === 0) {
          contentPieces.push({
            type: 'paragraph',
            text: text
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        // Handle headings
        if (tagName.match(/^h[1-6]$/)) {
          const level = parseInt(tagName.replace('h', ''));
          contentPieces.push({
            type: 'heading',
            text: node.textContent.trim(),
            level: level
          });
        }
        // Handle paragraphs
        else if (tagName === 'p') {
          contentPieces.push({
            type: 'paragraph',
            text: node.textContent.trim()
          });
        }
        // Handle unordered lists
        else if (tagName === 'ul') {
          const newListLevel = listLevel + 1;
          for (let child of node.childNodes) {
            processNode(child, newListLevel, 'ul', 0);
          }
        }
        // Handle ordered lists
        else if (tagName === 'ol') {
          const newListLevel = listLevel + 1;
          let newCounter = 1;
          for (let child of node.childNodes) {
            const result = processNode(child, newListLevel, 'ol', newCounter);
            newCounter = result.listCounter;
          }
        }
        // Handle list items
        else if (tagName === 'li') {
          let prefix = '';
          if (listType === 'ul') {
            prefix = '• ';
          } else if (listType === 'ol') {
            prefix = `${listCounter}. `;
            listCounter++;
          }
          
          contentPieces.push({
            type: 'list-item',
            text: node.textContent.trim(),
            level: listLevel,
            prefix: prefix
          });
          
          return { listCounter };
        }
        // Handle tables
        else if (tagName === 'table') {
          const rows = [];
          const trElements = node.querySelectorAll('tr');
          
          trElements.forEach(tr => {
            const cells = [];
            const cellElements = tr.querySelectorAll('th, td');
            
            cellElements.forEach(cell => {
              // Extract formatting information
              const isBold = cell.querySelector('strong, b') !== null;
              const isItalic = cell.querySelector('i, em') !== null;
              
              cells.push({
                text: cell.textContent.trim(),
                isHeader: cell.tagName.toLowerCase() === 'th',
                isBold: isBold || cell.tagName.toLowerCase() === 'th',
                isItalic: isItalic
              });
            });
            
            if (cells.length > 0) {
              rows.push(cells);
            }
          });
          
          if (rows.length > 0) {
            contentPieces.push({
              type: 'table',
              rows: rows
            });
          }
        }
        // Process other elements recursively
        else {
          for (let child of node.childNodes) {
            processNode(child, listLevel, listType, listCounter);
          }
        }
      }
      
      return { listCounter };
    };
    
    // Process DOM tree
    processNode(tempDiv);
    
  } catch (error) {
    // If DOM processing fails (e.g., server-side), fall back to regex
    console.warn('DOM processing failed, falling back to regex parsing:', error);
    
    // Extract headings
    const headingMatches = cleanHtml.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi) || [];
    headingMatches.forEach(match => {
      const headingText = match.replace(/<\/?[^>]+(>|$)/g, '').trim();
      const level = parseInt(match.match(/<h([1-6])/i)[1]);
      
      contentPieces.push({
        type: 'heading',
        text: headingText,
        level: level
      });
    });
    
    // Extract unordered lists
    const ulRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;
    let ulMatch;
    while ((ulMatch = ulRegex.exec(cleanHtml)) !== null) {
      const listHtml = ulMatch[1];
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      
      while ((liMatch = liRegex.exec(listHtml)) !== null) {
        const itemText = liMatch[1]
          .replace(/<\/?[^>]+(>|$)/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
        
        contentPieces.push({
          type: 'list-item',
          text: itemText,
          level: 1,
          prefix: '• '
        });
      }
    }
    
    // Extract ordered lists
    const olRegex = /<ol[^>]*>([\s\S]*?)<\/ol>/gi;
    let olMatch;
    while ((olMatch = olRegex.exec(cleanHtml)) !== null) {
      const listHtml = olMatch[1];
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      let counter = 1;
      
      while ((liMatch = liRegex.exec(listHtml)) !== null) {
        const itemText = liMatch[1]
          .replace(/<\/?[^>]+(>|$)/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
        
        contentPieces.push({
          type: 'list-item',
          text: itemText,
          level: 1,
          prefix: `${counter}. `
        });
        
        counter++;
      }
    }
    
    // Extract tables
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    while ((tableMatch = tableRegex.exec(cleanHtml)) !== null) {
      const tableHtml = tableMatch[0];
      const rows = [];
      
      // Extract rows
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const cells = [];
        
        // Extract cells (both th and td)
        const cellRegex = /<(th|td)[^>]*>([\s\S]*?)<\/(th|td)>/gi;
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
          const isHeader = cellMatch[1].toLowerCase() === 'th';
          const cellHtml = cellMatch[2];
          
          // Check for formatting
          const isBold = /<(strong|b)[^>]*>/.test(cellHtml);
          const isItalic = /<(em|i)[^>]*>/.test(cellHtml);
          
          const cellText = cellHtml
            .replace(/<\/?[^>]+(>|$)/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
          
          cells.push({
            text: cellText,
            isHeader,
            isBold: isBold || isHeader,
            isItalic
          });
        }
        
        if (cells.length > 0) {
          rows.push(cells);
        }
      }
      
      if (rows.length > 0) {
        contentPieces.push({
          type: 'table',
          rows
        });
      }
    }
    
    // Extract paragraphs
    const paragraphMatches = cleanHtml.match(/<p[^>]*>(.*?)<\/p>/gi) || [];
    paragraphMatches.forEach(match => {
      const paragraphHtml = match.substring(match.indexOf('>') + 1, match.lastIndexOf('<'));
      
      // Check for formatting
      const isBold = /<(strong|b)[^>]*>/.test(paragraphHtml);
      const isItalic = /<(em|i)[^>]*>/.test(paragraphHtml);
      
      const paragraphText = paragraphHtml
        .replace(/<\/?[^>]+(>|$)/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (paragraphText.length > 0) {
        contentPieces.push({
          type: 'paragraph',
          text: paragraphText,
          isBold,
          isItalic
        });
      }
    });
  }
  
  // If we have no content, extract plain text as a fallback
  if (contentPieces.length === 0) {
    const allText = cleanHtml
      .replace(/<\/?[^>]+(>|$)/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (allText.length > 0) {
      contentPieces.push({
        type: 'paragraph',
        text: allText
      });
    }
  }
  
  return contentPieces;
};

/**
 * Saves a merged document by converting HTML directly to PDF
 * @param {string} content - HTML content of the document
 * @param {string} agreementId - ID of the agreement
 * @returns {Promise<string|null>} - URL of the saved document or null if save failed
 */
export const saveMergedDocument = async (content, agreementId) => {
  try {
    console.log('Saving merged document for agreement:', agreementId);
    
    if (!content) {
      throw new Error('Document content is empty');
    }
    
    console.log('Converting content to PDF format...');
    
    // Get agreement data to ensure we have all required merge fields
    const { data: agreement, error: agreementError } = await supabase
      .from('agreements')
      .select(`
        *,
        property:propertyid(name, address),
        unit:unitid(unitnumber, description, floor, bedrooms, bathrooms, rentalvalues),
        rentee:renteeid(name, email)
      `)
      .eq('id', agreementId)
      .single();
      
    if (agreementError) {
      console.warn('Could not fetch agreement data for merge fields:', agreementError);
    } else {
      console.log('Fetched agreement data for document generation:', {
        hasProperty: !!agreement.property,
        hasUnit: !!agreement.unit,
        unitNumber: agreement.unit?.unitnumber || 'None',
        hasRentee: !!agreement.rentee,
        hasRentalValues: agreement.unit?.rentalvalues ? 'Yes' : 'No'
      });
    }
    
    // Parse HTML content
    const parsedContent = parseHtmlContent(content);
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed standard fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const helveticaBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
    
    // Add a page
    let page = pdfDoc.addPage([612, 792]); // US Letter size
    const { width, height } = page.getSize();
    const margin = 50;
    
    // Starting position for content
    let y = height - margin;
    const lineHeight = 14;
    const paragraphSpacing = 10;
    const headingSpacing = 20;
    
    // Add title
    page.drawText('Rental Agreement', {
      x: width / 2 - 80, // Center approximation
      y: y,
      size: 24,
      font: helveticaBold
    });
    y -= 30;
    
    // Add agreement ID
    page.drawText(`Agreement ID: ${agreementId}`, {
      x: margin,
      y: y,
      size: 12,
      font: helveticaBold
    });
    y -= lineHeight + 5;
    
    // Add timestamp
    page.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: margin,
      y: y,
      size: 10,
      font: helveticaFont
    });
    y -= lineHeight + 10;
    
    // Extract important agreement details if available
    if (agreement) {
      // Add essential agreement info box
      const infoBoxY = y;
      const infoBoxHeight = 100;
      
      // Draw info box border
      page.drawRectangle({
        x: margin,
        y: infoBoxY,
        width: width - (margin * 2),
        height: -infoBoxHeight,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1
      });
      
      // Property & Unit info
      page.drawText('Property:', {
        x: margin + 10,
        y: infoBoxY - 20,
        size: 10,
        font: helveticaBold
      });
      
      const propertyName = agreement.property?.name || 'N/A';
      const unitName = agreement.unit?.unitnumber || agreement.unit?.name || '';
      
      const propertyText = unitName ? `${propertyName}, Unit ${unitName}` : propertyName;
      
      page.drawText(propertyText, {
        x: margin + 120,
        y: infoBoxY - 20,
        size: 10,
        font: helveticaFont
      });
      
      // Tenant info
      page.drawText('Tenant:', {
        x: margin + 10,
        y: infoBoxY - 40,
        size: 10,
        font: helveticaBold
      });
      
      page.drawText(String(agreement.rentee?.name || 'N/A'), {
        x: margin + 120,
        y: infoBoxY - 40,
        size: 10,
        font: helveticaFont
      });
      
      // Date range
      page.drawText('Period:', {
        x: margin + 10,
        y: infoBoxY - 60,
        size: 10,
        font: helveticaBold
      });
      
      const startDate = agreement.startdate ? new Date(agreement.startdate).toLocaleDateString() : 'N/A';
      const endDate = agreement.enddate ? new Date(agreement.enddate).toLocaleDateString() : 'N/A';
      
      page.drawText(`${startDate} to ${endDate}`, {
        x: margin + 120,
        y: infoBoxY - 60,
        size: 10,
        font: helveticaFont
      });
      
      // Monthly Rent and Security Deposit - highlight these as they were missing
      page.drawText('Monthly Rent:', {
        x: margin + 10,
        y: infoBoxY - 80,
        size: 10,
        font: helveticaBold
      });
      
      const monthlyRent = agreement.terms?.monthlyRent || 'Not specified';
      
      page.drawText(String(monthlyRent), {
        x: margin + 120,
        y: infoBoxY - 80,
        size: 10,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.8) // Blue for emphasis
      });
      
      // Security deposit on same line, but right side
      page.drawText('Security Deposit:', {
        x: width - margin - 200,
        y: infoBoxY - 80,
        size: 10,
        font: helveticaBold
      });
      
      const securityDeposit = agreement.terms?.depositAmount || 'Not specified';
      
      page.drawText(String(securityDeposit), {
        x: width - margin - 90,
        y: infoBoxY - 80,
        size: 10,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.8) // Blue for emphasis
      });
      
      // Update y position after info box
      y = infoBoxY - infoBoxHeight - 20;
    } else {
      y -= headingSpacing;
    }
    
    // Helper function to add text with wrapping
    const addWrappedText = (text, fontSize, isHeading = false) => {
      const font = isHeading ? helveticaBold : helveticaFont;
      const maxWidth = width - (margin * 2);
      const words = text.split(' ');
      
      let currentLine = '';
      
      words.forEach(word => {
        const potentialLine = currentLine ? `${currentLine} ${word}` : word;
        const potentialWidth = font.widthOfTextAtSize(potentialLine, fontSize);
        
        if (potentialWidth <= maxWidth) {
          currentLine = potentialLine;
        } else {
          // Draw current line and start a new one
          page.drawText(currentLine, {
            x: margin,
            y: y,
            size: fontSize,
            font: font
          });
          
          y -= lineHeight;
          currentLine = word;
          
          // Add a new page if we're near the bottom
          if (y < margin) {
            page = pdfDoc.addPage([612, 792]);
            y = height - margin;
          }
        }
      });
      
      // Draw remaining text
      if (currentLine) {
        page.drawText(currentLine, {
          x: margin,
          y: y,
          size: fontSize,
          font: font
        });
        
        y -= isHeading ? (lineHeight + headingSpacing) : (lineHeight + paragraphSpacing);
      }
    };
    
    // Process parsed content - keep the existing implementation
    parsedContent.forEach(item => {
      // Rest of the existing code for processing content items
      // ...
      // Add a new page if we're near the bottom
      if (y < margin + 100) {
        page = pdfDoc.addPage([612, 792]);
        y = height - margin;
      }
      
      if (item.type === 'heading') {
        const fontSize = item.level === 1 ? 18 : (item.level === 2 ? 16 : 14);
        addWrappedText(item.text, fontSize, true);
      } else if (item.type === 'paragraph') {
        // Use appropriate font based on formatting
        const font = item.isBold ? helveticaBold : helveticaFont;
        const fontSize = 12;
        
        // Add the paragraph text with proper wrapping
        const maxWidth = width - (margin * 2);
        const words = item.text.split(' ');
        let currentLine = '';
        
        words.forEach(word => {
          const potentialLine = currentLine ? `${currentLine} ${word}` : word;
          const potentialWidth = font.widthOfTextAtSize(potentialLine, fontSize);
          
          if (potentialWidth <= maxWidth) {
            currentLine = potentialLine;
          } else {
            // Draw current line and start a new one
            page.drawText(currentLine, {
              x: margin,
              y: y,
              size: fontSize,
              font: font
            });
            
            y -= lineHeight;
            currentLine = word;
            
            // Add a new page if we're near the bottom
            if (y < margin) {
              page = pdfDoc.addPage([612, 792]);
              y = height - margin;
            }
          }
        });
        
        // Draw remaining text
        if (currentLine) {
          page.drawText(currentLine, {
            x: margin,
            y: y,
            size: fontSize,
            font: font
          });
          
          y -= lineHeight + paragraphSpacing;
        }
      } else if (item.type === 'list-item') {
        // Calculate indentation based on list level
        const indentation = margin + (item.level * 20);
        const fontSize = 12;
        
        // Draw the bullet or number prefix
        page.drawText(item.prefix, {
          x: indentation - 15,
          y: y,
          size: fontSize,
          font: helveticaBold
        });
        
        // Add the list item text with proper wrapping
        const maxWidth = width - (indentation + 20) - margin;
        const words = item.text.split(' ');
        let currentLine = '';
        let firstLine = true;
        
        words.forEach(word => {
          const potentialLine = currentLine ? `${currentLine} ${word}` : word;
          const potentialWidth = helveticaFont.widthOfTextAtSize(potentialLine, fontSize);
          
          if (potentialWidth <= maxWidth) {
            currentLine = potentialLine;
          } else {
            // Draw current line and start a new one
            page.drawText(currentLine, {
              x: firstLine ? indentation : indentation + 10,
              y: y,
              size: fontSize,
              font: helveticaFont
            });
            
            y -= lineHeight;
            currentLine = word;
            firstLine = false;
            
            // Add a new page if we're near the bottom
            if (y < margin) {
              page = pdfDoc.addPage([612, 792]);
              y = height - margin;
            }
          }
        });
        
        // Draw remaining text
        if (currentLine) {
          page.drawText(currentLine, {
            x: firstLine ? indentation : indentation + 10,
            y: y,
            size: fontSize,
            font: helveticaFont
          });
          
          y -= lineHeight + (paragraphSpacing / 2); // less spacing for list items
        }
      } else if (item.type === 'table') {
        // Render table
        const tableRows = item.rows;
        if (tableRows.length > 0) {
          // Calculate column widths based on the number of columns
          const numCols = Math.max(...tableRows.map(row => row.length));
          const colWidth = (width - margin * 2) / numCols;
          
          // Calculate table height and check if it fits
          const rowHeight = lineHeight * 2;
          const tableHeight = tableRows.length * rowHeight;
          
          if (y - tableHeight < margin) {
            // Table won't fit, create a new page
            page = pdfDoc.addPage([612, 792]);
            y = height - margin;
          }
          
          // Starting position for the table
          const tableX = margin;
          let tableY = y;
          
          // Draw table borders - outer rectangle
          page.drawRectangle({
            x: tableX,
            y: tableY,
            width: width - (margin * 2),
            height: -tableHeight,  // Negative height to draw down from y
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
            opacity: 0.8
          });
          
          // Draw each row
          for (let i = 0; i < tableRows.length; i++) {
            const row = tableRows[i];
            const isHeader = i === 0 && row.some(cell => cell.isHeader);
            
            // Draw row background for headers
            if (isHeader) {
              page.drawRectangle({
                x: tableX,
                y: tableY,
                width: width - (margin * 2),
                height: -rowHeight,
                color: rgb(0.9, 0.9, 0.9)
              });
            }
            
            // Draw row separator
            if (i > 0) {
              page.drawLine({
                start: { x: tableX, y: tableY },
                end: { x: tableX + width - (margin * 2), y: tableY },
                thickness: 0.5,
                color: rgb(0, 0, 0),
                opacity: 0.5
              });
            }
            
            // Process cells
            let cellX = tableX;
            for (let j = 0; j < row.length; j++) {
              const cell = row[j];
              const font = cell.isBold ? helveticaBold : helveticaFont;
              const fontSize = 10;
              
              // Draw cell separator (except for first column)
              if (j > 0) {
                page.drawLine({
                  start: { x: cellX, y: tableY },
                  end: { x: cellX, y: tableY - rowHeight },
                  thickness: 0.5,
                  color: rgb(0, 0, 0),
                  opacity: 0.5
                });
              }
              
              // Calculate text that fits in cell
              const cellText = cell.text || '';
              const maxChars = Math.floor(colWidth / (fontSize * 0.6));
              const displayText = cellText.length > maxChars 
                ? cellText.substring(0, maxChars - 3) + '...' 
                : cellText;
              
              // Draw cell text
              page.drawText(displayText, {
                x: cellX + 5,
                y: tableY - rowHeight/2 + fontSize/2,
                size: fontSize,
                font: font
              });
              
              cellX += colWidth;
            }
            
            // Move to next row
            tableY -= rowHeight;
          }
          
          // Update y position to after the table
          y = tableY - 15;
        }
      }
    });
    
    // Footer with page number
    page.drawText('Page 1', {
      x: width / 2 - 20,
      y: 30,
      size: 10,
      font: helveticaFont
    });
    
    // For multiple pages, add page numbers to all pages
    const pageCount = pdfDoc.getPageCount();
    if (pageCount > 1) {
      for (let i = 1; i < pageCount; i++) {
        const currentPage = pdfDoc.getPage(i);
        const { width } = currentPage.getSize();
        
        currentPage.drawText(`Page ${i + 1}`, {
          x: width / 2 - 20,
          y: 30,
          size: 10,
          font: helveticaFont
        });
      }
    }
    
    // Save PDF as Uint8Array
    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

    console.log('PDF generated successfully:', pdfBlob.size, 'bytes');
    if (window.location.port === '8080' || window.location.hostname === 'localhost') {
      console.warn('You are running through a local proxy. If you see upload errors, try running without the proxy as proxies can break binary uploads.');
    }

    // Generate a safe filename without special characters
    const safeTimestamp = Date.now();
    const safeFilename = `final_agreement_${safeTimestamp}.pdf`;
    const safePath = `agreements/${agreementId}/${safeFilename}`;
    
    console.log('Uploading PDF to safe path:', safePath);
    
    try {
      // Use the specialized binary upload function that will try multiple approaches
      const { success, url, error } = await binaryUpload(
        STORAGE_BUCKETS.FILES,
        safePath,
        pdfBlob,
        { contentType: 'application/pdf' }
      );
      
      if (!success || error) {
        console.error('PDF upload error details:', error);
        throw error;
      }
      
      console.log('PDF uploaded successfully:', url);
      return url;
    } catch (uploadError) {
      console.error('Error saving merged document:', uploadError);
      toast.error('Error saving document: ' + uploadError.message);
      throw uploadError;
    }
  } catch (error) {
    console.error('Error saving merged document:', error);
    toast.error('Error saving document: ' + error.message);
    throw error;
  }
};

/**
 * Converts a DOCX file to PDF
 * @param {string} agreementId - ID of the agreement
 * @returns {Promise<Blob|null>} - PDF blob or null if conversion failed
 */
export const convertDocxToPdf = async (agreementId) => {
  try {
    console.log('Converting DOCX to PDF for agreement:', agreementId);
    
    if (!agreementId) {
      throw new Error('Agreement ID is required for PDF conversion');
    }
    
    // Define the path to the DOCX file in storage
    const docxPath = `${BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].AGREEMENTS}/${agreementId}/final_agreement.docx`;
    console.log('Downloading DOCX from storage path:', docxPath);
    
    // List files in directory to debug any issues
    const { data: fileData, error: fileError } = await supabase.storage
      .from(STORAGE_BUCKETS.FILES)
      .list(`${BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].AGREEMENTS}/${agreementId}`);
    
    if (fileError) {
      console.error('Error listing files in directory:', fileError);
    } else {
      console.log('Files available in directory:', fileData);
    }
    
    // Download the DOCX file from storage
    const { data: docxData, error: docxError } = await supabase.storage
      .from(STORAGE_BUCKETS.FILES)
      .download(docxPath);
      
    // Handle download errors
    if (docxError) {
      console.error('Error downloading DOCX file:', docxError);
      throw new Error(`Failed to download DOCX file: ${docxError.message}`);
    }
    
    // Validate the downloaded data
    if (!docxData || docxData.size === 0) {
      console.error('Downloaded DOCX file is empty or null');
      throw new Error('DOCX file is empty or could not be downloaded');
    }
    
    console.log('DOCX file downloaded successfully, size:', docxData.size);
    
    // Create a new PDF document
    // Note: In a browser environment, full DOCX to PDF conversion is limited
    // This creates a simple PDF with basic information
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    
    // Add title to the PDF
    page.drawText('Rental Agreement', {
      x: 50,
      y: 750,
      size: 24
    });
    
    // Add agreement ID to the PDF
    page.drawText(`Agreement ID: ${agreementId}`, {
      x: 50,
      y: 720,
      size: 12
    });
    
    // Add timestamp
    page.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: 50,
      y: 690,
      size: 10
    });
    
    // Add note about document
    page.drawText('The complete agreement is available in DOCX format.', {
      x: 50,
      y: 660,
      size: 12
    });
    
    // Add a link to the original DOCX
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.FILES)
      .getPublicUrl(docxPath);
      
    if (urlData?.publicUrl) {
      page.drawText('Original document link:', {
        x: 50,
        y: 630,
        size: 10
      });
      
      page.drawText(urlData.publicUrl, {
        x: 50,
        y: 610,
        size: 8,
        color: rgb(0, 0, 1) // Blue text for the link
      });
    }
    
    // Save the PDF to bytes
    const pdfBytes = await pdfDoc.save();
    
    // Convert to a blob for upload
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    console.log('PDF generated successfully');
    
    // Return the PDF blob
    return pdfBlob;
  } catch (error) {
    // Handle and log any errors
    console.error('Error converting DOCX to PDF:', error);
    toast.error(`PDF generation failed: ${error.message}`);
    return null;
  }
};

/**
 * Generates a PDF for an agreement
 * @param {Object} formData - The agreement form data
 * @returns {Promise<string|null>} - URL of the generated PDF or null if generation failed
 */
export const generatePdf = async (formData) => {
  try {
    console.log('Generating PDF for agreement:', formData.id || 'new agreement');
    
    if (!formData || !formData.content) {
      console.warn('Agreement content is missing, attempting to use processed content');
    }
    
    // First save the document as DOCX
    const content = formData.content || 'Agreement content not available';
    const agreementId = formData.id || `temp_${Date.now()}`;
    
    // Save the content as DOCX
    const docxUrl = await saveMergedDocument(content, agreementId);
    
    if (!docxUrl) {
      throw new Error('Failed to save document as DOCX');
    }
    
    // Convert DOCX to PDF
    const pdfBlob = await convertDocxToPdf(agreementId);
    
    if (!pdfBlob) {
      throw new Error('Failed to convert document to PDF');
    }
    
    // Define the PDF file path in storage
    const safeFileName = `final_agreement_${Date.now()}.pdf`;
    const pdfPath = `${BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].AGREEMENTS}/${agreementId}/${safeFileName}`;
    
    console.log('Uploading PDF to storage path:', pdfPath);
    
    try {
      // Use the specialized binary upload function
      const { success, url, error } = await binaryUpload(
        STORAGE_BUCKETS.FILES,
        pdfPath,
        pdfBlob,
        { contentType: 'application/pdf' }
      );
      
      if (!success || error) {
        console.error('Error uploading PDF:', error);
        throw error;
      }
      
      console.log('PDF uploaded successfully:', url);
      return url;
    } catch (uploadError) {
      console.error('Error saving merged document:', uploadError);
      toast.error('Error saving document: ' + uploadError.message);
      throw uploadError;
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    toast.error(`PDF generation failed: ${error.message}`);
    return null;
  }
};

function processHtmlContent(content) {
  if (!content) return [];
  
  console.log('Processing HTML content for document generation');
  
  const contentPieces = [];
  let remainingContent = content;
  
  // Process tables first to avoid interference with other elements
  const tableParts = remainingContent.match(/\<table[^>]*>([\s\S]*?)<\/table>/gi);
  if (tableParts && tableParts.length > 0) {
    for (let i = 0; i < tableParts.length; i++) {
      const tablePart = tableParts[i];
      // Remove the table from the content to process other elements
      remainingContent = remainingContent.replace(tablePart, '{{TABLE_PLACEHOLDER_' + i + '}}');
      
      // Extract rows
      const rows = [];
      const rowMatch = tablePart.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
      if (rowMatch) {
        for (const row of rowMatch) {
          const cells = [];
          // Extract cells
          const cellMatch = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
          if (cellMatch) {
            for (const cell of cellMatch) {
              // Clean cell content of HTML tags but preserve formatting
              let cellContent = cell.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i, '$1');
              
              // Convert basic HTML formatting to DOCX formatting
              const isBold = /<strong>|<b>/i.test(cellContent);
              const isItalic = /<em>|<i>/i.test(cellContent);
              
              // Clean all HTML tags
              cellContent = cellContent.replace(/<[^>]*>/g, '');
              // Decode HTML entities
              cellContent = cellContent.replace(/&nbsp;/g, ' ')
                                      .replace(/&amp;/g, '&')
                                      .replace(/&lt;/g, '<')
                                      .replace(/&gt;/g, '>')
                                      .replace(/&quot;/g, '"')
                                      .replace(/&#39;/g, "'");
              
              cells.push({
                text: cellContent.trim(),
                bold: isBold,
                italic: isItalic
              });
            }
          }
          rows.push({ cells });
        }
      }
      contentPieces.push({
        type: 'table',
        rows
      });
    }
  }
  
  // Process headings
  const headingMatches = remainingContent.match(/\<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi);
  if (headingMatches) {
    for (const match of headingMatches) {
      const level = parseInt(match.match(/\<h([1-6])/i)[1], 10);
      let text = match.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i, '$1');
      
      // Clean HTML tags
      text = text.replace(/<[^>]*>/g, '');
      // Decode HTML entities
      text = text.replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
      
      contentPieces.push({
        type: 'heading',
        text: text.trim(),
        level
      });
      remainingContent = remainingContent.replace(match, '');
    }
  }
  
  // Process paragraphs
  const paragraphMatches = remainingContent.match(/\<p[^>]*>(.*?)<\/p>/gi);
  if (paragraphMatches) {
    for (const match of paragraphMatches) {
      let text = match.replace(/<p[^>]*>(.*?)<\/p>/i, '$1');
      
      // Extract formatting
      const isBold = /<strong>|<b>/i.test(text);
      const isItalic = /<em>|<i>/i.test(text);
      
      // Clean HTML tags
      text = text.replace(/<[^>]*>/g, '');
      // Decode HTML entities
      text = text.replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
      
      // Check if this is a table placeholder
      const tablePlaceholder = text.match(/{{TABLE_PLACEHOLDER_(\d+)}}/);
      if (tablePlaceholder) {
        // Table already processed, skip
        continue;
      }
      
      contentPieces.push({
        type: 'paragraph',
        text: text.trim(),
        bold: isBold,
        italic: isItalic
      });
      remainingContent = remainingContent.replace(match, '');
    }
  }
  
  // Process lists
  const listTypes = [
    { type: 'unordered', regex: /\<ul[^>]*>([\s\S]*?)<\/ul>/gi },
    { type: 'ordered', regex: /\<ol[^>]*>([\s\S]*?)<\/ol>/gi }
  ];
  
  for (const listType of listTypes) {
    const listMatches = remainingContent.match(listType.regex);
    if (listMatches) {
      for (const match of listMatches) {
        const itemMatches = match.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
        if (itemMatches) {
          const items = [];
          for (const itemMatch of itemMatches) {
            let text = itemMatch.replace(/<li[^>]*>([\s\S]*?)<\/li>/i, '$1');
            
            // Extract formatting
            const isBold = /<strong>|<b>/i.test(text);
            const isItalic = /<em>|<i>/i.test(text);
            
            // Clean HTML tags
            text = text.replace(/<[^>]*>/g, '');
            // Decode HTML entities
            text = text.replace(/&nbsp;/g, ' ')
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'");
            
            items.push({
              text: text.trim(),
              bold: isBold,
              italic: isItalic
            });
          }
          
          contentPieces.push({
            type: listType.type + 'List',
            items
          });
        }
        remainingContent = remainingContent.replace(match, '');
      }
    }
  }
  
  // If there's still remaining content after processing all known elements,
  // add it as a simple paragraph (after cleaning)
  if (remainingContent.trim() !== '') {
    const cleanedText = remainingContent
      .replace(/<[^>]*>/g, '') // Remove any HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    
    if (cleanedText !== '') {
      contentPieces.push({
        type: 'paragraph',
        text: cleanedText
      });
    }
  }
  
  console.log(`Processed ${contentPieces.length} content pieces for document`);
  return contentPieces;
}

/**
 * Creates a document from HTML content (direct PDF generation)
 * @param {string} html - The HTML content to convert
 * @param {string} fileName - The name of the document file
 * @param {string} agreementId - The ID of the agreement
 * @returns {Promise<{success: boolean, url: string, error: any}>} - Result object with success status and file URL
 */
async function createDocument(html, fileName, agreementId) {
  try {
    console.log(`Creating document for agreement ${agreementId}`);
    
    // Process the HTML content into structured format
    const processedContent = processHtmlContent(html);
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed standard fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    
    // Add a page
    let page = pdfDoc.addPage([612, 792]); // US Letter size
    const { width, height } = page.getSize();
    const margin = 50;
    
    // Starting position for content
    let y = height - margin;
    const lineHeight = 14;
    const paragraphSpacing = 10;
    const headingSpacing = 20;
    
    // Add title
    page.drawText(fileName || 'Agreement Document', {
      x: width / 2 - 100,
      y: y,
      size: 20,
      font: helveticaBold
    });
    y -= 40;
    
    // Add timestamp
    page.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: margin,
      y: y,
      size: 10,
      font: helveticaFont
    });
    y -= lineHeight + 20;
    
    // Process content
    for (const piece of processedContent) {
      // Add a new page if we're near the bottom
      if (y < margin + 50) {
        page = pdfDoc.addPage([612, 792]);
        y = height - margin;
      }
      
      switch (piece.type) {
        case 'heading':
          const headingText = piece.text || '';
          const headingSize = piece.level === 1 ? 18 : (piece.level === 2 ? 16 : 14);
          
          page.drawText(headingText, {
            x: margin,
            y: y,
            size: headingSize,
            font: helveticaBold
          });
          
          y -= headingSize + headingSpacing;
          break;
          
        case 'paragraph':
          const paragraphText = piece.text || '';
          const font = piece.bold ? helveticaBold : (piece.italic ? helveticaOblique : helveticaFont);
          const fontSize = 12;
          
          // Simple word wrapping
          const words = paragraphText.split(' ');
          let line = '';
          const maxWidth = width - (margin * 2);
          
          for (const word of words) {
            const testLine = line ? line + ' ' + word : word;
            const lineWidth = font.widthOfTextAtSize(testLine, fontSize);
            
            if (lineWidth > maxWidth) {
              page.drawText(line, {
                x: margin,
                y: y,
                size: fontSize,
                font: font
              });
              
              line = word;
              y -= lineHeight;
              
              // Add a new page if needed
              if (y < margin) {
                page = pdfDoc.addPage([612, 792]);
                y = height - margin;
              }
            } else {
              line = testLine;
            }
          }
          
          // Draw remaining text
          if (line) {
            page.drawText(line, {
              x: margin,
              y: y,
              size: fontSize,
              font: font
            });
            y -= lineHeight + paragraphSpacing;
          }
          break;
          
        case 'unorderedList':
        case 'orderedList':
          const items = piece.items || [];
          const isOrdered = piece.type === 'orderedList';
          
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemText = item.text || '';
            const itemFont = item.bold ? helveticaBold : (item.italic ? helveticaOblique : helveticaFont);
            const bulletOrNumber = isOrdered ? `${i + 1}. ` : '• ';
            
            // Draw bullet or number
            page.drawText(bulletOrNumber, {
              x: margin,
              y: y,
              size: 12,
              font: helveticaBold
            });
            
            // Calculate width of the bullet/number for text indentation
            const bulletWidth = helveticaBold.widthOfTextAtSize(bulletOrNumber, 12);
            
            // Simple word wrapping for list item text
            const words = itemText.split(' ');
            let line = '';
            const maxWidth = width - (margin * 2 + bulletWidth + 5);
            let firstLine = true;
            
            for (const word of words) {
              const testLine = line ? line + ' ' + word : word;
              const lineWidth = itemFont.widthOfTextAtSize(testLine, 12);
              
              if (lineWidth > maxWidth) {
                page.drawText(line, {
                  x: firstLine ? margin + bulletWidth + 5 : margin + bulletWidth + 15,
                  y: y,
                  size: 12,
                  font: itemFont
                });
                
                line = word;
                y -= lineHeight;
                firstLine = false;
                
                // Add a new page if needed
                if (y < margin) {
                  page = pdfDoc.addPage([612, 792]);
                  y = height - margin;
                }
              } else {
                line = testLine;
              }
            }
            
            // Draw remaining text
            if (line) {
              page.drawText(line, {
                x: firstLine ? margin + bulletWidth + 5 : margin + bulletWidth + 15,
                y: y,
                size: 12,
                font: itemFont
              });
              y -= lineHeight + 5;
            }
          }
          break;
          
        case 'table':
          const rows = piece.rows || [];
          if (rows.length === 0) break;
          
          // Calculate table dimensions
          const numCols = Math.max(...rows.map(row => (row.cells || []).length));
          if (numCols === 0) break;
          
          const colWidth = (width - margin * 2) / numCols;
          const rowHeight = 20;
          const tableHeight = rows.length * rowHeight;
          
          // Check if table fits on current page
          if (y - tableHeight < margin) {
            page = pdfDoc.addPage([612, 792]);
            y = height - margin;
          }
          
          // Draw table
          const tableX = margin;
          let tableY = y;
          
          // Draw table border
          page.drawRectangle({
            x: tableX,
            y: tableY,
            width: width - margin * 2,
            height: -tableHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
          });
          
          // Draw rows
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.cells || [];
            
            // Draw row divider if not first row
            if (i > 0) {
              page.drawLine({
                start: { x: tableX, y: tableY - i * rowHeight },
                end: { x: tableX + width - margin * 2, y: tableY - i * rowHeight },
                thickness: 1,
                color: rgb(0, 0, 0)
              });
            }
            
            // Draw cells
            for (let j = 0; j < numCols && j < cells.length; j++) {
              const cell = cells[j];
              const cellText = cell.text || '';
              const cellFont = cell.bold ? helveticaBold : (cell.italic ? helveticaOblique : helveticaFont);
              
              // Draw column divider if not first column
              if (j > 0) {
                page.drawLine({
                  start: { x: tableX + j * colWidth, y: tableY },
                  end: { x: tableX + j * colWidth, y: tableY - tableHeight },
                  thickness: 1,
                  color: rgb(0, 0, 0)
                });
              }
              
              // Draw cell text (truncate if needed)
              const fontSize = 10;
              const maxWidth = colWidth - 6;
              const textWidth = cellFont.widthOfTextAtSize(cellText, fontSize);
              const displayText = textWidth > maxWidth
                ? cellText.substring(0, Math.floor(cellText.length * (maxWidth / textWidth) - 3)) + '...'
                : cellText;
              
              page.drawText(displayText, {
                x: tableX + j * colWidth + 3,
                y: tableY - i * rowHeight - rowHeight/2 + fontSize/2,
                size: fontSize,
                font: cellFont
              });
            }
          }
          
          y = tableY - tableHeight - 10;
          break;
      }
    }
    
    // Add page numbers
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      const { width } = page.getSize();
      
      page.drawText(`Page ${i + 1} of ${pdfDoc.getPageCount()}`, {
        x: width / 2 - 40,
        y: 30,
        size: 10,
        font: helveticaFont
      });
    }
    
    // Save the PDF to bytes
    const pdfBytes = await pdfDoc.save();
    
    // Convert to a blob for upload
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    // Generate a unique file name with timestamp
    const timestamp = new Date().getTime();
    const filePath = `agreements/${agreementId}/${fileName.replace(/\s+/g, '_')}_${timestamp}.pdf`;
    
    // Upload the file to Supabase Storage
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });
    
    if (error) {
      console.error('Error uploading document to storage:', error);
      return { success: false, error };
    }
    
    // Get the public URL for the file
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);
    
    console.log(`Document created successfully: ${urlData.publicUrl}`);
    
    return {
      success: true,
      url: urlData.publicUrl,
      path: filePath
    };
  } catch (error) {
    console.error('Error creating document:', error);
    return {
      success: false,
      error: error.message || error
    };
  }
}

/**
 * Helper function to sanitize URLs that might be causing issues
 * with path-to-regexp library used by React Router.
 * 
 * @param {string} url - The URL to sanitize
 * @returns {string} - A sanitized URL string
 */
const sanitizeUrl = (url) => {
  if (!url) {
    return url;
  }
  
  try {
    // Check if the URL has a protocol (http:// or https://)
    if (url.includes('://')) {
      // For URLs with protocols, encode them to avoid colons in paths
      // which can confuse path-to-regexp
      return encodeURI(url);
    }
    
    // For relative URLs, just return as is
    return url;
  } catch (error) {
    console.error('Error sanitizing URL:', error);
    return url; // Return original in case of error
  }
};

/**
 * Fetches and prepares all necessary data for merge fields in an agreement
 * @param {Object} agreement - The agreement object
 * @returns {Promise<Object>} - Object containing all merge data
 */
async function getMergeDataForAgreement(agreement) {
  const mergeData = {
    agreement: {
      startDate: formatDate(agreement.startdate),
      endDate: formatDate(agreement.enddate),
      currentDate: formatDate(new Date()),
      agreementId: agreement.id || 'New Agreement'
    },
    terms: {
      ...agreement.terms,
      // Initialize with agreement terms, ensuring values are properly formatted even if zero
      monthlyRent: agreement.terms?.monthlyRent || '',
      depositAmount: agreement.terms?.depositAmount || '',
      paymentDueDay: agreement.terms?.paymentDueDay || '5',
      noticePeriod: agreement.terms?.noticePeriod || '30',
      specialConditions: agreement.terms?.specialConditions || '',
      // Also include formatted dates in terms for backward compatibility
      startDate: formatDate(agreement.startdate),
      endDate: formatDate(agreement.enddate)
    }
  };
  
  // Get property data if available
  if (agreement.propertyid) {
    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('id', agreement.propertyid)
      .single();
      
    if (property) {
      mergeData.property = {
        name: property.name || '',
        address: property.address || '',
        type: property.propertytype || '',
        squareFeet: property.squarefeet || '',
        yearBuilt: property.yearbuilt || '',
        amenities: property.amenities ? property.amenities.join(', ') : '',
        bankName: property.bank_name || '',
        bankBranch: property.bank_branch || '',
        bankAccount: property.bank_account_number || ''
      };
    }
  }
  
  // Get unit data if available
  if (agreement.unitid) {
    const { data: unit } = await supabase
      .from('property_units')
      .select('*')
      .eq('id', agreement.unitid)
      .single();
      
    if (unit) {
      mergeData.unit = {
        number: unit.unitnumber || '',
        floor: unit.floor || '',
        bedrooms: unit.bedrooms || '',
        bathrooms: unit.bathrooms || '',
        squareFeet: unit.squarefeet || '',
        description: unit.description || '',
        bankName: unit.bank_name || '',
        bankBranch: unit.bank_branch || '',
        bankAccount: unit.bank_account_number || ''
      };
    }
  }
  
  // Get rentee data if available
  if (agreement.renteeid) {
    const { data: rentee } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', agreement.renteeid)
      .single();
      
    if (rentee) {
      mergeData.rentee = {
        name: rentee.name || '',
        email: rentee.email || '',
        phone: rentee.phone || '',
        permanentAddress: rentee.permanent_address || '',
        nationalId: rentee.national_id || '',
        id: rentee.id || ''
      };
    }
  }
  
  return mergeData;
}

export {
  processHtmlContent,
  createDocument,
  sanitizeUrl
}; 