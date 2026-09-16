# Storage hotfix smoke test

After deployment:

1. Sign in to KH Rentals.
2. Open a property with an existing image reference.
3. Confirm nested `/storage/images/tenants/.../properties/...` requests no longer return HTTP 500.
4. A missing object should return HTTP 404.
5. Upload a new property image and confirm it renders in the same revision.
6. Durable cross-revision persistence must be validated after production is switched from local storage to R2.
