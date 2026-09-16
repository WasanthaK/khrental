const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
};

export const calculateTenancySettlement = ({
  depositReceived = 0,
  approvedDeductions = 0,
  outstandingInvoices = 0
} = {}) => {
  const deposit = Math.max(0, money(depositReceived));
  const deductions = Math.max(0, money(approvedDeductions));
  const outstanding = Math.max(0, money(outstandingInvoices));
  const obligations = Math.round((deductions + outstanding) * 100) / 100;
  const refundAmount = Math.max(0, Math.round((deposit - obligations) * 100) / 100);
  const amountDue = Math.max(0, Math.round((obligations - deposit) * 100) / 100);

  return {
    depositReceived: deposit,
    approvedDeductions: deductions,
    outstandingInvoices: outstanding,
    refundAmount,
    amountDue
  };
};

export const isClosureReady = ({ inspectionStatus, settlementStatus }) => (
  String(inspectionStatus || '').toLowerCase() === 'completed'
  && String(settlementStatus || '').toLowerCase() === 'settled'
);

export const validateNoticeResponse = (noticeType, response) => {
  const type = String(noticeType || '').toLowerCase();
  const normalized = String(response || '').toLowerCase();
  if (type === 'renewal_offer') return ['accepted', 'declined'].includes(normalized);
  if (type === 'termination_notice') return normalized === 'acknowledged';
  return false;
};
