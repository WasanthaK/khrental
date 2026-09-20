const normalizeType = (value) => String(value || '').trim().toLowerCase();

export const isRenteeDirectoryRecord = (record = {}) => (
  normalizeType(record.user_type || record.userType) === 'rentee'
  || normalizeType(record.role) === 'rentee'
);

export const normalizeRenteeDirectoryRecords = (records = []) => {
  const seen = new Set();

  return (Array.isArray(records) ? records : [])
    .filter(isRenteeDirectoryRecord)
    .filter((record) => {
      const id = String(record?.id || '').trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};
