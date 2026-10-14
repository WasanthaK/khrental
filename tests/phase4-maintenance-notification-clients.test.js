import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

const notifications = source('../src/services/notificationService.js');
const begin = notifications.indexOf('export const getUserNotifications');
const end = notifications.indexOf('// Function to get notification templates', begin);
assert.ok(begin >= 0 && end > begin);
const notificationMethods = notifications.slice(begin, end).replaceAll('export const ', 'const ');
const createNotificationClient = new Function('requestMssqlApi', 'console',
  notificationMethods + '\nreturn {getUserNotifications, markNotificationAsRead};');
const logger = { log() {}, warn() {}, error() {} };

test('user notification reads collect multiple authorized pages and never request another user', async () => {
  const received = [];
  const all = Array.from({ length: 101 }, (_, i) => ({id:'notification-' + i, message:'Update'}));
  const service = createNotificationClient(async (path, opts) => {
    received.push({path, opts});
    const page = Number(new URL('https://api.example' + path).searchParams.get('page'));
    return all.slice((page - 1) * 100, page * 100);
  }, logger);
  const result = await service.getUserNotifications('foreign-user');
  assert.equal(result.success, true);
  assert.equal(result.data.length, 101);
  assert.equal(result.data[0].title, 'Notification');
  assert.deepEqual(received.map(x=>x.path),
    ['/api/notifications/me?page=1&pageSize=100', '/api/notifications/me?page=2&pageSize=100']);
});

test('malformed or denied notification self read fails explicitly rather than returning empty history', async () => {
  for(const payload of [null, {}, [{id:''}], [{message:'missing id'}]]) {
    const svc = createNotificationClient(async () => payload, logger);
    const out = await svc.getUserNotifications();
    assert.equal(out.success, false);
    assert.equal(out.data, null);
  }
  const svc = createNotificationClient(async () => {throw Object.assign(Error('Forbidden'), {status:403})}, logger);
  assert.deepEqual(await svc.getUserNotifications(), {success:false,data:null,error:'Forbidden'});
});

test('mark read uses dedicated authenticated PATCH and reports missing/denied writes', async () => {
  const calls=[];
  const svc = createNotificationClient(async (path, opts) => {
    calls.push({path, opts});
    return {id:'notification-1',is_read:true};
  }, logger);
  assert.deepEqual(await svc.markNotificationAsRead('notification-1'), {
    success: true, data:[{id:'notification-1',is_read:true}], error:null
  });
  assert.deepEqual(calls, [{
    path:'/api/notifications/notification-1/read',
    opts:{method:'PATCH'}
  }]);
  const denied = createNotificationClient(async () => {throw Error('Notification not found.')}, logger);
  assert.equal((await denied.markNotificationAsRead('foreign-id')).success, false);
});

const lifecycle = source('../src/services/maintenanceLifecycleService.js');
const uploadStart = lifecycle.indexOf('const uploadLifecycleImages');
const uploadEnd = lifecycle.indexOf('const bestEffortNotify', uploadStart);
assert.ok(uploadStart >= 0 && uploadEnd > uploadStart);
const uploadSource = lifecycle.slice(uploadStart, uploadEnd);
const createImageUpload = new Function('saveImage','attachMaintenanceLifecycleImage','console',
  uploadSource + '\nreturn uploadLifecycleImages;');

test('maintenance metadata attachments use the authorized endpoint and never retry generic inserts', async () => {
  const calls=[];
  const upload = createImageUpload(async () => ({success:false}), async (id, body) => {
    calls.push({id,body});
    return body.imageUrl.endsWith('good.jpg') ?
      {data:{id:'image-1'},error:null} : {data:null,error:Error('Denied')};
  }, logger);
  const good='/storage/images/tenants/tenant-a/maintenance/good.jpg';
  const bad='/storage/images/tenants/tenant-b/maintenance/bad.jpg';
  assert.deepEqual(await upload('request-1',[good,bad], 'initial'), [good]);
  assert.deepEqual(calls,[
    {id:'request-1',body:{imageUrl:good,imageType:'initial',description:''}},
    {id:'request-1',body:{imageUrl:bad,imageType:'initial',description:''}}
  ]);
  assert.doesNotMatch(uploadSource, /platformClient|\.from\(/);
});
