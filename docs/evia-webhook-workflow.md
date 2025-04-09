# Evia Sign Webhook Workflow Guide

This document explains how the signature notification system works in our rental agreement application.

## What is a Webhook?

A webhook is like a digital messenger that automatically notifies our application when something happens with your document in Evia Sign. Think of it as a "callback" that Evia Sign uses to let our system know when:

1. A signature request is sent
2. Someone signs a document
3. All required signatures are completed

## How Our Signature Process Works

### 1. Sending a Document for Signature

When you click "Send for Signature" in our application:

- The document is uploaded to Evia Sign
- A signature request is created with the signatories' information
- The webhook URL is included so Evia Sign knows where to send updates
- Signatories receive email notifications to sign

### 2. Tracking Signature Progress

As the signing process proceeds:

- When the request is first received, Evia Sign sends a "SignRequestReceived" notification
- When each person signs, Evia Sign sends a "SignatoryCompleted" notification
- Our application updates the status in real-time

### 3. Completing the Signature

Once all required signatures are collected:

- Evia Sign sends a "RequestCompleted" notification
- The completed document is attached to this notification
- Our application stores this signed document
- The agreement status is updated to "signed"

## Testing with webhook.site

For development and testing purposes, we're using a service called webhook.site. This allows us to:

1. See exactly what information Evia Sign is sending
2. Troubleshoot any issues with the signature process
3. Ensure the right data is being transferred

## What to Do if Signatures Aren't Being Tracked

If you notice that signature status isn't being updated properly:

1. Check if the document was successfully sent to Evia Sign (you should see a request ID)
2. Verify signatories received the email notifications
3. Try refreshing the status manually using the "Check Status" button
4. Contact the development team with the agreement ID and signature request ID

## Security Considerations

- All webhook communications happen securely between our servers and Evia Sign
- Document data is transmitted and stored securely
- The signed documents are saved in our encrypted storage system
- Only authorized users can access the signed documents

## Future Improvements

We plan to enhance the signature tracking system with:

- SMS notifications when documents are ready to sign
- Real-time status updates without refreshing the page
- Automated reminders for pending signatures
- More detailed signature audit trails 