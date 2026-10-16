import React, { createContext, useContext, useMemo, useState } from 'react';

// Isolated in-memory fixture: this module replaces ONLY the context import
// of the real PropertySelector in the dedicated Vite browser acceptance test.
// It cannot fetch properties, authenticate a user, or issue production requests.
const FixtureContext = createContext(null);
const records = [
  { id: 'alpha', name: 'Alpha Apartments', address: 'Alpha Street' },
  { id: 'beta', name: 'Beta Flats', address: 'Beta Street' },
  { id: 'gamma', name: 'Gamma House', address: 'Gamma Street' }
];

export function PropertyFixtureProvider({ children }) {
  // An existing context selection is intentional: a controlled empty value
  // must NOT inherit the previously selected Beta property.
  const [selectedPropertyIds, setSelectedPropertyIds] = useState(['beta']);
  const value = useMemo(() => ({
    properties: records,
    selectedPropertyIds,
    recentPropertyIds: [],
    loading: false,
    error: null,
    selectProperty: id => setSelectedPropertyIds([id]),
    togglePropertySelection: id => setSelectedPropertyIds(previous => (
      previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
    )),
    clearPropertySelection: () => setSelectedPropertyIds([]),
    selectAllProperties: () => setSelectedPropertyIds(records.map(record => record.id))
  }), [selectedPropertyIds]);
  return <FixtureContext.Provider value={value}>{children}</FixtureContext.Provider>;
}

export function useProperty() {
  const context = useContext(FixtureContext);
  if (!context) throw new Error('Fixture PropertyContext not mounted');
  return context;
}
