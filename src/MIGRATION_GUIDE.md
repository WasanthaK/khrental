# Migration Guide: Unified User Management

## Overview

This document provides guidance on the migration from separate `team_members` and `rentees` tables to the unified `app_users` table. This migration simplifies user management and provides a more consistent approach to handling different user types in the application.

## Database Changes

### Old Structure
- `team_members` table: Stored staff, admin, and maintenance team members
- `rentees` table: Stored rentee information
- Both tables had separate `authid` and `invited` fields for authentication

### New Structure
- `app_users` table: A unified table for all user types
- Key fields:
  - `id`: Primary key
  - `name`: User's name
  - `email`: User's email address
  - `user_type`: Either 'staff' or 'rentee'
  - `role`: More specific role (admin, staff, maintenance, rentee)
  - `auth_id`: Link to Supabase Auth user ID
  - `invited`: Boolean indicating if the user has been invited
  - `contact_details`: JSON object with contact information
  - Type-specific fields for each user type

## Code Changes

The following components have been updated to use the new `app_users` table:

### Staff/Admin Components
- `TeamMemberForm`: Updated to create/edit staff members in the `app_users` table
- `TeamMemberDetails`: Updated to fetch and display staff member details from `app_users`
- `TeamList`: Updated to list staff members from `app_users`
- `AuthUserLinking`: Updated to link auth users to `app_users` records
- `Dashboard`: Updated to count staff members from `app_users`
- `AdminTools`: Updated to check for and create `app_users` records

### Rentee Components
- `RenteeForm`: Updated to create/edit rentees in the `app_users` table
- `RenteeDetails`: Updated to fetch and display rentee details from `app_users`
- `RenteeList`: Updated to list rentees from `app_users`
- `RenteeCard`: Updated to display rentee information from `app_users`

### Services
- `teamService.js`: Updated to use `app_users` table for CRUD operations on staff members
- `userService.js`: Updated to check invitation status and link users using `app_users`
- `appUserService.js`: New service for managing `app_users` records

## Known Issues

### Route and Navigation Mismatch (RESOLVED)
There was previously a mismatch between the routes defined in `routes.jsx` and the navigation links in `RenteePortalLayout.jsx`:

- In `routes.jsx`, the rentee portal routes were defined under the path `rentee` (e.g., `/rentee/profile`)
- In `RenteePortalLayout.jsx`, the navigation links pointed to the path `portal` (e.g., `/portal/profile`)

**Resolution:**
Both paths are now supported in the application:
1. The `routes.jsx` file has been updated to include identical route definitions for both `/rentee/*` and `/portal/*` paths
2. The `constants.js` file has been updated to include both path variants in the `ROUTES` object
3. This ensures backward compatibility while providing a consistent user experience

## Migration Instructions

To migrate your database:

1. Go to the Admin Tools page
2. Click "Check App Users Table" to verify if the table exists
3. If the table doesn't exist, click "Generate App Users Table SQL" and run the SQL in Supabase
4. Click "Run App Users Migration" to generate the migration SQL
5. Run the migration SQL in Supabase to migrate data from the old tables

## Error Handling

The application now includes robust error handling for cases where the `app_users` table doesn't exist:

- Components will display user-friendly error messages
- Users will be prompted to run the migration
- The `AdminTools` page provides tools to check and create the necessary tables

## Future Improvements

- Remove all references to the deprecated `team_members` and `rentees` tables
- Update all components to use the unified `app_users` table consistently
- Implement proper role-based access control using the new user structure
- Add data validation to ensure consistent data across all user types 