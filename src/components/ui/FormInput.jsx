import React from 'react';

const FormInput = ({
  label,
  id,
  type = 'text',
  placeholder,
  value,
  onChange,
  required = false,
  error,
  className = '',
  ...props
}) => {
  return (
    <div className={`mb-4 ${className}`}>
      <label htmlFor={id} className="block text-sm font-bold text-gray-800 mb-1">
        {label} {required && <span className="text-red-500 font-bold">*</span>}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        value={value || ''}
        onChange={onChange}
        required={required}
        aria-required={required}
        aria-invalid={!!error}
        className={`w-full px-3 py-2 border ${
          error ? 'border-red-500' : 'border-gray-300'
        } rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium text-base bg-white`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-500 font-medium">{error}</p>}
    </div>
  );
};

export default FormInput; 