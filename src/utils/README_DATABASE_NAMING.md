# Database Naming Conventions and Utility Functions

## Naming Conventions

In the KH Rentals application, we follow these naming conventions:

1. **Database Tables and Columns**: All table and column names in the database use lowercase names (e.g., `team_members`, `createdat`).

2. **JavaScript Variables**: In JavaScript code, we use camelCase for variable names (e.g., `teamMembers`, `createdAt`).

## Utility Functions

To help with the conversion between these naming conventions, we've created utility functions in `src/utils/databaseUtils.js`:

### toDatabaseFormat

Converts camelCase keys to lowercase for database operations:

```javascript
import { toDatabaseFormat } from '../utils/databaseUtils';

// Example usage
const userData = {
  firstName: 'John',
  lastName: 'Doe',
  emailAddress: 'john.doe@example.com'
};

const dbData = toDatabaseFormat(userData);
// Result: { firstname: 'John', lastname: 'Doe', emailaddress: 'john.doe@example.com' }
```

### fromDatabaseFormat

Converts database lowercase keys to camelCase for frontend use:

```javascript
import { fromDatabaseFormat } from '../utils/databaseUtils';

// Example usage
const dbData = {
  firstname: 'John',
  lastname: 'Doe',
  emailaddress: 'john.doe@example.com'
};

const userData = fromDatabaseFormat(dbData);
// Result: { firstName: 'John', lastName: 'Doe', emailAddress: 'john.doe@example.com' }
```

## Best Practices

1. **Always use the utility functions** when sending data to or receiving data from the database.

2. **Use camelCase in your React components and JavaScript code** for consistency with JavaScript conventions.

3. **Use lowercase in your SQL queries and database operations** for consistency with the database schema.

4. **When creating new database tables or columns**, follow the lowercase naming convention.

5. **When adding new service functions**, make sure to use the utility functions to handle the conversion between naming conventions.

## Example Service Function

Here's an example of a service function that follows these best practices:

```javascript
import { supabase } from './supabaseClient';
import { toDatabaseFormat, fromDatabaseFormat } from '../utils/databaseUtils';

export const createItem = async (itemData) => {
  try {
    // Convert camelCase keys to lowercase for database
    const dbData = toDatabaseFormat(itemData);
    
    // Add timestamps
    dbData.createdat = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('items')
      .insert(dbData)
      .select()
      .single();
    
    if (error) throw error;
    
    // Convert database format back to camelCase for frontend
    return {
      success: true,
      data: fromDatabaseFormat(data),
      error: null
    };
  } catch (error) {
    console.error('Error creating item:', error.message);
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
};
```

By following these conventions and using the utility functions, we ensure consistency across the application and prevent errors related to field name mismatches. 