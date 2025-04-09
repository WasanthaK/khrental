import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'react-hot-toast';
import { AGREEMENT_STATUS } from '../constants/agreementStatus';

export const useAgreementForm = (initialData = null) => {
  const [formData, setFormData] = useState({
    templateid: '',
    propertyid: '',
    unitid: '',
    renteeid: '',
    status: AGREEMENT_STATUS.DRAFT,
    terms: {
      monthlyRent: '',
      depositAmount: '',
      paymentDueDay: '',
      noticePeriod: '',
      additionalTerms: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [properties, setProperties] = useState([]);
  const [propertyUnits, setPropertyUnits] = useState([]);
  const [rentees, setRentees] = useState([]);
  const [templateContent, setTemplateContent] = useState('');
  const [processedContent, setProcessedContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedAmenities, setSelectedAmenities] = useState([]);
  const [amenities, setAmenities] = useState([]);

  // Load initial data
  useEffect(() => {
    if (initialData) {
      // Create a deep copy of the initialData
      const formattedData = {...initialData};
      
      // Initialize terms object if it doesn't exist
      if (!formattedData.terms) {
        formattedData.terms = {};
      }
      
      // Map database date fields to terms object fields if not already set
      if (formattedData.startdate && !formattedData.terms.startDate) {
        console.log('Mapping database startdate to terms.startDate:', formattedData.startdate);
        formattedData.terms.startDate = formattedData.startdate;
      }
      
      if (formattedData.enddate && !formattedData.terms.endDate) {
        console.log('Mapping database enddate to terms.endDate:', formattedData.enddate);
        formattedData.terms.endDate = formattedData.enddate;
      }
      
      // Set the formatted data
      setFormData(formattedData);
    }
    loadData();
  }, [initialData]);

  // Load all necessary data
  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadTemplates(),
        loadProperties(),
        loadRentees()
      ]);
      
      if (initialData?.propertyid) {
        await loadPropertyUnits(initialData.propertyid);
      }
      
      if (initialData?.templateid) {
        await loadTemplateContent(initialData.templateid);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setError(error.message);
      toast.error('Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  // Load templates
  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('agreement_templates')
      .select('*')
      .order('name');
    
    if (error) {throw error;}
    setTemplates(data);
  };

  // Load properties
  const loadProperties = async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('name');
    
    if (error) {throw error;}
    setProperties(data);
  };

  // Load property units
  const loadPropertyUnits = async (propertyId) => {
    if (!propertyId) {
      setPropertyUnits([]);
      return;
    }

    const { data, error } = await supabase
      .from('property_units')
      .select('*')
      .eq('propertyid', propertyId)
      .order('unitnumber');
    
    if (error) {throw error;}
    setPropertyUnits(data);
  };

  // Load rentees
  const loadRentees = async () => {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('role', 'rentee')
      .order('name');
    
    if (error) {throw error;}
    setRentees(data);
  };

  // Load and process template content
  const loadTemplateContent = async (templateId) => {
    if (!templateId) {
      setTemplateContent('');
      setProcessedContent('');
      return;
    }

    const { data, error } = await supabase
      .from('agreement_templates')
      .select('content')
      .eq('id', templateId)
      .single();
    
    if (error) {throw error;}
    
    // Check for date placeholders in the template
    const { content } = data;
    const datePlaceholders = content.match(/\{\{([^}]*date[^}]*)\}\}/gi);
    if (datePlaceholders?.length > 0) {
      console.log('Found date placeholders in template:', datePlaceholders);
    }
    
    setTemplateContent(content);
    await processTemplate(content);
  };

  // Process template with form data
  const processTemplate = async (content) => {
    if (!content) {return;}

    try {
      let processed = content;
      console.log("Processing template with data:", {
        propertyId: formData.propertyid,
        unitId: formData.unitid,
        renteeId: formData.renteeid,
        startDate: formData.terms?.startDate,
        endDate: formData.terms?.endDate
      });

      // Get property details if needed
      if (formData.propertyid) {
        const { data: property } = await supabase
          .from('properties')
          .select('*, property_units(*)')
          .eq('id', formData.propertyid)
          .single();

        if (property) {
          // Standard property placeholders
          processed = processed.replace(/\{\{property\.([^}]+)\}\}/g, (match, field) => {
            const value = property[field.toLowerCase()];
            if (field.toLowerCase() === 'address') {
              return formatAddress(value);
            }
            if (field.toLowerCase() === 'rentalvalues') {
              return formatCurrency(value.baseRent);
            }
            return value || match;
          });

          // Custom property placeholders
          processed = processed.replace(/\{\{propertyName\}\}/g, property.name || '');
          processed = processed.replace(/\{\{propertyAddress\}\}/g, formatAddress(property.address) || '');

          // Process bank details
          processed = processed.replace(/\{\{bank\.([^}]+)\}\}/g, (match, field) => {
            switch (field.toLowerCase()) {
              case 'name':
                return property.bank_name || match;
              case 'branch':
                return property.bank_branch || match;
              case 'accountnumber':
                return property.bank_account_number || match;
              default:
                return match;
            }
          });

          // Custom bank placeholders 
          processed = processed.replace(/\{\{propertyBankName\}\}/g, property.bank_name || '');
          processed = processed.replace(/\{\{propertyBankBranch\}\}/g, property.bank_branch || '');
          processed = processed.replace(/\{\{propertyBankAccount\}\}/g, property.bank_account_number || '');
        }
      }

      // Get unit details if needed
      if (formData.unitid) {
        const { data: unit } = await supabase
          .from('property_units')
          .select('*')
          .eq('id', formData.unitid)
          .single();

        if (unit) {
          // Standard unit placeholders
          processed = processed.replace(/\{\{unit\.([^}]+)\}\}/g, (match, field) => {
            return unit[field.toLowerCase()] || match;
          });

          // Custom unit placeholders
          processed = processed.replace(/\{\{unitNumber\}\}/g, unit.unitnumber || '');
        }
      }

      // Enhanced rentee details processing
      if (formData.renteeid) {
        const { data: rentee } = await supabase
          .from('app_users')
          .select('*')
          .eq('id', formData.renteeid)
          .single();

        if (rentee) {
          // Standard rentee placeholders
          processed = processed.replace(/\{\{rentee\.([^}]+)\}\}/g, (match, field) => {
            switch (field.toLowerCase()) {
              case 'fullname':
                return rentee.name;
              case 'nationalid':
                return rentee.national_id || match;
              case 'address':
                return rentee.permanent_address || match;
              case 'contact':
                return rentee.contact_details?.phone || match;
              default:
                return rentee[field.toLowerCase()] || match;
            }
          });

          // Custom rentee placeholders
          processed = processed.replace(/\{\{renteeName\}\}/g, rentee.name || '');
          processed = processed.replace(/\{\{renteeNationalId\}\}/g, rentee.national_id || '');
          processed = processed.replace(/\{\{renteePermanentAddress\}\}/g, rentee.permanent_address || '');
        }
      }

      // Enhanced terms processing
      if (formData.terms) {
        // Handle dates directly with explicit logging for debugging
        if (formData.terms.startDate) {
          const formattedStartDate = formatDate(formData.terms.startDate);
          console.log('Replacing startDate:', formData.terms.startDate, formattedStartDate);
          
          // Try all possible placeholder formats with case variations
          processed = processed.replace(/\{\{startDate\}\}/g, formattedStartDate);
          processed = processed.replace(/\{\{startdate\}\}/g, formattedStartDate);
          processed = processed.replace(/\{\{StartDate\}\}/g, formattedStartDate);
          processed = processed.replace(/\{\{terms\.startDate\}\}/g, formattedStartDate);
          processed = processed.replace(/\{\{terms\.startdate\}\}/g, formattedStartDate);
          
          // Also check for database column name format
          processed = processed.replace(/\{\{agreement\.startdate\}\}/g, formattedStartDate);
          processed = processed.replace(/\{\{agreement\.startDate\}\}/g, formattedStartDate);
        }
        
        if (formData.terms.endDate) {
          const formattedEndDate = formatDate(formData.terms.endDate);
          console.log('Replacing endDate:', formData.terms.endDate, formattedEndDate);
          
          // Try all possible placeholder formats with case variations
          processed = processed.replace(/\{\{endDate\}\}/g, formattedEndDate);
          processed = processed.replace(/\{\{enddate\}\}/g, formattedEndDate);
          processed = processed.replace(/\{\{EndDate\}\}/g, formattedEndDate);
          processed = processed.replace(/\{\{terms\.endDate\}\}/g, formattedEndDate);
          processed = processed.replace(/\{\{terms\.enddate\}\}/g, formattedEndDate);
          
          // Also check for database column name format
          processed = processed.replace(/\{\{agreement\.enddate\}\}/g, formattedEndDate);
          processed = processed.replace(/\{\{agreement\.endDate\}\}/g, formattedEndDate);
        }

        // Standard terms placeholders - we process dates separately above
        processed = processed.replace(/\{\{terms\.([^}]+)\}\}/g, (match, field) => {
          // Skip date fields as we've already processed them
          if (field.toLowerCase().includes('date')) {
            return match;
          }
          
          const value = formData.terms[field.toLowerCase()];
          if (field.toLowerCase().includes('amount') || field.toLowerCase().includes('rent')) {
            return formatCurrency(value);
          }
          return value || match;
        });

        // Custom terms placeholders
        processed = processed.replace(/\{\{monthlyRent\}\}/g, formatCurrency(formData.terms?.monthlyRent) || '');
        processed = processed.replace(/\{\{depositAmount\}\}/g, formatCurrency(formData.terms?.depositAmount) || '');
        processed = processed.replace(/\{\{paymentDueDay\}\}/g, formData.terms?.paymentDueDay || '');
        processed = processed.replace(/\{\{noticePeriod\}\}/g, formData.terms?.noticePeriod || '');
      }

      // Add special placeholders
      processed = processed.replace(/\{\{currentDate\}\}/g, formatDate(new Date()));
      processed = processed.replace(/\{\{expiryDate\}\}/g, formatDate(addDays(new Date(), 7)));

      // Log missing placeholders for debugging
      const remainingPlaceholders = processed.match(/\{\{([^}]+)\}\}/g);
      if (remainingPlaceholders?.length > 0) {
        console.warn('Remaining unprocessed placeholders:', remainingPlaceholders);
      }

      setProcessedContent(processed);
    } catch (error) {
      console.error('Error processing template:', error);
      toast.error('Failed to process template');
    }
  };

  // Handle input changes
  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev };
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        newData[parent] = { ...newData[parent], [child]: value };
      } else {
        newData[field] = value;
        // Load unit details when unit is selected
        if (field === 'unitid' && value) {
          loadUnitDetails(value);
        }
      }
      return newData;
    });
  };

  // Load unit details and set rental values
  const loadUnitDetails = async (unitId) => {
    if (!unitId) {return;}

    try {
      console.log('Loading unit details for ID:', unitId);
      
      // Get both the unit and its associated property
      const { data: unitData, error: unitError } = await supabase
        .from('property_units')
        .select('*, property:properties(*)')
        .eq('id', unitId)
        .single();

      if (unitError) {throw unitError;}
      
      console.log('Unit data loaded:', {
        unitId: unitData.id,
        unitNumber: unitData.unitnumber,
        hasRentalValues: !!unitData.rentalvalues,
        hasProperty: !!unitData.property
      });

      // Extract rental values with fallbacks
      let monthlyRent = '';
      let depositAmount = '';
      
      // Try to get values from unit first, then from property
      if (unitData.rentalvalues) {
        console.log('Using rental values from unit:', unitData.rentalvalues);
        monthlyRent = unitData.rentalvalues.monthlyRent || 
                      unitData.rentalvalues.rent || 
                      unitData.rentalvalues.baseRent || '';
        depositAmount = unitData.rentalvalues.depositAmount || 
                       unitData.rentalvalues.deposit || '';
      } else if (unitData.property?.rentalvalues) {
        console.log('Using rental values from property:', unitData.property.rentalvalues);
        monthlyRent = unitData.property.rentalvalues.monthlyRent || 
                     unitData.property.rentalvalues.rent || 
                     unitData.property.rentalvalues.baseRent || '';
        depositAmount = unitData.property.rentalvalues.depositAmount || 
                       unitData.property.rentalvalues.deposit || '';
      }
      
      // Extract terms from property (units don't have terms)
      let paymentDueDay = '5'; // Default value
      let noticePeriod = '30'; // Default value
      
      if (unitData.property?.terms) {
        console.log('Using terms from property:', unitData.property.terms);
        if (unitData.property.terms.paymentDueDay) {
          paymentDueDay = unitData.property.terms.paymentDueDay;
        }
        if (unitData.property.terms.noticePeriod) {
          noticePeriod = unitData.property.terms.noticePeriod;
        }
      }
      
      // Update form data with all values
      setFormData(prev => {
        console.log('Updating form data with unit details:', {
          monthlyRent,
          depositAmount,
          paymentDueDay,
          noticePeriod
        });
        
        return {
          ...prev,
          terms: {
            ...prev.terms,
            monthlyRent,
            depositAmount,
            paymentDueDay,
            noticePeriod
          }
        };
      });
    } catch (error) {
      console.error('Error loading unit details:', error);
      toast.error('Failed to load unit details');
    }
  };

  // Handle property change
  const handlePropertyChange = async (propertyId) => {
    handleInputChange('propertyid', propertyId);
    handleInputChange('unitid', null); // Reset unit to null when property changes
    await loadPropertyUnits(propertyId);
    
    // Load property details and set rental values
    try {
      console.log('Loading property details for ID:', propertyId);
      
      const { data: property, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single();

      if (error) {throw error;}
      
      console.log('Property data loaded:', {
        propertyId: property.id,
        propertyName: property.name,
        propertyType: property.propertytype,
        hasRentalValues: !!property.rentalvalues,
        hasTerms: !!property.terms
      });

      // Extract rental values with fallbacks
      let monthlyRent = '';
      let depositAmount = '';
      
      if (property.rentalvalues) {
        console.log('Using rental values from property:', property.rentalvalues);
        monthlyRent = property.rentalvalues.monthlyRent || 
                     property.rentalvalues.rent || 
                     property.rentalvalues.baseRent || '';
        depositAmount = property.rentalvalues.depositAmount || 
                       property.rentalvalues.deposit || '';
      }
      
      // Extract terms from property with defaults
      let paymentDueDay = '5'; // Default value
      let noticePeriod = '30'; // Default value
      
      if (property.terms) {
        console.log('Using terms from property:', property.terms);
        if (property.terms.paymentDueDay) {
          paymentDueDay = property.terms.paymentDueDay;
        }
        if (property.terms.noticePeriod) {
          noticePeriod = property.terms.noticePeriod;
        }
      }

      // Update form data with property values
      setFormData(prev => {
        console.log('Updating form data with property details:', {
          monthlyRent,
          depositAmount,
          paymentDueDay,
          noticePeriod
        });
        
        return {
          ...prev,
          terms: {
            ...prev.terms,
            monthlyRent,
            depositAmount,
            paymentDueDay,
            noticePeriod
          }
        };
      });
    } catch (error) {
      console.error('Error loading property details:', error);
      toast.error('Failed to load property details');
    }
  };

  // Handle template change
  const handleTemplateChange = async (templateId) => {
    handleInputChange('templateid', templateId);
    await loadTemplateContent(templateId);
  };

  // Check if agreement is editable
  const isAgreementEditable = () => {
    return !formData.id || 
           formData.status === AGREEMENT_STATUS.DRAFT || 
           formData.status === AGREEMENT_STATUS.REVIEW;
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  // Helper functions
  const formatDate = (date) => {
    if (!date) {return '';}
    
    try {
      // Handle different date formats
      let dateObj;
      
      if (typeof date === 'string') {
        // For ISO format strings like "2023-05-15"
        dateObj = new Date(date);
      } else if (date instanceof Date) {
        dateObj = date;
      } else {
        console.warn('Invalid date format:', date);
        return '';
      }
      
      // Check if date is valid
      if (isNaN(dateObj.getTime())) {
        console.warn('Invalid date:', date);
        return '';
      }
      
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error, date);
      return '';
    }
  };

  const formatAddress = (address) => {
    return address?.replace(/\n/g, '<br>') || '';
  };

  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Update processed content when form data changes
  useEffect(() => {
    if (templateContent) {
      console.log("Form data or template changed - processing template", { 
        hasTemplate: !!templateContent,
        propertyId: formData.propertyid,
        unitId: formData.unitid,
        renteeId: formData.renteeid,
        termsKeys: formData.terms ? Object.keys(formData.terms) : []
      });
      processTemplate(templateContent);
    }
  }, [formData, templateContent]);

  // Force template processing when any data changes
  useEffect(() => {
    // This effect runs on mount or when dependencies change
    if (formData.propertyid && formData.renteeid && formData.templateid && templateContent) {
      console.log("Critical data changed - forcing template processing");
      processTemplate(templateContent);
    }
  }, [
    formData.propertyid, 
    formData.renteeid, 
    formData.unitid, 
    formData.terms?.monthlyRent,
    formData.terms?.depositAmount,
    formData.terms?.startDate,
    formData.terms?.endDate,
    formData.terms?.paymentDueDay,
    formData.terms?.noticePeriod,
    formData.terms?.additionalTerms
  ]);

  useEffect(() => {
    const areArraysEqual = (arr1, arr2) => {
      if (arr1?.length !== arr2?.length) {
        return false;
      }
      return arr1?.every((item, index) => item === arr2[index]);
    };

    if (!areArraysEqual(selectedAmenities, amenities)) {
      setAmenities(selectedAmenities || []);
    }
  }, [selectedAmenities]); // Removed amenities from dependencies to prevent infinite loop

  return {
    formData,
    loading,
    submitting,
    setSubmitting,
    error,
    templates,
    properties,
    propertyUnits,
    rentees,
    templateContent,
    processedContent,
    handleInputChange,
    handlePropertyChange,
    handleTemplateChange,
    isAgreementEditable
  };
}; 