# Production storage follow-up

The nested delivery-path 500 is fixed by the storage delivery hotfix.

Production durability remains a separate deployment configuration task. Azure Container Apps local filesystem storage is not an appropriate persistent store for uploaded property images across revisions. KH Rentals already supports Cloudflare R2; switch the production Container App to `STORAGE_DRIVER=r2` with the required R2 credentials, then validate upload/read/delete flows before relying on uploaded assets surviving future deployments.
