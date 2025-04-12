import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { STORAGE_BUCKETS, BUCKET_FOLDERS, saveFile } from '../../services/fileService';
import { toast } from 'react-hot-toast';

const ImageUpload = ({ 
  onImagesChange, 
  maxImages = 5, 
  initialImages = [],
  bucket = STORAGE_BUCKETS.IMAGES,
  folder = BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].PROPERTIES // Default to properties folder
}) => {
  const [images, setImages] = useState(initialImages);
  const [error, setError] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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

      // Validate folder path before trying to upload
      if (!folder) {
        // Use a default folder if none is provided
        console.warn("No folder specified, using 'maintenance' as default");
        folder = 'maintenance';
      }

      // Use default bucket if not specified or invalid
      const targetBucket = bucket || STORAGE_BUCKETS.IMAGES;
      
      // Log the bucket we're trying to use - helps with debugging
      console.log(`Using storage bucket: ${targetBucket}, folder: ${folder}`);

      const uploadPromises = files.map(async (file) => {
        // First compress the image
        setIsCompressing(true);
        const compressedFile = await compressImage(file);
        setIsCompressing(false);

        try {
          // Then upload it using the provided bucket and folder
          const result = await saveFile(compressedFile, {
            bucket: targetBucket,
            folder: folder 
          });

          if (!result.success) {
            throw new Error(result.error || 'Failed to upload image');
          }

          return result.url;
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
          // Try direct upload as fallback
          console.log('Attempting direct upload as fallback...');
          
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.jpg`;
          const filePath = `${folder}/${fileName}`;
          
          const { data, error } = await supabase.storage
            .from(targetBucket)
            .upload(filePath, compressedFile, {
              upsert: true
            });
            
          if (error) throw error;
          
          const { data: { publicUrl } } = supabase.storage
            .from(targetBucket)
            .getPublicUrl(filePath);
            
          return publicUrl;
        }
      });

      const uploadedUrls = await Promise.all(uploadPromises);

      const updatedImages = [...images, ...uploadedUrls.map(url => ({ url }))];
      setImages(updatedImages);
      console.log('Updating parent with image URLs:', updatedImages.map(img => img.url));
      onImagesChange(updatedImages.map(img => img.url));
    } catch (error) {
      console.error('Error processing images:', error);
      setError(`Error processing images: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };
  
  // Remove an image
  const handleRemoveImage = async (index) => {
    const updatedImages = [...images];
    const imageToRemove = updatedImages[index];
    
    // If it's a new image that was uploaded, delete it from storage
    if (imageToRemove.isNew && imageToRemove.path) {
      try {
        const { error: deleteError } = await supabase.storage
          .from(STORAGE_BUCKETS.IMAGES.bucket)
          .remove([imageToRemove.path]);
          
        if (deleteError) {
          throw deleteError;
        }
      } catch (error) {
        console.error('Error deleting image:', error);
        toast.error('Failed to delete image');
        return;
      }
    }
    
    // Release object URL to prevent memory leaks
    if (imageToRemove.preview && imageToRemove.isNew) {
      URL.revokeObjectURL(imageToRemove.preview);
    }
    
    updatedImages.splice(index, 1);
    setImages(updatedImages);
    
    // Notify parent component
    if (onImagesChange) {
      onImagesChange(updatedImages.map(img => img.url));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {images.map((image, index) => (
          <div key={index} className="relative">
            <img 
              src={image.preview || image.url} 
              alt={`Preview ${index}`} 
              className="w-24 h-24 object-cover rounded border"
            />
            <button
              type="button"
              onClick={() => handleRemoveImage(index)}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
              aria-label="Remove image"
            >
              ×
            </button>
            {image.originalSize && image.compressedSize && (
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 text-center">
                {((image.compressedSize / 1024 / 1024).toFixed(1))}MB
              </div>
            )}
          </div>
        ))}
        
        {images.length < maxImages && (
          <label className="w-24 h-24 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 relative">
            {isCompressing || isUploading ? (
              <div className="flex flex-col items-center">
                <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-xs text-gray-500 mt-1">
                  {isCompressing ? 'Compressing...' : 'Uploading...'}
                </span>
              </div>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-xs text-gray-500 mt-1">Add Image</span>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg, image/png"
              onChange={handleFileChange}
              className="hidden"
              multiple
              disabled={isCompressing || isUploading}
            />
          </label>
        )}
      </div>
      
      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}
      
      <p className="text-sm text-gray-500">
        Upload up to {maxImages} images (JPG or PNG, max 10MB each). Images will be automatically compressed.
      </p>
    </div>
  );
};

export default ImageUpload; 