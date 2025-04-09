import React, { useState } from 'react';
import { Box, Button, Card, CardMedia, CircularProgress, LinearProgress, Typography } from '@mui/material';
import { FiUpload, FiImage, FiTrash2 } from 'react-icons/fi';

/**
 * A reusable component for uploading images
 * @param {object} props 
 * @param {string} props.currentImage - Current image URL (if any)
 * @param {function} props.onImageSelected - Function to call when an image is selected
 * @param {boolean} props.disabled - Whether the uploader is disabled
 * @param {boolean} props.isUploading - Whether an upload is in progress
 * @param {number} props.uploadProgress - Upload progress percentage (0-100)
 * @param {string} props.label - Optional label for the uploader
 */
const ImageUploader = ({
  currentImage,
  onImageSelected,
  disabled = false,
  isUploading = false,
  uploadProgress = 0,
  label = 'Upload Image'
}) => {
  const [previewUrl, setPreviewUrl] = useState(currentImage || null);
  const fileInputRef = React.useRef(null);

  // Update preview if currentImage prop changes
  React.useEffect(() => {
    setPreviewUrl(currentImage);
  }, [currentImage]);

  const handleSelectFile = () => {
    if (disabled || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Preview the image locally
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);

    // Call the callback
    onImageSelected(file);
    
    // Reset the input value to allow selecting the same file again
    event.target.value = '';
  };

  const handleRemoveImage = () => {
    setPreviewUrl(null);
    onImageSelected(null);
  };

  return (
    <Box>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />

      {!previewUrl ? (
        <Card
          sx={{
            width: '100%',
            height: 200,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            border: '2px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            cursor: disabled || isUploading ? 'not-allowed' : 'pointer',
            bgcolor: 'background.paper',
            p: 2,
            '&:hover': {
              bgcolor: disabled || isUploading ? 'background.paper' : 'action.hover'
            }
          }}
          onClick={handleSelectFile}
        >
          {isUploading ? (
            <>
              <CircularProgress size={40} sx={{ mb: 2 }} />
              <Typography variant="body2" color="textSecondary">
                Uploading... {Math.round(uploadProgress)}%
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={uploadProgress} 
                sx={{ width: '80%', mt: 1 }} 
              />
            </>
          ) : (
            <>
              <FiImage size={40} style={{ marginBottom: 16, opacity: 0.6 }} />
              <Typography variant="body1" align="center">
                {label}
              </Typography>
              <Typography variant="body2" color="textSecondary" align="center">
                Click to browse or drag and drop
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FiUpload />}
                sx={{ mt: 2 }}
                disabled={disabled || isUploading}
              >
                Select Image
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
          <CardMedia
            component="img"
            image={previewUrl}
            alt="Selected image"
            sx={{ 
              height: 200,
              objectFit: 'cover'
            }}
          />
          
          {isUploading && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                bgcolor: 'rgba(0, 0, 0, 0.5)',
                color: 'white'
              }}
            >
              <CircularProgress color="inherit" size={40} sx={{ mb: 1 }} />
              <Typography variant="body2">
                Uploading... {Math.round(uploadProgress)}%
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={uploadProgress} 
                sx={{ width: '80%', mt: 1, bgcolor: 'rgba(255, 255, 255, 0.3)' }} 
              />
            </Box>
          )}
          
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              display: 'flex',
              gap: 1,
              p: 1
            }}
          >
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<FiUpload />}
              onClick={handleSelectFile}
              disabled={disabled || isUploading}
              sx={{
                bgcolor: 'rgba(25, 118, 210, 0.8)',
                '&:hover': {
                  bgcolor: 'rgba(25, 118, 210, 0.9)',
                }
              }}
            >
              Change
            </Button>
            
            <Button
              variant="contained"
              color="error"
              size="small"
              startIcon={<FiTrash2 />}
              onClick={handleRemoveImage}
              disabled={disabled || isUploading}
              sx={{
                bgcolor: 'rgba(211, 47, 47, 0.8)',
                '&:hover': {
                  bgcolor: 'rgba(211, 47, 47, 0.9)',
                }
              }}
            >
              Remove
            </Button>
          </Box>
        </Card>
      )}
    </Box>
  );
};

export default ImageUploader; 