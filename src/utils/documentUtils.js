import { supabase } from '../services/supabaseClient';

/**
 * Format a currency value for display
 * @param {number|string} value - Currency value to format
 * @returns {string} - Formatted currency string
 */
export const formatCurrency = (value) => {
  if (!value) { return ''; }
  try {
    // Remove any existing currency formatting
    const numericValue = parseFloat(value.toString().replace(/[^0-9.-]+/g, ''));
    if (isNaN(numericValue)) { return ''; }
    
    // Format as LKR
    return `Rs. ${numericValue.toLocaleString('si-LK')}`;
  } catch (error) {
    console.error('Error formatting currency:', error);
    return value;
  }
};

/**
 * Format a date value for display
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date string
 */
export const formatDate = (date) => {
  if (!date) { return ''; }
  
  try {
    const dateObj = new Date(date);
    
    // Check for invalid date
    if (isNaN(dateObj.getTime())) {
      console.warn(`formatDate: Invalid date value: "${date}"`);
      return date;
    }
    
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error, { date });
    return date;
  }
};

/**
 * Format a phone number for display
 * @param {string} phone - Phone number to format
 * @returns {string} - Formatted phone number
 */
export const formatPhone = (phone) => {
  if (!phone) { return ''; }
  
  try {
    // Clean input of non-digit characters
    const cleaned = ('' + phone).replace(/\D/g, '');
    
    // Check if it's a standard 10-digit US phone number
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    
    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    
    // Handle other formats
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      // Format as 1-XXX-XXX-XXXX for 11 digits starting with 1
      return `1-${cleaned.slice(1, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length >= 7) {
      // Generic format for other lengths
      return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    }
    
    return phone; // Return original if not standard format
  } catch (error) {
    console.error('Error formatting phone number:', error, { phone });
    return phone;
  }
};

/**
 * Format an address for display
 * @param {string} address - Address to format
 * @returns {string} - Formatted address with HTML line breaks
 */
export const formatAddress = (address) => {
  if (!address) { return ''; }
  
  try {
    // Replace commas followed by whitespace with comma + <br>
    return address.replace(/,\s*/g, ',<br>');
  } catch (error) {
    console.error('Error formatting address:', error, { address });
    return address;
  }
};

/**
 * Format amenities list for display
 * @param {Array|string} amenities - Array or string of amenities
 * @returns {string} - Formatted amenities HTML
 */
export const formatAmenities = (amenities) => {
  if (!amenities) { return ''; }
  
  try {
    let amenitiesList = amenities;
    
    // Parse if it's a JSON string
    if (typeof amenities === 'string') {
      if (amenities.trim().startsWith('[')) {
        try {
          amenitiesList = JSON.parse(amenities);
        } catch (e) {
          console.warn('Error parsing amenities JSON string:', e, { amenities });
          return amenities;
        }
      } else {
        // Simple string, return as is or split by commas
        return amenities.includes(',') 
          ? '<ul>' + amenities.split(',').map(a => `<li>${a.trim()}</li>`).join('') + '</ul>'
          : amenities;
      }
    }
    
    // Format as a list if it's an array
    if (Array.isArray(amenitiesList)) {
      if (amenitiesList.length === 0) { return ''; }
      
      // Filter out empty items and format as HTML list
      const filteredList = amenitiesList
        .filter(amenity => amenity && String(amenity).trim())
        .map(amenity => `<li>${amenity}</li>`);
      
      if (filteredList.length === 0) { return ''; }
      
      return '<ul>' + filteredList.join('') + '</ul>';
    }
    
    // Handle objects or other unexpected types
    if (typeof amenitiesList === 'object') {
      return JSON.stringify(amenitiesList);
    }
    
    return String(amenities); // Convert to string as fallback
  } catch (error) {
    console.error('Error formatting amenities:', error, { amenities });
    return String(amenities);
  }
};

// First define a helper function to normalize addresses at the top of the file
/**
 * Normalize an address by removing extra newlines and standardizing formatting
 * @param {string} address - The address to normalize
 * @returns {string} - Normalized address
 */
function normalizeAddress(address) {
  if (!address) { return ''; }
  
  // Replace multiple newlines with a comma and space
  // Also replace single newlines with comma and space
  return address
    .replace(/\r?\n+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Validates HTML content for properly closed tags
 * @param {string} content - HTML content to validate
 * @returns {string} - Corrected HTML content
 */
const validateHtmlTags = (content) => {
  // Create a map of opening and closing tags
  const tagPairs = {
    '<b>': '</b>',
    '<strong>': '</strong>',
    '<i>': '</i>',
    '<em>': '</em>',
    '<p>': '</p>',
    '<ul>': '</ul>',
    '<ol>': '</ol>',
    '<li>': '</li>'
  };
  
  // Stack to track opening tags
  const tagStack = [];
  let validatedContent = content;
  
  // First pass: count tags and identify mismatches
  Object.entries(tagPairs).forEach(([openTag, closeTag]) => {
    const openCount = (content.match(new RegExp(openTag, 'g')) || []).length;
    const closeCount = (content.match(new RegExp(closeTag, 'g')) || []).length;
    
    // If there are more opening tags than closing tags, add missing closing tags
    if (openCount > closeCount) {
      console.log(`Found ${openCount} ${openTag} tags but only ${closeCount} ${closeTag} tags`);
      for (let i = 0; i < openCount - closeCount; i++) {
        validatedContent += closeTag;
      }
    }
    // If there are more closing tags than opening tags, add missing opening tags at the start
    else if (closeCount > openCount) {
      console.log(`Found ${closeCount} ${closeTag} tags but only ${openCount} ${openTag} tags`);
      validatedContent = openTag.repeat(closeCount - openCount) + validatedContent;
    }
  });
  
  return validatedContent;
};

/**
 * Populate merge fields in a template with actual data
 * @param {string} templateContent - Template content with merge fields
 * @param {Object} data - Data object containing agreement, property, unit, rentee, and terms data
 * @returns {Promise<string>} - Populated content
 */
export const populateMergeFields = async (templateContent, data) => {
  if (!templateContent) {
    console.warn('populateMergeFields called with empty template content');
    return '';
  }
  
  if (!data) {
    console.warn('populateMergeFields called without data object, returning original template');
    return templateContent;
  }
  
  try {
    console.log('Starting to populate merge fields:', {
      templateLength: templateContent.length,
      dataProvided: {
        hasAgreement: !!data.agreement,
        hasProperty: !!data.property,
        hasRentee: !!data.rentee,
        hasUnit: !!data.unit,
        hasTerms: !!data.terms
      },
      agreementInfo: data.agreement ? {
        id: data.agreement.agreementId,
        hasStartDate: !!data.agreement.startDate,
        hasEndDate: !!data.agreement.endDate
      } : 'No agreement data provided'
    });
    
    // Normalize address fields to prevent formatting issues
    if (data.rentee && data.rentee.permanent_address) {
      data.rentee.permanent_address = normalizeAddress(data.rentee.permanent_address);
    }
    
    if (data.property && data.property.address) {
      data.property.address = normalizeAddress(data.property.address);
    }
    
    // Replace merge fields with actual values
    let mergedContent = templateContent
      // Agreement fields
      .replace(/{{startDate}}/g, formatDate(data.agreement?.startDate))
      .replace(/{{endDate}}/g, formatDate(data.agreement?.endDate))
      .replace(/{{currentDate}}/g, formatDate(data.agreement?.currentDate || new Date()))
      .replace(/{{agreementId}}/g, data.agreement?.agreementId || 'New Agreement')
      
      // Property fields
      .replace(/{{propertyName}}/g, data.property?.name || '')
      .replace(/{{propertyAddress}}/g, formatAddress(data.property?.address || ''))
      .replace(/{{propertyType}}/g, data.property?.propertytype || '')
      .replace(/{{propertySquareFeet}}/g, data.property?.squarefeet?.toString() || '')
      .replace(/{{propertyYearBuilt}}/g, data.property?.yearbuilt?.toString() || '')
      .replace(/{{propertyAmenities}}/g, formatAmenities(data.property?.amenities))
      .replace(/{{propertyBankName}}/g, data.property?.bank_name || '')
      .replace(/{{propertyBankBranch}}/g, data.property?.bank_branch || '')
      .replace(/{{propertyBankAccount}}/g, data.property?.bank_account_number || '')
      
      // Rentee fields
      .replace(/{{renteeName}}/g, data.rentee?.name || '')
      .replace(/{{renteeEmail}}/g, data.rentee?.email || '')
      .replace(/{{renteePhone}}/g, formatPhone(data.rentee?.contact_details?.phone || ''))
      .replace(/{{renteeAddress}}/g, formatAddress(data.rentee?.permanent_address || ''))
      .replace(/{{renteePermanentAddress}}/g, formatAddress(data.rentee?.permanent_address || ''))
      .replace(/{{renteeNationalId}}/g, data.rentee?.national_id || '')
      .replace(/{{renteeId}}/g, data.rentee?.id || '')
      
      // Terms fields
      .replace(/{{monthlyRent}}/g, formatCurrency(data.terms?.monthlyRent || ''))
      .replace(/{{depositAmount}}/g, formatCurrency(data.terms?.depositAmount || ''))
      .replace(/{{paymentDueDay}}/g, data.terms?.paymentDueDay || '')
      .replace(/{{noticePeriod}}/g, data.terms?.noticePeriod || '')
      .replace(/{{specialConditions}}/g, data.terms?.specialConditions || '')
      .replace(/{{utilities}}/g, Array.isArray(data.terms?.utilities) ? data.terms.utilities.join(', ') : (data.terms?.utilities || ''))
      .replace(/{{parkingSpaces}}/g, data.terms?.parkingSpaces || '')
      .replace(/{{petPolicy}}/g, data.terms?.petPolicy || '')
      .replace(/{{maintenanceContact}}/g, data.terms?.maintenanceContact || '')
      .replace(/{{emergencyContact}}/g, data.terms?.emergencyContact || '')
      .replace(/{{leaseType}}/g, data.terms?.leaseType || '')
      .replace(/{{paymentMethods}}/g, data.terms?.paymentMethods || '')
      .replace(/{{lateFees}}/g, data.terms?.lateFees || '')
      .replace(/{{insuranceRequirements}}/g, data.terms?.insuranceRequirements || '');
      
    // Add unit-specific replacements if unit data is provided
    if (data.unit) {
      console.log('Adding unit data to template:', {
        unitNumber: data.unit.unitnumber,
        bedrooms: data.unit.bedrooms,
        bathrooms: data.unit.bathrooms
      });
      
      mergedContent = mergedContent
        .replace(/{{unitNumber}}/g, data.unit.unitnumber || '')
        .replace(/{{unitFloor}}/g, data.unit.floor || '')
        .replace(/{{unitBedrooms}}/g, data.unit.bedrooms?.toString() || '')
        .replace(/{{unitBathrooms}}/g, data.unit.bathrooms?.toString() || '')
        .replace(/{{unitSquareFeet}}/g, data.unit.squarefeet?.toString() || '')
        .replace(/{{unitDescription}}/g, data.unit.description || '')
        .replace(/{{unitBankName}}/g, data.unit.bank_name || '')
        .replace(/{{unitBankBranch}}/g, data.unit.bank_branch || '')
        .replace(/{{unitBankAccount}}/g, data.unit.bank_account_number || '');
    } else {
      console.log('No unit data provided, replacing unit fields with empty strings');
      // If no unit data, replace unit fields with empty strings
      mergedContent = mergedContent
        .replace(/{{unitNumber}}/g, '')
        .replace(/{{unitFloor}}/g, '')
        .replace(/{{unitBedrooms}}/g, '')
        .replace(/{{unitBathrooms}}/g, '')
        .replace(/{{unitSquareFeet}}/g, '')
        .replace(/{{unitDescription}}/g, '')
        .replace(/{{unitBankName}}/g, '')
        .replace(/{{unitBankBranch}}/g, '')
        .replace(/{{unitBankAccount}}/g, '');
    }
    
    // Add basic HTML formatting
    mergedContent = mergedContent
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\_(.*?)\_/g, '<em>$1</em>');
    
    // Note: Text colors applied via TipTap are already in the HTML as span elements
    // with inline style, so they are preserved automatically
    
    // Ensure we don't have any broken span tags by doing a quick validation
    const openSpans = (mergedContent.match(/<span/g) || []).length;
    const closeSpans = (mergedContent.match(/<\/span>/g) || []).length;
    if (openSpans !== closeSpans) {
      console.warn(`Warning: Unbalanced span tags detected in content. Open spans: ${openSpans}, Close spans: ${closeSpans}`);
    }
    
    // Check if any merge fields remain unprocessed
    const remainingMergeFields = mergedContent.match(/{{[^{}]+}}/g);
    if (remainingMergeFields && remainingMergeFields.length > 0) {
      console.warn('Some merge fields could not be replaced:', remainingMergeFields);
    }
    
    // Validate and fix HTML tags
    const validatedContent = validateHtmlTags(mergedContent);
    
    // Log validation results
    console.log('HTML validation complete:', {
      originalLength: mergedContent.length,
      validatedLength: validatedContent.length,
      paragraphs: (validatedContent.match(/<p>/g) || []).length,
      boldTags: (validatedContent.match(/<(b|strong)>/g) || []).length
    });
    
    console.log('Successfully populated merge fields in template');
    return validatedContent;
  } catch (error) {
    console.error('Error populating merge fields:', error, {
      errorName: error.name,
      errorStack: error.stack,
      templateLength: templateContent?.length,
      dataProvided: {
        hasAgreement: !!data?.agreement,
        hasProperty: !!data?.property,
        hasRentee: !!data?.rentee,
        hasUnit: !!data?.unit,
        hasTerms: !!data?.terms
      }
    });
    
    // Return original template with error message for debugging
    return `<div style="color: red; padding: 10px; border: 1px solid red; margin: 10px 0;">
      Error populating merge fields: ${error.message}
    </div>
    ${templateContent}`;
  }
}; 