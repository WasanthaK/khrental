import fs from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';

// Disposable test adapter only. Never writes to app public/storage or R2.
// Atomic hard-link publication ensures no partial target and no overwrite.
const CANONICAL = /^tenants\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/invoices\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/issued\/sha256-[0-9a-f]{64}\.pdf$/;

export const createInvoiceArchiveLocalProofStore = ({ rootDirectory }) => {
  if (typeof rootDirectory !== 'string' || !path.isAbsolute(rootDirectory) ||
      !path.resolve(rootDirectory).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    throw new Error('A dedicated absolute temporary directory is required.');
  }
  const locate = (bucket, objectPath) => {
    if (bucket !== 'invoices' || !CANONICAL.test(objectPath || '')) {
      throw new Error('Invalid invoice archive proof bucket/path.');
    }
    const full = path.resolve(rootDirectory, bucket, objectPath);
    if (!full.startsWith(path.resolve(rootDirectory) + path.sep)) {
      throw new Error('Archive proof path escaped its directory.');
    }
    return full;
  };
  return {
    createIfAbsent: async (bucket, objectPath, body) => {
      if (!Buffer.isBuffer(body)) throw new Error('Archive proof requires binary bytes.');
      const target = locate(bucket, objectPath);
      const folder = path.dirname(target);
      await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      const stage = path.join(folder, '.incoming-' + crypto.randomUUID());
      const handle = await fs.open(stage, 'wx', 0o600);
      try {
        await handle.writeFile(body);
        await handle.sync();
      } finally { await handle.close(); }
      try {
        await fs.link(stage, target); // link fails on existing object (unlike rename)
        return 'created';
      } catch (error) {
        if (error.code === 'EEXIST') return 'exists';
        throw error;
      } finally {
        await fs.rm(stage, { force: true });
      }
    },
    getObject: async (bucket, objectPath) => ({
      body: await fs.readFile(locate(bucket, objectPath)),
      contentType: 'application/pdf'
    })
  };
};
