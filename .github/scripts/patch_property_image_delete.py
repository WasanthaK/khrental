from pathlib import Path


def replace_once(path, old, new, label):
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise SystemExit(f'{label} block not found')
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    'src/pages/PropertyForm.jsx',
    """      if (imageUrl) {
        // Extract the path from the URL
        const urlParts = imageUrl.split('/storage/v1/object/public/');
        if (urlParts.length === 2) {
          const [bucket, path] = urlParts[1].split('/', 1);
          const filePath = urlParts[1].substring(bucket.length + 1);
          
          console.log('Deleting property image file:', { bucket, path: filePath });
          
          const { success, error } = await deleteFile(bucket, filePath);
          if (!success) {
            console.error('Failed to delete property image file:', error);
            throw new Error(error?.message || 'Failed to delete image');
          }

          // Update form data only after successful deletion
          const updatedImages = formData.images.filter((_, i) => i !== index);
          setFormData(prev => ({
            ...prev,
            images: updatedImages
          }));

          toast.success('Property image removed successfully');
        } else {
          console.error('Invalid property image URL format:', imageUrl);
          throw new Error('Invalid image URL format');
        }
      }
""",
    """      if (imageUrl) {
        const legacyMarker = '/storage/v1/object/public/';
        let bucket = '';
        let filePath = '';

        if (imageUrl.includes(legacyMarker)) {
          const remainder = imageUrl.split(legacyMarker)[1]?.split('?')[0] || '';
          const separatorIndex = remainder.indexOf('/');
          if (separatorIndex > 0) {
            bucket = decodeURIComponent(remainder.slice(0, separatorIndex));
            filePath = decodeURIComponent(remainder.slice(separatorIndex + 1));
          }
        } else {
          try {
            const parsedUrl = new URL(imageUrl, window.location.origin);
            const match = parsedUrl.pathname.match(/^\\/storage\\/([^/]+)\\/(.+)$/);
            if (match) {
              bucket = decodeURIComponent(match[1]);
              filePath = decodeURIComponent(match[2]);
            }
          } catch (parseError) {
            console.error('Failed to parse property image URL:', parseError);
          }
        }

        if (!bucket || !filePath) {
          console.error('Invalid property image URL format:', imageUrl);
          throw new Error('Invalid image URL format');
        }

        console.log('Deleting property image file:', { bucket, path: filePath });

        const { success, error } = await deleteFile(bucket, filePath);
        if (!success) {
          const status = Number(error?.status || error?.statusCode || 0);
          const message = error?.message || '';
          const alreadyMissing = status === 404 || /not found|does not exist/i.test(message);
          if (!alreadyMissing) {
            console.error('Failed to delete property image file:', error);
            throw new Error(message || 'Failed to delete image');
          }
          console.warn('Property image file is already missing; removing its property reference.', { bucket, path: filePath });
        }

        const updatedImages = formData.images.filter((_, i) => i !== index);
        setFormData(prev => ({
          ...prev,
          images: updatedImages
        }));

        toast.success('Property image removed successfully');
      }
""",
    'PropertyForm delete',
)

replace_once(
    'src/pages/PropertyDetails.jsx',
    """      // Extract the path from the URL
      const urlParts = imageUrl.split('/storage/v1/object/public/');
      if (urlParts.length !== 2) {
        throw new Error('Invalid image URL format');
      }
      
      const [bucket, path] = urlParts[1].split('/', 1);
      const filePath = urlParts[1].substring(bucket.length + 1);
      
      console.log('Deleting image file:', { bucket, path: filePath });
      
      // Delete the file from storage
      const { success, error: deleteError } = await deleteFile(bucket, filePath);
      if (!success) {
        throw new Error(deleteError?.message || 'Failed to delete image file');
      }
""",
    """      const legacyMarker = '/storage/v1/object/public/';
      let bucket = '';
      let filePath = '';

      if (imageUrl.includes(legacyMarker)) {
        const remainder = imageUrl.split(legacyMarker)[1]?.split('?')[0] || '';
        const separatorIndex = remainder.indexOf('/');
        if (separatorIndex > 0) {
          bucket = decodeURIComponent(remainder.slice(0, separatorIndex));
          filePath = decodeURIComponent(remainder.slice(separatorIndex + 1));
        }
      } else {
        try {
          const parsedUrl = new URL(imageUrl, window.location.origin);
          const match = parsedUrl.pathname.match(/^\\/storage\\/([^/]+)\\/(.+)$/);
          if (match) {
            bucket = decodeURIComponent(match[1]);
            filePath = decodeURIComponent(match[2]);
          }
        } catch (parseError) {
          console.error('Failed to parse property image URL:', parseError);
        }
      }

      if (!bucket || !filePath) {
        throw new Error('Invalid image URL format');
      }

      console.log('Deleting image file:', { bucket, path: filePath });

      const { success, error: deleteError } = await deleteFile(bucket, filePath);
      if (!success) {
        const status = Number(deleteError?.status || deleteError?.statusCode || 0);
        const message = deleteError?.message || '';
        const alreadyMissing = status === 404 || /not found|does not exist/i.test(message);
        if (!alreadyMissing) {
          throw new Error(message || 'Failed to delete image file');
        }
        console.warn('Property image file is already missing; removing its property reference.', { bucket, path: filePath });
      }
""",
    'PropertyDetails delete',
)
