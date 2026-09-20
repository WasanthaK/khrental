import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * The legacy Admin Dashboard mixed platform diagnostics, storage, templates,
 * and generic user onboarding in one screen. Generic user onboarding is now
 * deliberately retired: platform administrators manage organizations and
 * tenant administrators only, while tenant administrators own renters and
 * team members inside their workspace.
 *
 * Keep this route as a compatibility redirect for old bookmarks.
 */
const AdminDashboard = () => <Navigate to="/dashboard/tenant-admin" replace />;

export default AdminDashboard;
