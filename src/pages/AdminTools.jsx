import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * The legacy Admin Tools page exposed database repair and generic user
 * operations directly in the product UI. Those responsibilities are no longer
 * part of normal administration. Keep old bookmarks safe by redirecting to the
 * focused platform administration surface.
 */
const AdminTools = () => <Navigate to="/dashboard/tenant-admin" replace />;

export default AdminTools;
