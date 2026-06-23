# WhatsApp Sender API

A REST API built with Node.js and Express.js that allows you to send WhatsApp messages from your phone number to single or multiple recipients using WhatsApp Web.

## Features

- Send WhatsApp messages to single or multiple phone numbers
- RESTful API endpoints
- WhatsApp Web integration via whatsapp-web.js
- QR code authentication
- Session persistence (no need to scan QR code every time)
- Connection status monitoring

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- A WhatsApp account on your phone

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory (optional, defaults are provided):
```env
PORT=3000
SESSION_PATH=./.wwebjs_auth
```

## Usage

1. Start the server:
```bash
npm start
```

   Or for development with auto-reload:
```bash
npm run dev
```

2. When the server starts, you'll see a QR code in the terminal. Scan it with your WhatsApp:
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Tap "Link a Device"
   - Scan the QR code displayed in the terminal

3. Once connected, you can start sending messages via the API.

## API Endpoints

### Send Message
**POST** `/api/send`

Send a WhatsApp message to one or multiple phone numbers.

**Request Body:**
```json
{
  "phoneNumbers": ["1234567890@c.us", "0987654321@c.us"],
  "message": "Hello from WhatsApp API!"
}
```

**Response:**
```json
{
  "success": true,
  "total": 2,
  "successCount": 2,
  "failureCount": 0,
  "results": [
    {
      "success": true,
      "phoneNumber": "1234567890@c.us",
      "messageId": "true_1234567890@c.us_3EB0123456789ABCDEF"
    },
    {
      "success": true,
      "phoneNumber": "0987654321@c.us",
      "messageId": "true_0987654321@c.us_3EB0987654321ABCDEF"
    }
  ]
}
```

### Get Status
**GET** `/api/status`

Check the WhatsApp connection status.

**Response:**
```json
{
  "success": true,
  "connected": true,
  "ready": true,
  "qrCode": null
}
```

### Get QR Code
**GET** `/api/qr`

Get the QR code for authentication (if not already connected).

**Response:**
```json
{
  "success": true,
  "qrCode": "QR_CODE_STRING_HERE",
  "message": "Scan this QR code with your WhatsApp to connect"
}
```

## Phone Number Format

WhatsApp Web uses the format: `[country code][phone number]@c.us`

Examples:
- US number: `1234567890@c.us` (for +1-234-567-8900)
- International: Include country code without the `+` sign

**Note:** The phone number should include the country code without the `+` sign. For example:
- US: `1234567890@c.us`
- UK: `441234567890@c.us`
- India: `911234567890@c.us`

## Example Usage with cURL

```bash
# Send message to single recipient
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumbers": ["1234567890@c.us"],
    "message": "Hello from API!"
  }'

# Send message to multiple recipients
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumbers": ["1234567890@c.us", "0987654321@c.us"],
    "message": "Hello everyone!"
  }'

# Check status
curl http://localhost:3000/api/status

# Get QR code
curl http://localhost:3000/api/qr
```

## Example Usage with JavaScript (fetch)

```javascript
// Send message
const response = await fetch('http://localhost:3000/api/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    phoneNumbers: ['1234567890@c.us'],
    message: 'Hello from API!'
  })
});

const data = await response.json();
console.log(data);
```

## Error Handling

The API returns appropriate HTTP status codes:
- `200` - Success
- `400` - Bad Request (invalid input)
- `404` - Not Found (route or QR code not available)
- `500` - Internal Server Error

Error responses follow this format:
```json
{
  "success": false,
  "error": "Error message here"
}
```

## Session Management

The WhatsApp session is stored in the `.wwebjs_auth` directory (or the path specified in `SESSION_PATH`). This means you only need to scan the QR code once. Subsequent server restarts will automatically reconnect using the saved session.

## Troubleshooting

1. **QR Code not appearing**: Wait a few seconds after starting the server. The QR code is generated asynchronously.

2. **Connection lost**: If the connection is lost, restart the server. You may need to scan the QR code again if the session expired.

3. **Message not sending**: 
   - Check if WhatsApp is connected: `GET /api/status`
   - Verify phone number format includes `@c.us`
   - Ensure the recipient's phone number is correct

4. **Port already in use**: Change the `PORT` in `.env` file or use a different port.

## Security Notes

- This API has no authentication built-in. Consider adding authentication middleware for production use.
- The WhatsApp session is stored locally. Keep it secure.
- This uses WhatsApp Web, which may have rate limits and terms of service restrictions.

## License

ISC

