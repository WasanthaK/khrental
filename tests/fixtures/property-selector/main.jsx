import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PropertySelector from '../../../src/components/properties/PropertySelector.jsx';
import { PropertyFixtureProvider, useProperty } from './mockPropertyContext.jsx';

function Controlled({ single = false }) {
  const [selection, setSelection] = useState([]);
  const name = single ? 'single' : 'controlled';
  return (
    <section data-fixture={name}>
      <output data-selection={name}>{selection.length ? selection.join(',') : 'none'}</output>
      <PropertySelector
        label={single ? 'Single controlled property' : 'Controlled properties'}
        showRecent={false}
        multiSelect={!single}
        onChange={setSelection}
        value={selection}
      />
    </section>
  );
}

function Uncontrolled() {
  const { selectedPropertyIds } = useProperty();
  return (
    <section data-fixture="uncontrolled">
      <output data-selection="uncontrolled">
        {selectedPropertyIds.length ? selectedPropertyIds.join(',') : 'none'}
      </output>
      <PropertySelector label="Uncontrolled properties" showRecent={false} multiSelect />
    </section>
  );
}

function App() {
  return (
    <PropertyFixtureProvider>
      <Controlled />
      <Uncontrolled />
      <Controlled single />
    </PropertyFixtureProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
