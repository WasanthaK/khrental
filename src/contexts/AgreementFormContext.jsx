import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from "../services/supabaseClient";
import { fetchData } from '../services/supabaseClient';
import { fromDatabaseFormat } from '../utils/dataUtils';

// Status constants
export const STATUS = {
  DRAFT: 'draft',
  REVIEW: 'review',
  PENDING: 'pending',
  PENDING_SIGNATURE: 'pending_signature',
  SIGNED: 'signed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired'
};

// Storage constants
export const STORAGE_BUCKETS = {
  AGREEMENTS: 'files',
  TEMPLATES: 'templates'
};

export const BUCKET_FOLDERS = {
  DOCUMENTS: 'agreements',
  PDFS: 'pdfs',
  SIGNATURES: 'signatures'
};

// Create context
const AgreementFormContext = createContext();

// Custom hook to use the context
export const useAgreementForm = () => {
  const context = useContext(AgreementFormContext);
  if (!context) {
    throw new Error('useAgreementForm must be used within an AgreementFormProvider');
  }
  return context;
};

// Provider component
export const AgreementFormProvider = ({ children, agreementId }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    id: null,
    templateid: '',
    propertyid: '',
    unitid: '',
    renteeid: '',
    startdate: new Date().toISOString().split('T')[0],
    enddate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    status: STATUS.DRAFT,
    documenturl: '',
    pdfurl: '',
    signatureurl: '',
    eviasignreference: '',
    signature_request_id: '',
    notes: '',
    terms: {
      monthlyRent: '',
      depositAmount: '',
      paymentDueDay: '5',
      noticePeriod: '30',
      specialConditions: ''
    }
  });
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [properties, setProperties] = useState([]);
  const [propertyUnits, setPropertyUnits] = useState([]);
  const [rentees, setRentees] = useState([]);
  const [templateContent, setTemplateContent] = useState('');
  const [templateLoadError, setTemplateLoadError] = useState(null);
  
  // Load existing agreement data
  useEffect(() => {
    const loadExistingAgreement = async () => {
      if (!agreementId) {
        return;
      }
      
      setLoading(true);
      try {
        console.log('Loading existing agreement with ID:', agreementId);
        
        const { data: agreement, error } = await supabase
          .from('agreements')
          .select(`
            *,
            property:propertyid (*),
            unit:unitid (*),
            rentee:renteeid (*),
            template:templateid (*)
          `)
          .eq('id', agreementId)
          .single();
        
        if (error) {
          throw error;
        }
        
        console.log('Loaded agreement data:', agreement);
        
        // Fix issue with terms being stored as character array
        let parsedTerms = agreement.terms;
        
        // Check if terms is stored as a character array or string rather than an object
        if (typeof parsedTerms === 'string') {
          try {
            parsedTerms = JSON.parse(parsedTerms);
            console.log('Parsed terms from string:', parsedTerms);
          } catch (e) {
            console.error('Failed to parse terms string:', e);
          }
        } else if (Array.isArray(parsedTerms) || (typeof parsedTerms === 'object' && parsedTerms !== null && '0' in parsedTerms)) {
          // Handle case where terms is saved as a character array
          try {
            // Try to reconstruct the JSON string
            const jsonStr = Object.values(parsedTerms).join('');
            parsedTerms = JSON.parse(jsonStr);
            console.log('Reconstructed terms from array:', parsedTerms);
          } catch (e) {
            console.error('Failed to reconstruct terms from array:', e);
            // Fallback to empty terms
            parsedTerms = {
              monthlyRent: '',
              depositAmount: '',
              paymentDueDay: '5',
              noticePeriod: '30',
              specialConditions: ''
            };
          }
        }
        
        // If parsedTerms is still not an object, create a default object
        if (typeof parsedTerms !== 'object' || parsedTerms === null) {
          console.warn('Terms is not an object, creating default terms');
          parsedTerms = {
            monthlyRent: '',
            depositAmount: '',
            paymentDueDay: '5',
            noticePeriod: '30',
            specialConditions: ''
          };
        }
        
        if (agreement) {
          console.log('Setting form data with agreement values');
          
          // Set form data with existing agreement values
          setFormData({
            id: agreement.id,
            templateid: agreement.templateid,
            propertyid: agreement.propertyid,
            unitid: agreement.unitid || '',
            renteeid: agreement.renteeid,
            propertyType: agreement.property?.propertytype || '',
            startdate: agreement.startdate,
            enddate: agreement.enddate,
            status: agreement.status,
            documenturl: agreement.documenturl || '',
            pdfurl: agreement.pdfurl || '',
            signatureurl: agreement.signatureurl || '',
            eviasignreference: agreement.eviasignreference || '',
            signature_request_id: agreement.signature_request_id || '',
            notes: agreement.notes || '',
            terms: parsedTerms
          });

          // Log the terms that were set
          console.log('Set terms in form data:', parsedTerms);

          // Load template content directly from the joined template data if available
          if (agreement.template?.content) {
            console.log('Setting template content from joined data');
            setTemplateContent(agreement.template.content);
          }
          // As a fallback, load template content separately
          else if (agreement.templateid) {
            await loadTemplateContent(agreement.templateid);
          }

          // Load property details if propertyid is available
          if (agreement.propertyid) {
            console.log('Loading property details for property ID:', agreement.propertyid);
            await loadPropertyDetails(agreement.propertyid);
            
            // Then load unit details if unitid is available
            if (agreement.unitid) {
              console.log('Loading unit details for unit ID:', agreement.unitid);
              await loadUnitDetails(agreement.unitid);
            }
          }

          // Load property units if it's an apartment
          if (agreement.property?.propertytype === 'apartment') {
            const { data: units } = await supabase
              .from('property_units')
              .select('*')
              .eq('propertyid', agreement.propertyid);
            
            setPropertyUnits(units || []);
          }
        }
      } catch (error) {
        console.error('Error loading agreement:', error);
        toast.error('Failed to load agreement: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    // Load initial data
    const loadInitialData = async () => {
      setLoading(true);
      try {
        // Load properties
        const { data: propertiesData, error: propertiesError } = await supabase
          .from('properties')
          .select('*')
          .order('name');
        
        if (propertiesError) {
          throw propertiesError;
        }
        setProperties(propertiesData || []);

        // Load rentees
        const { data: renteesData, error: renteesError } = await supabase
          .from('app_users')
          .select('*')
          .eq('user_type', 'rentee');
        
        if (renteesError) {
          throw renteesError;
        }
        setRentees(renteesData || []);

        // Load existing agreement if editing
        await loadExistingAgreement();
      } catch (error) {
        console.error('Error loading initial data:', error);
        toast.error('Failed to load data: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [agreementId]);
  
  // Handle input changes
  const handleInputChange = async (name, value) => {
    console.log(`Changing ${name} to ${value}`);
    
    // If we're setting a numeric field, ensure it's stored as a string for consistency
    const formattedValue = ['terms.monthlyRent', 'terms.depositAmount', 'terms.paymentDueDay', 'terms.noticePeriod'].includes(name) 
      ? String(value)
      : value;
    
    setFormData(prev => {
      const newData = { ...prev };
      if (name.includes('.')) {
        const [parent, child] = name.split('.');
        newData[parent] = { ...newData[parent], [child]: formattedValue };
      } else {
        newData[name] = formattedValue;
      }
      return newData;
    });
    
    // When template changes, load its content
    if (name === 'templateid' && value) {
      loadTemplateContent(value);
    }

    // When property changes, load units and rental values
    if (name === 'propertyid' && value) {
      await loadPropertyDetails(value);
    }

    // When unit changes, load unit-specific rental values
    if (name === 'unitid' && value) {
      await loadUnitDetails(value);
    }
  };
  
  // Handle terms object changes
  const handleTermsChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      terms: {
        ...prev.terms,
        [field]: value
      }
    }));
  };
  
  // Determine if agreement is editable
  const isAgreementEditable = () => {
    // Don't allow editing of signed, pending_signature, cancelled, or expired agreements
    return !formData.status || 
           formData.status === STATUS.DRAFT || 
           formData.status === STATUS.REVIEW;
           // Explicitly not allowing:
           // formData.status === STATUS.SIGNED 
           // formData.status === STATUS.PENDING_SIGNATURE
           // formData.status === STATUS.CANCELLED
           // formData.status === STATUS.EXPIRED
  };
  
  // Load template content
  const loadTemplateContent = async (templateId) => {
    try {
      setTemplateLoadError(null);
      console.log('Loading template content for:', templateId);
      
      const { data, error } = await supabase
        .from('agreement_templates')
        .select('content')
        .eq('id', templateId)
        .single();
      
      if (error) {
        console.error('Error loading template:', error);
        setTemplateLoadError('Failed to load template: ' + error.message);
        setTemplateContent('');
        toast.error('Error loading template: ' + error.message);
        return;
      }
      
      if (data && data.content) {
        console.log('Template content loaded successfully');
        setTemplateContent(data.content);
      } else {
        console.warn('Template has no content');
        setTemplateLoadError('Template has no content');
        setTemplateContent('');
        toast.warning('Selected template has no content');
      }
    } catch (err) {
      console.error('Exception loading template:', err);
      setTemplateLoadError('Error: ' + err.message);
      setTemplateContent('');
      toast.error('Failed to load template content');
    }
  };
  
  // Load property details including units and terms
  const loadPropertyDetails = async (propertyId) => {
    try {
      console.log('Loading property details for ID:', propertyId);
      
      // Get property details
      const { data: property, error: propertyError } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single();

      if (propertyError) throw propertyError;

      console.log('Retrieved property data:', property);
      console.log('Property rental values:', property.rentalvalues);

      // Extract rental values, handling both naming formats
      // The database often uses "rent" and "deposit" instead of "monthlyRent" and "depositAmount"
      const rentalValues = property.rentalvalues || {};
      console.log('Rental values object:', rentalValues);
      
      // Convert all values to strings for consistency in the form
      const monthlyRent = String(rentalValues.monthlyRent || rentalValues.rent || '');
      const depositAmount = String(rentalValues.depositAmount || rentalValues.deposit || '');
      
      console.log('Extracted rental values:', { monthlyRent, depositAmount });
      
      // Extract property terms data
      const propertyTerms = property.terms || {};
      const paymentDueDay = propertyTerms.paymentDueDay || '5';
      const noticePeriod = propertyTerms.noticePeriod || '30';
      const specialConditions = propertyTerms.specialConditions || '';

      console.log('Extracted terms:', {
        monthlyRent,
        depositAmount,
        paymentDueDay,
        noticePeriod,
        specialConditions
      });

      // If it's an apartment, load units
      if (property.propertytype === 'apartment') {
        const { data: units, error: unitsError } = await supabase
          .from('property_units')
          .select('*')
          .eq('propertyid', propertyId);

        if (unitsError) throw unitsError;
        setPropertyUnits(units || []);
        
        // For apartments, always set property rental values as defaults
        setFormData(prev => ({
          ...prev,
          propertyType: property.propertytype,
          terms: {
            ...prev.terms,
            // Always set these values from the property data
            monthlyRent,
            depositAmount,
            paymentDueDay,
            noticePeriod,
            specialConditions
          }
        }));
        
        console.log('Set property-level terms for apartment property with default rent values');
      } else {
        // For non-apartment properties, clear the unitid field
        setPropertyUnits([]);
        // For non-apartment properties, set all terms from property profile
        setFormData(prev => ({
          ...prev,
          // Clear unitid for non-apartment properties
          unitid: '',
          propertyType: property.propertytype,
          terms: {
            ...prev.terms,
            // Always set these values for non-apartments too
            monthlyRent,
            depositAmount,
            paymentDueDay,
            noticePeriod,
            specialConditions,
            // Add any additional terms from property profile
            ...propertyTerms
          }
        }));
        
        console.log('Set all terms for non-apartment property and cleared unit ID');
      }

      // Log the loaded property details for debugging
      console.log('Updated form data after loading property details:', {
        propertyType: property.propertytype,
        rentalValues: {
          original: property.rentalvalues,
          mapped: { monthlyRent, depositAmount }
        },
        currentTerms: getFormDataTerms() // Get current form data terms
      });

    } catch (error) {
      console.error('Error loading property details:', error);
      toast.error('Failed to load property details');
    }
  };

  // Helper function to get current terms
  const getFormDataTerms = () => {
    return formData.terms;
  };

  // Load unit details and rental values
  const loadUnitDetails = async (unitId) => {
    if (!unitId) {
      return;
    }

    try {
      console.log('Loading unit details for ID:', unitId);
      
      // Get both unit and its parent property details
      const { data: unit, error: unitError } = await supabase
        .from('property_units')
        .select(`
          *,
          property:propertyid (
            terms,
            rentalvalues
          )
        `)
        .eq('id', unitId)
        .single();

      if (unitError) throw unitError;

      console.log('Retrieved unit data:', unit);

      // Combine property terms with unit-specific values
      const propertyTerms = unit.property?.terms || {};
      const propertyRentalValues = unit.property?.rentalvalues || {};
      const unitRentalValues = unit.rentalvalues || {};
      
      console.log('Unit rental values:', unitRentalValues);
      console.log('Property rental values:', propertyRentalValues);
      
      // Extract rental values, handling both naming formats
      // Use unit values first, fall back to property values if unit values don't exist
      // Convert to string for consistency in form
      const monthlyRent = String(
        unitRentalValues.monthlyRent || 
        unitRentalValues.rent || 
        propertyRentalValues.monthlyRent || 
        propertyRentalValues.rent || 
        ''
      );
        
      const depositAmount = String(
        unitRentalValues.depositAmount || 
        unitRentalValues.deposit || 
        propertyRentalValues.depositAmount || 
        propertyRentalValues.deposit || 
        ''
      );

      // Log extracted values for debugging
      console.log('Extracted rental values for unit:', {
        monthlyRent,
        depositAmount,
        unitValues: unitRentalValues,
        propertyValues: propertyRentalValues
      });

      setFormData(prev => ({
        ...prev,
        terms: {
          // Start with property-level terms
          ...propertyTerms,
          // Override with unit-specific values - ensure these values always get set
          monthlyRent,
          depositAmount,
          paymentDueDay: propertyTerms.paymentDueDay || '5',
          noticePeriod: propertyTerms.noticePeriod || '30',
          specialConditions: unitRentalValues.specialConditions || propertyTerms.specialConditions || '',
          // Add any unit-specific terms
          ...unit.terms
        }
      }));

      // Log the loaded unit details for debugging
      console.log('Loaded unit details:', {
        originalRentalValues: unitRentalValues,
        mappedRentalValues: { monthlyRent, depositAmount },
        propertyTerms,
        combinedTerms: unit.terms
      });

    } catch (error) {
      console.error('Error loading unit details:', error);
      toast.error('Failed to load unit details');
    }
  };
  
  // Values to expose in context
  const contextValue = {
    formData,
    setFormData,
    loading,
    submitting,
    setSubmitting,
    error,
    properties,
    propertyUnits,
    rentees,
    templateContent,
    setTemplateContent,
    templateLoadError,
    STATUS,
    handleInputChange,
    handleTermsChange,
    isAgreementEditable,
    loadTemplateContent,
    STORAGE_BUCKETS,
    BUCKET_FOLDERS
  };
  
  return (
    <AgreementFormContext.Provider value={contextValue}>
      {children}
    </AgreementFormContext.Provider>
  );
};

export default AgreementFormContext; 