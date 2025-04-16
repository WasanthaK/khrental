# Markdown Files to Consolidate

The following markdown files should be moved to the /documentation directory:

## Root Directory
- README.md (copy, don't move the original)
- database.md
- eviadocs.md
- PROJECT_RULES.md
- azure-setup-guide.md
- azure-deployment-checklist.md

## Source Directory
- src/README_PROPERTY_ASSOCIATIONS.md
- src/MIGRATION_GUIDE.md
- src/api/README.md
- src/services/README.md

## Documentation Directory
- docs/manual-webhook-deployment.md
- docs/setup-evia-webhook.md
- docs/webhook-implementation-guide.md
- docs/webhook-setup.md
- docs/evia-webhook-workflow.md
- docs/fix-webhook-events-table.md
- docs/invoicemanagement.md
- docs/evia-webhook-integration.md
- docs/evia-webhook-setup.md
- docs/evia-webhook-solution.md

## Other Documentation
- src/docs/evia-sign-api-docs.md (if it exists)

# Next Steps for Documentation Consolidation

1. Move all these files to the /documentation directory
2. Consider renaming files for better organization, for example:
   - `api-reference.md` for API documentation
   - `database-schema.md` for database.md
   - `evia-sign-integration.md` for eviadocs.md
   - `project-rules.md` for PROJECT_RULES.md
   - `azure-deployment.md` to combine the Azure guides

3. Update references between documents to point to the new locations
4. Update the main README.md to point to the /documentation directory

# Recommended Documentation Structure

- /documentation
  - README.md (main overview)
  - guides/
    - deployment-guide.md
    - development-guide.md
    - webhook-integration.md
  - reference/
    - api-reference.md
    - database-schema.md
  - architecture/
    - system-overview.md
    - component-structure.md 