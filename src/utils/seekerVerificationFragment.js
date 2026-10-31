// S3c: consume an opaque verification token from the browser URL fragment.
// The fragment is never sent in the HTTP request URL; scrub it from history
// before rendering the form or invoking any network APIs.
import {enquiryLoginSearch,parseEnquiryIntent} from './enquiryReturnPath.js';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const consumeSeekerVerificationContext = ({
  location, history
} = {}) => {
  const rawHash = typeof location?.hash === 'string' ? location.hash : '';
  const path = typeof location?.pathname === 'string' ? location.pathname : '';
  const search = typeof location?.search === 'string' ? location.search : '';
  const isVerificationPath = path === '/verify-email';

  const empty={token:null,enquirySearch:''};
  if (!isVerificationPath) {return empty;}
  let token = null;
  let enquirySearch='';
  let accountChallenge;
  const accountMatch=/^#token=([A-Za-z0-9_-]{43})&accountChallenge=([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})&ownerCountry=(LK|BN)$/i.exec(rawHash);
  if(accountMatch&&accountMatch[0]===rawHash){
    token=accountMatch[1];accountChallenge=accountMatch[2];enquirySearch='?ownerCountry='+accountMatch[3];
  }
  const ownerMatch=/^#token=([A-Za-z0-9_-]{43})&ownerCountry=(LK|BN)$/.exec(rawHash);
  if(ownerMatch&&ownerMatch[0]===rawHash){token=ownerMatch[1];enquirySearch='?ownerCountry='+ownerMatch[2];}
  const match=/^#token=([A-Za-z0-9_-]{43})(?:&listingId=([^&]+)&country=(LK|BN))?$/.exec(rawHash);
  if(match&&match[0]===rawHash&&TOKEN.test(match[1])){
    const intent=match[2]?parseEnquiryIntent({listingId:match[2],country:match[3]}):null;
    if(!match[2]||intent){
      token=match[1];
      if(intent){enquirySearch=enquiryLoginSearch('?listingId='+intent.listingId+'&country='+intent.country);}
    }
  }

  // This must succeed before any page can use the token. Avoid placing tokens
  // in query strings, history state, session storage or application logs.
  if (rawHash || search) {
    if (typeof history?.replaceState !== 'function') {return empty;}
    try {
      history.replaceState(history.state ?? null, '', '/verify-email');
    } catch {
      return empty;
    }
  }
  return {token,enquirySearch,...(accountChallenge?{accountChallenge}:{})};
};
// Preserve the token-only API used by existing verification contracts.
export const consumeSeekerVerificationFragment = options => consumeSeekerVerificationContext(options).token;
