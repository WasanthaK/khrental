import { useState, useRef } from 'react';
import { formatFileSize } from '../../utils/helpers';

const FileUpload = ({
  label,
  id,
  onChange,
  multiple = false,
  accept = 'image/*',
  required = false,
  error,
  maxSize = 5 * 1024 * 1024, // 5MB default
  className = '',
  existingFiles = [],
  onRemove,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState(null);
  const inputRef = useRef(null);
  
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };
  
  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };
  
  const handleFiles = (files) => {
    setFileError(null);
    
    // Filter files by size and type
    const validFiles = [];
    const invalidFiles = [];
    
    Array.from(files).forEach(file => {
      const isValidSize = file.size <= maxSize;
      
      // Check if file type matches the accept pattern
      let isValidType = true;
      if (accept !== '*') {
        const acceptTypes = accept.split(',').map(type => type.trim());
        isValidType = acceptTypes.some(type => {
          if (type.includes('/*')) {
            // Handle wildcard mime types (e.g., image/*)
            const mainType = type.split('/')[0];
            return file.type.startsWith(`${mainType}/`);
          }
          return file.type === type;
        });
      }
      
      if (!isValidSize) {
        invalidFiles.push({ file, reason: `exceeds the maximum size of ${formatFileSize(maxSize)}` });
      } else if (!isValidType) {
        invalidFiles.push({ file, reason: 'is not a valid file type' });
      } else {
        validFiles.push(file);
      }
    });
    
    // Set error message if there are invalid files
    if (invalidFiles.length > 0) {
      const errorMessages = invalidFiles.map(item => 
        `"${item.file.name}" ${item.reason}`
      );
      setFileError(errorMessages.join(', '));
    }
    
    if (validFiles.length > 0 && typeof onChange === 'function') {
      onChange(validFiles);
      
      // Reset the input value to allow selecting the same file again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };
  
  const handleButtonClick = () => {
    inputRef.current.click();
  };
  
  const handleRemoveFile = (index) => {
    if (onRemove) {
      onRemove(index);
    }
  };
  
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <div
        className={`border-2 border-dashed rounded-md p-4 text-center ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={id}
          name={id}
          type="file"
          multiple={multiple}
          accept={accept}
          required={required}
          className="hidden"
          onChange={handleChange}
        />
        
        <div className="space-y-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-gray-600">
            Drag and drop {multiple ? 'files' : 'a file'} here, or{' '}
            <button
              type="button"
              className="text-blue-600 hover:text-blue-800 font-medium"
              onClick={handleButtonClick}
            >
              browse
            </button>
          </p>
          <p className="text-xs text-gray-500">
            {accept === 'image/*' ? 'Images' : accept.replace(/\./g, '').toUpperCase()} only. Max size: {formatFileSize(maxSize)}.
          </p>
        </div>
      </div>
      
      {/* Display file errors */}
      {fileError && (
        <p className="mt-1 text-sm text-red-600">{fileError}</p>
      )}
      
      {/* Display error from parent */}
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      
      {/* Display existing files */}
      {existingFiles && existingFiles.length > 0 && (
        <div className="mt-2 space-y-2">
          {existingFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
              <div className="flex items-center">
                {file.type?.includes('image') || typeof file === 'string' ? (
                  <img 
                    src={typeof file === 'string' ? file : URL.createObjectURL(file)} 
                    alt="Preview" 
                    className="h-10 w-10 object-cover rounded mr-2" 
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://via.placeholder.com/150?text=Image+Error';
                    }}
                  />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                <span className="text-sm truncate max-w-xs">
                  {typeof file === 'string' 
                    ? file.split('/').pop() 
                    : file.name}
                </span>
              </div>
              <button
                type="button"
                className="text-red-600 hover:text-red-800"
                onClick={() => handleRemoveFile(index)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload; 