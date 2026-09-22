import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import FormInput from '../components/ui/FormInput';
import {
  createRentee,
  getRentee,
  sendRenteeInvitation,
  updateRentee
} from '../services/renteeService';
import {
  listTenantProperties,
  listTenantPropertyUnits
} from '../services/propertyDirectoryService';
import {
  deleteTenantFiles,
  extractStoragePath,
  uploadTenantFile
} from '../services/storageApiService';
import {
  getRenteeAssociations,
  storeRenteeAssociations
} from '../services/renteeAssociationCache';

const ID_COPY_BUCKET = 'images';
const ID_COPY_FOLDER = 'id-copies';

const normalizePropertyIds = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const RenteeForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    nationalId: '',
    permanentAddress: '',
    associatedPropertyIds: [],
    structuredAssociations: []
  });
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [propertyUnits, setPropertyUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idCopyFile, setIdCopyFile] = useState(null);
  const [idCopyPreview, setIdCopyPreview] = useState(null);
  const [existingIdCopyUrl, setExistingIdCopyUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const propertyData = await listTenantProperties();
        if (cancelled) return;

        setProperties(propertyData.map((property) => ({
          ...property,
          displayName: property.name || property.address || 'Unnamed Property'
        })));

        if (!isEditMode) return;

        const rentee = await getRentee(id);
        if (cancelled) return;

        setFormData({
          name: rentee?.name || '',
          email: rentee?.email || rentee?.contact_details?.email || '',
          phone: rentee?.contact_details?.phone || '',
          nationalId: rentee?.national_id || '',
          permanentAddress: rentee?.permanent_address || '',
          associatedPropertyIds: normalizePropertyIds(rentee?.associated_property_ids),
          structuredAssociations: getRenteeAssociations(id)
        });
        setExistingIdCopyUrl(rentee?.id_copy_url || null);
      } catch (loadError) {
        console.error('Failed to load tenant form:', loadError);
        if (!cancelled) setError(loadError.message || 'Failed to load tenant information.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, isEditMode]);

  useEffect(() => {
    let cancelled = false;

    const loadUnits = async () => {
      if (!selectedProperty) {
        setPropertyUnits([]);
        setSelectedUnit('');
        return;
      }

      try {
        const units = await listTenantPropertyUnits(selectedProperty);
        if (!cancelled) setPropertyUnits(units);
      } catch (unitError) {
        console.error('Failed to load property units:', unitError);
        if (!cancelled) {
          setPropertyUnits([]);
          toast.error('Unable to load units for this property.');
        }
      }
    };

    loadUnits();
    return () => {
      cancelled = true;
    };
  }, [selectedProperty]);

  const selectedPropertyRecord = useMemo(
    () => properties.find((property) => String(property.id) === String(selectedProperty)) || null,
    [properties, selectedProperty]
  );

  const selectedPropertyIsApartment = selectedPropertyRecord?.propertytype === 'apartment';

  const updateField = (field) => (event) => {
    setFormData((previous) => ({ ...previous, [field]: event.target.value }));
  };

  const handleIdCopyChange = (event) => {
    const file = event.target.files?.[0] || null;
    setIdCopyFile(file);

    if (!file) {
      setIdCopyPreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setIdCopyPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const removeExistingIdCopy = async () => {
    try {
      if (existingIdCopyUrl) {
        const storedPath = extractStoragePath(existingIdCopyUrl, ID_COPY_BUCKET);
        await deleteTenantFiles({ bucket: ID_COPY_BUCKET, paths: [storedPath] });

        if (isEditMode) {
          await updateRentee(id, { id_copy_url: null });
        }
      }

      setExistingIdCopyUrl(null);
      setIdCopyFile(null);
      setIdCopyPreview(null);
    } catch (removeError) {
      console.error('Failed to remove ID copy:', removeError);
      toast.error(removeError.message || 'Failed to remove ID copy.');
    }
  };

  const addPropertyAssociation = () => {
    if (!selectedProperty) return;

    if (selectedPropertyIsApartment && !selectedUnit) {
      toast.error('Select a unit for this apartment.');
      return;
    }

    const duplicate = formData.structuredAssociations.some((association) => (
      String(association.propertyId) === String(selectedProperty)
      && String(association.unitId || '') === String(selectedPropertyIsApartment ? selectedUnit : '')
    ));

    if (duplicate) {
      toast.error('This property or unit is already associated with the tenant.');
      return;
    }

    setFormData((previous) => ({
      ...previous,
      associatedPropertyIds: previous.associatedPropertyIds.some((propertyId) => String(propertyId) === String(selectedProperty))
        ? previous.associatedPropertyIds
        : [...previous.associatedPropertyIds, selectedProperty],
      structuredAssociations: [
        ...previous.structuredAssociations,
        {
          propertyId: selectedProperty,
          unitId: selectedPropertyIsApartment ? selectedUnit : null
        }
      ]
    }));

    setSelectedProperty('');
    setSelectedUnit('');
  };

  const removePropertyAssociation = (index) => {
    setFormData((previous) => {
      const removed = previous.structuredAssociations[index];
      const structuredAssociations = previous.structuredAssociations.filter((_, associationIndex) => associationIndex !== index);
      const stillUsesProperty = structuredAssociations.some(
        (association) => String(association.propertyId) === String(removed?.propertyId)
      );

      return {
        ...previous,
        structuredAssociations,
        associatedPropertyIds: stillUsesProperty
          ? previous.associatedPropertyIds
          : previous.associatedPropertyIds.filter((propertyId) => String(propertyId) !== String(removed?.propertyId))
      };
    });
  };

  const describeAssociation = (association) => {
    const property = properties.find((item) => String(item.id) === String(association.propertyId));
    const propertyName = property?.displayName || association.propertyId;

    if (!association.unitId) return propertyName;

    const unit = propertyUnits.find((item) => String(item.id) === String(association.unitId));
    return `${propertyName} — Unit ${unit?.unitnumber || association.unitId}`;
  };

  const saveTenant = async ({ inviteAfterSave }) => {
    const email = formData.email.trim().toLowerCase();
    const name = formData.name.trim();

    if (!name || !email || !formData.phone.trim() || !formData.nationalId.trim() || !formData.permanentAddress.trim()) {
      throw new Error('Complete all required tenant information before saving.');
    }

    let idCopyUrl = existingIdCopyUrl;
    if (idCopyFile) {
      const safeName = idCopyFile.name.replace(/[^A-Za-z0-9._-]/g, '_');
      const uniquePart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const upload = await uploadTenantFile({
        bucket: ID_COPY_BUCKET,
        path: `${ID_COPY_FOLDER}/${uniquePart}-${safeName}`,
        file: idCopyFile
      });
      idCopyUrl = upload.url;
    }

    const payload = {
      name,
      email,
      role: 'rentee',
      user_type: 'rentee',
      contact_details: {
        email,
        phone: formData.phone.trim()
      },
      id_copy_url: idCopyUrl || null,
      associated_property_ids: formData.associatedPropertyIds,
      national_id: formData.nationalId.trim(),
      permanent_address: formData.permanentAddress.trim()
    };

    const saved = isEditMode
      ? await updateRentee(id, payload)
      : await createRentee(payload);

    const renterId = isEditMode ? id : saved?.id;
    if (!renterId) {
      throw new Error('The server saved the tenant but did not return an identity ID.');
    }

    storeRenteeAssociations(renterId, formData.structuredAssociations);

    if (inviteAfterSave) {
      await sendRenteeInvitation({ id: renterId, email, name });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const inviteAfterSave = event.nativeEvent?.submitter?.value === 'save-invite';

    try {
      setSubmitting(true);
      setError(null);
      await saveTenant({ inviteAfterSave });
      toast.success(inviteAfterSave ? 'Tenant saved and invitation accepted for delivery.' : 'Tenant saved successfully.');
      navigate('/dashboard/rentees');
    } catch (saveError) {
      console.error('Failed to save tenant:', saveError);
      setError(saveError.message || 'Failed to save tenant.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-lg">Loading tenant information...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{isEditMode ? 'Edit Tenant' : 'Add Tenant'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tenant identity, organization membership and portal invitation are managed as one tenant workflow.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium">Basic Information</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormInput label="Full Name" id="name" name="name" value={formData.name} onChange={updateField('name')} required />
            <FormInput label="Email" id="email" name="email" type="email" value={formData.email} onChange={updateField('email')} required />
            <FormInput label="Phone Number" id="phone" name="phone" value={formData.phone} onChange={updateField('phone')} required />
            <FormInput label="National ID" id="national_id" name="national_id" value={formData.nationalId} onChange={updateField('nationalId')} required />
          </div>

          <div className="mt-4">
            <label htmlFor="permanent_address" className="block text-sm font-medium text-gray-700">
              Permanent Address <span className="text-red-500">*</span>
            </label>
            <textarea
              id="permanent_address"
              rows={3}
              value={formData.permanentAddress}
              onChange={updateField('permanentAddress')}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              required
            />
          </div>

          <div className="mt-6">
            <label htmlFor="id-copy" className="block text-sm font-medium text-gray-700">ID Copy</label>
            <input
              id="id-copy"
              type="file"
              accept="image/*,application/pdf"
              onChange={handleIdCopyChange}
              className="mt-2 block w-full text-sm text-gray-600"
            />

            {(idCopyPreview || existingIdCopyUrl) && (
              <div className="mt-3 flex items-center gap-4">
                {(idCopyFile?.type || '').startsWith('image/') || (!idCopyFile && existingIdCopyUrl && !existingIdCopyUrl.toLowerCase().endsWith('.pdf')) ? (
                  <img src={idCopyPreview || existingIdCopyUrl} alt="ID copy preview" className="h-28 max-w-xs rounded object-contain" />
                ) : (
                  <span className="text-sm text-gray-600">ID document selected</span>
                )}
                <button type="button" onClick={removeExistingIdCopy} className="text-sm text-red-600 hover:text-red-800">
                  Remove ID Copy
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium">Property Assignment</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="property" className="block text-sm font-medium text-gray-700">Property</label>
              <select
                id="property"
                value={selectedProperty}
                onChange={(event) => {
                  setSelectedProperty(event.target.value);
                  setSelectedUnit('');
                }}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="">Select a property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.displayName} ({property.propertytype})
                  </option>
                ))}
              </select>
            </div>

            {selectedPropertyIsApartment && (
              <div>
                <label htmlFor="unit" className="block text-sm font-medium text-gray-700">Unit</label>
                <select
                  id="unit"
                  value={selectedUnit}
                  onChange={(event) => setSelectedUnit(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="">Select a unit</option>
                  {propertyUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>Unit {unit.unitnumber}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-end">
              <button
                type="button"
                onClick={addPropertyAssociation}
                disabled={!selectedProperty || (selectedPropertyIsApartment && !selectedUnit)}
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Add Property
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="text-sm font-medium text-gray-700">Associated Properties</div>
            {formData.structuredAssociations.length === 0 ? (
              <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No properties assigned yet.</div>
            ) : (
              formData.structuredAssociations.map((association, index) => (
                <div key={`${association.propertyId}-${association.unitId || 'property'}-${index}`} className="flex items-center justify-between rounded border border-gray-200 p-3">
                  <span className="text-sm">{describeAssociation(association)}</span>
                  <button type="button" onClick={() => removePropertyAssociation(index)} className="text-sm text-red-600 hover:text-red-800">Remove</button>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard/rentees')}
            disabled={submitting}
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            value="save"
            disabled={submitting}
            className="rounded-md border border-blue-600 px-4 py-2 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Tenant'}
          </button>
          <button
            type="submit"
            value="save-invite"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save & Invite'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RenteeForm;