# KH Rentals Project Rules

## Core Principles
- NEVER create functionality that wasn't requested
- NEVER introduce libraries not already in the project
- ONLY fix SPECIFIC errors with MINIMAL changes
- ALWAYS check if a file exists before creating it
- SECURITY, USER EXPERIENCE, and DURABILITY are mandatory design constraints for authentication and account lifecycle work
- READ `docs/AUTHENTICATION-LIFECYCLE.md` and `docs/EXECUTION-PLAN.md` before changing authentication, invitations, user creation, memberships, session handling, password flows, onboarding, or auth-related routing

## Authentication and Account Lifecycle
- One global `app_users` identity per email is canonical; organization access belongs in `tenant_memberships`
- Every credential lifecycle transition MUST have exactly one UI owner and one backend authority
- `/accept-invite` and `/reset-password` are isolated credential-flow routes and MUST NOT run the normal authenticated application shell, tenant initialization, navigation registration, storage initialization, or generic onboarding guides
- Route isolation and anonymity are different concepts: password recovery is anonymous; invitation redemption may inspect only a server-valid existing session to preserve a different signed-in user
- `AcceptInvite` is the sole UI owner of invited-account credential setup; `WelcomeGuide` MUST NOT infer invitation state from URL tokens
- `WelcomeGuide` may change a password only for an already-authenticated account explicitly marked `force_password_change`
- Invitation redemption MUST create/link auth state transactionally, verify the persisted credential with the normal sign-in verifier, and fail closed if verification cannot be proven
- NEVER perform a redundant second password login after successful invitation redemption; use the server-issued redemption session
- `Registered` means login-capable account access is proven, not merely `accepted_at`, `app_users.auth_id`, or the presence of an auth row
- Partial/claimed accounts that cannot prove access MUST surface as `Setup Incomplete / Account Recovery Required`
- NEVER resend an invitation if doing so could overwrite an existing global credential or create account-takeover risk
- Browser-local session state is never proof of authentication; validate server-side when session validity affects a security decision
- Invitation tokens, reset tokens, passwords, credential hashes/salts, email bodies and secrets MUST NOT be logged
- Authentication changes require automated regression coverage plus physical browser acceptance before the active execution-plan item can close

## Document Generation
- ALL document generation is handled by Evia Sign API, not local code
- DO NOT implement PDF generation - Evia Sign handles documents
- Document tokens from Evia Sign are used to track documents

## Import Path Rules
- Always use correct case in imports (e.g., `DocumentService.js` not `documentService.js`)
- Always reference `services` from the proper location (src/services/)
- Do not create duplicate service files in different locations

## File Structure
- The shared platform client lives in src/services/platformClient.js
- Service files should be in src/services/
- Do not nest directories (no src/src/)
- Do not create backup files (.bak) in the codebase

## Previous Mistakes to Avoid
- Adding PDF generation when Evia handles documents
- Creating duplicate files in different locations
- Changing case in import paths
- Making assumptions about project requirements
- Creating nested directory structures
- Allowing legacy onboarding UI and secure invitation UI to compete for the same credential transition
- Treating invitation acceptance or auth linkage as equivalent to verified login-capable registration

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
