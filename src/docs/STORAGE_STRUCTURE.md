# Storage Structure

The application uses Supabase Storage for file management, organized into buckets and folders.

## Storage Organization

### Buckets

```javascript
export const STORAGE_BUCKETS = {
  IMAGES: 'images',  // Public bucket for images (5MB limit)
  FILES: 'files'     // Private bucket for files (50MB limit)
};
```

### Folder Structure

```javascript
export const BUCKET_FOLDERS = {
  [STORAGE_BUCKETS.IMAGES]: {
    PROPERTIES: 'properties',           // Property images
    MAINTENANCE: 'maintenance',         // Maintenance request images
    UTILITY_READINGS: 'utility-readings' // Utility meter reading images
  },
  [STORAGE_BUCKETS.FILES]: {
    ID_COPIES: 'id-copies',           // User ID documents
    PAYMENT_PROOFS: 'payment-proofs', // Payment proof documents
    AGREEMENTS: 'agreements',         // Rental agreements
    DOCUMENTS: 'documents'            // Other documents
  }
};
```

## Usage Example

```javascript
import { saveFile, STORAGE_BUCKETS, BUCKET_FOLDERS } from '../services/fileService';

// Upload a property image
const result = await saveFile(file, {
  bucket: STORAGE_BUCKETS.IMAGES,
  folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].PROPERTIES
});

if (result.success) {
  console.log('File uploaded:', result.url);
}
```

## File Size Limits

- Images bucket: 5MB per file
- Files bucket: 50MB per file

## Security

- Images bucket is public (read-only)
- Files bucket is private (authenticated access only)
- All write operations require authentication
- Folder access is controlled by Row Level Security (RLS) policies

## Maintenance

The storage system includes automatic cleanup of unused files and folder structure maintenance. Each folder contains a `.keep` file to ensure the folder structure is preserved.