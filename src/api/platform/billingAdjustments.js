export const BILLING_ADJUSTMENT_TYPES = Object.freeze([
  'arrears',
  'tax',
  'adjustment',
  'other'
]);

const ALLOWED_TYPES = new Set(BILLING_ADJUSTMENT_TYPES);

export const normalizeBillingAdjustmentType = (value) => (
  String(value || '').trim().toLowerCase()
);

export const isBillingAdjustmentTypeAllowed = (value) => (
  ALLOWED_TYPES.has(normalizeBillingAdjustmentType(value))
);

export const normalizeBillingAdjustmentAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : NaN;
};

export const isBillingAdjustmentAmountAllowed = (componentType, value) => {
  const type = normalizeBillingAdjustmentType(componentType);
  const amount = normalizeBillingAdjustmentAmount(value);
  if (!Number.isFinite(amount)) return false;
  if (type === 'adjustment') return amount !== 0;
  return ['arrears', 'tax', 'other'].includes(type) && amount > 0;
};
