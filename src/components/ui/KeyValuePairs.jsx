import { useState } from 'react';

const KeyValuePairs = ({
  label,
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  required = false,
  error,
  className = '',
}) => {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  
  const handleAddPair = () => {
    if (newKey.trim() !== '' && newValue.trim() !== '') {
      const updatedPairs = { ...pairs, [newKey.trim()]: newValue.trim() };
      onChange(updatedPairs);
      setNewKey('');
      setNewValue('');
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddPair();
    }
  };
  
  const handleRemovePair = (key) => {
    const updatedPairs = { ...pairs };
    delete updatedPairs[key];
    onChange(updatedPairs);
  };
  
  return (
    <div className={`mb-4 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      <div className="flex space-x-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder={keyPlaceholder}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={valuePlaceholder}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={handleAddPair}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Add
        </button>
      </div>
      
      {Object.keys(pairs).length > 0 ? (
        <div className="mt-2 border border-gray-200 rounded-md divide-y divide-gray-200">
          {Object.entries(pairs).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between p-3">
              <div className="flex-1">
                <span className="text-sm font-medium">{key}:</span>{' '}
                <span className="text-sm">{value}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemovePair(key)}
                className="text-red-600 hover:text-red-800"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-500">No items added yet.</p>
      )}
      
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
};

export default KeyValuePairs; 