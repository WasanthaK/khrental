from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing expected block: {label}')
    return text.replace(old, new, 1)


# Tenant utility reading photo upload.
p = Path('src/pages/rentee/UtilityReadingForm.jsx')
s = p.read_text()
import_marker = "import { useAuth } from '../../hooks/useAuth';\n"
storage_import = "import { uploadTenantFile } from '../../services/storageApiService';\n"
if storage_import not in s:
    s = s.replace(import_marker, import_marker + storage_import, 1)
old = """      const { data: uploadData, error: uploadError } = await platformClient.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL
      const scopedFilePath = uploadData?.scopedPath || uploadData?.path || filePath;
      const { data: { publicUrl } } = platformClient.storage
        .from('images')
        .getPublicUrl(scopedFilePath);

      setFormData(prev => ({
        ...prev,
        photoUrl: publicUrl
      }));
"""
new = """      const uploadData = await uploadTenantFile({
        bucket: 'images',
        path: filePath,
        file
      });
      const photoUrl = uploadData?.url;

      if (!photoUrl) {
        throw new Error('Utility photo upload did not return a storage URL.');
      }

      setFormData(prev => ({
        ...prev,
        photoUrl
      }));
"""
s = replace_once(s, old, new, 'rentee utility photo upload')
if 'platformClient.storage' in s:
    raise SystemExit('UtilityReadingForm still contains compatibility storage calls')
p.write_text(s)

# Reusable utility meter photo upload.
p = Path('src/components/utilities/UtilityMeterForm.jsx')
s = p.read_text()
import_marker = "import ImageUploader from '../common/ImageUploader';\n"
storage_import = "import { uploadTenantFile } from '../../services/storageApiService';\n"
if storage_import not in s:
    s = s.replace(import_marker, import_marker + storage_import, 1)
old = """      // Upload to storage
      const { data, error } = await platformClient.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          onUploadProgress: (progress) => {
            setUploadProgress(progress);
          }
        });
      
      if (error) {
        throw error;
      }
      
      // Get public URL for the file
      const scopedFilePath = data?.scopedPath || data?.path || filePath;
      const { data: urlData } = platformClient.storage
        .from('media')
        .getPublicUrl(scopedFilePath);
      
      setFormData(prev => ({
        ...prev,
        photoUrl: urlData.publicUrl
      }));
"""
new = """      // Upload through the explicit tenant-scoped storage API.
      const uploadData = await uploadTenantFile({
        bucket: 'media',
        path: filePath,
        file
      });
      const photoUrl = uploadData?.url;

      if (!photoUrl) {
        throw new Error('Utility photo upload did not return a storage URL.');
      }

      setUploadProgress(100);
      setFormData(prev => ({
        ...prev,
        photoUrl
      }));
"""
s = replace_once(s, old, new, 'utility meter photo upload')
if 'platformClient.storage' in s:
    raise SystemExit('UtilityMeterForm still contains compatibility storage calls')
p.write_text(s)

# Regression-lock both utility upload surfaces.
p = Path('tests/storage-delivery.test.js')
s = p.read_text()
source_marker = """const storageApiServiceSource = readFileSync(
  new URL('../src/services/storageApiService.js', import.meta.url),
  'utf8'
);
"""
source_add = source_marker + """
const utilityReadingFormSource = readFileSync(
  new URL('../src/pages/rentee/UtilityReadingForm.jsx', import.meta.url),
  'utf8'
);

const utilityMeterFormSource = readFileSync(
  new URL('../src/components/utilities/UtilityMeterForm.jsx', import.meta.url),
  'utf8'
);
"""
if 'const utilityReadingFormSource' not in s:
    s = replace_once(s, source_marker, source_add, 'utility test sources')
extra = r"""

test('utility reading photos use explicit tenant-scoped storage APIs', () => {
  for (const source of [utilityReadingFormSource, utilityMeterFormSource]) {
    assert.doesNotMatch(source, /platformClient\.storage/);
    assert.match(source, /uploadTenantFile/);
    assert.match(source, /uploadData\?\.url/);
  }
  assert.match(utilityReadingFormSource, /bucket: 'images'/);
  assert.match(utilityMeterFormSource, /bucket: 'media'/);
});
"""
if 'utility reading photos use explicit tenant-scoped storage APIs' not in s:
    s += extra
p.write_text(s)
