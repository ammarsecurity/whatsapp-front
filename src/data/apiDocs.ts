export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface DocParam {
  name: string
  type: string
  required?: boolean
  description: string
}

export interface DocEndpoint {
  id: string
  method: HttpMethod
  path: string
  title: string
  description: string
  auth: boolean
  params?: DocParam[]
  body?: Record<string, unknown>
  response?: Record<string, unknown>
  notes?: string[]
}

export interface DocSection {
  id: string
  title: string
  description?: string
  endpoints: DocEndpoint[]
}

export const API_VERSION = 'v1'
export const DEFAULT_BASE = 'http://74.50.65.142:8489'

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    description:
      'REST API for WhatsApp account linking, status monitoring, and outbound messaging. All paths are relative to your configured base URL.',
    endpoints: [],
  },
  {
    id: 'auth',
    title: 'Authentication',
    description:
      'Obtain a JWT via login and send it on every protected request as a raw Authorization header value (no Bearer prefix required by default).',
    endpoints: [
      {
        id: 'login',
        method: 'POST',
        path: '/api/auth/login',
        title: 'Login',
        description: 'Authenticate with username and password. Returns a JWT token.',
        auth: false,
        body: { username: 'your_user', password: 'your_password' },
        response: {
          success: true,
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        notes: [
          'Token may also appear as accessToken or access_token.',
          'Store the token client-side and attach it to subsequent requests.',
        ],
      },
      {
        id: 'register',
        method: 'POST',
        path: '/api/auth/register',
        title: 'Register',
        description: 'Create a new user account.',
        auth: false,
        body: { username: 'new_user', password: 'secure_password' },
        response: { success: true, message: 'User registered' },
      },
    ],
  },
  {
    id: 'system',
    title: 'System',
    description: 'Global server readiness checks.',
    endpoints: [
      {
        id: 'system-status',
        method: 'GET',
        path: '/api/status/system',
        title: 'System status',
        description: 'Check if the WhatsApp bridge service is ready (isReady).',
        auth: true,
        response: { success: true, ready: true, isReady: true },
      },
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts',
    description:
      'Each accountId maps to one WhatsApp session. Link devices via QR, poll status until connected, then send messages.',
    endpoints: [
      {
        id: 'list-accounts',
        method: 'GET',
        path: '/api/accounts',
        title: 'List accounts',
        description: 'Returns all WhatsApp accounts owned by the authenticated user.',
        auth: true,
        response: {
          success: true,
          accounts: [{ accountId: 'ibsprimary', status: 'connected' }],
        },
      },
      {
        id: 'add-account',
        method: 'POST',
        path: '/api/accounts',
        title: 'Add account',
        description: 'Register a new WhatsApp account slot on the server.',
        auth: true,
        body: { accountId: 'ibsprimary' },
        response: { success: true, accountId: 'ibsprimary' },
      },
      {
        id: 'add-account-path',
        method: 'POST',
        path: '/api/accounts/:accountId',
        title: 'Add account (path)',
        description: 'Alternative endpoint — account ID in the URL path.',
        auth: true,
        params: [
          {
            name: 'accountId',
            type: 'string',
            required: true,
            description: 'Unique account identifier (path segment).',
          },
        ],
        response: { success: true },
      },
      {
        id: 'account-status',
        method: 'GET',
        path: '/api/accounts/:accountId/status',
        title: 'Account status',
        description:
          'Connection state for an account. Poll after QR scan until status is connected/open.',
        auth: true,
        params: [
          {
            name: 'accountId',
            type: 'string',
            required: true,
            description: 'Account to inspect.',
          },
        ],
        response: {
          success: true,
          status: 'connected',
          connected: true,
        },
      },
      {
        id: 'account-qr',
        method: 'GET',
        path: '/api/accounts/:accountId/qr',
        title: 'Get QR code',
        description:
          'Returns a WhatsApp pairing string in qr. Encode it as a QR image client-side (not base64 PNG).',
        auth: true,
        params: [
          {
            name: 'accountId',
            type: 'string',
            required: true,
            description: 'Account to link.',
          },
        ],
        response: {
          success: true,
          qr: '2@AbCdEf...pairing_token...',
        },
        notes: [
          'Scan with WhatsApp → Linked devices → Link a device.',
          'The qr value is a pairing payload (often starts with 2@), not an image URL.',
        ],
      },
      {
        id: 'delete-account',
        method: 'DELETE',
        path: '/api/accounts/:accountId',
        title: 'Delete account',
        description: 'Remove an account and its session from the server.',
        auth: true,
        params: [
          {
            name: 'accountId',
            type: 'string',
            required: true,
            description: 'Account to delete.',
          },
        ],
        response: { success: true },
      },
    ],
  },
  {
    id: 'messages',
    title: 'Messages',
    description: 'Send and validate phone numbers against WhatsApp.',
    endpoints: [
      {
        id: 'check-number',
        method: 'POST',
        path: '/api/messages/check-number',
        title: 'Check number',
        description: 'Verify whether a phone number is registered on WhatsApp.',
        auth: true,
        body: {
          accountId: 'ibsprimary',
          phoneNumber: '9647807110011',
        },
        response: { success: true, exists: true },
        notes: ['Use country code without + prefix (e.g. 964 for Iraq).'],
      },
      {
        id: 'send-message',
        method: 'POST',
        path: '/api/messages/send',
        title: 'Send message',
        description: 'Send a text message to one or more numbers.',
        auth: true,
        body: {
          accountId: 'ibsprimary',
          message: 'Hello!',
          phoneNumbers: ['9647807110011'],
        },
        response: { success: true, sent: 1 },
      },
    ],
  },
  {
    id: 'admin',
    title: 'Admin (Super Admin)',
    description: 'User management endpoints. Requires admin role on the JWT.',
    endpoints: [
      {
        id: 'list-users',
        method: 'GET',
        path: '/api/users',
        title: 'List users',
        description: 'List all system users (admin only).',
        auth: true,
        response: {
          users: [
            { userId: 1, username: 'admin', role: 'admin' },
            { userId: 2, username: 'user1', role: 'user' },
          ],
        },
      },
      {
        id: 'create-user',
        method: 'POST',
        path: '/api/users',
        title: 'Create user',
        description: 'Create a new user (admin only).',
        auth: true,
        body: {
          username: 'new_user',
          password: 'password123',
          role: 'user',
        },
        response: { success: true, userId: 3 },
      },
      {
        id: 'delete-user',
        method: 'DELETE',
        path: '/api/users/:userId',
        title: 'Delete user',
        description: 'Remove a user by ID (admin only).',
        auth: true,
        params: [
          {
            name: 'userId',
            type: 'number',
            required: true,
            description: 'Numeric user ID.',
          },
        ],
        response: { success: true },
      },
    ],
  },
  {
    id: 'errors',
    title: 'Errors & conventions',
    description: 'Common response patterns and integration notes.',
    endpoints: [],
  },
]

export const DOC_QUICK_START = [
  'POST /api/auth/login — obtain JWT',
  'POST /api/accounts — create accountId',
  'GET /api/accounts/:id/qr — fetch pairing string, render as QR',
  'GET /api/accounts/:id/status — poll until connected',
  'POST /api/messages/send — send messages',
]

export const DOC_ERRORS = [
  {
    code: '401',
    title: 'Unauthorized',
    detail: 'Missing or invalid JWT. Re-login and refresh the Authorization header.',
  },
  {
    code: '404',
    title: 'Not found',
    detail: 'Account or route does not exist. Verify accountId and base URL.',
  },
  {
    code: '4xx/5xx',
    title: 'Error body',
    detail: 'Most errors return JSON with a message field. Example: { "message": "..." }',
  },
]
