// User roles
export const USER_ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  MANAGER: 'manager',
  MAINTENANCE: 'maintenance',
  FINANCE_STAFF: 'finance_staff',
  MAINTENANCE_STAFF: 'maintenance_staff',
  SUPERVISOR: 'supervisor',
  RENTEE: 'rentee',
};

// Invoice status
export const INVOICE_STATUS = {
  PENDING: 'pending',
  VERIFICATION_PENDING: 'verification_pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
  REJECTED: 'rejected',
};

// Agreement status
export const AGREEMENT_STATUS = {
  DRAFT: 'draft',
  REVIEW: 'review',
  PENDING: 'pending',
  SIGNED: 'signed',
  EXPIRED: 'expired',
  TERMINATED: 'terminated',
};

// Maintenance task status
export const MAINTENANCE_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// Maintenance task types
export const MAINTENANCE_TYPES = {
  AIR_CONDITIONING: 'air_conditioning',
  PLUMBING: 'plumbing',
  ELECTRICAL: 'electrical',
  CLEANING: 'cleaning',
  GARDENING: 'gardening',
  PEST_CONTROL: 'pest_control',
  EMERGENCY: 'emergency',
  OTHER: 'other',
};

// Camera status
export const CAMERA_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  MAINTENANCE: 'maintenance',
};

// Action types
export const ACTION_TYPES = {
  ADVANCE_CONFIRMATION: 'advanceConfirmation',
  DEPOSIT_COLLECTION: 'depositCollection',
  AGREEMENT_SIGNING: 'agreementSigning',
  ITEM_CHECKLIST: 'itemChecklist',
  PAYMENT_RECEIPT: 'paymentReceipt',
  DAMAGED_SETTLEMENT: 'damagedSettlement',
  TERMINATION: 'termination',
  RENEWAL: 'renewal',
};

// Letter types
export const LETTER_TYPES = {
  TERMINATION: 'termination',
  WARNING: 'warning',
  CONFIRMATION: 'confirmation',
  REPAIR_NOTIFICATION: 'repairNotification',
  GENERAL_NOTIFICATION: 'generalNotification',
};

// Notification channels
export const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
};

// Languages
export const LANGUAGES = {
  ENGLISH: 'English',
  SINHALA: 'Sinhala',
};

// Utility types
export const UTILITY_TYPES = {
  ELECTRICITY: 'electricity',
  WATER: 'water',
};

// Billing types
export const BILLING_TYPES = {
  FIXED: 'fixed',
  METERED: 'metered',
};

// Routes - Primary application routes
export const ROUTES = {
  // Auth and main routes
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  
  // Dashboard routes
  PROPERTIES: '/properties',
  PROPERTY_DETAILS: '/properties/:id',
  RENTEES: '/rentees',
  RENTEE_DETAILS: '/rentees/:id',
  AGREEMENTS: '/agreements',
  AGREEMENT_DETAILS: '/agreements/:id',
  INVOICES: '/invoices',
  INVOICE_DETAILS: '/invoices/:id',
  MAINTENANCE: '/maintenance',
  MAINTENANCE_DETAILS: '/maintenance/:id',
  CAMERAS: '/cameras',
  CAMERA_DETAILS: '/cameras/:id',
  TEAM: '/team',
  TEAM_MEMBER_DETAILS: '/team/:id',
  SETTINGS: '/settings',
  
  // Rentee portal routes - /rentee and /portal are both supported
  RENTEE_PORTAL: '/rentee',
  RENTEE_PROFILE: '/rentee/profile',
  RENTEE_INVOICES: '/rentee/invoices',
  RENTEE_AGREEMENTS: '/rentee/agreements',
  RENTEE_MAINTENANCE: '/rentee/maintenance',
  RENTEE_UTILITIES: '/rentee/utilities',
};

// API endpoints - these match table names in the database
export const API_ENDPOINTS = {
  PROPERTIES: 'properties',
  AGREEMENTS: 'agreements',
  AGREEMENT_TEMPLATES: 'agreement_templates',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  MAINTENANCE: 'maintenance_requests',
  CAMERAS: 'cameras',
  CAMERA_MONITORING: 'camera_monitoring',
  APP_USERS: 'app_users',
  TASK_ASSIGNMENTS: 'task_assignments',
  LETTER_TEMPLATES: 'letter_templates',
  SENT_LETTERS: 'sent_letters',
  UTILITY_READINGS: 'utility_readings',
  UTILITY_CONFIG: 'utility_config',
  ACTION_RECORDS: 'action_records',
  NOTIFICATIONS: 'notifications',
};

// Property types
export const PROPERTY_TYPES = {
  APARTMENT: 'apartment',
  HOUSE: 'house',
  CONDO: 'condo',
  COMMERCIAL: 'commercial',
  LAND: 'land',
};

// Maintenance request priorities
export const MAINTENANCE_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  EMERGENCY: 'emergency',
};

// Add a default image constant
export const DEFAULT_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';

// Note: Storage buckets and folders constants have been moved to fileService.js
// to prevent duplication. Import them from there instead:
// import { STORAGE_BUCKETS, BUCKET_FOLDERS } from '../services/fileService'; 