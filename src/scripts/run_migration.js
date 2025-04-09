#!/usr/bin/env node

/**
 * Migration execution script for KH Rentals
 * Run with: node src/scripts/run_migration.js
 */

console.log('Starting migration process...');
console.log('Loading rentee-property association functions');

// Load the migration files
import('./migrate_property_associations.js')
  .then(() => {
    console.log('Migration completed successfully.');
  })
  .catch((error) => {
    console.error('Error during migration:', error);
    process.exit(1);
  }); 