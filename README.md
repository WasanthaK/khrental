# KH Rentals Web Application

A comprehensive web application for managing rental properties and operations.

## Features

- **Property Management:** Add, edit, and delete properties with details, rental values, checklists, terms, and images.
- **Action Processing:** Handle confirmation advance, deposit collection, agreement signing, checklists, payment receipts, damaged settlement, termination, and renewal notifications.
- **Agreements Management:** Manage contract templates and digital signing via Evia Sign API.
- **Utilities Management:** Track meter readings, calculate bills, and manage utility configurations.
- **Invoice & Payment Processing:** Generate invoices, process payments, and verify payment proofs.
- **Maintenance & Cleaning Management:** Schedule and track routine and emergency maintenance tasks.
- **Surveillance:** Register cameras, update daily status, and manage data packages.
- **User & Team Management:** Manage rentee profiles, staff profiles, and task assignments.
- **Letters & Notifications:** Create and dispatch various communication templates via email/SMS.

## Technology Stack

- **Frontend:** React, TailwindCSS, shadcn UI
- **Backend & Database:** Supabase (authentication, database, storage, and real-time functions)
- **Integrations:** Evia Sign API, Payment Gateway API, SMS/Email Service APIs

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/khrentals.git
   cd khrentals
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the development server:
   ```
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

## User Roles

- **KH Staff (Admin/Staff):** Full access to the administrative dashboard with property management, action processing, agreements, invoices, maintenance, surveillance, and team management.
- **Rentees:** Access to a simplified portal for viewing property details, submitting utility readings, making payments, and requesting maintenance.

## Deployment

To build the application for production:

```
npm run build
```

The build artifacts will be stored in the `dist/` directory.

## License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

## Database Migration

The application has recently migrated from using separate `team_members` and `rentees` tables to a unified `app_users` table. See the [Migration Guide](./src/MIGRATION_GUIDE.md) for detailed information about this change.

### Running the Migration

1. Log in as an admin user
2. Navigate to the Admin Tools page
3. Click "Check App Users Table" to verify if the table exists
4. If needed, click "Run App Users Migration" to generate the migration SQL
5. Run the generated SQL in your Supabase database

### Finding Deprecated Table References

The project includes a utility script to help identify any remaining references to deprecated tables:

```bash
npm run find-deprecated
```

This script will scan the codebase and report any files that still reference the deprecated `team_members` or `rentees` tables.

## Routing

The application supports two equivalent path patterns for the rentee portal:

- `/rentee/*` - The original path pattern
- `/portal/*` - An alternative path pattern

Both patterns are fully supported and will render the same components. This dual-path approach ensures backward compatibility while allowing for a more intuitive URL structure.

## Code Standards

### Database Naming Conventions

This project follows these database naming conventions:

1. **Table and Column Names**: All database table and column names use lowercase without underscores (e.g., `createdat`, `updatedat`, `propertyid`).

2. **JavaScript Variables**: In code, we use camelCase for variables (e.g., `createdAt`, `updatedAt`, `propertyId`).

3. **Timestamps**: All tables should have `createdat` and `updatedat` columns (without underscores).

When developing new features or fixing bugs, please ensure you're following these conventions to maintain consistency across the codebase.

#### Fixing Naming Inconsistencies

If you encounter naming inconsistencies, you can run:

```bash
# Standardize timestamp columns across all tables
node src/scripts/standardizeTimestampColumns.js
```

## Utility Scripts

### Database Utilities

#### Update Missing Timestamps

If you encounter errors related to missing `updated_at` or `created_at` fields, you can run the timestamp update script:

```bash
node src/scripts/updateTimestamps.js
```

To standardize all timestamp columns across the database (converting any `created_at`/`updated_at` to `createdat`/`updatedat`):

```bash
node src/scripts/standardizeTimestampColumns.js
```

#### Timestamp Database Triggers

For a permanent solution to missing timestamp issues, you can set up database triggers. This will automatically set `created_at` and `updated_at` values for all new and updated records.

1. Navigate to your Supabase dashboard
2. Open the SQL Editor
3. Copy the contents of `src/scripts/createTimestampTriggers.sql`
4. Run the SQL script in the editor

Once the triggers are set up, all new records will automatically have their timestamp fields populated.

#### Setting Up Required Tables

If you encounter errors about missing tables such as `notifications`, you can create them using the provided SQL scripts:

```bash
# Navigate to your Supabase dashboard
# Open the SQL Editor
# Copy the contents of one of these scripts:
src/scripts/createNotificationsTable.sql
# Run the SQL script in the editor
```

Once the required tables are set up, the application should function normally.

#### Database Setup Script

For a comprehensive solution to set up all required database tables and triggers, run the database setup script:

```bash
# Navigate to the project directory
cd khrentals

# Run the script using Node
node src/scripts/setupDatabase.js
```

This script will:
1. Check if each required table exists
2. Create missing tables using the corresponding SQL scripts
3. Set up timestamp triggers for all tables

Note: This script requires that you have the necessary SQL scripts in the `src/scripts` directory and that your Supabase instance has the `exec_sql` RPC function enabled.

#### Enabling the exec_sql RPC Function

Some database utility scripts require the `exec_sql` RPC function to be enabled in your Supabase instance. If you encounter errors related to this function not existing, follow these steps:

1. Navigate to your Supabase dashboard
2. Open the SQL Editor
3. Copy the contents of `src/scripts/enableExecSql.sql`
4. Run the SQL script in the editor

Note: This function allows executing arbitrary SQL commands, so it should be used with caution in production environments.

#### Recreating Notifications Table

If you encounter errors related to the notifications table, you can run the following script:

```bash
node src/scripts/recreateNotificationsTable.js
```

This script will drop the existing notifications table (if any) and recreate it with the correct schema.

The actual schema for the notifications table is:
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE
);
```

2. For other tables, use the database setup script:
```bash
node src/scripts/setupDatabase.js
```

#### Syntax Errors in SQL Scripts

If you encounter errors like:
- `ERROR: 42601: syntax error at or near "BEGIN"`

These are likely related to PostgreSQL version differences or syntax issues in the SQL scripts. The updated scripts should resolve these issues, but if problems persist:

1. Check the specific SQL script mentioned in the error message
2. Ensure all statements in your SQL scripts end with semicolons
3. Run each statement separately in the Supabase SQL Editor to identify the problematic one

## Troubleshooting

### Agreement Form Issues

#### Circular Reference Errors
If you encounter circular reference errors when saving agreements, ensure your data object contains only primitive values:

```javascript
// WRONG ❌
const agreementData = { ...formData }; // May contain DOM elements or circular references

// CORRECT ✅
const agreementData = {}; 
// Manually add only the primitive fields you need
agreementData.propertyid = formData.propertyid;
agreementData.status = status;
// etc.
```

#### Form Submission Issues
If your form buttons trigger unexpected behaviors or default to 'draft' status:

1. Check for form onSubmit handlers that might be intercepting button clicks:
```javascript
// PROBLEMATIC ❌
<form onSubmit={(e) => handleSubmitWithStatus(e, formData.status)}>
  <button>Save for Review</button> <!-- This will trigger form submission -->
</form>

// BETTER ✅
<form> <!-- No onSubmit handler -->
  <button type="button" onClick={handleSaveForReview}>Save for Review</button>
</form>
```

2. Always specify `type="button"` on action buttons within forms:
```javascript
<button type="button" onClick={handleSaveForReview}>Save for Review</button>
```

3. Avoid passing event objects to status-handling functions:
```javascript
// WRONG ❌
handleSubmitWithStatus(event, 'review') // Event is first parameter

// CORRECT ✅
handleSubmitWithStatus('review', false) // Status is first parameter
```

#### Status Not Updating
If agreement status isn't updating when saving:

1. Make sure status values are explicitly passed as strings:
```javascript
// WRONG ❌
handleSubmitWithStatus(event) // Passing an event object instead of a string

// CORRECT ✅
handleSubmitWithStatus('review', false) // Explicitly pass a string value
```

2. Add debug logging to track status values:
```javascript
console.log('Status before save:', status);
console.log('Type of status:', typeof status);
```

3. Ensure button handlers correctly pass status as a string:
```javascript
onClick={() => {
  console.log('Save for Review button clicked');
  handleSubmitWithStatus('review', false);
}}
```

4. Check that the Supabase response contains the expected status:
```javascript
console.log('Saved agreement data from DB:', savedAgreement[0]);
console.log('Saved status:', savedAgreement[0].status);
```

5. For persistent status issues, consider using direct handlers for specific status values:
```javascript
// Create a specialized function for each status
const handleSaveForReview = async () => {
  const agreementData = {
    status: 'review', // Explicitly set and never override
    // Other properties...
  };

  // Save directly to Supabase
  const { data: savedAgreement } = await supabase
    .from('agreements')
    .upsert([agreementData])
    .select();
    
  // Rest of the implementation...
};

// Then use it directly in the button
<button onClick={() => handleSaveForReview()}>Save for Review</button>
```

#### Navigation Issues
If the app doesn't navigate back to the agreements list after submission:

1. Ensure the navigation logic is correctly implemented in the handleSubmitWithStatus function:
```javascript
if (!id || status === 'pending' || status === 'signed') {
  navigate('/agreements');
} else if (status === 'review') {
  navigate(`/agreements/${savedAgreementId}`);
}
```

2. Make sure there are no errors preventing the navigation code from executing by checking the console for errors.

### Common Database Issues

#### Quickest Fix for All Database Issues

To fix all common database issues at once (timestamp fields and app_users table), run:

```bash
npm run run-fixes
```

This will execute the comprehensive fix script that:
1. Updates the `app_users` table to use the correct `associated_property_ids` array structure
2. Standardizes all timestamp columns across the database
3. Ensures all records have proper timestamp values

#### Timestamp Fields
If you only need to fix timestamp issues:

```bash
npm run standardize-timestamps
```

#### App Users Table Issues
If you only need to fix the app_users table:

```bash
npm run fix-app-users
```

#### Error: Cannot find module '../services/supabaseClient'

If you get this error when running scripts, use the npm scripts which have been properly configured:

```bash
npm run run-fixes
```

#### Table or Column Not Found Errors

If you encounter other database structure errors, you may need to run the migration scripts. See the Database Setup section for more details.

## User Invitation System

The application uses Supabase's authentication system with magic links for user invitations. This is a more reliable approach that doesn't require complex server-side functions.

### How It Works

1. When a staff member invites a rentee, the system sends a magic link to their email
2. The rentee clicks the link to create their account
3. The user is redirected to the application to complete registration
4. The user's role information is stored in the user's metadata

### Troubleshooting Invitations

If you encounter issues with user invitations:

1. Check the Supabase logs for any errors
2. Verify that the email service is properly configured in your Supabase project
3. Ensure your Supabase authentication settings allow magic link sign-in
4. Check that the redirect URL is correct for your environment

const profileImage = property.images?.[0] || DEFAULT_IMAGE;

## Maintenance Request Handling

### Common Issues and Solutions

#### 1. Status Value Case Sensitivity
Maintenance request status values are case-sensitive and must match database constraints:
```javascript
// WRONG ❌
status: 'CANCELLED'  // Uppercase causes check constraint violation

// CORRECT ✅
status: 'cancelled'  // Lowercase matches database constraint
```

Valid status values:
- 'pending'
- 'in_progress'
- 'completed'
- 'cancelled'

#### 2. Row Level Security (RLS) Policies
Maintenance requests have specific RLS policies that must be properly configured:

```sql
-- Correct RLS Policy Structure
CREATE POLICY "maintenance_update_policy" ON maintenance_requests
FOR UPDATE TO authenticated
USING (
    -- Allow if user is the rentee who owns the request
    renteeid = (
        SELECT id FROM app_users WHERE auth_id = auth.uid()
    )
    -- OR if user is a staff member
    OR EXISTS (
        SELECT 1 FROM app_users 
        WHERE auth_id = auth.uid() 
        AND role = 'staff'
    )
)
WITH CHECK (
    -- Same conditions for the check
    renteeid = (
        SELECT id FROM app_users WHERE auth_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM app_users 
        WHERE auth_id = auth.uid() 
        AND role = 'staff'
    )
);
```

Key points:
- Use `WITH CHECK` clause to ensure conditions apply during updates
- Use `=` instead of `IN` for single value comparisons
- Test policies with both rentee and staff roles

#### 3. Error Handling
Implement proper error handling for maintenance requests:

```javascript
try {
    // Maintenance request operations
} catch (error) {
    console.error('Error details:', error);
    
    // Handle specific error codes
    if (error.code === '23514') {
        return { 
            success: false, 
            error: 'Invalid status value. Please use lowercase status values.' 
        };
    }
    
    return { 
        success: false, 
        error: error.message || 'Failed to process maintenance request' 
    };
}
```

#### 4. Debugging Best Practices
Add these logs in critical functions:
```javascript
// User context
console.log('Current user data:', userData);
console.log('Request renteeid:', currentRequest.renteeid);

// Operation data
console.log('Updating request with data:', updateFields);
console.log('Updated request state:', updatedRequest);
```

### Testing Checklist
Before deploying maintenance request changes:
- [ ] Test with both rentee and staff roles
- [ ] Verify status values match database constraints
- [ ] Check RLS policies are properly configured
- [ ] Ensure error messages are user-friendly
- [ ] Verify logging provides enough context for debugging

### Constants
Use the maintenance status constants from `src/constants/maintenance.js`:
```javascript
import { MAINTENANCE_STATUS } from '../constants/maintenance';

// Use constants instead of string literals
status: MAINTENANCE_STATUS.CANCELLED
```

### Best Practices
1. Always use status constants instead of string literals
2. Test RLS policies with both rentee and staff roles
3. Include detailed logging for debugging
4. Handle specific error codes appropriately
5. Keep status values in sync with database constraints
6. Document all valid values and constraints
7. Follow database column naming conventions in queries:
   ```javascript
   // WRONG ❌
   .select('property_type, created_at')  // Using underscores

   // CORRECT ✅
   .select('propertytype, createdat')    // No underscores, all lowercase
   ```

### Common Error Codes
- `23514`: Check constraint violation (usually invalid status value)
- `42501`: Permission denied (RLS policy violation)
- `42P01`: Undefined table (database connection issue)
- `42703`: Column does not exist (usually due to incorrect column names or underscores)


we need to upload images for number of reasons
1. properties - the images of the property (images\properties)
2. maintenance - images of issues reported, images of work completion etc (images\maintenance)
3. utility reading - images of utility reading (images\utility-readings)
4. user (rentee 's) - national id copy (files\id-copies)
5. rent agreement - rental agreement (file\agreements)
6. documents - any other documents (file\documents)
7. payments - any payment proofs (file\payment-proofs)

## Agreement Workflow

The application supports a streamlined agreement workflow:

### Agreement Statuses
- **Draft**: Initial status when creating an agreement
- **Review**: Agreement is ready for internal team review
- **Pending**: Agreement has been sent for signature
- **Signed**: Agreement has been signed by all parties

### PDF Generation Process
PDF generation is automatically triggered when:
1. An agreement status is changed to 'review' or 'pending'
2. The "Generate PDF" button is clicked

```javascript
// Automatic PDF generation based on status
if (status === 'review' || status === 'pending') {
  await handlePdfGenerationAndSignature(agreementId);
}
```

### Common PDF Generation Issues
- **Empty or Missing Content**: Ensure the agreement has complete template content
- **Storage Errors**: Check Supabase storage permissions and bucket configuration
- **Conversion Errors**: Monitor console for detailed error messages during conversion

### Best Practices for Agreement Handlers
1. Always use explicit string status values:
   ```javascript
   handleSubmitWithStatus('review', false); // Not event objects
   ```

2. Implement proper error handling:
   ```javascript
   try {
     // PDF generation code
   } catch (error) {
     console.error('PDF generation error:', error);
     toast.error('Failed to generate PDF: ' + error.message);
   }
   ```

3. Return success/failure values from key functions:
   ```javascript
   // Return boolean to indicate success/failure
   return pdfUrl ? true : false;
   ```

## Troubleshooting

## GitHub and Azure Deployment Guide

This guide walks you through setting up both the main application and webhook server for deployment to Azure.

### Prerequisites

- GitHub account with access to the KH Rentals repository
- Azure account with subscription
- Node.js 22 installed locally
- Azure CLI installed (optional, for local testing)

### Azure Resources Required

1. **Azure Static Web App** - For the main React application
2. **Azure App Service** - For the webhook server
3. **Azure Monitor** (recommended) - For logging and monitoring

### GitHub Repository Setup

1. Clone the repository locally:
   ```bash
   git clone https://github.com/yourusername/khrental.git
   cd khrental
   ```

2. Configure GitHub secrets:
   - Go to your GitHub repository > Settings > Secrets and Variables > Actions
   - Add the following secrets:
     - `VITE_SUPABASE_URL` - Your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` - Supabase anon key for client-side access
     - `SUPABASE_SERVICE_KEY` - Supabase service key for webhook server
     - `VITE_EVIA_WEBHOOK_URL` - Webhook server URL (will be your Azure App Service URL)
     - `AZURE_STATIC_WEB_APPS_API_TOKEN` - From Azure Static Web App deployment
     - `WEBHOOK_PUBLISH_PROFILE` - From Azure App Service deployment settings

### Main Application Deployment (Static Web App)

1. In Azure Portal, create a new Static Web App
2. Link it to your GitHub repository
3. Configure build settings:
   - Build Preset: `Vite`
   - App location: `/`
   - API location: `api`
   - Output location: `dist`
   - Build command: `npm run build`

4. After deployment, copy the deployment token and add it as the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret in GitHub.

### Webhook Server Deployment (App Service)

1. In Azure Portal, create a new App Service:
   - Runtime stack: Node.js 22
   - Operating System: Linux
   - Region: Same as your Static Web App for best performance

2. Configure deployment settings:
   - Go to Deployment Center
   - Choose GitHub as the source
   - Configure Continuous Deployment
   
3. Configure App Service settings:
   - Go to Configuration > Application settings
   - Add the following settings:
     - `PORT`: 8080
     - `SUPABASE_URL`: Your Supabase URL
     - `SUPABASE_SERVICE_KEY`: Your Supabase service key
     - `EVIA_SIGN_WEBHOOK_URL`: Your webhook endpoint (https://your-app-name.azurewebsites.net/webhook/evia-sign)

4. Configure startup command:
   - Go to Configuration > General settings
   - Set startup command: `cd webhook-server && node server.js`

5. Get the publish profile by clicking "Get Publish Profile" in the App Service Overview
   - Add this as the `WEBHOOK_PUBLISH_PROFILE` secret in GitHub

### Continuous Deployment

The repository includes two GitHub Actions workflows:

1. `.github/workflows/main-app-deploy.yml` - Deploys the main application
2. `.github/workflows/webhook-deploy.yml` - Deploys the webhook server

These workflows run automatically when changes are pushed to the main branch.

### Testing the Deployment

1. Main application:
   - Visit your Static Web App URL
   - Login and verify that all features work correctly

2. Webhook server:
   - Visit your App Service URL + `/status` endpoint
   - Should display a status page confirming the webhook server is running

3. Integration test:
   - Create a new agreement
   - Test the digital signature process
   - Verify that webhook events are processed correctly

### Troubleshooting

If you encounter issues with the deployment:

1. Check GitHub Actions logs for any build or deployment errors
2. Verify that all GitHub secrets are correctly set
3. Check Azure App Service logs in the Azure Portal
4. For webhook issues, check the logs in both Azure and Supabase

### Additional Resources

- [Azure Static Web Apps Documentation](https://docs.microsoft.com/en-us/azure/static-web-apps/)
- [Azure App Service Documentation](https://docs.microsoft.com/en-us/azure/app-service/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Supabase Documentation](https://supabase.io/docs)
