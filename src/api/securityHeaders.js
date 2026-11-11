import helmet from 'helmet';

export const createSecurityHeaders = ({production=process.env.NODE_ENV==='production'}={}) => helmet({
  referrerPolicy:{policy:'no-referrer'},
  crossOriginOpenerPolicy:{policy:'same-origin-allow-popups'},
  crossOriginEmbedderPolicy:false,
  // Public listing media is consumed by quixo.homes and external rental links.
  // Protected storage still has its own authentication and content policy.
  crossOriginResourcePolicy:{policy:'cross-origin'},
  strictTransportSecurity:production?{maxAge:31536000,includeSubDomains:true}:false,
  contentSecurityPolicy:{directives:{
    defaultSrc:["'self'"],baseUri:["'self'"],formAction:["'self'"],frameAncestors:["'self'"],
    scriptSrc:production?["'self'"]:["'self'","'unsafe-inline'","'unsafe-eval'"],
    scriptSrcAttr:["'none'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],
    fontSrc:["'self'",'data:','https://fonts.gstatic.com'],imgSrc:["'self'",'data:','blob:','https:'],
    connectSrc:["'self'",'https://evia.enadocapp.com','https://webhook.site',...(!production?['ws:','wss:']:[])],
    // Preserve the accepted PDF/blob viewer, provider documents and map iframe.
    frameSrc:["'self'",'blob:','https:'],objectSrc:["'self'",'blob:'],workerSrc:["'self'",'blob:'],
    upgradeInsecureRequests:null
  }}
});
