#!/bin/bash
# Script to move markdown files to the documentation directory

# Create documentation subdirectories if they don't exist
mkdir -p documentation/guides
mkdir -p documentation/reference
mkdir -p documentation/architecture
mkdir -p documentation/api

# Copy the root README.md (don't move it)
cp README.md documentation/original-readme.md

# Move markdown files from root directory
mv database.md documentation/reference/database-schema.md
mv eviadocs.md documentation/reference/evia-sign-integration.md
mv PROJECT_RULES.md documentation/project-rules.md
mv azure-setup-guide.md documentation/guides/azure-setup-guide.md
mv azure-deployment-checklist.md documentation/guides/azure-deployment-checklist.md

# Move markdown files from src directory
mv src/README_PROPERTY_ASSOCIATIONS.md documentation/reference/property-associations.md
mv src/MIGRATION_GUIDE.md documentation/guides/migration-guide.md
mv src/api/README.md documentation/api/api-overview.md
mv src/services/README.md documentation/reference/services-overview.md

# Move markdown files from docs directory
mv docs/manual-webhook-deployment.md documentation/guides/manual-webhook-deployment.md
mv docs/setup-evia-webhook.md documentation/guides/setup-evia-webhook.md
mv docs/webhook-implementation-guide.md documentation/guides/webhook-implementation-guide.md
mv docs/webhook-setup.md documentation/guides/webhook-setup.md
mv docs/evia-webhook-workflow.md documentation/guides/evia-webhook-workflow.md
mv docs/fix-webhook-events-table.md documentation/guides/fix-webhook-events-table.md
mv docs/invoicemanagement.md documentation/reference/invoice-management.md
mv docs/evia-webhook-integration.md documentation/guides/evia-webhook-integration.md
mv docs/evia-webhook-setup.md documentation/guides/evia-webhook-setup.md
mv docs/evia-webhook-solution.md documentation/guides/evia-webhook-solution.md

# Move markdown files from src/docs directory (if it exists)
if [ -f src/docs/evia-sign-api-docs.md ]; then
  mv src/docs/evia-sign-api-docs.md documentation/api/evia-sign-api-docs.md
fi

echo "Documentation files have been moved to the documentation directory."
echo "Remember to update any references to these files in the codebase." 