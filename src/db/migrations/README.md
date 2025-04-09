# Database Migrations

This directory contains SQL migrations for the KH Rentals application. These scripts should be run in the specified order to update the database schema and fix any issues.

## How to Run Migrations

You can run the SQL migrations in one of two ways:

### 1. Using the Supabase Dashboard

1. Log into your Supabase project dashboard
2. Navigate to the SQL Editor section
3. Create a new query
4. Copy the contents of the migration file you want to run
5. Execute the query

### 2. Using the Supabase CLI

If you have the Supabase CLI installed, you can run:

```bash
supabase db execute -f path/to/migration/file.sql
```

## Current Migrations

### 1. Fix Utility Reading Rejection (202309015_fix_rejection_constraints.sql)

**Purpose:** Fixes issues with rejecting utility readings by:
- Updating database constraints for `utility_readings.billing_status`
- Adding additional validation and error handling
- Creating a stored procedure for reliable rejections
- Fixing inconsistent data

**When to run this:** If you're experiencing issues with rejecting readings, particularly with errors related to constraints or when the rejection doesn't properly update the status.

**How to run:**
```bash
# Via CLI
supabase db execute -f src/db/sql/migrations/202309015_fix_rejection_constraints.sql

# Or copy the contents into the Supabase SQL Editor
```

**Verification:** After running the migration, try rejecting a reading. You should see:
1. The reading's status changes to "Rejected"
2. The reading appears in the "Rejected" filter section 
3. No constraint violation errors appear in the console

## Troubleshooting

If you encounter issues running migrations:

1. **Permission errors**: Make sure you're using an account with the necessary permissions.
2. **Syntax errors**: Some SQL syntax might vary between Postgres versions. If you get syntax errors, check for version-specific commands.
3. **Constraint errors**: If you see constraint violation errors, check for existing data that might violate new constraints.

For persistent issues, you can:
1. Run just the constraint update parts of the scripts
2. Check the database logs for detailed error messages
3. Use the fallback client-side implementation which tries multiple approaches to update records 