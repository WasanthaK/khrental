# KH Rentals Project Rules

## Core Principles
- NEVER create functionality that wasn't requested
- NEVER introduce libraries not already in the project
- ONLY fix SPECIFIC errors with MINIMAL changes
- ALWAYS check if a file exists before creating it

## Document Generation
- ALL document generation is handled by Evia Sign API, not local code
- DO NOT implement PDF generation - Evia Sign handles documents
- Document tokens from Evia Sign are used to track documents

## Import Path Rules
- Always use correct case in imports (e.g., `DocumentService.js` not `documentService.js`)
- Always reference `services` from the proper location (src/services/)
- Do not create duplicate service files in different locations

## File Structure
- The supabaseClient is ONLY in src/services/supabaseClient.js
- Service files should be in src/services/
- Do not nest directories (no src/src/)
- Do not create backup files (.bak) in the codebase

## Previous Mistakes to Avoid
- Adding PDF generation when Evia handles documents
- Creating duplicate files in different locations
- Changing case in import paths
- Making assumptions about project requirements
- Creating nested directory structures

## Integration with Evia Sign
- Use the Evia Sign API as documented in src/docs/evia-sign-api-docs.md
- The document signing flow uses Evia's platform, not local generation
- For sending documents, follow the Evia Sign callback protocol

## Linting Standards for Imports
- ALWAYS verify file existence before writing import statements
- ALWAYS check correct casing with `ls -la src/services/` before import
- DO NOT create new service files - use existing ones or ask if needed
- NEVER change import paths without verifying the destination exists
- USE `import { function } from '../../services/ServiceName';` pattern consistently
- CHECK exported function names exactly - don't assume function names
- DOUBLE-CHECK upper/lowercase in all imports (particularly DocumentService vs documentService)

## React and JSX Standards
- ALWAYS close JSX tags properly
- USE consistent indentation in JSX
- AVOID lengthy inline styles - use classes instead
- USE unique 'key' props in lists
- DESTRUCTURE props at the component top level
- PROPERLY handle form submissions with preventDefault()

## Variable Naming Conventions
- React components use PascalCase (MyComponent)
- Variables and functions use camelCase (myVariable)
- Constants use UPPER_SNAKE_CASE (MY_CONSTANT)
- File names should match their default export name

## Service Function Standards
- CHECK before destructuring objects (const { prop } = obj || {})
- HANDLE errors consistently in async functions with try/catch
- RETURN early from functions when validating inputs
- DO NOT mutate function arguments directly

## Sourcery-Recommended Code Standards
- ALWAYS use block braces for conditionals (if, while, for, etc.), even for single-line bodies
- PREFER object destructuring when accessing multiple properties (const { prop1, prop2 } = obj)
- INLINE variables that are immediately returned rather than declaring them separately
- USE function parameters directly instead of creating intermediate variables
- EXTRACT repeated code into reusable helper functions
- AVOID duplicating logic in conditional branches
- USE optional chaining (?.) for nested property access
- COMBINE related state variables using objects

REFER TO THESE RULES BEFORE MAKING ANY CHANGES 