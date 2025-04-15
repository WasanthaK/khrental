import { supabase } from '../services/supabaseClient';

/**
 * Helper function to safely display template variables in JSX
 * Prevents "Uncaught ReferenceError: variable is not defined" 
 * 
 * @param {string} field - The field name to display inside curly braces
 * @returns {string} - The field wrapped in double curly braces as a string
 * 
 * @example
 * // Usage in JSX:
 * <div>Use the template field {templateField('unitNumber')}</div>
 * // Renders as: Use the template field {{unitNumber}}
 */
export const templateField = (field) => {
  return `{{${field}}}`;
};

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
      }
    });
    
    // Normalize address fields to prevent formatting issues
    if (data.rentee && data.rentee.permanent_address) {
      data.rentee.permanent_address = normalizeAddress(data.rentee.permanent_address);
    }
    
    if (data.property && data.property.address) {
      data.property.address = normalizeAddress(data.property.address);
    }
    
    // Create a working copy of the template to avoid modifying the original
    let mergedContent = templateContent;
    
    // Define a function to safely replace merge fields with actual values
    // This ensures we don't accidentally break HTML tags or attributes
    const safeReplace = (template, placeholder, value) => {
      // If value is null, undefined, or empty string, use a non-breaking space to preserve layout
      const safeValue = (value === null || value === undefined || value === '') ? '&nbsp;' : value;
      
      // Use a regex that ensures we're only replacing the exact placeholder
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      return template.replace(regex, safeValue);
    };
    
    // Agreement fields
    mergedContent = safeReplace(mergedContent, '{{startDate}}', formatDate(data.agreement?.startDate));
    mergedContent = safeReplace(mergedContent, '{{endDate}}', formatDate(data.agreement?.endDate));
    mergedContent = safeReplace(mergedContent, '{{currentDate}}', formatDate(data.agreement?.currentDate || new Date()));
    mergedContent = safeReplace(mergedContent, '{{agreementId}}', data.agreement?.agreementId || 'New Agreement');
    
    // Property fields
    mergedContent = safeReplace(mergedContent, '{{propertyName}}', data.property?.name);
    mergedContent = safeReplace(mergedContent, '{{propertyAddress}}', formatAddress(data.property?.address || ''));
    mergedContent = safeReplace(mergedContent, '{{propertyType}}', data.property?.propertytype);
    mergedContent = safeReplace(mergedContent, '{{propertySquareFeet}}', data.property?.squarefeet?.toString());
    mergedContent = safeReplace(mergedContent, '{{propertyYearBuilt}}', data.property?.yearbuilt?.toString());
    mergedContent = safeReplace(mergedContent, '{{propertyAmenities}}', formatAmenities(data.property?.amenities));
    mergedContent = safeReplace(mergedContent, '{{propertyBankName}}', data.property?.bank_name);
    mergedContent = safeReplace(mergedContent, '{{propertyBankBranch}}', data.property?.bank_branch);
    mergedContent = safeReplace(mergedContent, '{{propertyBankAccount}}', data.property?.bank_account_number);
    
    // Rentee fields
    mergedContent = safeReplace(mergedContent, '{{renteeName}}', data.rentee?.name);
    mergedContent = safeReplace(mergedContent, '{{renteeEmail}}', data.rentee?.email);
    mergedContent = safeReplace(mergedContent, '{{renteePhone}}', formatPhone(data.rentee?.contact_details?.phone || ''));
    mergedContent = safeReplace(mergedContent, '{{renteeAddress}}', formatAddress(data.rentee?.permanent_address || ''));
    mergedContent = safeReplace(mergedContent, '{{renteePermanentAddress}}', formatAddress(data.rentee?.permanent_address || ''));
    mergedContent = safeReplace(mergedContent, '{{renteeNationalId}}', data.rentee?.national_id);
    mergedContent = safeReplace(mergedContent, '{{renteeId}}', data.rentee?.id);
    
    // Terms fields
    mergedContent = safeReplace(mergedContent, '{{monthlyRent}}', formatCurrency(data.terms?.monthlyRent || ''));
    mergedContent = safeReplace(mergedContent, '{{depositAmount}}', formatCurrency(data.terms?.depositAmount || ''));
    mergedContent = safeReplace(mergedContent, '{{paymentDueDay}}', data.terms?.paymentDueDay);
    mergedContent = safeReplace(mergedContent, '{{noticePeriod}}', data.terms?.noticePeriod);
    mergedContent = safeReplace(mergedContent, '{{specialConditions}}', data.terms?.specialConditions);
    mergedContent = safeReplace(mergedContent, '{{utilities}}', Array.isArray(data.terms?.utilities) ? data.terms.utilities.join(', ') : (data.terms?.utilities || ''));
    mergedContent = safeReplace(mergedContent, '{{parkingSpaces}}', data.terms?.parkingSpaces);
    mergedContent = safeReplace(mergedContent, '{{petPolicy}}', data.terms?.petPolicy);
    mergedContent = safeReplace(mergedContent, '{{maintenanceContact}}', data.terms?.maintenanceContact);
    mergedContent = safeReplace(mergedContent, '{{emergencyContact}}', data.terms?.emergencyContact);
    mergedContent = safeReplace(mergedContent, '{{leaseType}}', data.terms?.leaseType);
    mergedContent = safeReplace(mergedContent, '{{paymentMethods}}', data.terms?.paymentMethods);
    mergedContent = safeReplace(mergedContent, '{{lateFees}}', data.terms?.lateFees);
    mergedContent = safeReplace(mergedContent, '{{insuranceRequirements}}', data.terms?.insuranceRequirements);
    
    // Unit fields
    mergedContent = safeReplace(mergedContent, '{{unitNumber}}', data.unit?.unitnumber);
    mergedContent = safeReplace(mergedContent, '{{unitFloor}}', data.unit?.floor);
    mergedContent = safeReplace(mergedContent, '{{unitBedrooms}}', data.unit?.bedrooms?.toString());
    mergedContent = safeReplace(mergedContent, '{{unitBathrooms}}', data.unit?.bathrooms?.toString());
    mergedContent = safeReplace(mergedContent, '{{unitSquareFeet}}', data.unit?.squarefeet?.toString());
    mergedContent = safeReplace(mergedContent, '{{unitDescription}}', data.unit?.description);
    mergedContent = safeReplace(mergedContent, '{{unitBankName}}', data.unit?.bank_name);
    mergedContent = safeReplace(mergedContent, '{{unitBankBranch}}', data.unit?.bank_branch);
    mergedContent = safeReplace(mergedContent, '{{unitBankAccount}}', data.unit?.bank_account_number);
    
    // Log which unit fields were available
    console.log('Unit fields for merge:', {
      unitNumber: data.unit?.unitnumber || 'Not available',
      unitFloor: data.unit?.floor || 'Not available',
      unitBedrooms: data.unit?.bedrooms?.toString() || 'Not available', 
      unitBathrooms: data.unit?.bathrooms?.toString() || 'Not available',
      unitDescription: data.unit?.description ? 'Available' : 'Not available',
      hasUnitRentalValues: data.unit?.rentalvalues ? 'Available' : 'Not available'
    });
    
    // Check if any merge fields remain unprocessed
    const remainingMergeFields = mergedContent.match(/{{[^{}]+}}/g);
    if (remainingMergeFields && remainingMergeFields.length > 0) {
      console.warn('Some merge fields could not be replaced:', remainingMergeFields);
      
      // Replace any remaining unknown placeholders with non-breaking spaces
      // to prevent layout issues while still preserving the document structure
      remainingMergeFields.forEach(field => {
        mergedContent = safeReplace(mergedContent, field, '&nbsp;');
      });
    }
    
    console.log('Successfully populated merge fields in template');
    return mergedContent;
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