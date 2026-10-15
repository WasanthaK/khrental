/**
 * Preserve the old page-facing image upload envelope while ensuring all
 * attachment metadata is written by the tenant-authenticated lifecycle API.
 * The optional userId supplied by older pages is deliberately ignored:
 * the server derives uploaded_by from the verified session.
 */
export const createMaintenanceImageAttachment = ({
  getRequest,
  uploadImage,
  attachImage,
  isFile = value => typeof File !== 'undefined' && value instanceof File
}) => async (input = {}) => {
  try {
    const requestId = String(input?.maintenance_request_id || '').trim();
    if (!requestId) throw new Error('Missing maintenance request ID');
    if (!input?.image) throw new Error('No image provided');

    const requestedType = String(input.image_type || 'additional').trim().toLowerCase();
    // Legacy generic/progress photos are additional evidence in the governed API.
    const imageType = ['general', 'progress'].includes(requestedType)
      ? 'additional' : requestedType;
    if (!['initial', 'additional', 'completion'].includes(imageType)) {
      throw new Error('Unsupported maintenance image type');
    }

    // Reject foreign/unknown requests before uploading bytes. This is not
    // sufficient authorization for the write: attachImage checks again on SQL.
    const { data: projection, error: accessError } = await getRequest(requestId);
    if (accessError) throw accessError;
    if (!projection?.request?.id
      || projection.request.id.toLowerCase() !== requestId.toLowerCase()) {
      throw new Error('Maintenance request is not accessible');
    }

    let imageUrl = typeof input.image === 'string' ? input.image
      : typeof input.image?.url === 'string' ? input.image.url : null;
    if (!imageUrl) {
      const file = input.image?.file || input.image;
      if (!isFile(file)) throw new Error('Invalid image format. Expected a file or stored image URL.');
      const uploaded = await uploadImage(file, {
        folder: 'maintenance',
        compress: true,
        maxSize: 10 * 1024 * 1024
      });
      if (!uploaded?.success || !uploaded?.url) {
        throw new Error(uploaded?.error || 'Failed to upload maintenance image');
      }
      imageUrl = uploaded.url;
    }

    if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
      throw new Error('Maintenance image URL is required');
    }
    const { data, error } = await attachImage(requestId, {
      imageUrl: imageUrl.trim(),
      imageType,
      description: String(input.description || '').trim().slice(0, 1000)
    });
    if (error) throw error;
    if (!data?.id) throw new Error('Maintenance image attachment was not acknowledged');
    return { success: true, data, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error?.message || 'Failed to attach maintenance image'
    };
  }
};
