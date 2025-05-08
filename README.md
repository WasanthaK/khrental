# KH Rentals Management System

A comprehensive property rental management system built with React and Supabase.

## Known Issues and Solutions

### PDF Upload with CORS Proxy

When uploading PDFs to Supabase Storage while using a CORS proxy, we encountered several issues:

1. **Issue**: Direct file uploads through the proxy would fail with CORS errors or content-type mismatches.
   - The proxy was modifying the request headers, causing Supabase Storage to reject the upload
   - Binary file data was being corrupted during proxy transmission

2. **Solution**: We implemented multiple fallback approaches in the `binaryUpload` function:
   - Disabled proxy for storage operations
   - Added direct file upload with proper content-type headers
   - Implemented Blob to File conversion as fallback
   - Added enhanced error handling and logging

```javascript
// Example of the enhanced upload function
export const binaryUpload = async (bucket, path, fileData, options = {}) => {
  // Ensure path doesn't contain special characters
  const safePath = path.replace(/[:#?]/g, '_');
  
  // Get content type
  const contentType = options.contentType || 
                     (fileData instanceof Blob ? fileData.type : null) ||
                     'application/octet-stream';
  
  // Try direct upload first
  if (fileData instanceof File) {
    const { data, error } = await storageClient.upload(path, fileData, {
      contentType,
      ...options
    });
    if (!error) return { success: true, url: data.publicUrl };
  }
  
  // Fallback to Blob conversion if needed
  if (fileData instanceof Blob) {
    const file = new File([await fileData.arrayBuffer()], 
      path.split('/').pop(), 
      { type: contentType }
    );
    return await storageClient.upload(path, file, options);
  }
};
```

3. **Best Practices**:
   - Always specify correct content-type headers
   - Sanitize file paths before upload
   - Implement proper error handling and logging
   - Consider disabling proxy for storage operations
   - Use direct Supabase URL for file uploads

## Getting Started

### Prerequisites

- Node.js v18 or higher
- npm v9 or higher
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/khrentals.git
cd khrentals
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start the development server:
```bash
npm run dev
```

### Development with Proxy

To run the development server with CORS proxy:

```bash
npm run dev:with-proxy
```

Note: The proxy is not recommended for file uploads to Supabase Storage.

## Features

- Property management
- Rental agreements
- Document generation and signing
- PDF handling and storage
- Email notifications
- User management

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
