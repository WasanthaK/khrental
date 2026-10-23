// Read-only one-shot selection of a demo tenant for the I02 invoice pilot.
// This uses the serving app's existing SQL read connection. Do not log
// names, emails, addresses, bank accounts, invoice IDs or tokens.
(async () => {
  if (process.env.INVOICE_IMMUTABLE_ARCHIVE_ENABLED === 'true') {
    throw Error('Archive feature unexpectedly active; stop discovery.');
  }
  const { getMssqlPool, closeMssqlPool } = await import('./src/api/mssql/pool.js');
  try {
    const pool = await getMssqlPool();
    const result = await pool.request().query(`
      SELECT TOP (12)
        LOWER(CONVERT(nvarchar(36), t.id)) AS tenant_id,
        (SELECT COUNT_BIG(*) FROM dbo.properties p WHERE p.tenant_id=t.id) AS properties,
        (SELECT COUNT_BIG(*) FROM dbo.invoices i WHERE i.tenant_id=t.id
          AND LOWER(ISNULL(i.status, ''))='draft') AS drafts,
        (SELECT COUNT_BIG(*) FROM dbo.invoices i
          INNER JOIN dbo.app_users au ON au.id=i.renteeid AND au.tenant_id=i.tenant_id
          WHERE i.tenant_id=t.id AND LOWER(ISNULL(i.status, ''))='draft'
          AND au.email LIKE '%_@_%._%') AS drafts_with_renter_email,
        (SELECT COUNT_BIG(*) FROM dbo.tenant_memberships tm
          WHERE tm.tenant_id=t.id) AS memberships,
        CASE WHEN NULLIF(LTRIM(RTRIM(ts.invoice_issuer_profile_json)), '') IS NULL
          THEN 0 ELSE 1 END AS has_issuer_profile
      FROM dbo.tenants t
      LEFT JOIN dbo.tenant_settings ts ON ts.tenant_id=t.id
      ORDER BY
        (SELECT COUNT_BIG(*) FROM dbo.invoices i
          INNER JOIN dbo.app_users au ON au.id=i.renteeid AND au.tenant_id=i.tenant_id
          WHERE i.tenant_id=t.id AND LOWER(ISNULL(i.status, ''))='draft'
          AND au.email LIKE '%_@_%._%') DESC,
        (SELECT COUNT_BIG(*) FROM dbo.properties p WHERE p.tenant_id=t.id) DESC,
        t.id ASC;
    `);
    const rows = result.recordset.map(r => ({
      tenant_id: String(r.tenant_id).toLowerCase(),
      properties: Number(r.properties || 0),
      drafts: Number(r.drafts || 0),
      drafts_with_renter_email: Number(r.drafts_with_renter_email || 0),
      memberships: Number(r.memberships || 0),
      has_issuer_profile: r.has_issuer_profile === 1 || r.has_issuer_profile === true
    }));
    if (!rows.length) throw Error('No tenant available for controlled demo pilot.');
    const selected = rows.find(r => r.properties>0 && r.drafts_with_renter_email>0)
      || rows.find(r => r.properties>0 && r.memberships>0) || rows[0];
    console.log('I02_DEMO_TENANT_READ_ONLY_OK');
    console.log(JSON.stringify({
      selected,
      total_candidates_inspected: rows.length,
      archive_feature_enabled: false,
      note: 'Selected only; no invoice issued, email sent, tenant modified or archive flag enabled.'
    }));
  } finally {
    await closeMssqlPool().catch(() => {});
  }
})().catch(e => {
  console.error('I02_DEMO_TENANT_READ_ONLY_FAILED: ' + (e?.message || String(e)));
  process.exitCode=1;
});
