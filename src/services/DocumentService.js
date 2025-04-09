import { Document, Paragraph, TextRun, Packer, AlignmentType } from 'docx';
import { PDFDocument, rgb } from 'pdf-lib';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { STORAGE_BUCKETS, BUCKET_FOLDERS } from './fileService';

/**
 * Converts HTML content to a DOCX blob
 * @param {string} htmlContent - HTML content to convert
 * @returns {Promise<Blob>} - DOCX as blob
 */
export const convertToDocx = async (htmlContent) => {
  try {
    // Strip HTML tags to get plain text
    // This is a simplistic approach for browser context
    const textContent = htmlContent
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p.*?>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<(?:.|\n)*?>/gm, '') // Remove remaining HTML tags
      .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with just two
      .trim();
    
    // Create a DOCX document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: textContent,
                  size: 24 // 12pt = 24 half-points
                })
              ]
            })
          ]
        }
      ]
    });
    
    // Generate the DOCX as a blob
    const buffer = await Packer.toBlob(doc);
    return buffer;
  } catch (error) {
    console.error('Error converting to DOCX:', error);
    throw error;
  }
};

/**
 * Saves merged document content as a DOCX file
 * @param {string} content - HTML content to save
 * @param {string|object} agreement - ID of the agreement or the agreement object
 * @returns {Promise<string>} - Public URL of the saved document
 */
export const saveMergedDocument = async (content, agreement) => {
  try {
    // Extract the ID properly whether it's a string or an object
    const agreementId = typeof agreement === 'string' ? agreement : agreement.id;
    
    console.log('Saving merged document for agreement:', agreementId);
    console.log('Content length:', content.length);
    
    // Debug mode - log content for troubleshooting
    const DEBUG_MODE = true;
    if (DEBUG_MODE) {
      console.log('Content analysis:', {
        hasSpans: content.includes('<span'),
        hasColorStyles: content.includes('style="color'),
        hasParagraphs: content.includes('<p'),
        hasBold: content.includes('<strong') || content.includes('<b'),
        hasItalic: content.includes('<em') || content.includes('<i'),
        hasLists: content.includes('<ul') || content.includes('<ol') || content.includes('<li')
      });
      
      // Check for HTML structure
      console.log('HTML structure check:', {
        openParagraphs: (content.match(/<p[^>]*>/g) || []).length,
        closeParagraphs: (content.match(/<\/p>/g) || []).length,
        openBold: (content.match(/<(b|strong)[^>]*>/g) || []).length,
        closeBold: (content.match(/<\/(b|strong)>/g) || []).length
      });
    }
    
    // Ensure content has proper paragraph wrapping before processing
    let processedContent = content;
    if (!processedContent.includes('<p')) {
      console.log('No paragraph tags found, wrapping content in paragraphs');
      processedContent = `<p>${processedContent.replace(/\n/g, '</p><p>')}</p>`;
      // Clean up empty paragraphs
      processedContent = processedContent.replace(/<p>\s*<\/p>/g, '');
    }
    
    // Create a DOCX document with proper structure
    const doc = new Document({
      title: `Agreement ${agreementId}`,
      description: 'Rental Agreement Document',
      styles: {
        paragraphStyles: [
          {
            id: 'Normal',
            name: 'Normal',
            run: {
              size: 24, // 12pt
              font: 'Calibri'
            },
            paragraph: {
              spacing: {
                line: 276, // 1.15 line spacing
                before: 0,
                after: 200  // 10pt space after
              }
            }
          },
          {
            id: 'Heading1',
            name: 'Heading 1',
            run: {
              size: 32, // 16pt
              bold: true,
              font: 'Calibri'
            },
            paragraph: {
              spacing: {
                before: 240, // 12pt
                after: 120   // 6pt
              }
            }
          },
          {
            id: 'Heading2',
            name: 'Heading 2',
            run: {
              size: 28, // 14pt
              bold: true,
              font: 'Calibri'
            },
            paragraph: {
              spacing: {
                before: 240, // 12pt
                after: 120   // 6pt
              }
            }
          },
          {
            id: 'ListParagraph',
            name: 'List Paragraph',
            run: {
              size: 24, // 12pt
              font: 'Calibri'
            },
            paragraph: {
              spacing: {
                line: 276, // 1.15 line spacing
                before: 60,  // 3pt
                after: 60    // 3pt
              },
              indent: {
                left: 720    // 0.5 inch
              }
            }
          }
        ]
      },
      numbering: {
        config: [
          {
            reference: 'default-numbering',
            levels: [
              {
                level: 0,
                format: 'decimal',
                text: '%1.',
                alignment: AlignmentType.START,
                style: {
                  paragraph: {
                    indent: { left: 720, hanging: 260 }
                  }
                }
              },
              {
                level: 1,
                format: 'lowerLetter',
                text: '%2)',
                alignment: AlignmentType.START,
                style: {
                  paragraph: {
                    indent: { left: 1080, hanging: 260 }
                  }
                }
              }
            ]
          }
        ]
      },
      sections: [
        {
          children: processHtmlContent(processedContent)
        }
      ]
    });
    
    console.log('DOCX document created successfully, generating blob...');
    
    // Generate the DOCX as a blob
    const blob = await Packer.toBlob(doc);
    console.log('DOCX blob created, size:', blob.size, 'type:', blob.type);
    
    // Validate the blob
    if (!blob || blob.size === 0) {
      throw new Error('Generated DOCX is empty or invalid');
    }
    
    // Define the file path in storage
    const fileName = `final_agreement_${Date.now()}.docx`;
    // Make sure agreementId is used properly in the path (avoid undefined)
    const agreementFolder = `agreements/${agreementId}`;
    const filePath = `${agreementFolder}/${fileName}`;
    
    console.log('Uploading DOCX to storage path:', filePath);
    
    // Upload to Supabase Storage with explicit content type
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.FILES)
      .upload(filePath, blob, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true
      });
    
    if (error) {
      console.error('Error saving document:', error);
      throw error;
    }
    
    console.log('DOCX uploaded successfully:', data);
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.FILES)
      .getPublicUrl(filePath);
    
    const publicUrl = urlData.publicUrl;
    console.log('Document public URL generated:', publicUrl);
    
    // Verify that the URL seems correct and properly formatted
    if (!publicUrl || typeof publicUrl !== 'string') {
      throw new Error('Failed to generate a valid public URL for the document');
    }
    
    // Verify the URL includes both the agreement ID and filename
    if (!publicUrl.includes(agreementId) || !publicUrl.includes(fileName)) {
      console.warn('Generated URL might be incorrect:', publicUrl);
      console.warn('Expected URL to contain:', agreementId, 'and', fileName);
    }
    
    // Validate the URL
    if (!publicUrl.startsWith('http')) {
      console.error('Invalid URL format, does not start with http:', publicUrl);
      throw new Error('Generated URL is invalid');
    }
    
    console.log('Document saved successfully with URL:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error saving merged document:', error);
    toast.error('Error saving document: ' + error.message);
    throw error;
  }
};

/**
 * Helper function to process HTML content into DOCX paragraphs
 * @param {string} html - HTML content
 * @returns {Array} - Array of paragraphs for DOCX
 */
function processHtmlContent(html) {
  console.log("Processing HTML content with length:", html.length);
  const paragraphs = [];
  
  // Split the content into paragraphs based on HTML paragraph tags
  const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gs;
  const matches = [...html.matchAll(paragraphRegex)];
  
  // If no paragraphs found, process the entire content as a single paragraph
  if (matches.length === 0) {
    console.log("No paragraph tags found, processing entire content");
    paragraphs.push(createSimpleParagraph(html));
    return paragraphs;
  }
  
  console.log(`Found ${matches.length} paragraphs in HTML content`);
  
  // Process each paragraph
  for (const match of matches) {
    const paragraphContent = match[1].trim();
    if (!paragraphContent) continue;
    
    // Check if this is a list item
    if (paragraphContent.includes('<ul>') || paragraphContent.includes('<ol>')) {
      // Process lists
      processListItems(paragraphContent, paragraphs);
    } else if (paragraphContent.includes('<li>')) {
      // Handle orphaned list items
      const listItemContent = paragraphContent.replace(/<li>(.*?)<\/li>/g, '$1').trim();
      const para = new Paragraph({
        text: listItemContent,
        bullet: { level: 0 },
        style: 'ListParagraph'
      });
      paragraphs.push(para);
    } else {
      // Create a paragraph with proper formatting and handle bold/italic/etc.
      const para = createFormattedParagraph(paragraphContent);
      paragraphs.push(para);
    }
  }
  
  return paragraphs;
}

// Helper function to create a simple paragraph from text
function createSimpleParagraph(text) {
  // Remove HTML tags but preserve line breaks
  const cleanedText = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
    
  return new Paragraph({
    text: cleanedText,
    style: 'Normal'
  });
}

// Helper function to process list items
function processListItems(html, paragraphs) {
  // Handle unordered lists
  if (html.includes('<ul>')) {
    const listItems = html.match(/<li>(.*?)<\/li>/g) || [];
    listItems.forEach(item => {
      const content = item.replace(/<li>(.*?)<\/li>/, '$1').trim();
      const para = new Paragraph({
        text: content,
        bullet: { level: 0 },
        style: 'ListParagraph'
      });
      paragraphs.push(para);
    });
  }
  
  // Handle ordered lists
  if (html.includes('<ol>')) {
    const listItems = html.match(/<li>(.*?)<\/li>/g) || [];
    listItems.forEach((item, index) => {
      const content = item.replace(/<li>(.*?)<\/li>/, '$1').trim();
      const para = new Paragraph({
        text: content,
        numbering: {
          reference: 'default-numbering',
          level: 0,
          instance: index + 1
        },
        style: 'ListParagraph'
      });
      paragraphs.push(para);
    });
  }
}

// Helper function to create a paragraph with proper text formatting
function createFormattedParagraph(html) {
  // Process the HTML to extract formatting
  const textRuns = [];
  
  // Process the text and build text runs while preserving formatting
  let currentText = html;
  
  // Bold text
  currentText = processFormatting(currentText, /<(b|strong)>(.*?)<\/\1>/g, textRuns, 
    (content) => ({ text: content, bold: true }));
  
  // Italic text
  currentText = processFormatting(currentText, /<(i|em)>(.*?)<\/\1>/g, textRuns, 
    (content) => ({ text: content, italic: true }));
  
  // Colored text
  currentText = processFormatting(currentText, /<span style="color:\s*([^;"]+)[^"]*">(.*?)<\/span>/g, textRuns, 
    (content, matches) => ({ text: content, color: parseColor(matches[1]) }));
  
  // Any remaining HTML - convert to plain text
  if (currentText.trim()) {
    const cleanText = currentText.replace(/<[^>]+>/g, '').trim();
    if (cleanText) {
      textRuns.push(new TextRun({ text: cleanText }));
    }
  }
  
  // If no text runs were created, create a simple text run
  if (textRuns.length === 0) {
    // Just use the HTML with tags removed
    const plainText = html.replace(/<[^>]+>/g, '').trim();
    textRuns.push(new TextRun({ text: plainText }));
  }
  
  return new Paragraph({
    children: textRuns,
    style: html.startsWith('<h1') ? 'Heading1' : 
           html.startsWith('<h2') || html.startsWith('<h3') ? 'Heading2' : 'Normal'
  });
}

// Helper to process different kinds of formatting
function processFormatting(text, regex, textRuns, createTextRun) {
  let result = text;
  let lastIndex = 0;
  const matches = [...text.matchAll(regex)];
  
  for (const match of matches) {
    // Add any text before this match
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index).replace(/<[^>]+>/g, '');
      if (beforeText.trim()) {
        textRuns.push(new TextRun({ text: beforeText }));
      }
    }
    
    // Add the formatted content
    const content = match[2].replace(/<[^>]+>/g, '').trim();
    if (content) {
      textRuns.push(new TextRun(createTextRun(content, match)));
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Return any remaining text that hasn't been processed
  return lastIndex < text.length ? text.substring(lastIndex) : '';
}

// Helper to parse color values
function parseColor(colorValue) {
  // Handle named colors
  const colorMap = {
    'red': '#FF0000',
    'blue': '#0000FF',
    'green': '#008000',
    'black': '#000000',
    'white': '#FFFFFF',
    'gray': '#808080',
    'grey': '#808080',
    'orange': '#FFA500',
    'purple': '#800080',
    'brown': '#A52A2A'
    // Add more colors as needed
  };
  
  if (colorMap[colorValue.toLowerCase()]) {
    return colorMap[colorValue.toLowerCase()];
  }
  
  // Handle RGB format
  if (colorValue.startsWith('rgb')) {
    const rgbMatch = colorValue.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }
  
  // Return the color as is if it's a hex code or fallback to black
  return colorValue.startsWith('#') ? colorValue : '#000000';
}

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