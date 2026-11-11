import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseReadiness } from '../src/utils/databaseReadiness.js';

test('ready database is cached briefly, but checked again after inactivity', async () => {
  let time = 0, calls = 0;
  const ready = createDatabaseReadiness({ probe: async () => { calls++; return true; }, now: () => time });
  await ready(); await ready();
  assert.equal(calls, 1);
  time = 31000;
  await ready();
  assert.equal(calls, 2);
});
test('concurrent users of the client share a bounded wake-up sequence', async () => {
  let calls = 0;
  const states = [], waits = [];
  const ready = createDatabaseReadiness({
    probe: async () => ++calls === 3,
    delay: async ms => { waits.push(ms); },
    notify: state => states.push(state)
  });
  await Promise.all([ready(), ready(), ready()]);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [3000, 3000]);
  assert.deepEqual(states, ['checking', 'ready']);
});
test('outage stops after three probes and manual retry can recover', async () => {
  let calls = 0, available = false;
  const states = [];
  const ready = createDatabaseReadiness({
    probe: async () => { calls++; if (!available) {throw new Error('network');} return true; },
    delay: async () => {}, notify: state => states.push(state)
  });
  await assert.rejects(ready(), /Please try again/);
  assert.equal(calls, 3);
  assert.equal(states.at(-1), 'unavailable');
  available = true;
  await ready();
  assert.equal(calls, 4);
  assert.equal(states.at(-1), 'ready');
});
