import {problem} from './contract.js';

export const listSandboxCollectors = store => store.read(`SELECT id,market,provider,
  receiving_account AS receivingAccount,effective_at_utc AS effectiveAt,approval_reference AS approvalReference
  FROM dbo.management_market_sandbox_collectors ORDER BY market,effective_at_utc DESC`);

export const scheduleSandboxCollector = async (store,actorId,input,authorize) => {
  const market = String(input.market ?? '').trim().toUpperCase();
  const {provider,receivingAccount,effectiveAt,approvalReference} = input;
  if (!/^[A-Z]{2}$/.test(market) || provider !== 'stripe' ||
      typeof receivingAccount !== 'string' || !/^acct_[A-Za-z0-9]{1,123}$/.test(receivingAccount)) {
    throw problem(400,'COLLECTOR_INVALID','Enter the market and its Stripe sandbox account ID.');
  }
  if (typeof effectiveAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/.test(effectiveAt) ||
      !Number.isFinite(Date.parse(effectiveAt)) || new Date(effectiveAt).toISOString() !== effectiveAt ||
      typeof approvalReference !== 'string' || !approvalReference.trim() || approvalReference.length>250) {
    throw problem(400,'COLLECTOR_DECISION_INVALID','Enter a UTC effective minute and an approval reference.');
  }
  const reference = approvalReference.trim();
  const params = {market,provider,receivingAccount,reference,actorId,effective:effectiveAt.slice(0,-1)};
  return store.locked('sandbox-collector:'+market, async q => {
    await authorize(q);
    const [existing] = await q(`SELECT id,provider,receiving_account,approval_reference FROM dbo.management_market_sandbox_collectors
      WHERE market=@market AND effective_at_utc=CONVERT(datetime2,@effective)`,params);
    if (existing) {
      if (existing.provider===provider && existing.receiving_account===receivingAccount && existing.approval_reference===reference) {
        return {id:existing.id};
      }
      throw problem(409,'COLLECTOR_DATE_TAKEN','This market already has a collector assignment at that time.');
    }
    const [when] = await q('SELECT CASE WHEN CONVERT(datetime2,@effective)>SYSUTCDATETIME() THEN 1 ELSE 0 END AS future',params);
    if (!when.future) {throw problem(400,'COLLECTOR_DATE_PAST','Choose a future effective time in UTC.');}
    const [assignment] = await q(`DECLARE @id UNIQUEIDENTIFIER=NEWID();
      INSERT dbo.management_market_sandbox_collectors(id,market,provider,receiving_account,effective_at_utc,approval_reference,created_by)
      VALUES(@id,@market,@provider,@receivingAccount,CONVERT(datetime2,@effective),@reference,@actorId);
      SELECT @id AS id`,params);
    await store.audit(q,{actorId,action:'collector.sandbox.scheduled',resourceId:assignment.id,current:{market,provider,receivingAccount,effectiveAt},reason:reference});
    return assignment;
  });
};
