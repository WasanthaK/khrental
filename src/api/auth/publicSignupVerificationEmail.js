// B04 S3b2: inert, provider-independent email verification presentation.
// No public route, email sending, or account mutation is enabled by this module.
import { hashPublicSignupChallengeToken } from './publicSignupChallenge.js';
import {parseEnquiryIntent} from '../../utils/enquiryReturnPath.js';

const PRODUCTION_HOST = 'app.quixo.homes';

const configError = () => {
  const error = new Error('Verified public signup app URL is not configured.');
  error.status = 503;
  error.code = 'PUBLIC_SIGNUP_APP_URL_REQUIRED';
  return error;
};

// Raw verification tokens must never appear in the HTTP path or query.
// A fragment is not transmitted in an HTTP request; the later S3c browser
// page must read and clear it before posting the token in the request body.
export const createPublicSignupVerificationLink = ({ token, baseUrl, production = false, enquiry,ownerCountry,accountChallenge }) => {
  hashPublicSignupChallengeToken(token); // strict 256-bit base64url shape
  let url;
  try {
    url = new URL(String(baseUrl || ''));
  } catch {
    throw configError();
  }

  if (url.username || url.password || url.search || url.hash ||
      (url.pathname !== '/' && url.pathname !== '') ||
      !['http:', 'https:'].includes(url.protocol)) {
    throw configError();
  }

  const host = url.hostname.toLowerCase();
  if (production) {
    if (url.protocol !== 'https:' || host !== PRODUCTION_HOST || url.port) {
      throw configError();
    }
  } else if (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(host))) {
    throw configError();
  }

  // Only a server-controlled origin; never accept client-provided return URLs.
  url.pathname = '/verify-email';
  url.hash = 'token=' + token;
  if(accountChallenge!==undefined){
    if(typeof accountChallenge!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountChallenge)||
      enquiry!==undefined||!['LK','BN'].includes(ownerCountry)){throw configError();}
    url.hash+='&accountChallenge='+accountChallenge;
  }
  if(ownerCountry!==undefined){
    if(!['LK','BN'].includes(ownerCountry)||enquiry!==undefined){throw configError();}
    url.hash+='&ownerCountry='+ownerCountry;
  }
  if(enquiry!==undefined){
    const intent=parseEnquiryIntent(enquiry);
    if(!intent){throw configError();}
    // A public listing pointer is navigation only. The enquiry API rechecks
    // current availability and actor scope. Never carry arbitrary return URLs.
    url.hash += '&listingId='+intent.listingId+'&country='+intent.country;
  }
  return url.toString();
};

export const createPublicSignupVerificationEmail = ({ token, baseUrl, production = false, enquiry,ownerCountry,accountChallenge }) => {
  const link = createPublicSignupVerificationLink({ token, baseUrl, production, enquiry,ownerCountry,accountChallenge });
  const instruction=accountChallenge?'Verify your existing account’s email address to continue setting up your property workspace.':'Verify your email address to create your Quixo.Homes account.';
  return {
    subject: 'Verify your Quixo.Homes email address',
    text: [
      instruction,
      '',
      link,
      '',
      'This verification link expires in 30 minutes and can be used only once.',
      'If you did not request this verification, ignore this message.'
    ].join('\n'),
    html: [
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#222">',
      '<h1>Verify your Quixo.Homes email address</h1>',
      '<p>'+instruction+'</p>',
      '<p><a clicktracking=off href="' + link.replace(/&/g,'&amp;') + '">Verify email</a></p>',
      '<p>This link expires in 30 minutes and can be used only once.</p>',
      '<p>If you did not request this verification, ignore this message.</p>',
      '</div>'
    ].join('')
  };
};
