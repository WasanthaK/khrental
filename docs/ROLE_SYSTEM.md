# Role System Documentation

## Overview

This application uses a dual role system architecture to manage permissions and access control. Understanding how these systems interact is crucial for maintaining and extending the application.

## Role Systems

### 1. String-Based Roles (`USER_ROLES`)

Located in `src/utils/constants.js`, these are simple string constants used for:

- Setting and comparing user roles in the database
- Direct string comparisons in components
- UI display and presentation

Example:
```javascript
import { USER_ROLES } from '../utils/constants';

// Setting a role
user.role = USER_ROLES.ADMIN; // 'admin'

// Checking a role
if (user.role === USER_ROLES.ADMIN) {
  // Admin-specific logic
}
```

### 2. Object-Based Roles (`ROLES`)

Located in `src/utils/permissions.jsx`, these are complex objects containing permission definitions:

- Each role object contains a list of permissions
- Used for permission-based authorization
- Not meant for direct role comparison

Example:
```javascript
import { ROLES, hasPermission } from '../utils/permissions';

// Check if user has a specific permission
if (hasPermission(user, 'view_admin_tools')) {
  // Show admin tools
}
```

## Best Practices

### 1. Route Protection

Always use string role values with `ProtectedRoute`:

```jsx
// CORRECT
<ProtectedRoute requiredRoles={['admin']}>
  <AdminComponent />
</ProtectedRoute>

// INCORRECT - DO NOT DO THIS
<ProtectedRoute requiredRoles={[ROLES.ADMIN]}>
  <AdminComponent />
</ProtectedRoute>
```

### 2. Permission Checking

Use the helper functions for permission checks:

```jsx
// Check if user has a specific permission
if (hasPermission(user, PERMISSIONS.VIEW_ADMIN_TOOLS)) {
  // Show admin tools
}

// Check if user has any of these permissions
if (hasAnyPermission(user, [PERMISSIONS.EDIT_INVOICE, PERMISSIONS.CREATE_INVOICE])) {
  // Allow invoice actions
}

// Check if user has all of these permissions
if (hasAllPermissions(user, [PERMISSIONS.VIEW_PROPERTIES, PERMISSIONS.EDIT_PROPERTY])) {
  // Allow property management
}
```

### 3. Role Comparisons

For direct role comparisons in components, use string values from `USER_ROLES`:

```jsx
// CORRECT
if (user.role === USER_ROLES.ADMIN) {
  // Admin-specific UI
}

// INCORRECT - DO NOT DO THIS
if (user.role === ROLES.ADMIN) {
  // This will never match!
}
```

## Common Pitfalls

1. **Type Mismatch**: Never compare a string role with an object role
2. **Case Sensitivity**: Role strings can be case-sensitive, use the helper functions
3. **Dual Import**: Be clear which role system you're using in each context

## Recent Fixes

The codebase had issues with role checking due to type mismatches between:
- `user.role` (string value like "admin")
- `ROLES.ADMIN` (object with permissions)

We implemented these fixes:
1. Added `roleMatches()` helper function to standardize comparison
2. Updated `ProtectedRoute` to handle both string and object role values
3. Added `getRoleKey()` and `normalizeRoleString()` helper functions
4. Updated all routes to use string role values
5. Added documentation to clarify usage

## Adding New Roles

When adding a new role to the system:

1. Add the string value to `USER_ROLES` in `constants.js`
2. Add the role object with permissions to `ROLES` in `permissions.jsx`
3. Ensure the key name in `ROLES` matches the uppercase version of the string value
4. Update tests and documentation

## Testing Role Access

To verify role-based access is working correctly:
1. Log in as different user types
2. Attempt to access routes with different permission requirements
3. Check for proper redirection to unauthorized page when needed 