import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { STORAGE_BUCKETS, BUCKET_FOLDERS, saveFile } from '../../services/fileService';
import { toast } from 'react-hot-toast';

/**
 * Specialized image upload component for maintenance requests
 * that allows selecting the image type (stage of maintenance)
 */
const MaintenanceImageUpload = ({ 
  onImagesChange, 
  maxImages = 5, 
  initialImages = [],
  imageType = 'initial' // Default image type
}) => {
  const [images, setImages] = useState(initialImages);
  const [error, setError] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImageType, setSelectedImageType] = useState(imageType);
  const [description, setDescription] = useState('');

  // Image type options
  const imageTypeOptions = [
    { value: 'initial', label: 'Initial Request' },
    { value: 'progress', label: 'Work in Progress' },
    { value: 'completion', label: 'Completion' },
    { value: 'additional', label: 'Additional Images' }
  ];

  // Compress image function
  const compressImage = async (file) => {
    try {
      // Create a canvas element
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Create an image element
      const img = new Image();
      
      // Create a promise to handle image loading
      const loadImage = new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
      });
      
      // Wait for image to load
      await loadImage;
      
      // Calculate new dimensions (max 1920px)
      let width = img.width;
      let height = img.height;
      const maxDimension = 1920;
      
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      
      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;
      
      // Draw image on canvas with new dimensions
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to Blob with quality 0.7 (70%)
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.7);
      });
      
      // Clean up
      URL.revokeObjectURL(img.src);
      
      // Create a new File object
      return new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now()
      });
    } catch (error) {
      console.error('Error compressing image:', error);
      return file; // Return original file if compression fails
    }
  };

  // Handle file selection and upload
  const handleFileChange = async (event) => {
    try {
      const files = Array.from(event.target.files);
      
      if (images.length + files.length > maxImages) {
        setError(`You can only upload up to ${maxImages} images`);
        return;
      }

      setIsUploading(true);
      setError(null);

      // Maintenance images always go to the images bucket in the maintenance folder
      const targetBucket = STORAGE_BUCKETS.IMAGES;
      const targetFolder = BUCKET_FOLDERS[targetBucket].MAINTENANCE;
      
      console.log(`Using storage bucket: ${targetBucket}, folder: ${targetFolder}`);

      const uploadPromises = files.map(async (file) => {
        // First compress the image
        setIsCompressing(true);
        const compressedFile = await compressImage(file);
        setIsCompressing(false);

        try {
          // Upload it using the fileService
          const result = await saveFile(compressedFile, {
            bucket: targetBucket,
            folder: targetFolder 
          });

          if (!result.success) {
            throw new Error(result.error || 'Failed to upload image');
          }

          // Return URL with additional metadata
          return {
            url: result.url,
            type: selectedImageType,
            description: description,
            timestamp: new Date().toISOString()
          };
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
          // Try direct upload as fallback
          console.log('Attempting direct upload as fallback...');
          
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.jpg`;
          const filePath = `${targetFolder}/${fileName}`;
          
          const { data, error } = await supabase.storage
            .from(targetBucket)
            .upload(filePath, compressedFile, {
              upsert: true
            });
            
          if (error) throw error;
          
          const { data: { publicUrl } } = supabase.storage
            .from(targetBucket)
            .getPublicUrl(filePath);
            
          // Return URL with additional metadata
          return {
            url: publicUrl,
            type: selectedImageType,
            description: description,
            timestamp: new Date().toISOString()
          };
        }
      });

      const uploadedImages = await Promise.all(uploadPromises);

      const updatedImages = [...images, ...uploadedImages];
      setImages(updatedImages);
      console.log('Updating parent with image data:', updatedImages);
      onImagesChange(updatedImages);
      
      // Clear description after successful upload
      setDescription('');
    } catch (error) {
      console.error('Error processing images:', error);
      setError(error.message || 'Failed to upload images');
      toast.error('Failed to upload images: ' + (error.message || 'Unknown error'));
    } finally {
      setIsUploading(false);
    }
  };

  // Handle removing an image
  const handleRemoveImage = (index) => {
    const updatedImages = [...images];
    updatedImages.splice(index, 1);
    setImages(updatedImages);
    onImagesChange(updatedImages);
  };

  return (
    <div className="w-full">
      {/* Image type selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Image Type
        </label>
        <select
          value={selectedImageType}
          onChange={(e) => setSelectedImageType(e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          {imageTypeOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      
      {/* Image description */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Image Description (optional)
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="Describe what this image shows"
        />
      </div>

      {/* File input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Upload Images ({images.length}/{maxImages})
        </label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
          <div className="space-y-1 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex text-sm text-gray-600">
              <label
                htmlFor="file-upload"
                className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
              >
                <span>Upload images</span>
                <input
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  className="sr-only"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  disabled={isUploading || images.length >= maxImages}
                />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
            
            {isUploading && (
              <div className="mt-2">
                {isCompressing ? 'Compressing...' : 'Uploading...'}
              </div>
            )}
            
            {error && (
              <p className="text-sm text-red-600 mt-2">{error}</p>
            )}
          </div>
        </div>
      </div>

      {/* Image preview */}
      {images.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Uploaded Images</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {images.map((image, index) => (
              <div key={index} className="relative group">
                <img
                  src={image.url || image}
                  alt={`Uploaded ${index + 1}`}
                  className="w-full h-32 object-cover rounded-md"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleRemoveImage(index)}
                    className="bg-red-600 p-1 rounded-full text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                {image.type && (
                  <div className="absolute top-0 left-0 bg-black bg-opacity-60 text-white text-xs p-1 rounded-br-md">
                    {image.type}
                  </div>
                )}
                {image.description && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-1 truncate">
                    {image.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceImageUpload; 