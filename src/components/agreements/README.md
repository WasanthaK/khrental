# Agreement Components

This directory contains components related to rental agreements in the KH Rentals application.

## Component Structure

- `AgreementFormContainer.jsx` - The main agreement form container component, handles business logic and data management
- `AgreementFormUI.jsx` - The presentational component for the agreement form
- `AgreementActions.jsx` - Provides action buttons for agreements (sign, download, etc.)
- `AgreementTemplateSelector.jsx` - Allows users to select agreement templates
- `SignatureForm.jsx` - Handles digital signatures for agreements

## Component Hierarchy

1. `src/pages/AgreementFormPage.jsx` - The page-level component
   - Used as a route destination in the router
   - Should not be imported directly into other components
   - Renders the AgreementFormContainer

2. `src/components/agreements/AgreementFormContainer.jsx` - The container component
   - Handles business logic, data fetching, and state management
   - Uses the AgreementFormContext for state management
   - Renders the AgreementFormUI

3. `src/components/agreements/AgreementFormUI.jsx` - The presentational component
   - Handles the UI rendering and user interactions
   - Receives data and callbacks from the container
   - Focused purely on presentation

## Usage Guidelines

- For route components (used in router), use `src/pages/AgreementFormPage.jsx`
- For embedded components (used within other components), use `src/components/agreements/AgreementFormContainer.jsx`
- The AgreementFormUI component should only be used within AgreementFormContainer

## Evia Sign Integration

The agreement components work with the Evia Sign API for digital signatures. The integration is handled through:

- `src/services/eviaSignService.js` - API client for Evia Sign
- `src/services/AgreementService.js` - Business logic for agreements
- `SignatureForm.jsx` - UI for signature creation and verification

## Future Improvements

- Complete the migration to use only the context-based AgreementForm components
- Improve the separation of concerns between container and UI components
- Add comprehensive testing for all components 