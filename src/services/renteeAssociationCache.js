const STORAGE_KEY = 'kh_rentals_structured_associations';

export const storeRenteeAssociations = (renteeId, associations = []) => {
  if (!renteeId || typeof sessionStorage === 'undefined') return false;

  try {
    const existing = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    existing[renteeId] = Array.isArray(associations) ? associations : [];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    return true;
  } catch (error) {
    console.warn('Unable to cache renter property associations:', error);
    return false;
  }
};

export const getRenteeAssociations = (renteeId) => {
  if (!renteeId || typeof sessionStorage === 'undefined') return [];

  try {
    const existing = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    return Array.isArray(existing[renteeId]) ? existing[renteeId] : [];
  } catch (error) {
    console.warn('Unable to read renter property associations:', error);
    return [];
  }
};
