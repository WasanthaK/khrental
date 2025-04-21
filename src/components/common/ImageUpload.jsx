import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';

/**
 * Image upload component
 * @param {Function} onImagesChange - Function to call when images change
 * @param {number} maxImages - Maximum number of images allowed
 * @param {Array} initialImages - Initial images to display
 * @param {string} imageType - Type/category of images to upload (e.g., 'exterior', 'interior')
 * @param {boolean} showTypeSelector - Whether to display the image type selector
 */
const ImageUpload = ({
  onImagesChange,
  maxImages = 10,
  initialImages = [],
  imageType = 'exterior',
  showTypeSelector = false
}) => {
  const [images, setImages] = useState(initialImages);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedType, setSelectedType] = useState(imageType);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  };

  const handleFiles = (files) => {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
      toast.error('Please upload valid image files');
      return;
    }

    if (validFiles.length + images.length > maxImages) {
      toast.error(`You can only upload up to ${maxImages} images`);
      return;
    }

    // Convert files to data URLs for preview
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImages(prev => [...prev, e.target?.result]);
      };
      reader.readAsDataURL(file);
    });

    // Pass the selected type along with the files
    onImagesChange(validFiles, selectedType);
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleTypeChange = (e) => {
    setSelectedType(e.target.value);
  };

  return (
    <div className="space-y-4">
      {/* Image Type Selector */}
      {showTypeSelector && (
        <div className="mb-4">
          <label htmlFor="image-type" className="block text-sm font-medium text-gray-700 mb-1">
            Image Type
          </label>
          <select
            id="image-type"
            name="image-type"
            value={selectedType}
            onChange={handleTypeChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="exterior">Exterior</option>
            <option value="interior">Interior</option>
            <option value="floorplan">Floor Plan</option>
            <option value="other">Other</option>
          </select>
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((image, index) => (
            <div key={index} className="relative group">
              <img
                src={image}
                alt={`Uploaded ${selectedType} image ${index + 1}`}
                className="w-full h-48 object-cover rounded-lg"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Area */}
      {images.length < maxImages && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            accept="image/*"
            multiple
            className="hidden"
          />
          
          <div className="space-y-2">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            
            <div className="text-gray-600">
              <label
                htmlFor="file-upload"
                className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2"
              >
                <span>Upload {selectedType} images</span>
                <input
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  className="sr-only"
                  accept="image/*"
                  multiple
                  onChange={handleFileInput}
                />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            
            <p className="text-xs text-gray-500">
              PNG, JPG, GIF up to {maxImages} images
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUpload; 