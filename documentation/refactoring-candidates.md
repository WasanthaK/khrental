# Refactoring Candidates

This document identifies modules and components that are candidates for refactoring, based on code analysis and architecture review.

## 1. Webhook Implementation

### Current Status

The application currently has multiple webhook implementations:

1. **Standalone Express Server (`api-server.js`)**
   - Implements `/api/evia-webhook` endpoint
   - Stores webhook events in the database
   - Updates agreement statuses

2. **Dedicated Azure Webhook Server**
   - Running at `kh-reantals-webhook.azurewebsites.net`
   - Handles Evia Sign callbacks
   - Updates the database based on webhook events

### Problems

- Duplicate functionality between the standalone server and Azure webhook server
- Inconsistent webhook URL references in the codebase
- Multiple webhook documentation files with overlapping information
- Potential confusion about which webhook handler is active

### Refactoring Recommendation

- Remove `api-server.js` if the Azure webhook server is the primary webhook handler
- Update all webhook URL references to point to the Azure webhook server
- Consolidate webhook documentation into a single guide
- Ensure database triggers for webhook processing are consistent

## 2. Document Processing Services

### Current Status

The application has two overlapping services for document processing:

1. **`DocumentService.js`** (49KB, 1574 lines)
   - Handles document generation
   - Processes HTML content
   - Creates DOCX files

2. **`eviaSignService.js`** (48KB, 1331 lines)
   - Manages document signing
   - Also handles some document generation
   - Interacts with Evia Sign API

### Problems

- Both services are extremely large (over 1000 lines each)
- Overlapping functionality for document processing
- High coupling between services
- Difficult to maintain and test

### Refactoring Recommendation

- Split `DocumentService.js` into smaller, focused modules:
  - `DocumentGenerator.js` - For creating documents
  - `DocumentConverter.js` - For format conversion (HTML to DOCX)
  - `DocumentStorage.js` - For saving and retrieving documents

- Split `eviaSignService.js` into smaller modules:
  - `EviaAuthService.js` - For authentication with Evia
  - `EviaDocumentService.js` - For document operations
  - `EviaWebhookService.js` - For webhook handling

- Create clear interfaces between these services
- Reduce duplication of functionality

## 3. Testing Files

### Current Status

There are several testing files in the production codebase:

1. **`fileUploadTest.js`** (9.4KB, 281 lines)
2. **`FileUploadTest.jsx`** (30KB, 804 lines)
3. Various test scripts in the `/scripts` directory

### Problems

- Test files mixed with production code
- Large test components in the main codebase
- No clear separation between tests and production features

### Refactoring Recommendation

- Move all test files to a dedicated `/tests` or `/test-utils` directory
- Remove test components from production builds
- Consider implementing a proper testing framework (Jest, Vitest)
- Create focused unit tests instead of large test files

## 4. Authentication Flow

### Current Status

The authentication flow is implemented across multiple files:

1. **`useAuth.jsx`** - Authentication hook
2. **`supabaseClient.js`** - Supabase authentication
3. **Various auth pages** - Login, Register, etc.

### Problems

- Very complex authentication state management
- Mix of authentication logic and UI components
- Redundant auth state checks in multiple places
- Limited error handling for auth edge cases

### Refactoring Recommendation

- Simplify the authentication flow
- Create a clear separation between auth logic and UI
- Implement better error handling for auth failures
- Consider implementing auth state persistence more efficiently

## 5. CSS and Styling

### Current Status

The application uses a mix of styling approaches:

1. TailwindCSS for utility classes
2. Bootstrap components with their own styling
3. Custom CSS in separate files
4. Inline styles in some components

### Problems

- Inconsistent styling approach across the application
- Potential conflicts between TailwindCSS and Bootstrap
- Mix of class-based and inline styling
- Difficult to maintain consistent UI

### Refactoring Recommendation

- Standardize on a single styling approach (preferably TailwindCSS)
- Create a component library with consistent styling
- Establish design tokens for colors, spacing, typography
- Remove Bootstrap dependency if possible to avoid conflicts

## 6. Service Initialization

### Current Status

Services are initialized in different ways:

1. Some services use singleton pattern
2. Others are imported and used directly
3. Some are initialized through context providers

### Problems

- Inconsistent service initialization
- Difficult to mock services for testing
- Potential for hard-to-trace bugs due to singleton state

### Refactoring Recommendation

- Standardize service initialization
- Consider dependency injection pattern
- Create service interfaces for better testing
- Use context providers consistently for service access

## 7. Error Handling

### Current Status

Error handling is implemented inconsistently:

1. Some components use try/catch blocks
2. Others rely on error props
3. Global error state in some parts
4. Toast notifications in others

### Problems

- Inconsistent error handling approach
- User-facing errors mixed with technical details
- Multiple ways to display errors
- Some errors not properly handled

### Refactoring Recommendation

- Implement a consistent error handling strategy
- Create a central error management service
- Separate technical errors from user-facing messages
- Add better logging for debugging

## 8. Environmental Configuration

### Current Status

Environment configuration is managed in multiple ways:

1. `.env` files for development
2. `env-config.js` for production
3. Azure App Service settings
4. Hardcoded fallbacks in some services

### Problems

- Inconsistent access to environment variables
- Potential for environment-specific bugs
- Security concerns with exposed configuration
- Difficult to manage across environments

### Refactoring Recommendation

- Standardize environment configuration access
- Create a central configuration service
- Implement proper environment-specific builds
- Improve security for sensitive configuration

## Conclusion

The application has a solid foundation but would benefit from these refactoring efforts to improve maintainability, testability, and developer experience. Priority should be given to the webhook consolidation and document service refactoring as these appear to be the most pressing issues based on code analysis. 