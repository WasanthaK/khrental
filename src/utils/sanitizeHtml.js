import DOMPurify from 'dompurify';

// Stored agreements/templates are untrusted at every browser entry point,
// including legacy records and merge results. Keep legal-document formatting
// and tables while removing active markup, events and unsafe URL schemes.
export const sanitizeHtml = value => typeof DOMPurify.sanitize === 'function'
  ? DOMPurify.sanitize(String(value ?? ''), {
    USE_PROFILES:{html:true},
    FORBID_TAGS:['style','iframe','object','embed','form','input','button','textarea','select','link','meta','base'],
    FORBID_ATTR:['srcdoc','formaction'],
    SANITIZE_NAMED_PROPS:true
  }) : ''; // Server/no-DOM rendering fails closed.
