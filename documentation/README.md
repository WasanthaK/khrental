# KH Rentals Management System

A comprehensive property management application for KH Rentals that provides digital signature integration, property management, tenant portal features, billing and maintenance tracking.

## Table of Contents

1. [Introduction](#introduction)
2. [System Architecture](#system-architecture)
3. [Key Features](#key-features)
4. [Component Structure](#component-structure)
5. [Services](#services)
6. [Authentication and Authorization](#authentication-and-authorization)
7. [API Integration](#api-integration)
8. [Database Structure](#database-structure)
9. [Development Setup](#development-setup)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)

## Introduction

The KH Rentals Management System is a full-featured property management application built with React, Vite, and Supabase. It provides a comprehensive solution for managing rental properties, agreements, maintenance requests, utility billing, and tenant communications.

## System Architecture

The application follows a modern, component-based architecture:

- **Frontend**: React with Vite for fast development and optimized builds
- **State Management**: React Context API for global state
- **Backend**: Supabase for database, authentication, and storage
- **Routing**: React Router for client-side navigation
- **Styling**: TailwindCSS with some Bootstrap components
- **Document Processing**: Integration with Evia Sign for digital signatures and document generation with DOCX

## Key Features

### Property Management
- Property listing and details
- Unit management within properties
- Photo galleries and documentation
- Property association with rentees and agreements

### Agreement Management
- Digital agreement templates
- Agreement creation and editing
- Digital signature process via Evia Sign integration
- Agreement status tracking

### Tenant (Rentee) Portal
- Self-service portal for tenants
- View and sign agreements
- Submit maintenance requests
- Track invoices and payments
- Submit utility readings

### Maintenance Management
- Maintenance request submission and tracking
- Staff assignment and status updates
- Photo uploads for documentation
- Comment system for communication

### Utility Billing
- Utility reading submission
- Automatic billing calculation
- Invoice generation
- Payment tracking

### Administration
- User management and permissions
- Team management for staff
- System settings and configuration
- Advanced tools for system maintenance

## Component Structure

The application is organized into the following main directories:

### `/src/components`
Contains reusable UI components organized by feature:
- `/common` - Shared UI components like buttons, forms, modals
- `/agreements` - Agreement creation and management
- `/maintenance` - Maintenance request components
- `/properties` - Property listing and management
- `/rentees` - Tenant management
- `/dashboard` - Dashboard components for different user roles
- `/invoices` - Invoice creation and management
- `/layouts` - Page layout templates
- `/forms` - Reusable form components

### `/src/pages`
Contains page components that are directly associated with routes:
- Authentication pages (Login, Register, etc.)
- Dashboard pages
- Management pages for properties, rentees, agreements, etc.
- Feature-specific pages organized by role

### `/src/contexts`
Contains React context providers for global state management:
- Authentication context
- Theme context
- Notification context

### `/src/hooks`
Custom React hooks for shared functionality:
- `useAuth` - Authentication and user information
- `usePermissions` - Permission checking
- Feature-specific custom hooks

### `/src/utils`
Utility functions and helper methods:
- Date and time formatting
- Data validation
- Helper functions

### `/src/services`
Service modules for interacting with backend APIs:
- `supabaseClient.js` - Supabase client configuration
- `agreementService.js` - Agreement operations
- `eviaSignService.js` - Evia Sign integration
- `fileService.js` - File upload and management
- `maintenanceService.js` - Maintenance request operations
- Other service modules

## Services

### Supabase Integration (`supabaseClient.js`)
- Authentication
- Database operations
- File storage
- Real-time subscriptions

### Document Management
- `DocumentService.js` - Document generation and processing
- `eviaSignService.js` - Digital signature integration

### Data Services
- Property management
- Rentee management
- Agreement management
- Maintenance request management
- Invoice management
- Utility billing management

## Authentication and Authorization

The application uses Supabase Auth for authentication and a custom role-based permission system:

### User Roles
- `admin` - Full system access
- `staff` - General staff access
- `maintenance_staff` - Focused on maintenance tasks
- `finance_staff` - Focused on financial tasks
- `rentee` - Tenant access to personal information and services

### Permission System
- Feature-based permissions
- Role-based access control
- Page-level protection with ProtectedRoute component

## API Integration

### Evia Sign Integration
The system integrates with Evia Sign for digital signatures:
- OAuth authentication
- Document signing workflow
- Webhook integration for status updates
- Signed document retrieval

### Webhook Processing
- Webhook events from Evia Sign are processed
- Agreement statuses are updated based on signature events
- Designed for reliability with database triggers
- Currently implemented via a dedicated Azure webhook server at kh-reantals-webhook.azurewebsites.net

## Database Structure

The application uses a Supabase PostgreSQL database with the following main tables:

- `properties` - Property information
- `units` - Individual rental units within properties
- `rentees` - Tenant information
- `agreements` - Rental agreements
- `agreement_templates` - Templates for agreements
- `maintenance_requests` - Maintenance tickets
- `invoices` - Billing invoices
- `utility_readings` - Utility consumption data
- `webhook_events` - Webhook event tracking
- `app_users` - Application user profiles

## Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example`
4. Start the development server:
   ```bash
   npm run dev
   ```
   
## Deployment

The application is configured for deployment to Azure Web App:

### Azure Configuration
- Environment variables must be set in Azure App Settings
- Web.config is configured for client-side routing
- Azure deployment is handled via GitHub Actions

### Environment Variables
Ensure these variables are configured in production:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_EVIA_SIGN_CLIENT_ID`
- `VITE_EVIA_SIGN_CLIENT_SECRET`
- `VITE_API_ENDPOINT`
- `VITE_WEBHOOK_URL`

## Troubleshooting

### Common Issues

1. **Authentication Issues**
   - Verify Supabase URL and keys are correct
   - Check user permissions in Supabase dashboard
   - Ensure environment variables are properly set

2. **Webhook Processing**
   - Ensure the webhook URL is correctly configured
   - Check database triggers for webhook_events
   - Verify Evia Sign configuration

3. **Document Generation**
   - Check templates in the database
   - Verify HTML processing is working correctly
   - Ensure proper content encoding

4. **URL Handling**
   - Ensure proper URL encoding for paths containing HTML content
   - Check env-config.js for proper URL handling

## Modules for Potential Refactoring

During analysis, the following modules were identified for potential refactoring:

1. **api-server.js** - This standalone Express server appears to be redundant since the application is now using a dedicated webhook server at kh-reantals-webhook.azurewebsites.net.

2. **Multiple Webhook Implementation Files** - There are numerous webhook implementation files in the /docs directory that could be consolidated:
   - webhook-implementation-guide.md
   - webhook-setup.md
   - evia-webhook-workflow.md
   - evia-webhook-setup.md
   - evia-webhook-solution.md
   - evia-webhook-integration.md

3. **Legacy Files**:
   - `fileUploadTest.js` appears to be a testing utility rather than a production service
   - `src/scripts/createWebhookEventsTable.sql` may be redundant if the table is already created

4. **Overlapping Services**:
   - Some functionality in `DocumentService.js` and `eviaSignService.js` appears to be overlapping
   - Consider consolidating related functionality

5. **Documentation Consolidation**:
   - Multiple markdown files scattered throughout the project
   - Consider consolidating all documentation into the /documentation directory

## Conclusion

The KH Rentals Management System provides a comprehensive solution for property management with a focus on digital workflows and tenant self-service. The modular architecture allows for easy maintenance and future expansion. 