import React from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Box, CircularProgress } from '@mui/material';
import { FiX } from 'react-icons/fi';

/**
 * A reusable component for viewing images in a modal dialog
 * @param {object} props 
 * @param {string} props.imageUrl - URL of the image to display
 * @param {boolean} props.open - Whether the dialog is open
 * @param {function} props.onClose - Function to call when the dialog is closed
 * @param {string} props.title - Optional title for the dialog
 */
const ImageViewer = ({ imageUrl, open, onClose, title }) => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const handleImageLoad = () => {
    setLoading(false);
  };

  const handleImageError = () => {
    setLoading(false);
    setError(true);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 2 }}>
        {title || 'Image Viewer'}
        <IconButton onClick={onClose} aria-label="close" size="small" sx={{ color: 'gray' }}>
          <FiX />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ padding: 0, position: 'relative', minHeight: 300 }}>
        {loading && (
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1
            }}
          >
            <CircularProgress />
          </Box>
        )}
        
        {error ? (
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              height: 300,
              color: 'error.main'
            }}
          >
            Error loading image
          </Box>
        ) : (
          <img 
            src={imageUrl} 
            alt="Utility reading" 
            style={{ 
              width: '100%', 
              height: 'auto',
              maxHeight: '70vh',
              objectFit: 'contain',
              display: loading ? 'none' : 'block'
            }} 
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImageViewer; 