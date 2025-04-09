# Property-Unit Association System

This document outlines the enhanced property-unit association system implemented in the KH Rentals application to better manage the relationship between rentees and properties, particularly for apartment buildings with multiple units.

## Overview

The system allows for a more structured approach to associate rentees with properties and specific units, providing better data organization and more precise relationships between rentees, properties, and units.

### Key Features

- Support for both standard properties and apartment units
- Backward compatibility with the existing system
- Clear representation of which unit a rentee is assigned to
- Consistent data across agreements, rentee profiles, and invoices

## Data Structure

### Database Schema

The system introduces a new column in the `app_users` table:

- `associated_properties`: JSONB field that stores an array of structured property-unit associations

```json
[
  {
    "propertyId": "uuid",
    "unitId": "uuid|null"
  }
]
```

- For standard properties, `unitId` is `null`
- For apartment units, `unitId` references a specific unit in the `property_units` table

### Legacy Support

The system maintains backward compatibility with the existing flat array structure:

- `associated_property_ids`: UUID[] - This field is still updated alongside the new structured format

## Implementation Details

### Migration

A migration script (`src/scripts/enhance_property_associations.sql`) has been created to:

1. Add the new `associated_properties` column to the `app_users` table
2. Convert existing flat array entries to the structured format
3. Maintain both formats during the transition period

To run the migration:

```bash
node src/scripts/migrate_property_associations.js
```

### Key Components Updated

The following components have been updated to support the new system:

1. **AgreementFormContainer**: Updated to store both the property and unit association when an agreement is signed
2. **RenteeForm**: Enhanced to allow selection of specific units for apartment properties
3. **RenteeDetails**: Updated to display unit information for apartment properties
4. **RenteePortal**: Improved to show unit details for rentees' apartment units

## Usage

### Creating Rentee-Property Associations

When creating or editing a rentee, you can now:

1. Select a property from the dropdown menu
2. If the property is an apartment, select a specific unit
3. Add the property-unit association to the rentee's profile

### Signing Agreements

When marking an agreement as signed:

1. The system updates both the legacy and new format association data
2. For apartments, it associates the rentee with both the property and the specific unit
3. The property status is updated to "rented"
4. If applicable, the unit status is updated to "occupied"

## Data Flow

1. When a property is selected in the RenteeForm, the system checks if it's an apartment type
2. If it's an apartment, available units are loaded for selection
3. When a unit is selected, both the property and unit IDs are stored in the structured format
4. When viewing rentee details, the system fetches both property and unit information for display
5. In the rentee portal, properties and their associated units are shown to the rentee

## Querying Guidelines

When querying for rentee-property associations:

1. Check if the `associated_properties` field exists and has entries
2. If available, use the structured format for precise property-unit relationships
3. Fall back to the legacy format if the structured data is not available

## Future Considerations

As the system matures, we plan to:

1. Phase out the legacy format completely
2. Enhance reporting to better utilize the structured relationships
3. Add more granular permission controls for unit-specific access 