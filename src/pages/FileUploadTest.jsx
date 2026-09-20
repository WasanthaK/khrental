import { Navigate } from 'react-router-dom';

/**
 * Compatibility route retained for old bookmarks. Storage diagnostics now use
 * the KH Rentals backend/R2 health checks instead of provider-specific bucket
 * policy tooling.
 */
const FileUploadTest = () => <Navigate to="/dashboard/settings" replace />;

export default FileUploadTest;
