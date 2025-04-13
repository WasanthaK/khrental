# API Structure

## Webhook Implementation

The webhook system has been refactored to follow a more organized and simplified structure:

### Core Implementation

- `src/api/evia-sign/webhookHandler.js` - Contains the core implementation of webhook handling logic
- `src/api/evia-sign/index.js` - Exports the webhook handlers as part of the evia-sign module

### API Routes

- `src/api/routes/index.js` - Contains all route handlers including the webhook handler

### NextJS API Route

- `src/pages/api/evia-webhook.js` - NextJS API route that receives Evia Sign webhook requests

## Import Structure

All components should now import from the centralized index files rather than directly from implementation files:

```js
// Correct imports for webhook handlers
import { webhookRequestHandler } from '../api/evia-sign';
import { handleWebhookRequest } from '../api/routes';

// Avoid direct imports from implementation files
// Don't do this:
import { webhookRequestHandler } from '../api/evia-sign/webhookHandler';
```

## Code Organization Principles

The refactoring follows these key principles:

1. **Single Source of Truth**: Each function is implemented in only one place
2. **Centralized Exports**: All exports are centralized in index files
3. **Clear Responsibilities**: 
   - Core implementation: `webhookHandler.js`
   - API route handling: `routes/index.js`
   - NextJS entry point: `pages/api/evia-webhook.js`

This structure ensures that:

1. There's a single source of truth for each component
2. Implementation details can change without affecting consuming code
3. Dependencies are clearly expressed through the index files
4. Code is not duplicated across the application 