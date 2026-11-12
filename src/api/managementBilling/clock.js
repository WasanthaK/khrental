// Application/provider time only. SQL authorization and durable leases retain
// locked SYSUTCDATETIME(). This dependency is never chosen by an HTTP request.
export const billingClock=Object.freeze({now:()=>Date.now()});
