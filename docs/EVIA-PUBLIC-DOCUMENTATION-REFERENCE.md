# Evia public API documentation reference

Source review: 3 November 2026. This note contains public documentation references only; it does not record production identifiers, credentials, request payloads or operational diagnostics.

| Area | Public documentation finding |
| --- | --- |
| V2 authorization-code exchange | POST to `https://evia.enadocapp.com/_apis/falcon/auth/api/v2/token`, Basic client authentication, URL-encoded `grant_type`, `client_id`, `client_secret` and `code`. |
| V2 refresh | The detailed token guide specifies multipart `Refresh_Token` and `Grant_Type=Refresh_Token`, with Basic client authentication. |
| Authorization request | The V1 guide uses `responce_type` and omits scope. The V2 guide uses `response_type` and lists `scope` as required. This is a documented version difference. |
| App permissions | Current registration screenshots show `documents:read`, `audit:read` and `webhook.documents.download`. The pages do not specify exactly which combination the audit-PDF endpoint enforces. |
| API keys | A key can use only scopes granted to its app. |
| Provider evidence | App details include Webhooks and Activity tabs for linked endpoints, document access and delivery status. |
| Request callbacks | Callback type 0 means all events. `CompletedDocumentsAttached=true` is described as attaching signed PDFs, without an explicit guarantee of an audit PDF or completed-package descriptor. |
| Retrieval | The document-list route returns exact opaque download URLs. The package route uses the verified completion event's URL and expiring token. |
| Historical recovery | No package-token reissue or webhook-redelivery API was found in the reviewed pages. Retry/idempotency advice does not establish such an API. |

Permission labels and documentation differences are investigation leads, not proof of an installation's configuration or the cause of a download failure.

## Sources

- [V1 authorization](https://docs.sign.enadocapp.com/evia-sign-api/v1/authorization-of-the-api-access)
- [V2 token migration](https://docs.sign.enadocapp.com/evia-sign-api/v2/how-to-migrate-from-api-v1-to-v2/access-token-request-v1-v2)
- [V2 authorization request](https://docs.sign.enadocapp.com/evia-sign-api/v2/authorization-and-authentication/requesting-the-authorization-code)
- [Token exchange and refresh](https://docs.sign.enadocapp.com/evia-sign-api/v2/authorization-and-authentication/exchange-authorization-code-for-access-token)
- [Registration and scope screenshots](https://docs.sign.enadocapp.com/evia-sign-api/v2/authorization-and-authentication/how-to-register-your-application)
- [API Apps, keys, linked webhooks and activity](https://docs.sign.enadocapp.com/evia-sign-api/v2/authorization-and-authentication/api-app-credentials-and-api-keys)
- [Request callback options](https://docs.sign.enadocapp.com/evia-sign-api/v2/creating-a-signature-request)
- [Completed-document retrieval](https://docs.sign.enadocapp.com/evia-sign-api/v2/webhook-management/retrieve-completed-documents-from-a-webhook)
- [Completed-package retrieval](https://docs.sign.enadocapp.com/evia-sign-api/v2/webhook-management/store-completed-documents-in-sharepoint-using-microsoft-power-automate)
