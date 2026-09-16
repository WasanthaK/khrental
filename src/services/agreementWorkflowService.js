import { AGREEMENT_STATUS } from '../constants/agreementStatus';
import { populateMergeFields } from '../utils/documentUtils';
import { saveMergedDocument } from './DocumentService';
import { fetchAppUser } from './appUserService';
import {
  fetchAgreement,
  fetchProperty,
  fetchPropertyUnit,
  getTemplate,
  saveAgreement,
  updateAgreementData
} from './agreementService';

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

const firstNonEmpty = (...values) => values.find((value) => (
  value !== undefined
  && value !== null
  && String(value).trim() !== ''
));

const normalizeTerms = (terms) => {
  const parsed = parseObject(terms, {});
  return {
    ...parsed,
    startDate: parsed.startDate || parsed.startdate || null,
    endDate: parsed.endDate || parsed.enddate || null,
    paymentDueDay: firstNonEmpty(parsed.paymentDueDay, parsed.paymentdueday, '5'),
    noticePeriod: firstNonEmpty(parsed.noticePeriod, parsed.noticeperiod, '30'),
    specialConditions: firstNonEmpty(parsed.specialConditions, parsed.additionalTerms, '')
  };
};

const normalizeRelatedRecord = (candidate, expectedId) => {
  if (!candidate) {
    return null;
  }

  if (!expectedId || String(candidate.id) === String(expectedId)) {
    return candidate;
  }

  return null;
};

const verifyPersistedAgreement = async (agreementId, expectations = {}) => {
  const persisted = await fetchAgreement(agreementId);
  if (!persisted?.id) {
    throw new Error('Agreement write completed, but the saved record could not be read back.');
  }

  if (expectations.status && persisted.status !== expectations.status) {
    throw new Error(`Agreement was saved with status ${persisted.status || 'unknown'} instead of ${expectations.status}.`);
  }

  if (expectations.documenturl && persisted.documenturl !== expectations.documenturl) {
    throw new Error('Agreement document URL was not persisted correctly.');
  }

  return persisted;
};

export const buildAgreementMergeData = async (agreement = {}, related = {}) => {
  const terms = normalizeTerms(agreement.terms);
  const propertyId = agreement.propertyid || agreement.propertyId || null;
  const unitId = agreement.unitid || agreement.unitId || null;
  const renteeId = agreement.renteeid || agreement.renteeId || null;

  const suppliedProperty = normalizeRelatedRecord(related.property, propertyId);
  const suppliedUnit = normalizeRelatedRecord(related.unit, unitId);
  const suppliedRentee = normalizeRelatedRecord(related.rentee, renteeId);

  const [property, unit, rentee] = await Promise.all([
    suppliedProperty || (propertyId ? fetchProperty(propertyId).catch(() => null) : null),
    suppliedUnit || (unitId ? fetchPropertyUnit(unitId).catch(() => null) : null),
    suppliedRentee || (renteeId ? fetchAppUser(renteeId).catch(() => null) : null)
  ]);

  const unitRentalValues = parseObject(unit?.rentalvalues, {});
  const propertyRentalValues = parseObject(property?.rentalvalues, {});

  const monthlyRent = firstNonEmpty(
    terms.monthlyRent,
    agreement.rentamount,
    unitRentalValues.monthlyRent,
    unitRentalValues.rent,
    unitRentalValues.baseRent,
    propertyRentalValues.monthlyRent,
    propertyRentalValues.rent,
    propertyRentalValues.baseRent,
    ''
  );

  const depositAmount = firstNonEmpty(
    terms.depositAmount,
    agreement.depositamount,
    unitRentalValues.depositAmount,
    unitRentalValues.deposit,
    propertyRentalValues.depositAmount,
    propertyRentalValues.deposit,
    ''
  );

  return {
    agreement: {
      startDate: firstNonEmpty(terms.startDate, agreement.startdate, agreement.startDate, null),
      endDate: firstNonEmpty(terms.endDate, agreement.enddate, agreement.endDate, null),
      currentDate: new Date(),
      agreementId: agreement.id || 'New Agreement'
    },
    property: property || {},
    unit: unit || {},
    rentee: rentee || {},
    terms: {
      ...terms,
      monthlyRent,
      depositAmount,
      paymentDueDay: firstNonEmpty(terms.paymentDueDay, '5'),
      noticePeriod: firstNonEmpty(terms.noticePeriod, '30'),
      specialConditions: firstNonEmpty(terms.specialConditions, terms.additionalTerms, '')
    }
  };
};

export const renderAgreementContent = async ({ templateContent, agreement, related = {} }) => {
  if (!templateContent) {
    throw new Error('Agreement template content is required.');
  }

  const mergeData = await buildAgreementMergeData(agreement, related);
  return populateMergeFields(templateContent, mergeData);
};

const buildAgreementPersistencePayload = ({ formData, status, existingId = null }) => {
  const terms = normalizeTerms(formData?.terms);
  const id = formData?.id || existingId || undefined;

  return {
    ...(id ? { id } : {}),
    templateid: formData?.templateid || null,
    propertyid: formData?.propertyid || null,
    unitid: formData?.unitid || null,
    renteeid: formData?.renteeid || null,
    status,
    terms,
    notes: formData?.notes || null,
    processedcontent: typeof formData?.processedContent === 'string'
      ? formData.processedContent
      : (typeof formData?.processedcontent === 'string' ? formData.processedcontent : null),
    // Generation is orchestrated explicitly here. This must remain false so the
    // legacy saveAgreement path cannot trigger a hidden second generation pass.
    needs_document_generation: false
  };
};

export const persistAgreementForm = async ({
  formData,
  status = AGREEMENT_STATUS.DRAFT,
  existingId = null
}) => {
  const payload = buildAgreementPersistencePayload({ formData, status, existingId });
  const saved = await saveAgreement(payload);

  if (!saved?.id) {
    throw new Error('Agreement save did not return a valid agreement ID.');
  }

  return verifyPersistedAgreement(saved.id, { status });
};

export const generateAndAttachAgreementDocument = async ({
  agreement,
  finalStatus = null,
  related = {}
}) => {
  if (!agreement?.id) {
    throw new Error('Agreement must be saved before document generation.');
  }

  if (!agreement.templateid) {
    throw new Error('Agreement template is required before document generation.');
  }

  const template = await getTemplate(agreement.templateid);
  if (!template?.content) {
    throw new Error('Agreement template content could not be loaded.');
  }

  const mergedContent = await renderAgreementContent({
    templateContent: template.content,
    agreement,
    related
  });

  const documentUrl = await saveMergedDocument(mergedContent, agreement.id);
  if (!documentUrl) {
    throw new Error('Agreement document could not be saved to storage.');
  }

  const updated = await updateAgreementData(agreement.id, {
    processedcontent: mergedContent,
    documenturl: documentUrl,
    needs_document_generation: false,
    ...(finalStatus ? { status: finalStatus } : {})
  });

  if (!updated?.id) {
    throw new Error('Agreement document was generated, but the agreement record could not be updated.');
  }

  return verifyPersistedAgreement(agreement.id, {
    ...(finalStatus ? { status: finalStatus } : {}),
    documenturl: documentUrl
  });
};

export const saveAgreementForReview = async ({ formData, existingId = null }) => {
  const draft = await persistAgreementForm({
    formData,
    status: AGREEMENT_STATUS.DRAFT,
    existingId
  });

  return generateAndAttachAgreementDocument({
    agreement: draft,
    finalStatus: AGREEMENT_STATUS.REVIEW
  });
};

export const saveAgreementForStatus = async ({ formData, status, existingId = null }) => {
  if (status === AGREEMENT_STATUS.REVIEW) {
    return saveAgreementForReview({ formData, existingId });
  }

  return persistAgreementForm({ formData, status, existingId });
};
