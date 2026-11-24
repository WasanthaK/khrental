import {identifier, problem} from './contract.js';

const code = value => {
  if (typeof value !== 'string' || !/^[a-z]{2}$/i.test(value.trim())) {
    throw problem(400, 'ISSUER_COUNTRY_INVALID', 'Enter a two-letter country code.');
  }
  return value.trim().toUpperCase();
};

const requiredText = (value, limit, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) {
    throw problem(400, 'ISSUER_TEXT_INVALID', `Enter ${label} (up to ${limit} characters).`);
  }
  return value.trim();
};

export const listIssuerAssignments = store => store.read(`
  SELECT a.id, a.market, i.legal_name AS legalName, i.country_code AS issuerCountry,
    a.effective_at_utc AS effectiveAt, a.approval_reference AS approvalReference,
    CASE WHEN a.effective_at_utc IS NULL THEN 'Draft'
      WHEN a.effective_at_utc > SYSUTCDATETIME() THEN 'Scheduled'
      WHEN a.id = active.assignment_id THEN 'Current' ELSE 'Historical' END AS status
  FROM dbo.management_market_issuer_assignments a
  JOIN dbo.management_invoice_issuers i ON i.id=a.issuer_id
  OUTER APPLY dbo.management_invoice_issuer_at(a.market,SYSUTCDATETIME()) active
  ORDER BY a.market, a.effective_at_utc DESC, i.legal_name, a.id`);

export const saveIssuerDraft = async (store, actorId, input) => {
  const params = {market: code(input.market), country: code(input.issuerCountry),
    name: requiredText(input.legalName, 200, 'the registered company name')};
  return store.locked('issuer-administration', async q => {
    let [issuer] = await q('SELECT id FROM dbo.management_invoice_issuers WHERE country_code=@country AND legal_name=@name', params);
    if (!issuer) {
      [issuer] = await q(`DECLARE @newId UNIQUEIDENTIFIER=NEWID();
        INSERT dbo.management_invoice_issuers(id,legal_name,country_code) VALUES(@newId,@name,@country);
        SELECT @newId AS id`, params);
    }
    const assignment = {market: params.market, issuerId: issuer.id};
    const [existing] = await q(`SELECT id FROM dbo.management_market_issuer_assignments
      WHERE market=@market AND issuer_id=@issuerId AND effective_at_utc IS NULL`, assignment);
    if (existing) {return existing;}
    const [draft] = await q(`DECLARE @newId UNIQUEIDENTIFIER=NEWID();
      INSERT dbo.management_market_issuer_assignments(id,market,issuer_id) VALUES(@newId,@market,@issuerId);
      SELECT @newId AS id`, assignment);
    await store.audit(q, {actorId, action:'issuer.assignment.draft', resourceId:draft.id, current:assignment, reason:'Created market invoice issuer draft.'});
    return draft;
  });
};

export const scheduleIssuer = async (store, actorId, assignmentId, input) => {
  const id = identifier(assignmentId);
  const reference = requiredText(input.approvalReference, 250, 'an approval reference');
  const instant = input.effectiveAt;
  if (typeof instant !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/.test(instant) ||
      !Number.isFinite(Date.parse(instant)) || new Date(instant).toISOString() !== instant) {
    throw problem(400, 'ISSUER_DATE_INVALID', 'Enter the effective date and time in UTC, to the minute.');
  }
  return store.locked('issuer-administration', async q => {
    const [row] = await q(`SELECT market, effective_at_utc, approval_reference
      FROM dbo.management_market_issuer_assignments WHERE id=@id`, {id});
    if (!row) {throw problem(404, 'ISSUER_ASSIGNMENT_MISSING', 'This issuer assignment could not be found.');}
    if (row.effective_at_utc) {
      if (new Date(row.effective_at_utc).toISOString() === instant && row.approval_reference === reference) {return {id};}
      throw problem(409, 'ISSUER_ALREADY_SCHEDULED', 'This draft has already been scheduled. Reload the issuer history.');
    }
    const params = {id, market:row.market, effective:instant.slice(0,-1), reference};
    const [check] = await q(`SELECT CASE WHEN CONVERT(datetime2,@effective)<=SYSUTCDATETIME() THEN 1 ELSE 0 END AS past,
      (SELECT COUNT(*) FROM dbo.management_market_issuer_assignments WHERE market=@market
        AND effective_at_utc=CONVERT(datetime2,@effective)) AS conflicts`, params);
    if (check.past) {throw problem(400, 'ISSUER_DATE_PAST', 'Choose a future UTC date and time.');}
    if (check.conflicts) {throw problem(409, 'ISSUER_DATE_TAKEN', 'This market already has an issuer change at that time.');}
    await q(`UPDATE dbo.management_market_issuer_assignments SET effective_at_utc=CONVERT(datetime2,@effective),
      approval_reference=@reference WHERE id=@id`, params);
    await store.audit(q, {actorId, action:'issuer.assignment.scheduled', resourceId:id, current:{market:row.market,effectiveAt:instant,reference}, reason:reference});
    return {id};
  });
};
