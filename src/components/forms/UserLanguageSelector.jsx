import React from 'react';
import { LANGUAGES } from '../../utils/constants';

/**
 * Component for selecting a user's preferred language
 * 
 * @param {Object} props
 * @param {string} props.value - Current selected language value
 * @param {Function} props.onChange - Function to call when language changes
 * @param {boolean} props.disabled - Whether the selector is disabled
 */
const UserLanguageSelector = ({ value = 'en', onChange, disabled = false }) => {
  // Available language options with their codes and labels
  const languageOptions = [
    { code: 'en', label: 'English' },
    { code: 'si', label: 'Sinhala' }
  ];

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="block w-full p-2 border rounded text-sm focus:ring-blue-500 focus:border-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-500"
      >
        {languageOptions.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default UserLanguageSelector; 