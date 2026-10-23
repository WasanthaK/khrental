// B04 S3b2c: single-purpose, unmounted SendGrid adapter for verified
// global seeker registration. Public signup remains disabled until B04 gates.
import { sendViaSendGrid } from '../email/sendGridDelivery.js';
import { createPublicSignupVerificationEmail } from './publicSignupVerificationEmail.js';

const invalid = () => Object.assign(new Error('Public signup email delivery is not configured.'), {
  status: 503, code: 'PUBLIC_SIGNUP_MAIL_NOT_CONFIGURED'
});

const normalizedAddress = value => {
  if (typeof value !== 'string' || value.length > 320) return null;
  const address = value.trim().toLowerCase();
  if (address !== value.toLowerCase() ||
      !/^[a-z0-9.!#$%&'*+/=?^`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(address) ||
      /[\s\r\n]/.test(address)) return null;
  return address;
};

// The from address MUST already be verified in SendGrid's account settings;
// domain validation by itself is not provider/domain verification.
export const createPublicSignupSendGridAdapters = ({
  apiKey,
  senderEmail,
  senderName = 'Quixo.Homes',
  baseUrl,
  production = false,
  fetchImpl
} = {}) => {
  const from = normalizedAddress(senderEmail);
  if (typeof apiKey !== 'string' || !apiKey.trim() ||
      !from || !from.endsWith('@quixo.homes') ||
      typeof senderName !== 'string' || senderName.trim() !== senderName ||
      !senderName || senderName.length > 80 || /[\r\n<>]/.test(senderName)) {
    throw invalid();
  }

  // Fail before accepting any request if the public verification origin is not
  // an explicitly pinned Quixo application origin.
  createPublicSignupVerificationEmail({
    token: 'a'.repeat(43), baseUrl, production
  });

  const makeEmail = ({ token }) => createPublicSignupVerificationEmail({
    token, baseUrl, production
  });

  const sendEmail = async ({ to, subject, text, html } = {}) => {
    const recipient = normalizedAddress(to);
    if (!recipient || subject !== 'Verify your Quixo.Homes email address' ||
        typeof text !== 'string' || typeof html !== 'string' ||
        !text.includes('/verify-email#token=') ||
        !html.includes('/verify-email#token=') ||
        text.length > 5000 || html.length > 10000) {
      throw invalid();
    }

    const result = await sendViaSendGrid({
      apiKey,
      sender: { email: from, name: senderName },
      to: recipient,
      subject, text, html,
      disableTracking: true,
      ...(fetchImpl ? { fetchImpl } : {})
    });
    // SendGrid email submission normally acknowledges with HTTP 202.
    // An unusual success status is treated as uncertain—not confirmed mail.
    if (result?.providerStatus !== 202 || result?.simulated === true) {
      throw Object.assign(new Error('Verification email acceptance is uncertain.'), {
        status: 503, code: 'PUBLIC_SIGNUP_MAIL_UNCERTAIN'
      });
    }
    return result;
  };

  return { makeEmail, sendEmail };
};
