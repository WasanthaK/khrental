import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureAuthSchema, findAuthRecordByEmail } from '../src/api/auth/index.js';
import { runQuery } from '../src/api/mssql/query.js';
import { findAppUserByEmail } from '../src/api/mssql/repositories.js';

const sourcePath = path.resolve(process.argv[2] || '.local-auth-store.json');
const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const users = Array.isArray(source.users) ? source.users : [];

await ensureAuthSchema();
let migrated = 0;
let skipped = 0;

for (const user of users) {
  const email = String(user.email || '').trim().toLowerCase();
  if (!email || !user.passwordHash || await findAuthRecordByEmail(email)) {
    skipped += 1;
    continue;
  }

  const appUser = await findAppUserByEmail(email);
  const authId = /^[0-9a-f-]{36}$/i.test(String(user.authId || ''))
    ? user.authId
    : crypto.randomUUID();

  await runQuery(`
    INSERT INTO dbo.auth_users (
      auth_id, app_user_id, email, password_hash, password_salt,
      password_algorithm, role, metadata, createdat, updatedat
    ) VALUES (
      @authId, @appUserId, @email, @passwordHash, NULL,
      'legacy-sha256', @role, @metadata, @createdAt, @updatedAt
    )
  `, {
    authId,
    appUserId: appUser?.id || null,
    email,
    passwordHash: user.passwordHash,
    role: user.role || 'authenticated',
    metadata: JSON.stringify(user.metadata || {}),
    createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
    updatedAt: user.updatedAt ? new Date(user.updatedAt) : new Date()
  });

  if (appUser && !appUser.auth_id) {
    await runQuery(
      'UPDATE dbo.app_users SET auth_id = @authId, updatedat = SYSUTCDATETIME() WHERE id = @appUserId',
      { authId, appUserId: appUser.id }
    );
  }
  migrated += 1;
}

console.log(`Auth migration complete. Migrated: ${migrated}; skipped: ${skipped}.`);
