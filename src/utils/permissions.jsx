// Define permissions
export const PERMISSIONS = {
  // Property permissions
  VIEW_PROPERTIES: 'view_properties',
  CREATE_PROPERTY: 'create_property',
  EDIT_PROPERTY: 'edit_property',
  DELETE_PROPERTY: 'delete_property',
  
  // Rentee permissions
  VIEW_RENTEES: 'view_rentees',
  CREATE_RENTEE: 'create_rentee',
  EDIT_RENTEE: 'edit_rentee',
  DELETE_RENTEE: 'delete_rentee',
  
  // Invoice permissions
  VIEW_INVOICES: 'view_invoices',
  CREATE_INVOICE: 'create_invoice',
  EDIT_INVOICE: 'edit_invoice',
  DELETE_INVOICE: 'delete_invoice',
  
  // Maintenance permissions
  VIEW_MAINTENANCE: 'view_maintenance',
  CREATE_MAINTENANCE: 'create_maintenance',
  EDIT_MAINTENANCE: 'edit_maintenance',
  DELETE_MAINTENANCE: 'delete_maintenance',
  ASSIGN_MAINTENANCE: 'assign_maintenance',
  
  // Agreement permissions
  VIEW_AGREEMENTS: 'view_agreements',
  CREATE_AGREEMENT: 'create_agreement',
  EDIT_AGREEMENT: 'edit_agreement',
  DELETE_AGREEMENT: 'delete_agreement',
  
  // Team permissions
  VIEW_TEAM: 'view_team',
  CREATE_TEAM_MEMBER: 'create_team_member',
  EDIT_TEAM_MEMBER: 'edit_team_member',
  DELETE_TEAM_MEMBER: 'delete_team_member',
  
  // Reports permissions
  VIEW_REPORTS: 'view_reports',
  CREATE_REPORT: 'create_report',
  
  // Admin tools
  VIEW_ADMIN_TOOLS: 'view_admin_tools',
};

// Define roles with their permissions
export const ROLES = {
  ADMIN: {
    name: 'Administrator',
    description: 'Full access to all system features',
    permissions: Object.values(PERMISSIONS), // All permissions
  },
  
  MANAGER: {
    name: 'Property Manager',
    description: 'Manages properties, rentees, and maintenance',
    permissions: [
      // Property permissions
      PERMISSIONS.VIEW_PROPERTIES,
      PERMISSIONS.CREATE_PROPERTY,
      PERMISSIONS.EDIT_PROPERTY,
      
      // Rentee permissions
      PERMISSIONS.VIEW_RENTEES,
      PERMISSIONS.CREATE_RENTEE,
      PERMISSIONS.EDIT_RENTEE,
      
      // Invoice permissions
      PERMISSIONS.VIEW_INVOICES,
      PERMISSIONS.CREATE_INVOICE,
      PERMISSIONS.EDIT_INVOICE,
      
      // Maintenance permissions
      PERMISSIONS.VIEW_MAINTENANCE,
      PERMISSIONS.CREATE_MAINTENANCE,
      PERMISSIONS.EDIT_MAINTENANCE,
      PERMISSIONS.ASSIGN_MAINTENANCE,
      
      // Agreement permissions
      PERMISSIONS.VIEW_AGREEMENTS,
      PERMISSIONS.CREATE_AGREEMENT,
      PERMISSIONS.EDIT_AGREEMENT,
      
      // Team permissions
      PERMISSIONS.VIEW_TEAM,
      
      // Reports permissions
      PERMISSIONS.VIEW_REPORTS,
    ],
  },
  
  MAINTENANCE_STAFF: {
    name: 'Maintenance Staff',
    description: 'Handles maintenance requests',
    permissions: [
      // Property permissions (view only)
      PERMISSIONS.VIEW_PROPERTIES,
      
      // Maintenance permissions
      PERMISSIONS.VIEW_MAINTENANCE,
      PERMISSIONS.EDIT_MAINTENANCE,
    ],
  },
  
  FINANCE_STAFF: {
    name: 'Finance Staff',
    description: 'Handles invoices and payments',
    permissions: [
      // Property permissions (view only)
      PERMISSIONS.VIEW_PROPERTIES,
      
      // Rentee permissions (view only)
      PERMISSIONS.VIEW_RENTEES,
      
      // Invoice permissions
      PERMISSIONS.VIEW_INVOICES,
      PERMISSIONS.CREATE_INVOICE,
      PERMISSIONS.EDIT_INVOICE,
      
      // Reports permissions
      PERMISSIONS.VIEW_REPORTS,
    ],
  },
  
  RENTEE: {
    name: 'Rentee',
    description: 'Tenant who rents a property',
    permissions: [
      // Limited view permissions
      'view_own_invoices',
      'view_own_agreements',
      'view_own_properties',
      'create_maintenance',
      'view_own_maintenance',
    ],
  },
};

// Helper function to check if a user has a specific permission
export const hasPermission = (user, permission) => {
  if (!user) {
    return false;
  }
  
  // Special case: if user has Supabase's default "authenticated" role
  // Allow access to admin-tools so they can link themselves properly
  if (user.role === 'authenticated' && permission === 'view_admin_tools') {
    return true;
  }
  
  if (!user.role) {
    return false;
  }
  
  // Get the role configuration
  const roleConfig = ROLES[user.role.toUpperCase()];
  if (!roleConfig) {
    return false;
  }
  
  // Check if the role has the permission
  return roleConfig.permissions.includes(permission);
};

// Helper function to check if a user has any of the specified permissions
export const hasAnyPermission = (user, permissions) => {
  return permissions.some(permission => hasPermission(user, permission));
};

// Helper function to check if a user has all of the specified permissions
export const hasAllPermissions = (user, permissions) => {
  return permissions.every(permission => hasPermission(user, permission));
};

// Create a higher-order component for permission-based access control
export const withPermission = (WrappedComponent, requiredPermission) => {
  return (props) => {
    const { user } = props;
    
    if (!hasPermission(user, requiredPermission)) {
      return <div>You don't have permission to access this feature.</div>;
    }
    
    return <WrappedComponent {...props} />;
  };
}; 