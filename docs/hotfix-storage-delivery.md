# Storage delivery hotfix

## Production symptom

Nested object URLs such as `/storage/images/tenants/<tenant-id>/properties/<file>.jpg` returned HTTP 500.

## Root cause

The storage delivery handler was mounted at `/storage/:bucket` but read the remaining object path from `req.params[0]`. That parameter is not populated by the mounted route, so the handler could resolve the object path as empty and attempt to read a bucket directory as a file.

## Fix

The handler now resolves the nested object path from the mounted request path, normalizes it through the existing storage path validator, rejects empty object paths as not found, and maps directory reads to HTTP 404 instead of HTTP 500.

## Durable storage note

The Azure bootstrap currently configures `STORAGE_DRIVER=local`. Local Container Apps filesystem data is revision-local/ephemeral and is not a durable production store for uploaded assets. The repository already supports Cloudflare R2 (`STORAGE_DRIVER=r2`); production should be moved to durable object storage before relying on uploaded images surviving future container revisions.
