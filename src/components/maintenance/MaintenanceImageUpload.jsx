import React, { useState, useEffect } from 'react';
import { saveImage, STORAGE_BUCKETS } from '../../services/fileService';
import { toast } from 'react-hot-toast';

/**
 * Specialized image upload component for maintenance requests
 * that allows selecting the image type (stage of maintenance)
 */
const MaintenanceImageUpload = ({ 
  onImagesChange, 
  maxImages = 5, 
  initialImages = [], 
  imageType = 'initial',
  disabled = false
}) => {
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedImageType, setSelectedImageType] = useState(imageType);
  const [isUploading, setIsUploading] = useState(false);
  
  // Initialize with any initial images
  useEffect(() => {
    if (initialImages && initialImages.length > 0) {
      console.log('Initializing with images:', initialImages);
      setSelectedImages(initialImages);
    }
  }, [initialImages]);
  
  // Handle file input change
  const handleFileChange = async (event) => {
    if (disabled) return;
    
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;
    
    if (selectedImages.length + files.length > maxImages) {
      toast.error(`You can only upload a maximum of ${maxImages} images.`);
      return;
    }
    
    setIsUploading(true);
    
    // Track upload results
    let successCount = 0;
    let failureCount = 0;
    const newImages = [];
    
    // Process each file sequentially to avoid overwhelming the server
    for (const file of files) {
      try {
        console.log('Uploading image:', file.name);
        
        // Use the saveImage function which handles validation and compression
        const result = await saveImage(file, {
          folder: 'maintenance',
          compress: true,
          maxSize: 10 * 1024 * 1024 // 10MB
        });
        
        if (!result.success) {
          console.error(`Failed to upload image ${file.name}:`, result.error);
          toast.error(`Failed to upload ${file.name}: ${result.error}`);
          failureCount++;
          continue;
        }
        
        // Add to successful uploads
        const newImage = {
          url: result.url,
          type: selectedImageType,
          name: file.name,
          size: file.size,
          previewUrl: URL.createObjectURL(file)
        };
        
        newImages.push(newImage);
        successCount++;
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        toast.error(`Error uploading ${file.name}: ${error.message}`);
        failureCount++;
      }
    }
    
    // Only update state if we have successful uploads
    if (newImages.length > 0) {
      const updatedImages = [...selectedImages, ...newImages];
      setSelectedImages(updatedImages);
      
      // Call the parent's onChange handler
      if (onImagesChange) {
        onImagesChange(updatedImages);
      }
      
      toast.success(`Successfully uploaded ${successCount} image(s)`);
    }
    
    if (failureCount > 0) {
      toast.error(`Failed to upload ${failureCount} image(s)`);
    }
    
    setIsUploading(false);
    
    // Clear the file input
    event.target.value = '';
  };
  
  // Handle removing an image
  const handleRemoveImage = (index) => {
    if (disabled) return;
    
    const newImages = [...selectedImages];
    
    // Release object URL if it exists
    if (newImages[index].previewUrl) {
      URL.revokeObjectURL(newImages[index].previewUrl);
    }
    
    newImages.splice(index, 1);
    setSelectedImages(newImages);
    
    // Call the parent's onChange handler
    if (onImagesChange) {
      onImagesChange(newImages);
    }
  };
  
  // Get preview URL for an image (either from server or local preview)
  const getImagePreviewUrl = (image) => {
    if (image.previewUrl) return image.previewUrl;
    if (image.url) return image.url;
    if (typeof image === 'string') return image;
    return '';
  };

  return (
    <div className="space-y-4">
      {/* Type selector */}
      <div className="mb-2">
        <label htmlFor="imageType" className="block text-sm font-medium text-gray-700 mb-1">
          Image Type
        </label>
        <select
          id="imageType"
          value={selectedImageType}
          onChange={(e) => setSelectedImageType(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md"
          disabled={disabled}
        >
          <option value="initial">Initial Request</option>
          <option value="progress">Work in Progress</option>
          <option value="completion">Completion</option>
          <option value="additional">Additional</option>
        </select>
      </div>
      
      {/* Image previews */}
      {selectedImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {selectedImages.map((image, index) => (
            <div key={index} className="relative group">
              <div className="aspect-square overflow-hidden rounded-lg border border-gray-200">
                <img
                  src={getImagePreviewUrl(image)}
                  alt={`Selected image ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    console.error(`Error loading image preview: ${getImagePreviewUrl(image)}`);
                    e.target.src = 'https://via.placeholder.com/150?text=Image+Error';
                  }}
                />
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Upload button */}
      {selectedImages.length < maxImages && !disabled && (
        <div className="mt-2">
          <label
            htmlFor="file-upload"
            className={`cursor-pointer px-4 py-2 border border-dashed border-gray-300 rounded-md hover:bg-gray-50 flex items-center justify-center ${isUploading ? 'opacity-50' : ''}`}
          >
            {isUploading ? (
              <span className="text-sm text-gray-500">Uploading...</span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm text-gray-500">Add {selectedImages.length > 0 ? 'More ' : ''}Images</span>
              </>
            )}
          </label>
          <input
            id="file-upload"
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={isUploading || disabled}
          />
          <p className="mt-1 text-xs text-gray-500">
            {selectedImages.length}/{maxImages} (max {maxImages})
          </p>
        </div>
      )}
    </div>
  );
};

export default MaintenanceImageUpload; 