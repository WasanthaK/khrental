process.env.STORAGE_DRIVER = 'r2';

const required = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
for (const name of required) {
  if (!String(process.env[name] || '').trim()) {
    throw new Error(`${name} is not configured.`);
  }
}

const { getStorageDriver } = await import('../src/api/storage/index.js');
const storage = getStorageDriver();
const suffix = `github-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const probes = [
  { bucket: 'images', path: `_healthchecks/${suffix}.txt`,
    bytes: Buffer.from('kh-rentals-r2-validation'), mime: 'text/plain' },
  { bucket: 'documents', path: `_healthchecks/${suffix}.pdf`,
    bytes: Buffer.from('%PDF-1.4\\n%KH-Rentals-R2-probe\\n%%EOF'),
    mime: 'application/pdf' }
];
const uploaded = [];

try {
  for (const probe of probes) {
    await storage.upload(probe.bucket, probe.path, probe.bytes, probe.mime);
    uploaded.push(probe);
    const saved = await storage.getObject(probe.bucket, probe.path);
    if (!Buffer.isBuffer(saved.body) || !saved.body.equals(probe.bytes)) {
      throw new Error('R2 validation object content did not match uploaded payload.');
    }
    if (String(saved.contentType || '').split(';')[0].trim().toLowerCase() !== probe.mime) {
      throw new Error('R2 validation content type was not retained.');
    }
  }
  console.log('R2 images and documents write/read bytes and content-type validation succeeded.');
} finally {
  for (const probe of uploaded) {
    await storage.deleteObjects(probe.bucket, [probe.path]);
  }
  if (uploaded.length) console.log('R2 probe cleanup succeeded.');
}
