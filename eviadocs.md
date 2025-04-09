The Evia Sign API has been introduced to facilitate user access to Evia Sign resources. Users become eligible to submit requests to the Evia Sign API upon the completion of the application registration and authorization processes. The primary goal of the Evia Sign API documentation is to delineate the steps users must follow for application registration, obtaining authorization, and comprehensively outlining the details of Evia Sign API methods to facilitate seamless access to Evia Sign resources.

Access to the Evia Sign API service is restricted to authorized applications only.

The document's scope encompasses the following key components:

1. **Application Registration Process:** This section provides detailed guidance on the process of registering applications for interaction with the Evia Sign API.

2. **Authorization Acquisition:** Users will find comprehensive information on obtaining the necessary authorization to access the Evia Sign API in this section.

3. **API Methods for Accessing Evia Sign Resources:** This crucial section details the specific API methods available for interacting with various Evia Sign resources.


[PreviousEvia Sign API](https://docs.sign.enadocapp.com/evia-sign-api) [NextAuthorization of the API Access](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access)


## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#steps-to-register-a-client-application)    Steps to Register a Client Application

To initiate the registration of a client application with Evia Sign, the client is required to initiate contact with the Evia Sign team through email. During this communication, the client should provide their designated redirect URL for their external application, which serves as a crucial component for the registration process.

Upon successful communication and collaboration with the Evia Sign team, the client's application will be formally registered. Subsequently, the client will receive their unique Client ID and Client Secret, which are essential credentials for authentication and authorization processes.

It is imperative to note that the client's redirect URL, which was initially shared, plays a pivotal role in the overall process.

Following a successful login event, the OAuth code will be returned to the specified redirect URL, facilitating seamless integration and interaction between the client's application and the Evia Sign platform.

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#key-parameters)    Key Parameters:

- `client_id`: The Application ID assigned by the Evia Sign developer team during the registration process.

- `client_secret`: The Application Key provided by the Evia Sign developer team for secure access and authentication.

- `redirect_url`: The URL specified by the client during registration, to which the OAuth code will be returned upon successful login.


## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#obtaining-authorization-for-evia-resources)    Obtaining Authorization for Evia Resources

To obtain authorization, utilize the assigned client ID and client secret to acquire the authorization URL from the system. When requesting an access token and refresh token, specify the grant type as ' **authorization code.**'

The resulting access token facilitates access to Evia resources through the Evia API. As this process involves a redirection-based flow, it is imperative that the client possesses the capability to engage with the resource owner's user-agent, typically a web browser.

Furthermore, the client should be equipped to receive incoming requests, particularly through redirection, from the authorization server.

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#the-evia-identity-provider-eip)    The EVIA-IDENTITY-PROVIDER (EIP)

This serves as the central system responsible for furnishing user identifiers for interactions with Evia. EIP takes charge of user authentication, maintaining a comprehensive record of user login details. It also oversees the management of Enadoc organization information and user data. To engage with Evia resources via the Evia API, clients need to possess both the Evia website URL and the EIP URL. This ensures proper access and authentication for seamless integration with Evia services.

Refer to the provided image for the Evia Sign SaaS app URL to gain an understanding of the associated EIP URL:

![](https://docs.sign.enadocapp.com/~gitbook/image?url=https%3A%2F%2F627660952-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FNIlngTYM9Z8O6hJJLEe3%252Fuploads%252F2wPhTGbxUY3MehLHj45z%252FScreenshot%25202023-12-15%2520131943.png%3Falt%3Dmedia%26token%3D8f173350-300c-42c0-a661-8b9120c65769&width=768&dpr=4&quality=100&sign=2df4ff3a&sv=2)

EIP URL

## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#get-authorization-url)    Get Authorization URL

After obtaining the client ID and client secret, you can proceed to construct the client authorization URL using the specified format.

Utilize your assigned **client ID** and **redirect URL** in accordance with the provided guidelines to generate the authorization URL.

This URL serves as the Authorization URL, allowing you to input your unique **Client ID** and the **Redirect URL** for authentication purposes.

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line] whitespace-pre-wrap
https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize?application_state=external&resource=RESOURCE_APPLICATION&client_id={client_id}
&responce_type=code&redirect_uri={redirectURL}
```

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#error-messages)    **Error Messages**

Error

Error Decription

If access token is invalid

Invalid access token

If access token is expired

Access token is expired

If user does not exist in the system

User does not exist in the system. Please contact administrator

If network error occurred

Error! Please check your internet connection and try again.

## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#get-access-token)    Get Access Token

This endpoint, activated by a **GET** request to the designated URL with the access token included as a header, facilitates the retrieval of the access token for Evia Sign. Upon successful execution, it responds with a status code of 200 and presents the login page.

`POST` `https://evia.enadocapp.com/_apis/falcon/auth/api/v1/Token`

#### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#headers)    Headers

Name

Type

Description

Authorization

Bearer

Access token should be sent as request header

200: OK

If the request proceeds successfully, you will receive status code 200 with the login page to Evia Sign.

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#request-body)    **Request Body**

Upon a successful request to obtain the Access Token, the API provides a response containing relevant information, including the access token and additional details.

Here's a breakdown of the response body:

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
{
       "client_id":"<Client ID>",
       "client_secret":"<Client Secret>",
       "code":"<code>",
       "grant_type":"authorization_code"
 }
```

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#response-body)    Response Body

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
{
    "authToken": "Auth Token",
    "refreshToken": "Refresh Token"
}
```

## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#refresh-token)    Refresh Token

Triggered by a **GET** request to the specified URL, accompanied by the access token as a header, this endpoint is designed to refresh the access token for Evia Sign. Upon successful execution, it responds with a status code of 200, providing access to the login page, and issues a refresh token for future utilization

`POST` `https://evia.enadocapp.com/_apis/falcon/auth/api/v1/Token`

#### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#headers-1)    Headers

Name

Type

Description

Authorization

Bearer

Access token should be sent as request header

200: OK

If the request proceeds successfully, you will receive status code 200 with the login page to Evia Sign.

#### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access\#request-body-1)    Request Body

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
{
       "client_id":"<Client ID>",
       "client_secret":"<Client Secret>",
       "refresh_token":"'Refresh Token'",
       "grant_type":"refresh_token"
 }
```

**Response Body**

Upon a successful request to refresh the access token, the API provides a response containing relevant information, including the refreshed access token and additional details.

Here's a breakdown of the response body:

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
{
    "authToken": "Auth Token",
    "refreshToken": "Refresh Token"
}
```

[PreviousOverview](https://docs.sign.enadocapp.com/evia-sign-api/overview) [NextRequests](https://docs.sign.enadocapp.com/evia-sign-api/requests)

In the initial phase of the document upload process, upon successful completion, a document token is issued as a unique identifier for the uploaded document. This token plays a crucial role in the subsequent step, enabling the seamless initiation of a sign request associated with the uploaded document. Serving as a key element, the document token establishes a connection between the uploaded content and the sign request, enhancing the workflow for a more efficient and secure document signing experience.

## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests/document-upload\#document-endpoint)    Document Endpoint

This API offers endpoints for handling document-related operations, including fetching document pages, and uploading documents to a rendering service. These operations require proper authorization through an access token included in the request header.

## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests/document-upload\#document-upload)    **Document Upload**

This API endpoint facilitates the upload of documents to the Evia Sign platform.

`POST` `https://evia.enadocapp.com/_apis/sign/thumbs/api/Requests/document`

#### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests/document-upload\#headers)    Headers

Name

Type

Description

Authorization

Bearer

Access token should be sent as request header

#### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests/document-upload\#request-body)    Request Body

Name

Type

Description

File

The body contains the document data in a supported format. (PDF, DOC, DOCX)

200: OK

The body of the response contains the document data, formatted in a supported file type such as PDF, DOC, or DOCX. Ensure that the uploaded document adheres to the specified format requirements.

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests/document-upload\#response-body)    Response Body

The response body will include the document token for identification and reference purposes.

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests/document-upload\#error-messages)    Error Messages

Error

Error Description

If access token is invalid

Invalid access token

If access token is expired

Access token is expired

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests/document-upload\#upload-document-for-signing)    **Upload Document for Signing**

`POST` `/` [`https://evia.enadocapp.com/_apis/sign/api/drafts/documents`](https://evia.enadocapp.com/_apis/sign/api/Drafts/documents)

This API allows users to send documents stored in any Storage service, including SharePoint, OneDrive, or other file storage solutions, to the Evia Sign application for digital signing. The selected document from Storage will be opened in Evia Sign for further actions like signing, adding recipients, and completing the signing process.

JavaScriptPythonRuby

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
{
   "Documents":[\
      "documentId1",\
      "documentId2",\
      "documentId3"\
   ],
   "WebhookUrl":"https://webhook.site/SampleUrl"
}
```

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
message = "hello world"
print(message)
```

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
message = "hello world"
puts message
```

**Response**

200400

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
{
    "requestId": "e0b91887-383e-49a8-9775-6242774618e6",
    "draftRequestUrl":"https://evia.enadocapp.com/#/docview/draft/e0b91887-383e-49a8-9775-6242774618e6?tab=draftTab&filter=All&from=eviaSign_inbox&zm=ftw"
}
```

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
{
  "error": "Invalid request"
}
```

[PreviousRequests](https://docs.sign.enadocapp.com/evia-sign-api/requests) [NextSend Requests](https://docs.sign.enadocapp.com/evia-sign-api/requests/send-requests)

In the initial phase of the document upload process, upon successful completion, a document token is issued as a unique identifier for the uploaded document. This token plays a crucial role in the subsequent step, enabling the seamless initiation of a sign request associated with the uploaded document. Serving as a key element, the document token establishes a connection between the uploaded content and the sign request, enhancing the workflow for a more efficient and secure document signing experience.

## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests\#document-endpoint)    Document Endpoint

This API offers endpoints for handling document-related operations, including fetching document pages, and uploading documents to a rendering service. These operations require proper authorization through an access token included in the request header.

## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests\#document-upload)    **Document Upload**

This API endpoint facilitates the upload of documents to the Evia Sign platform.

`POST` `https://evia.enadocapp.com/_apis/sign/thumbs/api/Requests/document`

#### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests\#headers)    Headers

Name

Type

Description

Authorization

Bearer

Access token should be sent as request header

#### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests\#request-body)    Request Body

Name

Type

Description

File

The body contains the document data in a supported format. (PDF, DOC, DOCX)

200: OK

The body of the response contains the document data, formatted in a supported file type such as PDF, DOC, or DOCX. Ensure that the uploaded document adheres to the specified format requirements.

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests\#response-body)    Response Body

The response body will include the document token for identification and reference purposes.

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests\#error-messages)    Error Messages

Error

Error Description

If access token is invalid

Invalid access token

If access token is expired

Access token is expired

## [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests\#creating-the-signature-request)    Creating the Signature Request

This API endpoint enables the creation of a new signature request.

Submit a **POST** request to the specified URL with the access token provided as a header to initiate the process.

`POST` `https://evia.enadocapp.com/api/Requests?type=1,2,3`

#### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests\#headers-1)    Headers

Name

Type

Description

Authorization

Bearer

Access token should be sent as request header

200: OK

Upon successful creation, a status code of 200 is returned, confirming the successful initiation of the sign request.

**Three Methods to Create a Sign Request**

Type

Description

1

Initiate Signature Request from Template

2

Fixed Positioning for Standard Signature Request

3

Auto Stamping - (This is under the development phase)

**Request Body for Template**

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
{
        "templateId": "05117898-90db-45e5-b6b8-0230fd326e4f",
        "signatories":
        [\
            {\
                "roleId": "9e7bb576-a2da-9fdc-d99c-958063dcfa19",\
                "signatoryUserName": "Alison",\
                "signatoryUserEmail": "alison@gmail.com"\
            },\
            {\
                "roleId": "dd0caa50-58e1-bf28-441b-556bf70d5fc0",\
                "signatoryUserName": "Stev Smith",\
                "signatoryUserEmail": "stev@gmail.com"\
            },\
            {\
                "roleId": "0612c8de-52b0-dc18-9a95-447041ebbe56",\
                "signatoryUserName": "Jhone doe",\
                "signatoryUserEmail": "jhone@gmail.com"\
            }\
        ]
}
```

**Request Body for Fixed Positioning**

Copy

```inline-grid min-w-full grid-cols-[auto_1fr] p-2 [count-reset:line]
{
  "Message": "Message",
  "Title": "Title",
  "IsParallelSign": true,
  "Documents": [\
    "document token"\
  ],
  "Signatories": [\
    {\
      "Color": "#7c95f4",\
      "Email": "sample@gmail.com",\
      "Name": "Jhone Doe",\
      "Order": 1,\
      "PrivateMessage": "Private Message",\
      "signatoryType": 1,\
      "OTP": {\
        "IsRequired": true,\
        "AccessCode": "12345",\
        "Type": "2",\
        "MobileNumber": "+94711234567"\
      },\
      "Stamps": [\
        {\
          "Color": "#7c95f4",\
          "DocumentToken": "document token",\
          "Order": 1,\
          "Location": {\
            "X": 100.5,\
            "Y": 105.5\
          },\
          "StampSize": {\
            "Height": 50,\
            "Width": 100\
          },\
          "PageNumber": 1,\
          "PageHeight": 1000,\
          "PageWidth": 500,\
          "Type": "signature"\
        }\
      ]\
    }\
  ]
}

```

### [Direct link to heading](https://docs.sign.enadocapp.com/evia-sign-api/requests\#undefined-2)

[PreviousAuthorization of the API Access](https://docs.sign.enadocapp.com/evia-sign-api/authorization-of-the-api-access) [NextDocument Upload](https://docs.sign.enadocapp.com/evia-sign-api/requests/document-upload)


Authorization of the API Access
Steps to Register a Client Application
To initiate the registration of a client application with Evia Sign, the client is required to initiate contact with the Evia Sign team through email. During this communication, the client should provide their designated redirect URL for their external application, which serves as a crucial component for the registration process.

Upon successful communication and collaboration with the Evia Sign team, the client's application will be formally registered. Subsequently, the client will receive their unique Client ID and Client Secret, which are essential credentials for authentication and authorization processes.

It is imperative to note that the client's redirect URL, which was initially shared, plays a pivotal role in the overall process. 

Following a successful login event, the OAuth code will be returned to the specified redirect URL, facilitating seamless integration and interaction between the client's application and the Evia Sign platform.

Key Parameters:
client_id: The Application ID assigned by the Evia Sign developer team during the registration process.

client_secret: The Application Key provided by the Evia Sign developer team for secure access and authentication.

redirect_url: The URL specified by the client during registration, to which the OAuth code will be returned upon successful login.

Obtaining Authorization for Evia Resources
To obtain authorization, utilize the assigned client ID and client secret to acquire the authorization URL from the system. When requesting an access token and refresh token, specify the grant type as 'authorization code.' 

The resulting access token facilitates access to Evia resources through the Evia API. As this process involves a redirection-based flow, it is imperative that the client possesses the capability to engage with the resource owner's user-agent, typically a web browser. 

Furthermore, the client should be equipped to receive incoming requests, particularly through redirection, from the authorization server.

The EVIA-IDENTITY-PROVIDER (EIP) 
This serves as the central system responsible for furnishing user identifiers for interactions with Evia. EIP takes charge of user authentication, maintaining a comprehensive record of user login details. It also oversees the management of Enadoc organization information and user data. To engage with Evia resources via the Evia API, clients need to possess both the Evia website URL and the EIP URL. This ensures proper access and authentication for seamless integration with Evia services.

Refer to the provided image for the Evia Sign SaaS app URL to gain an understanding of the associated EIP URL:


EIP URL
Get Authorization URL
After obtaining the client ID and client secret, you can proceed to construct the client authorization URL using the specified format. 

Utilize your assigned client ID and redirect URL in accordance with the provided guidelines to generate the authorization URL.

This URL serves as the Authorization URL, allowing you to input your unique Client ID and the Redirect URL for authentication purposes.

Copy
https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize?application_state=external&resource=RESOURCE_APPLICATION&client_id={client_id}
&responce_type=code&redirect_uri={redirectURL}
Error Messages
Error
Error Decription
If access token is invalid

Invalid access token

If access token is expired

Access token is expired

If user does not exist in the system

User does not exist in the system. Please contact administrator

If network error occurred

Error! Please check your internet connection and try again.

Get Access Token
This endpoint, activated by a GET request to the designated URL with the access token included as a header, facilitates the retrieval of the access token for Evia Sign. Upon successful execution, it responds with a status code of 200 and presents the login page.

POST https://evia.enadocapp.com/_apis/falcon/auth/api/v1/Token

Headers
Name
Type
Description
Authorization 

Bearer

Access token should be sent as request header

200: OK
If the request proceeds successfully, you will receive status code 200 with the login page to Evia Sign.

Request Body
Upon a successful request to obtain the Access Token, the API provides a response containing relevant information, including the access token and additional details. 

Here's a breakdown of the response body:

Copy
{
       "client_id":"<Client ID>",
       "client_secret":"<Client Secret>",
       "code":"<code>",
       "grant_type":"authorization_code"
 }
Response Body
Copy
{
    "authToken": "Auth Token",
    "refreshToken": "Refresh Token"
}
Refresh Token
Triggered by a GET request to the specified URL, accompanied by the access token as a header, this endpoint is designed to refresh the access token for Evia Sign. Upon successful execution, it responds with a status code of 200, providing access to the login page, and issues a refresh token for future utilization

POST https://evia.enadocapp.com/_apis/falcon/auth/api/v1/Token

Headers
Name
Type
Description
Authorization 

Bearer

Access token should be sent as request header

200: OK
If the request proceeds successfully, you will receive status code 200 with the login page to Evia Sign.

Request Body
Copy
{
       "client_id":"<Client ID>",
       "client_secret":"<Client Secret>",
       "refresh_token":"'Refresh Token'",
       "grant_type":"refresh_token"
 }
Response Body

Upon a successful request to refresh the access token, the API provides a response containing relevant information, including the refreshed access token and additional details. 

Here's a breakdown of the response body:

Copy
{
    "authToken": "Auth Token",
    "refreshToken": "Refresh Token"
}


### Evia Sign - Status check 
“CallbackUrl” and “CompletedDocumentsAttached
“Behavior in Evia Sign API
Overview
This document explains the behavior of the CallbackUrl and CompletedDocumentsAttached
parameters in the Evia Sign API. It highlights the differences in webhook responses based on the 
CompletedDocumentsAttached value when signing requests are created and completed.
Parameters
• CallbackUrl: The webhook URL where events related to the signing process are sent.
• CompletedDocumentsAttached: A boolean flag that determines whether the completed 
documents should be included in the final webhook response.
Example Request Body
To ensure proper webhook functionality, include the CallbackUrl and 
CompletedDocumentsAttached parameters in the POST request body, as shown below:
{
 "Message": "",
 "Title": "{{RequestTitle}}",
 "CallbackUrl": "https://webhook.site/d1515635-8e02-4e21-b315-47ed68b39ebe",
 "CompletedDocumentsAttached": true,
 "Documents": [
 "{{documentId}}"
 ],
 "PDFComments": [],
 "Signatories": [
 {
 
 },
 "Stamps": [
 {
 "Color": "#7c95f4",
 "DocumentToken": "{{documentId}}",
 "Order": 1,
 "Location": {
 "X":451.0416666666667,
 "Y":342.5
 },
 "StampSize": {
 "Height": 35,
 "Width": 75
 },
 "PageNumber": 1,
 "PageHeight": 1122,
 "PageWidth": 793,
 "Type": "signature"
 }
 ]
 }
 ],
 "AuditDetails": {
 "AuthorType": 1,
 "AuthorIPAddress": "124.43.19.95",
 "Device": "Device Type: desktop - OS: Windows - Browser: Chrome (v131.0)"
 },
 "Connections": []
}
Webhook Payload Behavior
Webhook receives three types of payloads:
1. When a signing request is received (SignRequestReceived):
{
 "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
 "UserName": "Admin QA",
 "Email": "eviaqboss+kylan@gmail.com",
 "Subject": "test 01",
 "EventId": 1,
 "EventDescription": "SignRequestReceived",
 "EventTime": "2025-03-31T05:55:55.2975393Z"
}
2. When a signatory completes signing (SignatoryCompleted):
{
 "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
 "UserName": "Admin QA",
 "Email": "eviaqboss+kylan@gmail.com",
 "Subject": "test 01",
 "EventId": 2,
 "EventDescription": "SignatoryCompleted",
 "EventTime": "2025-03-31T05:56:06.8342123Z"
}
3. When the request is completed (RequestCompleted):
If CompletedDocumentsAttached = false:
{
 "RequestId": "68f62ce1-7424-43e1-b3cf-52fdf72744ca",
 "UserName": "Admin QA",
 "Email": "eviaqboss+kylan@gmail.com",
 "Subject": "test 01",
 "EventId": 3,
 "EventDescription": "RequestCompleted",
 "EventTime": "2025-03-31T05:31:42.1064458Z"
}
o If CompletedDocumentsAttached = true, the webhook additionally includes the 
completed document:
{
 "RequestId": "68f62ce1-7424-43e1-b3cf-52fdf72744ca",
 "UserName": "Admin QA",
 "Email": "eviaqboss+kylan@gmail.com",
 "Subject": "test 01",
 "EventId": 3,
 "EventDescription": "RequestCompleted",
 "EventTime": "2025-03-31T05:31:42.1064458Z",
 "Documents": [
 {
 "DocumentName": "document name in here",
 "DocumentContent": "JVBERi0xLjcNCiW1tb..." // Byte array content of 
the completed document
 }
 ]
}
Key Differences
• If CompletedDocumentsAttached = false, webhook does not include the Documents field in 
the final payload.
• If CompletedDocumentsAttached = true, webhook includes a Documents array containing 
the completed document name and content as a byte array.
Use Case Considerations
• Set CompletedDocumentsAttached = false if you do not need document content in webhook 
responses, which reduces payload size and bandwidth usage.
• Set CompletedDocumentsAttached = true if your integration requires the completed 
document to be sent directly via webhook.
Conclusion
Understanding the impact of the CompletedDocumentsAttached flag helps optimize webhook 
responses based on integration needs. If document retrieval is required after completion, enabling 
CompletedDocumentsAttached ensures documents are included in the webhook payload.

## minimum requirement for type 3 request

{
  "Message": "Message",
  "Title": "Title",
  "Documents": [
    "2e5cfa87-44d3-4d6d-88e1-3f6586a3c158"
  ],
  "Signatories": [
    {
      "Color": "#7c95f4",
      "Email": "shanaka@enadoc.com",
      "Name": "Jhone Doe",
      "Order": 1,
      "PrivateMessage": "This is a Private Message",
      "signatoryType": 1,
      "OTP": {
        "IsRequired": false,
        "AccessCode": "12345",
        "Type": "1",
        "MobileNumber": ""
      },
      "AutoStamps": [
        {
          "Identifier":"For Landlord:",
          "Color": "#7c95f4",
          "Order": 1,
          "Offset": {
            "X_offset": 0,
            "Y_offset":-50
            
          },
          "StampSize": {
            "Height": 50,
            "Width": 100
          },
          "Type": "signature"
        },
	{
          "Identifier":"email1",
          "Color": "#7c95f4",
          "Order": 1,
          "Offset": {
            "X_offset": 0,
            "Y_offset": -25
            
          },
          "StampSize": {
            "Height": 50,
            "Width": 100
          },
          "Type": "email"
        },
	{
          "Identifier":"Date1",
          "Color": "#7c95f4",
          "Order": 1,
          "Offset": {
            "X_offset": 0,
            "Y_offset": -25
            
          },
          "StampSize": {
            "Height": 50,
            "Width": 100
          },
          "Type": "date"
        }
      ]
    }
  ]
}