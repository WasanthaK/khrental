import ImageUpload from '../components/common/ImageUpload';
import MaintenanceImageUpload from '../components/maintenance/MaintenanceImageUpload';

{/* Request Images */}
<div className="mb-6">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Upload Images (Optional)
  </label>
  <MaintenanceImageUpload 
    onImagesChange={(images) => setFormData({ ...formData, images })}
    maxImages={8}
    initialImages={formData.images || []}
    imageType="initial"
  />
  <p className="mt-1 text-sm text-gray-500">
    Upload images to help diagnose the issue (max 8)
  </p>
</div> 