# Common Mistakes and Solutions

## Database Schema vs. Frontend Format

### Issue
The database uses snake_case or lowercase field names, while the frontend expects camelCase.

### Examples
- Database: `contactdetails` (JSON field) → Frontend: `contactDetails`
- Database: `idcopyurl` → Frontend: `idCopyURL`
- Database: `createdat` → Frontend: `createdAt`

### Solution
Always transform data between database and frontend formats:
```javascript
// When fetching from database to frontend
const transformedData = {
  id: dbData.id,
  name: dbData.name,
  contactDetails: dbData.contactdetails || {},
  idCopyURL: dbData.idcopyurl,
  createdAt: dbData.createdat
};

// When sending from frontend to database
const dbData = {
  name: frontendData.name,
  contactdetails: frontendData.contactDetails,
  idcopyurl: frontendData.idCopyURL,
  createdat: new Date().toISOString()
};
```

## Database Constraints

### Issue
Database tables have constraints that limit allowed values for certain fields.

### Examples
- `team_members_role_check` constraint limits allowed values for the `role` field
- Valid roles appear to be: "staff", "admin", "maintenance", "supervisor"

### Solution
Always check the database schema and constraints before setting field values:
```javascript
// Correct role options
<select name="role">
  <option value="staff">Staff</option>
  <option value="admin">Admin</option>
  <option value="maintenance">Maintenance</option>
  <option value="supervisor">Supervisor</option>
</select>
```

## JSON Fields vs. Direct Fields

### Issue
Some tables use JSON fields to store nested data, while others use direct columns.

### Examples
- `team_members` uses `contactdetails` JSON field
- `rentees` uses `contactdetails` JSON field

### Solution
Check the database schema to determine the correct field structure:
```javascript
// For tables with JSON fields
const data = {
  name: "John Doe",
  contactdetails: {
    email: "john@example.com",
    phone: "123-456-7890"
  }
};

// For tables with direct fields
const data = {
  name: "John Doe",
  email: "john@example.com",
  phone: "123-456-7890"
};
```

## Incorrect Table Names

### Issue
Using incorrect table names in API calls leads to 404 errors or "relation does not exist" errors.

### Examples
- Using `assignments` instead of `task_assignments`
- Using `team_assignment` instead of `task_assignments`

### Solution
Always refer to the database schema to use the correct table names:
```javascript
// Incorrect
const { data, error } = await fetchData({
  table: 'assignments',
  filters: [{ column: 'teammemberid', operator: 'eq', value: id }]
});

// Correct
const { data, error } = await fetchData({
  table: 'task_assignments',
  filters: [{ column: 'teammemberid', operator: 'eq', value: id }]
});
```

## Incorrect URL Paths

### Issue
Using incorrect URL paths in navigation links leads to 404 errors.

### Examples
- Using `/team/edit/${id}` instead of `/dashboard/team/${id}/edit`
- Using `/maintenance/${id}` instead of `/dashboard/maintenance/${id}`

### Solution
Always use consistent URL patterns and include the base path:
```javascript
// Incorrect
<Link to={`/team/edit/${id}`}>Edit</Link>

// Correct
<Link to={`/dashboard/team/${id}/edit`}>Edit</Link>
``` 