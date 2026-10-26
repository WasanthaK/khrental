// User roles
export const USER_ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  MANAGER: 'manager',
  MAINTENANCE: 'maintenance',
  FINANCE_STAFF: 'finance_staff',
  MAINTENANCE_STAFF: 'maintenance_staff',
  SUPERVISOR: 'supervisor',
  // Legacy stored value retained for compatibility. UI terminology is Tenant / Lessee.
  RENTEE: 'rentee',
};

// Invoice status
export const INVOICE_STATUS = {
  DRAFT: 'draft',
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

  // Canonical tenant portal routes.
  TENANT_PORTAL: '/rentee',
  TENANT_PROFILE: '/rentee/profile',
  TENANT_INVOICES: '/rentee/invoices',
  TENANT_AGREEMENTS: '/rentee/agreements',
  TENANT_MAINTENANCE: '/rentee/maintenance',
  TENANT_UTILITIES: '/rentee/utilities',

  // Legacy constant names retained so older components do not break.
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
export const DEFAULT_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';

// Note: Storage buckets and folders constants have been moved to fileService.js
// to prevent duplication. Import them from there instead:
// import { STORAGE_BUCKETS, BUCKET_FOLDERS } from '../services/fileService';

// ISO 3166-1 alpha-2 snapshot from the public-domain IANA tzdb iso3166.tab.
// Property country is independent of the currently supported public markets.
export const PROPERTY_COUNTRIES = Object.freeze([
  {"code": "AD", "name": "Andorra"},
  {"code": "AE", "name": "United Arab Emirates"},
  {"code": "AF", "name": "Afghanistan"},
  {"code": "AG", "name": "Antigua & Barbuda"},
  {"code": "AI", "name": "Anguilla"},
  {"code": "AL", "name": "Albania"},
  {"code": "AM", "name": "Armenia"},
  {"code": "AO", "name": "Angola"},
  {"code": "AQ", "name": "Antarctica"},
  {"code": "AR", "name": "Argentina"},
  {"code": "AS", "name": "Samoa (American)"},
  {"code": "AT", "name": "Austria"},
  {"code": "AU", "name": "Australia"},
  {"code": "AW", "name": "Aruba"},
  {"code": "AX", "name": "Åland Islands"},
  {"code": "AZ", "name": "Azerbaijan"},
  {"code": "BA", "name": "Bosnia & Herzegovina"},
  {"code": "BB", "name": "Barbados"},
  {"code": "BD", "name": "Bangladesh"},
  {"code": "BE", "name": "Belgium"},
  {"code": "BF", "name": "Burkina Faso"},
  {"code": "BG", "name": "Bulgaria"},
  {"code": "BH", "name": "Bahrain"},
  {"code": "BI", "name": "Burundi"},
  {"code": "BJ", "name": "Benin"},
  {"code": "BL", "name": "St Barthelemy"},
  {"code": "BM", "name": "Bermuda"},
  {"code": "BN", "name": "Brunei"},
  {"code": "BO", "name": "Bolivia"},
  {"code": "BQ", "name": "Caribbean NL"},
  {"code": "BR", "name": "Brazil"},
  {"code": "BS", "name": "Bahamas"},
  {"code": "BT", "name": "Bhutan"},
  {"code": "BV", "name": "Bouvet Island"},
  {"code": "BW", "name": "Botswana"},
  {"code": "BY", "name": "Belarus"},
  {"code": "BZ", "name": "Belize"},
  {"code": "CA", "name": "Canada"},
  {"code": "CC", "name": "Cocos (Keeling) Islands"},
  {"code": "CD", "name": "Congo (Dem. Rep.)"},
  {"code": "CF", "name": "Central African Rep."},
  {"code": "CG", "name": "Congo (Rep.)"},
  {"code": "CH", "name": "Switzerland"},
  {"code": "CI", "name": "Côte d'Ivoire"},
  {"code": "CK", "name": "Cook Islands"},
  {"code": "CL", "name": "Chile"},
  {"code": "CM", "name": "Cameroon"},
  {"code": "CN", "name": "China"},
  {"code": "CO", "name": "Colombia"},
  {"code": "CR", "name": "Costa Rica"},
  {"code": "CU", "name": "Cuba"},
  {"code": "CV", "name": "Cape Verde"},
  {"code": "CW", "name": "Curaçao"},
  {"code": "CX", "name": "Christmas Island"},
  {"code": "CY", "name": "Cyprus"},
  {"code": "CZ", "name": "Czech Republic"},
  {"code": "DE", "name": "Germany"},
  {"code": "DJ", "name": "Djibouti"},
  {"code": "DK", "name": "Denmark"},
  {"code": "DM", "name": "Dominica"},
  {"code": "DO", "name": "Dominican Republic"},
  {"code": "DZ", "name": "Algeria"},
  {"code": "EC", "name": "Ecuador"},
  {"code": "EE", "name": "Estonia"},
  {"code": "EG", "name": "Egypt"},
  {"code": "EH", "name": "Western Sahara"},
  {"code": "ER", "name": "Eritrea"},
  {"code": "ES", "name": "Spain"},
  {"code": "ET", "name": "Ethiopia"},
  {"code": "FI", "name": "Finland"},
  {"code": "FJ", "name": "Fiji"},
  {"code": "FK", "name": "Falkland Islands"},
  {"code": "FM", "name": "Micronesia"},
  {"code": "FO", "name": "Faroe Islands"},
  {"code": "FR", "name": "France"},
  {"code": "GA", "name": "Gabon"},
  {"code": "GB", "name": "Britain (UK)"},
  {"code": "GD", "name": "Grenada"},
  {"code": "GE", "name": "Georgia"},
  {"code": "GF", "name": "French Guiana"},
  {"code": "GG", "name": "Guernsey"},
  {"code": "GH", "name": "Ghana"},
  {"code": "GI", "name": "Gibraltar"},
  {"code": "GL", "name": "Greenland"},
  {"code": "GM", "name": "Gambia"},
  {"code": "GN", "name": "Guinea"},
  {"code": "GP", "name": "Guadeloupe"},
  {"code": "GQ", "name": "Equatorial Guinea"},
  {"code": "GR", "name": "Greece"},
  {"code": "GS", "name": "South Georgia & the South Sandwich Islands"},
  {"code": "GT", "name": "Guatemala"},
  {"code": "GU", "name": "Guam"},
  {"code": "GW", "name": "Guinea-Bissau"},
  {"code": "GY", "name": "Guyana"},
  {"code": "HK", "name": "Hong Kong"},
  {"code": "HM", "name": "Heard Island & McDonald Islands"},
  {"code": "HN", "name": "Honduras"},
  {"code": "HR", "name": "Croatia"},
  {"code": "HT", "name": "Haiti"},
  {"code": "HU", "name": "Hungary"},
  {"code": "ID", "name": "Indonesia"},
  {"code": "IE", "name": "Ireland"},
  {"code": "IL", "name": "Israel"},
  {"code": "IM", "name": "Isle of Man"},
  {"code": "IN", "name": "India"},
  {"code": "IO", "name": "British Indian Ocean Territory"},
  {"code": "IQ", "name": "Iraq"},
  {"code": "IR", "name": "Iran"},
  {"code": "IS", "name": "Iceland"},
  {"code": "IT", "name": "Italy"},
  {"code": "JE", "name": "Jersey"},
  {"code": "JM", "name": "Jamaica"},
  {"code": "JO", "name": "Jordan"},
  {"code": "JP", "name": "Japan"},
  {"code": "KE", "name": "Kenya"},
  {"code": "KG", "name": "Kyrgyzstan"},
  {"code": "KH", "name": "Cambodia"},
  {"code": "KI", "name": "Kiribati"},
  {"code": "KM", "name": "Comoros"},
  {"code": "KN", "name": "St Kitts & Nevis"},
  {"code": "KP", "name": "Korea (North)"},
  {"code": "KR", "name": "Korea (South)"},
  {"code": "KW", "name": "Kuwait"},
  {"code": "KY", "name": "Cayman Islands"},
  {"code": "KZ", "name": "Kazakhstan"},
  {"code": "LA", "name": "Laos"},
  {"code": "LB", "name": "Lebanon"},
  {"code": "LC", "name": "St Lucia"},
  {"code": "LI", "name": "Liechtenstein"},
  {"code": "LK", "name": "Sri Lanka"},
  {"code": "LR", "name": "Liberia"},
  {"code": "LS", "name": "Lesotho"},
  {"code": "LT", "name": "Lithuania"},
  {"code": "LU", "name": "Luxembourg"},
  {"code": "LV", "name": "Latvia"},
  {"code": "LY", "name": "Libya"},
  {"code": "MA", "name": "Morocco"},
  {"code": "MC", "name": "Monaco"},
  {"code": "MD", "name": "Moldova"},
  {"code": "ME", "name": "Montenegro"},
  {"code": "MF", "name": "St Martin (French)"},
  {"code": "MG", "name": "Madagascar"},
  {"code": "MH", "name": "Marshall Islands"},
  {"code": "MK", "name": "North Macedonia"},
  {"code": "ML", "name": "Mali"},
  {"code": "MM", "name": "Myanmar (Burma)"},
  {"code": "MN", "name": "Mongolia"},
  {"code": "MO", "name": "Macau"},
  {"code": "MP", "name": "Northern Mariana Islands"},
  {"code": "MQ", "name": "Martinique"},
  {"code": "MR", "name": "Mauritania"},
  {"code": "MS", "name": "Montserrat"},
  {"code": "MT", "name": "Malta"},
  {"code": "MU", "name": "Mauritius"},
  {"code": "MV", "name": "Maldives"},
  {"code": "MW", "name": "Malawi"},
  {"code": "MX", "name": "Mexico"},
  {"code": "MY", "name": "Malaysia"},
  {"code": "MZ", "name": "Mozambique"},
  {"code": "NA", "name": "Namibia"},
  {"code": "NC", "name": "New Caledonia"},
  {"code": "NE", "name": "Niger"},
  {"code": "NF", "name": "Norfolk Island"},
  {"code": "NG", "name": "Nigeria"},
  {"code": "NI", "name": "Nicaragua"},
  {"code": "NL", "name": "Netherlands"},
  {"code": "NO", "name": "Norway"},
  {"code": "NP", "name": "Nepal"},
  {"code": "NR", "name": "Nauru"},
  {"code": "NU", "name": "Niue"},
  {"code": "NZ", "name": "New Zealand"},
  {"code": "OM", "name": "Oman"},
  {"code": "PA", "name": "Panama"},
  {"code": "PE", "name": "Peru"},
  {"code": "PF", "name": "French Polynesia"},
  {"code": "PG", "name": "Papua New Guinea"},
  {"code": "PH", "name": "Philippines"},
  {"code": "PK", "name": "Pakistan"},
  {"code": "PL", "name": "Poland"},
  {"code": "PM", "name": "St Pierre & Miquelon"},
  {"code": "PN", "name": "Pitcairn"},
  {"code": "PR", "name": "Puerto Rico"},
  {"code": "PS", "name": "Palestine"},
  {"code": "PT", "name": "Portugal"},
  {"code": "PW", "name": "Palau"},
  {"code": "PY", "name": "Paraguay"},
  {"code": "QA", "name": "Qatar"},
  {"code": "RE", "name": "Réunion"},
  {"code": "RO", "name": "Romania"},
  {"code": "RS", "name": "Serbia"},
  {"code": "RU", "name": "Russia"},
  {"code": "RW", "name": "Rwanda"},
  {"code": "SA", "name": "Saudi Arabia"},
  {"code": "SB", "name": "Solomon Islands"},
  {"code": "SC", "name": "Seychelles"},
  {"code": "SD", "name": "Sudan"},
  {"code": "SE", "name": "Sweden"},
  {"code": "SG", "name": "Singapore"},
  {"code": "SH", "name": "St Helena"},
  {"code": "SI", "name": "Slovenia"},
  {"code": "SJ", "name": "Svalbard & Jan Mayen"},
  {"code": "SK", "name": "Slovakia"},
  {"code": "SL", "name": "Sierra Leone"},
  {"code": "SM", "name": "San Marino"},
  {"code": "SN", "name": "Senegal"},
  {"code": "SO", "name": "Somalia"},
  {"code": "SR", "name": "Suriname"},
  {"code": "SS", "name": "South Sudan"},
  {"code": "ST", "name": "Sao Tome & Principe"},
  {"code": "SV", "name": "El Salvador"},
  {"code": "SX", "name": "St Maarten (Dutch)"},
  {"code": "SY", "name": "Syria"},
  {"code": "SZ", "name": "Eswatini (Swaziland)"},
  {"code": "TC", "name": "Turks & Caicos Is"},
  {"code": "TD", "name": "Chad"},
  {"code": "TF", "name": "French S. Terr."},
  {"code": "TG", "name": "Togo"},
  {"code": "TH", "name": "Thailand"},
  {"code": "TJ", "name": "Tajikistan"},
  {"code": "TK", "name": "Tokelau"},
  {"code": "TL", "name": "East Timor"},
  {"code": "TM", "name": "Turkmenistan"},
  {"code": "TN", "name": "Tunisia"},
  {"code": "TO", "name": "Tonga"},
  {"code": "TR", "name": "Turkey"},
  {"code": "TT", "name": "Trinidad & Tobago"},
  {"code": "TV", "name": "Tuvalu"},
  {"code": "TW", "name": "Taiwan"},
  {"code": "TZ", "name": "Tanzania"},
  {"code": "UA", "name": "Ukraine"},
  {"code": "UG", "name": "Uganda"},
  {"code": "UM", "name": "US minor outlying islands"},
  {"code": "US", "name": "United States"},
  {"code": "UY", "name": "Uruguay"},
  {"code": "UZ", "name": "Uzbekistan"},
  {"code": "VA", "name": "Vatican City"},
  {"code": "VC", "name": "St Vincent"},
  {"code": "VE", "name": "Venezuela"},
  {"code": "VG", "name": "Virgin Islands (UK)"},
  {"code": "VI", "name": "Virgin Islands (US)"},
  {"code": "VN", "name": "Vietnam"},
  {"code": "VU", "name": "Vanuatu"},
  {"code": "WF", "name": "Wallis & Futuna"},
  {"code": "WS", "name": "Samoa (western)"},
  {"code": "YE", "name": "Yemen"},
  {"code": "YT", "name": "Mayotte"},
  {"code": "ZA", "name": "South Africa"},
  {"code": "ZM", "name": "Zambia"},
  {"code": "ZW", "name": "Zimbabwe"},
].map(Object.freeze));

export const normalizePropertyCountry = (value) => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!PROPERTY_COUNTRIES.some(country => country.code === code)) {
    throw Object.assign(new Error('Select a valid property country.'), {status: 400, code: 'PROPERTY_COUNTRY_REQUIRED'});
  }
  return code;
};
