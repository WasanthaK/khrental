from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing expected block: {label}')
    return text.replace(old, new, 1)

p = Path('src/services/eviaSignServiceLegacy.js')
s = p.read_text()
import_marker = "import { ENV, getApiBaseUrl } from '../utils/env';\n"
storage_import = "import { uploadTenantFile } from './storageApiService';\n"
if storage_import not in s:
    s = s.replace(import_marker, import_marker + storage_import, 1)

old = """    const { data: uploadData, error: uploadError } = await platformClient.storage
      .from('files')
      .upload(filePath, blob, {
        contentType: 'application/pdf',
        upsert: true
      });
      
    if (uploadError) {
      console.error('[eviaSignService] Error uploading signed document to storage:', uploadError);
      throw uploadError;
    }
    
    console.log('[eviaSignService] Signed document uploaded successfully:', uploadData);
    
    // Get the public URL
    const scopedFilePath = uploadData?.scopedPath || uploadData?.path || filePath;
    const { data: urlData } = platformClient.storage
      .from('files')
      .getPublicUrl(scopedFilePath);
      
    if (!urlData || !urlData.publicUrl) {
      throw new Error('Failed to get public URL for signed document');
    }
    
    console.log('[eviaSignService] Signed document available at:', urlData.publicUrl);
    
    return { 
      success: true, 
      documentUrl: urlData.publicUrl,
      fileName: fileName
    };
"""
new = """    const uploadData = await uploadTenantFile({
      bucket: 'files',
      path: filePath,
      file: blob
    });
    const documentUrl = uploadData?.url;

    if (!documentUrl) {
      throw new Error('Failed to get storage URL for signed document');
    }

    console.log('[eviaSignService] Signed document uploaded successfully:', { path: uploadData?.path || filePath });
    console.log('[eviaSignService] Signed document available at:', documentUrl);

    return {
      success: true,
      documentUrl,
      fileName
    };
"""
s = replace_once(s, old, new, 'legacy Evia signed document storage')
if 'platformClient.storage' in s:
    raise SystemExit('legacy Evia service still contains compatibility storage calls')
p.write_text(s)

p = Path('tests/storage-delivery.test.js')
s = p.read_text()
source_marker = """const storageApiServiceSource = readFileSync(
  new URL('../src/services/storageApiService.js', import.meta.url),
  'utf8'
);
"""
source_add = source_marker + """
const legacyEviaSource = readFileSync(
  new URL('../src/services/eviaSignServiceLegacy.js', import.meta.url),
  'utf8'
);
"""
if 'const legacyEviaSource' not in s:
    s = replace_once(s, source_marker, source_add, 'legacy Evia test source')
extra = r"""

test('legacy Evia completed documents use explicit tenant-scoped storage', () => {
  assert.doesNotMatch(legacyEviaSource, /platformClient\.storage/);
  assert.match(legacyEviaSource, /uploadTenantFile/);
  assert.match(legacyEviaSource, /bucket: 'files'/);
  assert.match(legacyEviaSource, /const filePath = `agreements\/\$\{fileName\}`/);
  assert.match(legacyEviaSource, /const documentUrl = uploadData\?\.url/);
});
"""
if 'legacy Evia completed documents use explicit tenant-scoped storage' not in s:
    s += extra
p.write_text(s)
