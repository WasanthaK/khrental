import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicSignupChallengeToken } from '../src/api/auth/publicSignupChallenge.js';
import { createPublicSignupSendGridAdapters } from '../src/api/auth/publicSignupSendGrid.js';

const config = {
  apiKey: 'synthetic-sendgrid-test-key',
  senderEmail: 'noreply@quixo.homes',
  senderName: 'Quixo.Homes',
  baseUrl: 'https://app.quixo.homes',
  production: true
};
const reply = (status = 202) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'synthetic-provider-id' }
});

test('safe mail adapter emits a single purpose provider payload without tracking', async () => {
  const { token } = createPublicSignupChallengeToken();
  const envelopes = [];
  const { makeEmail, sendEmail } = createPublicSignupSendGridAdapters({
    ...config,
    fetchImpl: async (url, options) => {
      envelopes.push({ url, options });
      return reply();
    }
  });
  const mail = makeEmail({ token });
  const accepted = await sendEmail({ to: 'seeker@example.invalid', ...mail });
  assert.equal(accepted.providerStatus, 202);
  assert.equal(accepted.success, true);
  assert.equal(envelopes.length, 1);
  assert.equal(envelopes[0].url, 'https://api.sendgrid.com/v3/mail/send');
  const payload = JSON.parse(envelopes[0].options.body);
  assert.deepEqual(payload.from, {
    email: 'noreply@quixo.homes', name: 'Quixo.Homes'
  });
  assert.deepEqual(payload.personalizations, [
    { to: [{ email: 'seeker@example.invalid' }] }
  ]);
  assert.deepEqual(payload.tracking_settings, {
    click_tracking: { enable: false, enable_text: false },
    open_tracking: { enable: false }
  });
  assert.equal(payload.attachments, undefined);
  assert.match(payload.content[0].value, /verify-email#token=/);
  assert.match(payload.content[1].value, /clicktracking=off/);
  assert.equal(payload.content[0].value.includes(token), true);
  assert.equal(payload.content[1].value.includes(token), true);
  assert.ok(!JSON.stringify(accepted).includes(token),
    'provider accepted response must not echo the verification token');
});

test('no sender fallback, no unapproved domain or hostile verification origin', () => {
  for (const override of [
    { apiKey: '' },
    { senderEmail: null },
    { senderEmail: 'noreply@khrentals.com' },
    { senderEmail: 'attacker@quixo.homes.evil.example' },
    { senderEmail: 'attacker@example.com' },
    { senderEmail: 'noreply@quixo.homes\nBcc: attacker@example.com' },
    { baseUrl: 'http://app.quixo.homes' },
    { baseUrl: 'https://wrong.example' },
    { baseUrl: 'https://app.quixo.homes.evil.example' }
  ]) {
    assert.throws(() => createPublicSignupSendGridAdapters({
      ...config, ...override
    }));
  }
});

test('mail send requires pinned template and constrained recipient', async () => {
  const { makeEmail, sendEmail } = createPublicSignupSendGridAdapters({
    ...config,
    fetchImpl: async () => { throw new Error('Must not send invalid payload'); }
  });
  const mail = makeEmail({ token: createPublicSignupChallengeToken().token });
  for (const patch of [
    { to: 'malformed-recipient' },
    { to: 'bad@example.com\r\nBcc: attacker@example.com' },
    { to: 'bad@example.com', subject: 'Custom forged subject' },
    { to: 'bad@example.com', html: '<b>No verification link</b>' },
    { to: 'bad@example.com', text: '<b>No verification link</b>' }
  ]) {
    await assert.rejects(sendEmail({
      to: 'seeker@example.invalid', ...mail, ...patch
    }), error => error.code === 'PUBLIC_SIGNUP_MAIL_NOT_CONFIGURED');
  }
});

test('provider 200 or rejection is not treated as confirmed delivery', async () => {
  const { token } = createPublicSignupChallengeToken();
  const mail = createPublicSignupSendGridAdapters({
    ...config, fetchImpl: async () => reply(200)
  });
  await assert.rejects(mail.sendEmail({
    to: 'seeker@example.invalid', ...mail.makeEmail({ token })
  }), error => error.code === 'PUBLIC_SIGNUP_MAIL_UNCERTAIN');

  const refused = createPublicSignupSendGridAdapters({
    ...config, fetchImpl: async () => reply(400)
  });
  await assert.rejects(refused.sendEmail({
    to: 'seeker@example.invalid', ...refused.makeEmail({ token })
  }), error => error.code === 'EMAIL_PROVIDER_REJECTED');
});

test('general SendGrid email behavior remains unchanged unless tracking is disabled', async () => {
  const { sendViaSendGrid } = await import('../src/api/email/sendGridDelivery.js');
  let body;
  await sendViaSendGrid({
    apiKey: 'synthetic-key',
    sender: { email: 'staff@example.invalid' },
    to: 'recipient@example.invalid',
    subject: 'Non-verification email',
    text: 'Unrelated',
    fetchImpl: async (_, options) => {
      body = JSON.parse(options.body);
      return reply();
    }
  });
  assert.equal(body.tracking_settings, undefined);
});
