process.env.STORAGE_DRIVER = 'r2';

const required = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
for (const name of required) {
  if (!String(process.env[name] || '').trim()) {
    throw new Error(`${name} is not configured.`);
  }
}

const { getStorageDriver } = await import('../src/api/storage/index.js');
const storage = getStorageDriver();
const testPath = `_healthchecks/github-${Date.now()}.txt`;
const expected = Buffer.from('kh-rentals-r2-validation');
let uploaded = false;

try {
  await storage.upload('images', testPath, expected, 'text/plain');
  uploaded = true;

  const object = await storage.getObject('images', testPath);
  if (!Buffer.isBuffer(object.body) || !object.body.equals(expected)) {
    throw new Error('R2 validation object content did not match the uploaded payload.');
  }

  console.log('R2 write/read validation succeeded.');
} finally {
  if (uploaded) {
    await storage.deleteObjects('images', [testPath]);
    console.log('R2 cleanup succeeded.');
  }
}
