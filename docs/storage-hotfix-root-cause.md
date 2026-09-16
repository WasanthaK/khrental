# Root cause

`createStorageDeliveryHandler` was mounted beneath `/storage/:bucket` but attempted to obtain the remaining nested object path from `req.params[0]`. The mounted route did not populate that wildcard parameter. The handler now resolves the remaining mounted request path instead.
