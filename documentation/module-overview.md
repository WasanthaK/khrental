# Module Overview

This document provides a comprehensive overview of the major modules in the KH Rentals Management System, describing their purpose and relationships.

## Core Modules

### 1. Authentication Module

**Primary Files:**
- `src/hooks/useAuth.jsx`
- `src/services/supabaseClient.js` (auth-related functions)
- `src/pages/Login.jsx`, `src/pages/Register.jsx`, etc.

**Purpose:**
Manages user authentication, registration, password reset, and session management using Supabase Authentication. Provides role-based access control and permission checking.

**Relationships:**
- Used by all protected routes via the `ProtectedRoute` component
- Provides user data to components through the `useAuth` hook
- Integrates with Supabase for backend authentication

### 2. Property Management Module

**Primary Files:**
- `src/services/propertyService.js`
- `src/pages/PropertyList.jsx`, `src/pages/PropertyDetails.jsx`, `src/pages/PropertyForm.jsx`
- `src/components/properties/*`

**Purpose:**
Handles property listing, details, creation, and editing. Manages property photos, documents, and associations with units and rentees.

**Relationships:**
- Referenced by Agreement Module for property selection
- Used by Dashboard for property summaries
- Integrated with File Storage Module for property images

### 3. Rentee (Tenant) Management Module

**Primary Files:**
- `src/services/renteeService.js`
- `src/pages/RenteeList.jsx`, `src/pages/RenteeDetails.jsx`, `src/pages/RenteeForm.jsx`
- `src/components/rentees/*`

**Purpose:**
Manages tenant information, including contact details, associated properties, agreements, and portal access.

**Relationships:**
- Referenced by Agreement Module for tenant selection
- Used by Dashboard for tenant summaries
- Provides data for Rentee Portal

### 4. Agreement Management Module

**Primary Files:**
- `src/services/agreementService.js`
- `src/pages/AgreementList.jsx`, `src/pages/AgreementDetails.jsx`
- `src/components/agreements/*`
- `src/pages/AgreementTemplateList.jsx`, `src/pages/AgreementTemplateForm.jsx`

**Purpose:**
Handles the creation, editing, and management of rental agreements. Includes template management, agreement generation, and signature processing.

**Relationships:**
- Integrates with the Document Service for agreement generation
- Integrates with Evia Sign for digital signatures
- References Property and Rentee modules for agreement data
- Used by Dashboard for agreement summaries

### 5. Maintenance Request Module

**Primary Files:**
- `src/services/maintenanceService.js`
- `src/pages/MaintenanceList.jsx`, `src/pages/MaintenanceDetails.jsx`, `src/pages/MaintenanceForm.jsx`
- `src/components/maintenance/*`

**Purpose:**
Manages maintenance requests from submission to completion. Includes status tracking, staff assignment, photo uploads, and commenting.

**Relationships:**
- References Property and Rentee modules for request context
- Integrates with File Storage Module for maintenance photos
- Used by Dashboard for maintenance summaries
- Provides data for Rentee Portal maintenance section

### 6. Invoice Management Module

**Primary Files:**
- `src/services/invoiceService.js`
- `src/pages/InvoiceList.jsx`, `src/pages/InvoiceDetails.jsx`, `src/pages/InvoiceForm.jsx`
- `src/components/invoices/*`

**Purpose:**
Handles invoice creation, editing, and management. Supports multiple invoice types, payment tracking, and batch operations.

**Relationships:**
- References Property and Rentee modules for invoice context
- Used by Dashboard for financial summaries
- Provides data for Rentee Portal invoice section
- Integrated with Utility Billing for utility invoices

### 7. Utility Billing Module

**Primary Files:**
- `src/services/utilityBillingService.js`
- `src/pages/UtilityBillingReview.jsx`, `src/pages/UtilityBillingInvoice.jsx`
- `src/pages/rentee/UtilityReadingForm.jsx`, `src/pages/rentee/UtilityHistory.jsx`

**Purpose:**
Manages utility meter readings, consumption calculation, and billing. Supports multiple utility types and automatic invoice generation.

**Relationships:**
- References Property and Unit information
- Integrates with Invoice Module for billing
- Provides data for Rentee Portal utility section
- Used by Dashboard for utility summaries

## Infrastructure Modules

### 8. Document Service Module

**Primary Files:**
- `src/services/DocumentService.js`

**Purpose:**
Handles document generation, formatting, and conversion. Processes HTML templates into formatted documents and handles document storage.

**Relationships:**
- Used by Agreement Module for document generation
- Integrated with Evia Sign for digital signatures
- References File Storage Module for document storage

### 9. Evia Sign Integration Module

**Primary Files:**
- `src/services/eviaSignService.js`
- `src/pages/DigitalSignatureForm.jsx`
- `src/pages/EviaAuthCallback.jsx`

**Purpose:**
Manages integration with the Evia Sign digital signature service. Handles authentication, document sending, signature tracking, and webhook processing.

**Relationships:**
- Used by Agreement Module for digital signatures
- Integrates with Document Service for document preparation
- Updates agreement statuses based on signature events

### 10. File Storage Module

**Primary Files:**
- `src/services/fileService.js`
- `src/components/common/ImageUpload.jsx`

**Purpose:**
Manages file uploads, storage, and retrieval using Supabase Storage. Supports images, documents, and other file types.

**Relationships:**
- Used by multiple modules for file management
- Provides file URLs for display and download
- Handles file permissions and organization

### 11. Dashboard Module

**Primary Files:**
- `src/pages/Dashboard.jsx`
- `src/pages/AdminDashboard.jsx`
- `src/components/dashboard/*`

**Purpose:**
Provides role-specific dashboards with summaries, statistics, and quick actions. Serves as the main landing page after login.

**Relationships:**
- Aggregates data from multiple modules
- Routes users to different features
- Adapts display based on user role

### 12. Rentee Portal Module

**Primary Files:**
- `src/pages/rentee/RenteePortal.jsx`
- `src/pages/rentee/*`
- `src/components/layouts/RenteePortalLayout.jsx`

**Purpose:**
Provides a dedicated portal for tenants to view their properties, agreements, invoices, maintenance requests, and utility information.

**Relationships:**
- Consumes data from multiple modules
- Filtered to show only relevant information for the logged-in tenant
- Provides simplified interfaces for tenant interactions

### 13. Administration Module

**Primary Files:**
- `src/pages/AdminPanel.jsx`
- `src/pages/AdminTools.jsx`
- `src/pages/TeamList.jsx`, `src/pages/TeamMemberDetails.jsx`, `src/pages/TeamMemberForm.jsx`

**Purpose:**
Provides system administration tools, team management, and configuration options.

**Relationships:**
- Manages system-wide settings
- Handles team member creation and management
- Provides tools for database operations and system maintenance

## Support Modules

### 14. Notification Module

**Primary Files:**
- `src/services/notificationService.js`

**Purpose:**
Manages system notifications, alerts, and communications.

**Relationships:**
- Used by multiple modules to notify users
- Integrates with external communication channels

### 15. UI Component Library

**Primary Files:**
- `src/components/common/*`
- `src/components/ui/*`

**Purpose:**
Provides reusable UI components used throughout the application.

**Relationships:**
- Used by all feature modules
- Ensures consistent UI/UX across the application

### 16. Routing and Navigation

**Primary Files:**
- `src/routes.jsx`
- `src/components/layouts/*`
- `src/components/navigation/*`

**Purpose:**
Manages application routing, layouts, and navigation.

**Relationships:**
- Defines the application structure
- Controls access to different sections based on permissions
- Provides consistent navigation experience

### 17. API Services

**Primary Files:**
- `src/api/*`
- `api-server.js`

**Purpose:**
Handles API endpoints and external service integration.

**Relationships:**
- Provides webhook endpoints
- Interfaces with external services
- Supplements Supabase backend functionality

## Module Relationships Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Authentication │────▶│     Routing     │◀────│     UI Lib      │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │                        ▲
         ▼                       ▼                        │
┌─────────────────┐     ┌─────────────────┐     ┌────────┴────────┐
│  Admin Module   │     │    Dashboard    │────▶│  Feature Modules │
└────────┬────────┘     └────────┬────────┘     │  - Properties   │
         │                       │              │  - Rentees      │
         │                       │              │  - Agreements   │
         │                       │              │  - Maintenance  │
         │                       │              │  - Invoices     │
         │                       ▼              │  - Utilities    │
         │              ┌─────────────────┐     └────────┬────────┘
         └────────────▶│  Data Services  │◀──────────────┘
                       └────────┬────────┘
                                │
                                ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Document Service│◀───▶│  Supabase API   │◀───▶│ File Storage    │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │                                                ▲
         ▼                                                │
┌─────────────────┐     ┌─────────────────┐     ┌────────┴────────┐
│   Evia Sign     │────▶│ Webhook Service │────▶│ Notification    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Module Size and Complexity

The following modules are particularly large and complex, potentially requiring refactoring:

1. **Document Service** (49KB, 1574 lines)
2. **Evia Sign Service** (48KB, 1331 lines)
3. **Maintenance Service** (36KB, 1119 lines)
4. **Utility Billing Service** (43KB, 1269 lines)
5. **Agreement Service** (27KB, 763 lines)

These larger services could benefit from being split into smaller, more focused modules with clearer responsibilities. 