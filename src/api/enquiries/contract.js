import {createHash} from 'node:crypto';

export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const enquiryError = (status, code, message) => Object.assign(new Error(message), {status, code});
export const parseEnquiry = body => {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !['listingId','country','message','consent','requestId'].includes(k)) ||
      !isUuid(body.listingId) || !isUuid(body.requestId) || !['LK','BN'].includes(body.country) ||
      body.consent !== true || typeof body.message !== 'string' ||
      body.message.trim().length < 1 || body.message.trim().length > 2000 ||
      [...body.message].some(c => c.charCodeAt(0)<32 && !['\n','\r','\t'].includes(c))) {
    throw enquiryError(400, 'INVALID_ENQUIRY', 'Choose a listing, enter up to 2,000 characters and consent to sharing with its owner.');
  }
  const input = {listingId:body.listingId.toLowerCase(), country:body.country,
    message:body.message.trim(), consent:true, requestId:body.requestId.toLowerCase()};
  return {...input, payloadHash:createHash('sha256').update(JSON.stringify([
    input.listingId,input.country,input.message,input.consent
  ])).digest('hex')};
};

// Private identity/contact fields never enter the seeker receipt.
export const seekerReceipt = row => ({
  id:row.id, listingId:row.listing_public_id, country:row.country_code,
  title:row.listing_title, message:row.message, status:row.status,
  response:row.owner_response || null, createdAt:row.created_at,
  updatedAt:row.updated_at, version:row.version
});
export const ownerReceipt = row => ({...seekerReceipt(row),
  seekerName:row.seeker_name, seekerEmail:row.seeker_email,
  propertyId:row.property_id
});

export const parseOwnerAction = body => {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !['status','response','version'].includes(k)) ||
      !['responded','closed'].includes(body.status) || !Number.isInteger(body.version) || body.version < 1 ||
      typeof body.response !== 'string' || body.response.trim().length > 2000 ||
      (body.status === 'responded' && !body.response.trim())) {
    throw enquiryError(400,'INVALID_ENQUIRY_ACTION','Supply a response or close the enquiry using its current version.');
  }
  return {status:body.status,response:body.response.trim(),version:body.version};
};
