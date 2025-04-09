import React, { useRef, useState } from 'react';
import { formatFileSize } from '../../utils/helpers';

/**
 * FileUpload component for handling file uploads
 * 
 * @param {Object} props - Component props
 * @param {function} props.onFileSelect - Function to call when files are selected
 * @param {string} props.accept - Accepted file types
 * @param {boolean} props.multiple - Whether multiple files can be selected
 * @param {number} props.maxSize - Maximum file size in bytes
 * @param {string} props.className - Additional CSS classes
 */
const FileUpload = ({
  onFileSelect,
  accept = '*',
  multiple = false,
  maxSize = 5 * 1024 * 1024, // 5MB default
  className = ''
}) => {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  
  const validateFiles = (files) => {
    const validFiles = [];
    let hasError = false;
    
    Array.from(files).forEach(file => {
      // Check file size
      if (file.size > maxSize) {
        setError(`File "${file.name}" exceeds the maximum size of ${formatFileSize(maxSize)}`);
        hasError = true;
        return;
      }
      
      validFiles.push(file);
    });
    
    if (!hasError) {
      setError(null);
    }
    
    return validFiles;
  };
  
  const handleFiles = (files) => {
    const validFiles = validateFiles(files);
    
    if (validFiles.length > 0) {
      onFileSelect(multiple ? validFiles : validFiles[0]);
    }
  };
  
  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };
  
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
  
  const handleButtonClick = () => {
    fileInputRef.current.click();
  };
  
  return (
    <div className={className}>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={handleButtonClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
        <div className="flex flex-col items-center justify-center">
          <svg
            className="w-10 h-10 text-gray-400 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mb-2 text-sm text-gray-700">
            <span className="font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500">
            {multiple ? 'Files' : 'File'} should be less than {formatFileSize(maxSize)}
          </p>
          {accept !== '*' && (
            <p className="text-xs text-gray-500 mt-1">
              Accepted formats: {accept.replace(/\./g, '').replace(/,/g, ', ')}
            </p>
          )}
        </div>
      </div>
      
      {error && (
        <div className="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
};

export default FileUpload; 