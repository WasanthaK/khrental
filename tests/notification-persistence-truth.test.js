import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/notificationService.js', import.meta.url), 'utf8');
const extract = (start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'notification service operation must remain present');
  return source.slice(a, b).replace('export const ', 'const ');
};
const notifyBody = extract('export const notifyUser =', '/**\n * Notification Service');
const makeNotify = new Function('platformClient', 'fetchNotificationUser', 'console',
  notifyBody + '\nreturn notifyUser;');

const logger = { log() {}, warn() {}, error() {} };

test('failed in-app notification insertion never reports delivery success or attempts placeholder channels', async () => {
  for (const failure of [
    { error: Object.assign(new Error('tenant denied'), { code: 'TENANT_ACCESS_DENIED' }) },
    { error: new Error('SQL unavailable') }
  ]) {
    let contactLoads = 0;
    const notify = makeNotify(
      { from(table) {
        assert.equal(table, 'notifications');
        return { insert: async () => failure };
      }},
      async () => { contactLoads++; return { contact_details: { email: 'person@example.invalid' } }; },
      logger
    );
    const result = await notify('user-1', { message: 'Assigned' });
    assert.equal(result.success, false);
    assert.equal(result.error, failure.error.message);
    assert.equal(result.code, failure.error.code || 'NOTIFICATION_PERSISTENCE_FAILED');
    assert.equal(contactLoads, 0);
  }

  const notifyRejected = makeNotify(
    { from() { return { insert: async () => { throw Error('transport disconnected'); } }; } },
    async () => { throw Error('contact lookup must not occur after insert failure'); },
    logger
  );
  assert.deepEqual(await notifyRejected('user-1', { message: 'Assigned' }), {
    success: false, error: 'transport disconnected', code: 'NOTIFICATION_PERSISTENCE_FAILED'
  });
});

test('validated successful in-app persistence is reported as success without claiming email or SMS sent', async () => {
  const inserts = [];
  const notify = makeNotify(
    { from(table) {
      assert.equal(table, 'notifications');
      return { insert: async payload => { inserts.push(payload); return { error: null }; } };
    }},
    async () => null, logger
  );
  assert.deepEqual(await notify('user-1', { message: 'New work' }), { success: true });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].user_id, 'user-1');
  assert.equal(inserts[0].message, 'New work');
  assert.equal(inserts[0].is_read, false);
  assert.equal((await notify(null, { message: 'No target' })).success, false);
  assert.equal((await notify('user-1', {})).success, false);
  assert.equal(inserts.length, 1);
});

test('maintenance staff notification summary reflects individual persistence failures', async () => {
  const body = extract('export const notifyStaffAboutNewRequest =', '// Function to notify about assignment');
  const fn = new Function('fetchNotificationUsersByType', 'notifyUser', 'console',
    body + '\nreturn notifyStaffAboutNewRequest;')(
    async () => [{ id: 'staff-1' }, { id: 'staff-2' }],
    async id => ({ success: id === 'staff-1' }), logger
  );
  const result = await fn({ id: 'request-1', propertyid: 'property-1', title: 'Repair' });
  assert.equal(result.success, false);
  assert.deepEqual(result.data, [{ success: true }, { success: false }]);
});

test('maintenance cancellation notification summary reflects individual persistence failures', async () => {
  const body = extract('export const notifyAboutCancellation =', '// Function to notify about new comment');
  const fn = new Function('notifyUser', 'console', body + '\nreturn notifyAboutCancellation;')(
    async id => ({ success: id === 'rentee-1' }), logger
  );
  const result = await fn({ id: 'request-1', title: 'Repair', renteeid: 'rentee-1', assignedstaff: 'staff-2' });
  assert.equal(result.success, false);
  assert.deepEqual(result.data, [{ success: true }, { success: false }]);
});
