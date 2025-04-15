import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { STORAGE_BUCKETS, BUCKET_FOLDERS } from './fileService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, AlignmentType } from 'docx';

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
        rentee:renteeid(fullname, email, idnumber)
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
      
      page.drawText(agreement.rentee?.fullname || 'N/A', {
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
      
      page.drawText(monthlyRent, {
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
      
      page.drawText(securityDeposit, {
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
    
    // Save the PDF to bytes
    const pdfBytes = await pdfDoc.save();
    
    // Convert to a blob for upload
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    // Define the file path in storage
    const fileName = `final_agreement_${Date.now()}.pdf`;
    const agreementFolder = `agreements/${agreementId}`;
    const filePath = `${agreementFolder}/${fileName}`;
    
    console.log('Uploading PDF to storage path:', filePath);
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.FILES)
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });
    
    if (error) {
      console.error('Error saving document:', error);
      throw error;
    }
    
    console.log('PDF uploaded successfully:', data);
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.FILES)
      .getPublicUrl(filePath);
    
    const publicUrl = urlData.publicUrl;
    console.log('Document public URL generated:', publicUrl);
    
    return publicUrl;
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
    const pdfPath = `${BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].AGREEMENTS}/${agreementId}/final_agreement.pdf`;
    
    // Upload PDF to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.FILES)
      .upload(pdfPath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });
    
    if (error) {
      console.error('Error uploading PDF:', error);
      throw error;
    }
    
    // Get the public URL for the PDF
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.FILES)
      .getPublicUrl(pdfPath);
    
    const pdfUrl = urlData.publicUrl;
    console.log('PDF generated and uploaded successfully:', pdfUrl);
    
    return pdfUrl;
  } catch (error) {
    console.error('Error generating PDF:', error);
    toast.error(`PDF generation failed: ${error.message}`);
    return null;
  }
}; 