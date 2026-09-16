import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AGREEMENT_STATUS } from '../constants/agreementStatus';
import { fetchAppUsers } from '../services/appUserService';
import {
  fetchProperty,
  fetchPropertyUnit,
  getTemplate,
  listProperties,
  listPropertyUnits,
  listTemplates
} from '../services/agreementService';
import { renderAgreementContent } from '../services/agreementWorkflowService';

const today = () => new Date().toISOString().split('T')[0];
const oneYearFromToday = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

const parseObject = (value, fallback = {}) => {
  if (!value) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
};

const dateOnly = (value, fallback) => {
  if (!value) {
    return fallback;
  }
  return String(value).split('T')[0];
};

const firstNonEmpty = (...values) => values.find((value) => (
  value !== undefined
  && value !== null
  && String(value).trim() !== ''
));

const normalizeInitialData = (initialData) => {
  if (!initialData) {
    return {
      templateid: '',
      propertyid: '',
      unitid: '',
      renteeid: '',
      status: AGREEMENT_STATUS.DRAFT,
      propertyType: '',
      terms: {
        monthlyRent: '',
        depositAmount: '',
        paymentDueDay: '5',
        noticePeriod: '30',
        additionalTerms: '',
        startDate: today(),
        endDate: oneYearFromToday()
      }
    };
  }

  const terms = parseObject(initialData.terms, {});
  return {
    ...initialData,
    propertyType: initialData.propertyType || initialData.property?.propertytype || initialData.properties?.propertytype || '',
    terms: {
      ...terms,
      monthlyRent: firstNonEmpty(terms.monthlyRent, initialData.rentamount, ''),
      depositAmount: firstNonEmpty(terms.depositAmount, initialData.depositamount, ''),
      paymentDueDay: firstNonEmpty(terms.paymentDueDay, '5'),
      noticePeriod: firstNonEmpty(terms.noticePeriod, '30'),
      additionalTerms: firstNonEmpty(terms.additionalTerms, terms.specialConditions, ''),
      startDate: dateOnly(firstNonEmpty(terms.startDate, initialData.startdate), today()),
      endDate: dateOnly(firstNonEmpty(terms.endDate, initialData.enddate), oneYearFromToday())
    }
  };
};

const getRentalValues = (record) => parseObject(record?.rentalvalues, {});
const getRecordTerms = (record) => parseObject(record?.terms, {});

export const useAgreementForm = (initialData = null) => {
  const [formData, setFormData] = useState(() => normalizeInitialData(initialData));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [properties, setProperties] = useState([]);
  const [propertyUnits, setPropertyUnits] = useState([]);
  const [rentees, setRentees] = useState([]);
  const [templateContent, setTemplateContent] = useState('');
  const [processedContent, setProcessedContent] = useState('');
  const renderVersionRef = useRef(0);

  useEffect(() => {
    setFormData(normalizeInitialData(initialData));
  }, [initialData]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [templateRows, propertyRows, renteeRows] = await Promise.all([
          listTemplates(),
          listProperties(),
          fetchAppUsers('rentee')
        ]);

        if (cancelled) {
          return;
        }

        const sortedProperties = (propertyRows || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const sortedRentees = (renteeRows || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setTemplates(templateRows || []);
        setProperties(sortedProperties);
        setRentees(sortedRentees);

        const selectedPropertyId = initialData?.propertyid || '';
        if (selectedPropertyId) {
          const units = await listPropertyUnits(selectedPropertyId);
          if (!cancelled) {
            setPropertyUnits(units || []);
            const selectedProperty = sortedProperties.find((property) => String(property.id) === String(selectedPropertyId));
            if (selectedProperty?.propertytype) {
              setFormData((current) => ({ ...current, propertyType: selectedProperty.propertytype }));
            }
          }
        } else {
          setPropertyUnits([]);
        }

        const selectedTemplateId = initialData?.templateid || '';
        if (selectedTemplateId) {
          const template = await getTemplate(selectedTemplateId);
          if (!cancelled) {
            setTemplateContent(template?.content || '');
          }
        } else if (!cancelled) {
          setTemplateContent('');
        }
      } catch (loadError) {
        console.error('Error loading agreement form data:', loadError);
        if (!cancelled) {
          setError(loadError.message);
          toast.error('Failed to load agreement form data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [initialData?.id, initialData?.propertyid, initialData?.templateid]);

  useEffect(() => {
    if (!templateContent) {
      setProcessedContent('');
      return undefined;
    }

    const version = ++renderVersionRef.current;
    let cancelled = false;

    const renderPreview = async () => {
      try {
        const property = properties.find((item) => String(item.id) === String(formData.propertyid)) || null;
        const unit = propertyUnits.find((item) => String(item.id) === String(formData.unitid)) || null;
        const rentee = rentees.find((item) => String(item.id) === String(formData.renteeid)) || null;

        const rendered = await renderAgreementContent({
          templateContent,
          agreement: {
            ...formData,
            startdate: formData.terms?.startDate || formData.startdate || null,
            enddate: formData.terms?.endDate || formData.enddate || null
          },
          related: { property, unit, rentee }
        });

        if (!cancelled && version === renderVersionRef.current) {
          setProcessedContent(rendered);
        }
      } catch (renderError) {
        console.error('Error rendering agreement preview:', renderError);
        if (!cancelled && version === renderVersionRef.current) {
          setProcessedContent('');
        }
      }
    };

    renderPreview();
    return () => {
      cancelled = true;
    };
  }, [formData, templateContent, properties, propertyUnits, rentees]);

  const loadPropertyUnitsForProperty = async (propertyId) => {
    if (!propertyId) {
      setPropertyUnits([]);
      return [];
    }
    const units = await listPropertyUnits(propertyId);
    setPropertyUnits(units || []);
    return units || [];
  };

  const loadUnitDetails = async (unitId) => {
    if (!unitId) {
      return;
    }

    try {
      const unit = propertyUnits.find((item) => String(item.id) === String(unitId))
        || await fetchPropertyUnit(unitId);
      if (!unit) {
        throw new Error('Unit not found');
      }

      const property = properties.find((item) => String(item.id) === String(unit.propertyid))
        || (unit.propertyid ? await fetchProperty(unit.propertyid).catch(() => null) : null);
      const unitRental = getRentalValues(unit);
      const propertyRental = getRentalValues(property);
      const propertyTerms = getRecordTerms(property);

      setFormData((current) => ({
        ...current,
        unitid: unitId,
        terms: {
          ...current.terms,
          monthlyRent: firstNonEmpty(unitRental.monthlyRent, unitRental.rent, unitRental.baseRent, propertyRental.monthlyRent, propertyRental.rent, propertyRental.baseRent, current.terms?.monthlyRent, ''),
          depositAmount: firstNonEmpty(unitRental.depositAmount, unitRental.deposit, propertyRental.depositAmount, propertyRental.deposit, current.terms?.depositAmount, ''),
          paymentDueDay: firstNonEmpty(propertyTerms.paymentDueDay, current.terms?.paymentDueDay, '5'),
          noticePeriod: firstNonEmpty(propertyTerms.noticePeriod, current.terms?.noticePeriod, '30')
        }
      }));
    } catch (unitError) {
      console.error('Error loading unit details:', unitError);
      toast.error('Failed to load unit details');
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((current) => {
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        return {
          ...current,
          [parent]: {
            ...current[parent],
            [child]: value
          }
        };
      }

      return { ...current, [field]: value };
    });

    if (field === 'unitid' && value) {
      void loadUnitDetails(value);
    }
  };

  const handlePropertyChange = async (propertyId) => {
    setFormData((current) => ({
      ...current,
      propertyid: propertyId,
      unitid: '',
      propertyType: ''
    }));

    if (!propertyId) {
      setPropertyUnits([]);
      return;
    }

    try {
      await loadPropertyUnitsForProperty(propertyId);
      const property = properties.find((item) => String(item.id) === String(propertyId))
        || await fetchProperty(propertyId);
      if (!property) {
        throw new Error('Property not found');
      }

      const rentalValues = getRentalValues(property);
      const propertyTerms = getRecordTerms(property);

      setFormData((current) => ({
        ...current,
        propertyid: propertyId,
        propertyType: property.propertytype || '',
        terms: {
          ...current.terms,
          monthlyRent: firstNonEmpty(rentalValues.monthlyRent, rentalValues.rent, rentalValues.baseRent, current.terms?.monthlyRent, ''),
          depositAmount: firstNonEmpty(rentalValues.depositAmount, rentalValues.deposit, current.terms?.depositAmount, ''),
          paymentDueDay: firstNonEmpty(propertyTerms.paymentDueDay, current.terms?.paymentDueDay, '5'),
          noticePeriod: firstNonEmpty(propertyTerms.noticePeriod, current.terms?.noticePeriod, '30')
        }
      }));
    } catch (propertyError) {
      console.error('Error loading property details:', propertyError);
      toast.error('Failed to load property details');
    }
  };

  const handleTemplateChange = async (templateId) => {
    setFormData((current) => ({ ...current, templateid: templateId }));

    if (!templateId) {
      setTemplateContent('');
      return;
    }

    try {
      const template = await getTemplate(templateId);
      if (!template?.content) {
        throw new Error('Template not found');
      }
      setTemplateContent(template.content);
    } catch (templateError) {
      console.error('Error loading template:', templateError);
      setTemplateContent('');
      toast.error('Failed to load agreement template');
    }
  };

  const isAgreementEditable = () => (
    !formData.id
    || formData.status === AGREEMENT_STATUS.DRAFT
    || formData.status === AGREEMENT_STATUS.REVIEW
  );

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
