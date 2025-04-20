const sgMail = require('@sendgrid/mail');

// Store the last 10 email requests for monitoring
const recentEmails = [];
const MAX_LOG_ENTRIES = 10;

// Store last error
let lastError = null;

// Store uptime info
const startTime = new Date();
let totalRequests = 0;
let successfulEmails = 0;
let failedEmails = 0;

// Helper to add to the log
function addToLog(entry) {
    // Add timestamp if not present
    if (!entry.timestamp) {
        entry.timestamp = new Date().toISOString();
    }
    
    // Add to recent emails, keeping only the last MAX_LOG_ENTRIES
    recentEmails.unshift(entry);
    if (recentEmails.length > MAX_LOG_ENTRIES) {
        recentEmails.pop();
    }
}

module.exports = async function (context, req) {
    // Handle GET requests for monitoring
    if (req.method === "GET") {
        context.log("Handling monitoring request");
        
        // Calculate uptime
        const uptime = new Date() - startTime;
        const uptimeDays = Math.floor(uptime / (1000 * 60 * 60 * 24));
        const uptimeHours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        
        // For security, sanitize the log entries
        const sanitizedLogs = recentEmails.map(entry => {
            // Create a copy to avoid modifying the original
            const sanitized = { ...entry };
            
            // Remove sensitive info
            if (sanitized.to) {
                const parts = sanitized.to.split('@');
                if (parts.length > 1) {
                    sanitized.to = `${parts[0].substring(0, 2)}...@${parts[1]}`;
                }
            }
            
            // Remove content, just indicate presence
            if (sanitized.html) {
                sanitized.html = `[HTML Content: ${sanitized.html.length} chars]`;
            }
            
            if (sanitized.text) {
                sanitized.text = `[Text Content: ${sanitized.text.length} chars]`;
            }
            
            if (sanitized.payload) {
                delete sanitized.payload;
            }
            
            return sanitized;
        });
        
        // Return status information
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: {
                status: "running",
                version: "1.0",
                startTime: startTime.toISOString(),
                uptime: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`,
                stats: {
                    totalRequests,
                    successfulEmails,
                    failedEmails,
                    successRate: totalRequests > 0 ? (successfulEmails / totalRequests * 100).toFixed(2) + '%' : 'N/A'
                },
                lastError: lastError ? {
                    message: lastError.message,
                    timestamp: lastError.timestamp,
                    code: lastError.code
                } : null,
                environment: {
                    hasApiKey: !!process.env.SENDGRID_API_KEY,
                    fromEmail: process.env.EMAIL_FROM || 'madhumathi@kubeira.com',
                    fromName: process.env.EMAIL_FROM_NAME || 'KH Rentals',
                    nodeEnv: process.env.NODE_ENV || 'not set'
                },
                recentActivity: sanitizedLogs
            }
        };
        return;
    }

    totalRequests++;
    context.log('=============== START EMAIL REQUEST ===============');
    context.log(`Received request at: ${new Date().toISOString()}`);
    context.log(`Request headers: ${JSON.stringify(req.headers)}`);
    
    // Create a log entry for this request
    const logEntry = {
        timestamp: new Date().toISOString(),
        requestId: context.invocationId,
        clientRequestId: req.headers && req.headers['x-client-request-id'],
        success: false
    };
    
    try {
        // Log request body (sanitized for security)
        const sanitizedBody = req.body ? {
            to: req.body.to,
            subject: req.body.subject,
            hasHtml: !!req.body.html,
            hasText: !!req.body.text,
            hasAttachments: !!(req.body.attachments && req.body.attachments.length > 0),
            attachmentsCount: req.body.attachments ? req.body.attachments.length : 0,
            clientRequestId: req.body.clientRequestId,
            clientInfo: req.body.clientInfo
        } : null;
        
        // Add client info to log entry
        if (req.body && req.body.clientInfo) {
            logEntry.clientInfo = req.body.clientInfo;
        }
        
        if (req.body && req.body.clientRequestId) {
            logEntry.clientRequestId = req.body.clientRequestId;
        }
        
        context.log(`Request body (sanitized): ${JSON.stringify(sanitizedBody)}`);
        
        // Check if required data is present
        if (!req.body || !req.body.to || !req.body.subject || (!req.body.html && !req.body.text)) {
            const errorMsg = "Missing required fields. Required: to, subject, and either html or text";
            context.log.error(`Validation Error: ${errorMsg}`);
            context.log(`Missing fields: ${!req.body ? 'entire body' : 
                (!req.body.to ? 'to, ' : '') + 
                (!req.body.subject ? 'subject, ' : '') + 
                (!req.body.html && !req.body.text ? 'html/text' : '')}`);
            
            // Update log with error
            logEntry.error = errorMsg;
            logEntry.errorType = 'validation';
            addToLog(logEntry);
            
            // Update last error
            lastError = {
                message: errorMsg,
                timestamp: new Date().toISOString(),
                code: 'VALIDATION_ERROR'
            };
            
            failedEmails++;
            
            context.res = {
                status: 400,
                body: {
                    success: false,
                    error: errorMsg,
                    timestamp: new Date().toISOString(),
                    requestId: context.invocationId
                }
            };
            context.log('=============== END EMAIL REQUEST (VALIDATION ERROR) ===============');
            return;
        }
        
        // Add basic info to log entry
        logEntry.to = req.body.to;
        logEntry.subject = req.body.subject;
        
        // Get SendGrid API key from environment variable
        const apiKey = process.env.SENDGRID_API_KEY;
        if (!apiKey) {
            context.log.error("SENDGRID_API_KEY not set in environment variables");
            
            // Log environment variables (excluding sensitive ones)
            const safeEnvVars = {};
            Object.keys(process.env).forEach(key => {
                if (!key.includes('KEY') && !key.includes('SECRET') && !key.includes('PASSWORD')) {
                    safeEnvVars[key] = process.env[key];
                } else {
                    safeEnvVars[key] = '[REDACTED]';
                }
            });
            
            context.log(`Available environment variables: ${JSON.stringify(safeEnvVars)}`);
            
            // Update log with error
            logEntry.error = "Email service is not configured properly";
            logEntry.errorType = 'configuration';
            addToLog(logEntry);
            
            // Update last error
            lastError = {
                message: "Email service is not configured properly",
                timestamp: new Date().toISOString(),
                code: 'CONFIG_ERROR'
            };
            
            failedEmails++;
            
            context.res = {
                status: 500,
                body: {
                    success: false,
                    error: "Email service is not configured properly",
                    details: "API key is missing",
                    timestamp: new Date().toISOString(),
                    requestId: context.invocationId
                }
            };
            context.log('=============== END EMAIL REQUEST (CONFIG ERROR) ===============');
            return;
        }
        
        // Log email configuration (excluding sensitive data)
        context.log(`Using email configuration: FROM=${process.env.EMAIL_FROM || 'noreply@khrentals.com'}, FROM_NAME=${process.env.EMAIL_FROM_NAME || 'KH Rentals'}`);
        
        // Set the API key
        sgMail.setApiKey(apiKey);
        
        // Extract email details from the request
        const { 
            to, 
            subject, 
            html, 
            text,
            from = process.env.EMAIL_FROM || 'madhumathi@kubeira.com',
            fromName = process.env.EMAIL_FROM_NAME || 'KH Rentals',
            attachments = [] 
        } = req.body;
        
        // Log the email request (exclude sensitive data)
        context.log(`Preparing email to ${to} with subject: "${subject}"`);
        context.log(`Content type: ${html ? 'HTML' : ''}${html && text ? ' and ' : ''}${text ? 'Text' : ''}`);
        context.log(`Attachments: ${attachments.length}`);
        
        // Create the email message
        const msg = {
            to,
            from: {
                email: from,
                name: fromName
            },
            subject,
            attachments
        };
        
        // Add content (either HTML or text or both)
        if (html) {
            msg.html = html;
            context.log(`HTML content length: ${html.length} characters`);
        }
        
        if (text) {
            msg.text = text;
            context.log(`Text content length: ${text.length} characters`);
        }
        
        // Log before sending
        context.log('Sending email via SendGrid API...');
        
        try {
            // Send the email
            const sendResult = await sgMail.send(msg);
            
            // Log successful response
            context.log(`SendGrid API Response: ${JSON.stringify(sendResult)}`);
            context.log('Email sent successfully!');
            
            // Update log entry with success
            logEntry.success = true;
            logEntry.sendGridResponse = {
                statusCode: sendResult[0]?.statusCode
            };
            addToLog(logEntry);
            
            successfulEmails++;
            
            // Return success response
            context.res = {
                status: 200,
                body: {
                    success: true,
                    message: "Email sent successfully",
                    to,
                    subject,
                    sendGridResponse: {
                        statusCode: sendResult[0]?.statusCode,
                        headers: sendResult[0]?.headers,
                    },
                    timestamp: new Date().toISOString(),
                    requestId: context.invocationId
                }
            };
            
            context.log('=============== END EMAIL REQUEST (SUCCESS) ===============');
        } catch (sendError) {
            // Handle SendGrid specific errors
            context.log.error(`SendGrid Error: ${sendError.message}`);
            
            if (sendError.response) {
                context.log.error(`SendGrid Status Code: ${sendError.response.statusCode}`);
                context.log.error(`SendGrid Error Body: ${JSON.stringify(sendError.response.body)}`);
            }
            
            // Update log entry with error
            logEntry.error = sendError.message;
            logEntry.errorType = 'sendgrid';
            if (sendError.response) {
                logEntry.statusCode = sendError.response.statusCode;
                logEntry.errorDetails = sendError.response.body;
            }
            addToLog(logEntry);
            
            // Update last error
            lastError = {
                message: sendError.message,
                timestamp: new Date().toISOString(),
                code: sendError.code || sendError.response?.body?.code || 'SENDGRID_ERROR'
            };
            
            failedEmails++;
            
            context.res = {
                status: 502, // Bad Gateway - upstream service failed
                body: {
                    success: false,
                    error: "Email provider error",
                    message: sendError.message,
                    details: sendError.response ? sendError.response.body : null,
                    statusCode: sendError.code || sendError.response?.statusCode,
                    timestamp: new Date().toISOString(),
                    requestId: context.invocationId
                }
            };
            
            context.log('=============== END EMAIL REQUEST (SENDGRID ERROR) ===============');
        }
    } catch (error) {
        // Log general errors
        context.log.error(`General Error: ${error.message}`);
        context.log.error(`Error Stack: ${error.stack}`);
        
        // Update log entry with error
        logEntry.error = error.message;
        logEntry.errorType = 'general';
        logEntry.stack = error.stack;
        addToLog(logEntry);
        
        // Update last error
        lastError = {
            message: error.message,
            timestamp: new Date().toISOString(),
            code: 'GENERAL_ERROR'
        };
        
        failedEmails++;
        
        // Return error response
        context.res = {
            status: 500,
            body: {
                success: false,
                error: "Internal server error",
                message: error.message,
                stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
                timestamp: new Date().toISOString(),
                requestId: context.invocationId
            }
        };
        
        context.log('=============== END EMAIL REQUEST (GENERAL ERROR) ===============');
    }
}; 