export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

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
  description?: string
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
export const API_BUILD = '2026-06-02-v12'
export const DEFAULT_BASE = 'http://74.50.65.142:8489'

const PAGINATION_PARAMS: DocParam[] = [
  { name: 'limit', type: 'integer', description: 'Page size (default 20, max 100).' },
  { name: 'offset', type: 'integer', description: 'Records to skip for pagination.' },
]

const SEARCH_PARAM: DocParam = {
  name: 'search',
  type: 'string',
  description: 'Filter by name, text, or phone (endpoint-specific).',
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    description:
      'REST API for WhatsApp account linking, outbound/inbound messaging, contact groups, campaigns, templates, inbox, webhooks, and API keys. Paths are relative to your configured base URL (no trailing /api).',
    endpoints: [],
  },
  {
    id: 'auth',
    title: 'Authentication',
    description:
      'Use JWT from login, or an API key (Settings → API & Webhooks). Send JWT as Authorization header; API keys use X-API-Key.',
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
          user: { userId: 1, username: 'your_user', role: 'user' },
        },
        notes: [
          'Token may also appear as accessToken or access_token.',
          'Alternatively use X-API-Key: wsk_… for machine-to-machine access (no JWT).',
        ],
      },
      {
        id: 'update-profile',
        method: 'PATCH',
        path: '/api/auth/profile',
        title: 'Update profile',
        description:
          'Change your username and/or password. Requires current password; returns a new JWT if username changed.',
        auth: true,
        body: {
          currentPassword: 'current_password',
          username: 'new_username',
          password: 'new_password',
        },
        response: {
          success: true,
          message: 'Profile updated',
          token: 'eyJ...',
          user: { userId: 1, username: 'new_username' },
        },
      },
    ],
  },
  {
    id: 'system',
    title: 'System',
    description: 'Server health and diagnostics. /health is public; no token required.',
    endpoints: [
      {
        id: 'health',
        method: 'GET',
        path: '/health',
        title: 'Health check (public)',
        description:
          'Returns apiBuild and enabled feature flags. Use to verify the server is running v11+ after deploy.',
        auth: false,
        response: {
          success: true,
          status: 'running',
          apiBuild: API_BUILD,
          features: ['contact-groups', 'campaigns', 'templates', 'inbox', 'integrations'],
        },
        notes: ['Also available at GET /api/health (public, before auth middleware).'],
      },
      {
        id: 'system-status',
        method: 'GET',
        path: '/api/status/system',
        title: 'System status',
        description: 'Chrome diagnostics and global readiness (authenticated).',
        auth: true,
        response: {
          ready: true,
          apiBuild: API_BUILD,
          chrome: {
            executablePath: '/usr/bin/google-chrome',
            headlessLaunch: true,
            version: 'Google Chrome 120...',
          },
        },
        notes: [
          'Per-account readiness is returned from GET /api/accounts/:accountId/status.',
          'chrome.headlessLaunch must be true for QR linking on Ubuntu.',
        ],
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
        id: 'account-qr-regenerate',
        method: 'GET',
        path: '/api/accounts/:accountId/qr?regenerate=1',
        title: 'Reset session & new QR',
        description: 'Clears saved session and waits for a fresh pairing QR.',
        auth: true,
        response: { success: true, qr: '2@...', apiBuild: API_BUILD },
      },
      {
        id: 'disconnect-account',
        method: 'POST',
        path: '/api/accounts/:accountId/disconnect',
        title: 'Disconnect account',
        description: 'Unlink WhatsApp session without deleting the account record.',
        auth: true,
        response: { success: true, disconnected: true },
      },
      {
        id: 'reset-session',
        method: 'POST',
        path: '/api/accounts/:accountId/reset-session',
        title: 'Reset session',
        description: 'Clear session files only; call GET /qr afterward.',
        auth: true,
        response: { success: true, message: 'Session cleared...' },
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
        notes: ['Use country code without + prefix (e.g. 964 for Iraq).', 'Counts against daily check quota (429 when exceeded).'],
      },
      {
        id: 'send-message',
        method: 'POST',
        path: '/api/messages/send',
        title: 'Send message',
        description:
          'Send text to one or more numbers. Use plain message, templateId, or templateName with templateVars (ideal for OTP).',
        auth: true,
        body: {
          accountId: 'new-ammar',
          phoneNumbers: ['9647807110011'],
          templateName: 'OTP',
          templateVars: {
            OTP_CODE: '482917',
            EXPIRE_MINUTES: '5',
            APP_NAME: 'Tanfeeth',
          },
        },
        response: {
          success: true,
          successCount: 1,
          total: 1,
          message: '482917\n\nلا تشارك…',
          results: [],
        },
        notes: [
          'Provide message OR templateId OR templateName (not multiple).',
          'Placeholders: {{VAR}} or {VAR} in template body.',
          'Counts against daily message quota.',
        ],
      },
      {
        id: 'send-media',
        method: 'POST',
        path: '/api/messages/send-media',
        title: 'Send media',
        description: 'Multipart upload — file + accountId + phoneNumbers JSON array.',
        auth: true,
        body: {
          accountId: 'ibsprimary',
          phoneNumbers: '["9647807110011"]',
          mediaType: 'document',
          caption: 'Optional caption',
          file: '(binary)',
        },
        response: { success: true, successCount: 1, mediaType: 'document' },
      },
      {
        id: 'message-history',
        method: 'GET',
        path: '/api/messages?accountId=&status=&search=&limit=20&offset=0',
        title: 'Message history',
        description: 'Paginated outbound message log for the authenticated user.',
        auth: true,
        params: [
          { name: 'accountId', type: 'string', description: 'Filter by WhatsApp account.' },
          { name: 'status', type: 'string', description: 'pending | sent | failed' },
          SEARCH_PARAM,
          ...PAGINATION_PARAMS,
        ],
        response: { success: true, messages: [], total: 0, limit: 20, offset: 0 },
      },
      {
        id: 'message-stats',
        method: 'GET',
        path: '/api/messages/statistics?accountId=',
        title: 'Message statistics',
        description: 'Counts of sent, failed, and pending messages.',
        auth: true,
        response: {
          success: true,
          statistics: { total: 0, sent: 0, failed: 0, pending: 0 },
        },
      },
    ],
  },
  {
    id: 'contacts',
    title: 'Contact groups',
    description: 'Organize phone numbers into groups for bulk campaigns.',
    endpoints: [
      {
        id: 'list-contact-groups',
        method: 'GET',
        path: '/api/contact-groups?search=&limit=20&offset=0',
        title: 'List groups',
        description: 'Paginated contact groups with number counts.',
        auth: true,
        params: [SEARCH_PARAM, ...PAGINATION_PARAMS],
        response: { success: true, groups: [{ id: 1, name: 'VIP', numberCount: 42 }], total: 1 },
      },
      {
        id: 'create-contact-group',
        method: 'POST',
        path: '/api/contact-groups',
        title: 'Create group',
        description: 'Create a group; optionally include initial phone numbers.',
        auth: true,
        body: {
          name: 'Summer leads',
          description: 'Optional',
          numbers: ['9647807110011'],
        },
        response: { success: true, group: { id: 1, name: 'Summer leads' } },
      },
      {
        id: 'get-contact-group',
        method: 'GET',
        path: '/api/contact-groups/:groupId?search=&limit=50&offset=0',
        title: 'Group detail + numbers',
        description: 'Group metadata and paginated phone list.',
        auth: true,
        params: [
          { name: 'groupId', type: 'integer', required: true, description: 'Group ID.' },
          SEARCH_PARAM,
          ...PAGINATION_PARAMS,
        ],
        response: { success: true, group: {}, numbers: [], total: 0 },
      },
      {
        id: 'import-numbers',
        method: 'POST',
        path: '/api/contact-groups/:groupId/numbers',
        title: 'Import numbers',
        description: 'Append or replace numbers in a group.',
        auth: true,
        body: { numbers: ['9647807110011', '9647807110012'], replace: false },
        response: { success: true, added: 2 },
      },
      {
        id: 'delete-contact-group',
        method: 'DELETE',
        path: '/api/contact-groups/:groupId',
        title: 'Delete group',
        description: 'Remove group and all its numbers.',
        auth: true,
        response: { success: true },
      },
    ],
  },
  {
    id: 'campaigns',
    title: 'Campaigns',
    description:
      'Broadcast one message to a contact group. Opt-out numbers are skipped automatically. Per-recipient results are stored for failure reports.',
    endpoints: [
      {
        id: 'list-campaigns',
        method: 'GET',
        path: '/api/campaigns?status=&search=&limit=20&offset=0',
        title: 'List campaigns',
        description: 'Paginated campaign history.',
        auth: true,
        params: [
          { name: 'status', type: 'string', description: 'pending | scheduled | running | completed | failed | cancelled' },
          SEARCH_PARAM,
          ...PAGINATION_PARAMS,
        ],
        response: { success: true, campaigns: [], total: 0 },
      },
      {
        id: 'send-campaign',
        method: 'POST',
        path: '/api/campaigns/send',
        title: 'Send campaign now',
        description: 'Send immediately to a group or phone list. Max 500 recipients.',
        auth: true,
        body: {
          accountId: 'work',
          groupId: 1,
          name: 'Promo March',
          message: 'Hello {name}!',
          templateId: null,
          templateVars: { name: 'Customer' },
          delayMs: 3000,
          scheduledAt: null,
        },
        response: {
          success: true,
          campaignId: 10,
          total: 100,
          successCount: 98,
          failureCount: 2,
          skippedOptOut: 0,
        },
        notes: [
          'Provide message OR templateId (with optional templateVars).',
          'Add scheduledAt (ISO datetime) to schedule instead of sending now.',
          'delayMs: milliseconds between messages (1000–30000, default 3000).',
        ],
      },
      {
        id: 'schedule-campaign',
        method: 'POST',
        path: '/api/campaigns/schedule',
        title: 'Schedule campaign',
        description: 'Schedule a future send (requires groupId).',
        auth: true,
        body: {
          accountId: 'work',
          groupId: 1,
          message: 'Scheduled promo',
          scheduledAt: '2026-06-15T10:00:00.000Z',
          delayMs: 3000,
        },
        response: { success: true, campaignId: 11, status: 'scheduled', scheduledAt: '2026-06-15T10:00:00.000Z' },
      },
      {
        id: 'campaign-detail',
        method: 'GET',
        path: '/api/campaigns/:campaignId',
        title: 'Campaign detail',
        description: 'Single campaign summary.',
        auth: true,
        response: { success: true, campaign: { id: 10, status: 'completed', successCount: 98 } },
      },
      {
        id: 'campaign-recipients',
        method: 'GET',
        path: '/api/campaigns/:campaignId/recipients?status=&limit=50&offset=0',
        title: 'Campaign recipients (failure report)',
        description: 'Per-number delivery results: sent, failed, or skipped_opt_out.',
        auth: true,
        params: [
          { name: 'status', type: 'string', description: 'sent | failed | skipped_opt_out' },
          ...PAGINATION_PARAMS,
        ],
        response: {
          success: true,
          recipients: [{ phoneNumber: '9647…', status: 'failed', errorMessage: '…' }],
          total: 2,
        },
      },
      {
        id: 'cancel-campaign',
        method: 'POST',
        path: '/api/campaigns/:campaignId/cancel',
        title: 'Cancel scheduled campaign',
        description: 'Cancel a campaign with status scheduled (not yet started).',
        auth: true,
        response: { success: true },
      },
    ],
  },
  {
    id: 'templates',
    title: 'Message templates',
    description: 'Reusable message bodies with placeholders like {{OTP_CODE}} or {name}.',
    endpoints: [
      {
        id: 'list-templates',
        method: 'GET',
        path: '/api/templates?search=&limit=20&offset=0',
        title: 'List templates',
        auth: true,
        params: [SEARCH_PARAM, ...PAGINATION_PARAMS],
        response: { success: true, templates: [{ id: 1, name: 'Welcome', body: 'Hi {name}!' }], total: 1 },
      },
      {
        id: 'create-template',
        method: 'POST',
        path: '/api/templates',
        title: 'Create template',
        auth: true,
        body: { name: 'OTP', body: '{{OTP_CODE}}\n\nالرمز صالح لمدة {{EXPIRE_MINUTES}} دقائق.\n\n{{APP_NAME}}' },
        response: { success: true, template: { id: 1, name: 'Welcome' } },
      },
      {
        id: 'update-template',
        method: 'PATCH',
        path: '/api/templates/:id',
        title: 'Update template',
        auth: true,
        body: { name: 'Welcome v2', body: 'Updated text {name}' },
        response: { success: true, template: {} },
      },
      {
        id: 'delete-template',
        method: 'DELETE',
        path: '/api/templates/:id',
        title: 'Delete template',
        auth: true,
        response: { success: true },
      },
    ],
  },
  {
    id: 'opt-out',
    title: 'Opt-out list',
    description:
      'Numbers that must not receive campaigns. Users can opt out by replying STOP (or إيقاف); you can also add manually.',
    endpoints: [
      {
        id: 'list-opt-out',
        method: 'GET',
        path: '/api/opt-out?search=&limit=50&offset=0',
        title: 'List opt-outs',
        auth: true,
        params: [SEARCH_PARAM, ...PAGINATION_PARAMS],
        response: { success: true, optOuts: [{ phoneNumber: '9647…', source: 'keyword' }], total: 1 },
      },
      {
        id: 'add-opt-out',
        method: 'POST',
        path: '/api/opt-out',
        title: 'Add opt-out',
        auth: true,
        body: { phoneNumber: '9647807110011', reason: 'Customer request' },
        response: { success: true, phoneNumber: '9647807110011' },
      },
      {
        id: 'remove-opt-out',
        method: 'DELETE',
        path: '/api/opt-out/:phone',
        title: 'Remove opt-out',
        auth: true,
        response: { success: true },
      },
    ],
  },
  {
    id: 'inbox',
    title: 'Inbox',
    description: 'Incoming WhatsApp messages and manual replies (requires linked account).',
    endpoints: [
      {
        id: 'list-inbox',
        method: 'GET',
        path: '/api/inbox?accountId=&search=&unreadOnly=0&limit=30&offset=0',
        title: 'List messages',
        auth: true,
        params: [
          { name: 'accountId', type: 'string', description: 'Filter by WhatsApp account.' },
          { name: 'unreadOnly', type: 'boolean', description: '1 to show unread inbound only.' },
          SEARCH_PARAM,
          ...PAGINATION_PARAMS,
        ],
        response: { success: true, messages: [], unread: 0, total: 0 },
      },
      {
        id: 'inbox-conversation',
        method: 'GET',
        path: '/api/inbox/conversation/:accountId/:phone',
        title: 'Conversation thread',
        auth: true,
        response: { success: true, messages: [] },
      },
      {
        id: 'inbox-reply',
        method: 'POST',
        path: '/api/inbox/reply',
        title: 'Reply to contact',
        auth: true,
        body: { accountId: 'work', phoneNumber: '9647807110011', message: 'Thanks for reaching out!' },
        response: { success: true, result: { success: true, phone: '9647807110011' } },
      },
      {
        id: 'inbox-mark-read',
        method: 'POST',
        path: '/api/inbox/read',
        title: 'Mark as read',
        auth: true,
        body: { ids: [1, 2, 3] },
        response: { success: true, marked: 3 },
      },
    ],
  },
  {
    id: 'auto-replies',
    title: 'Auto-replies',
    description: 'Automatic responses when inbound messages match keywords (or any message).',
    endpoints: [
      {
        id: 'list-auto-replies',
        method: 'GET',
        path: '/api/auto-replies?accountId=',
        title: 'List rules',
        auth: true,
        params: [
          { name: 'accountId', type: 'string', description: 'Optional — filter rules for one account.' },
        ],
        response: {
          success: true,
          rules: [{ id: 1, keyword: 'price', matchType: 'contains', replyText: '…', enabled: true }],
        },
      },
      {
        id: 'create-auto-reply',
        method: 'POST',
        path: '/api/auto-replies',
        title: 'Create rule',
        auth: true,
        body: {
          accountId: 'work',
          keyword: 'hello',
          matchType: 'contains',
          replyText: 'Hi! How can we help?',
          enabled: true,
        },
        notes: ['matchType: exact | contains | any (catch-all when keyword omitted).'],
        response: { success: true, rule: {} },
      },
      {
        id: 'update-auto-reply',
        method: 'PATCH',
        path: '/api/auto-replies/:id',
        title: 'Update rule',
        auth: true,
        body: { enabled: false },
        response: { success: true, rule: {} },
      },
      {
        id: 'delete-auto-reply',
        method: 'DELETE',
        path: '/api/auto-replies/:id',
        title: 'Delete rule',
        auth: true,
        response: { success: true },
      },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'API keys, outbound webhooks, and per-user rate limits.',
    endpoints: [
      {
        id: 'list-api-keys',
        method: 'GET',
        path: '/api/integrations/api-keys',
        title: 'List API keys',
        auth: true,
        response: { success: true, keys: [{ id: 1, name: 'CRM', keyPrefix: 'wsk_abc12345' }] },
      },
      {
        id: 'create-api-key',
        method: 'POST',
        path: '/api/integrations/api-keys',
        title: 'Create API key',
        auth: true,
        body: { name: 'CRM integration', expiresAt: null },
        response: {
          success: true,
          key: { id: 1, name: 'CRM', secret: 'wsk_…full_key_shown_once…' },
        },
        notes: ['Store secret immediately — it is only returned once.', 'Use header: X-API-Key: wsk_…'],
      },
      {
        id: 'delete-api-key',
        method: 'DELETE',
        path: '/api/integrations/api-keys/:id',
        title: 'Revoke API key',
        auth: true,
        response: { success: true },
      },
      {
        id: 'list-webhooks',
        method: 'GET',
        path: '/api/integrations/webhooks',
        title: 'List webhooks',
        auth: true,
        response: {
          success: true,
          validEvents: [
            'message.received',
            'message.sent',
            'campaign.completed',
            'campaign.failed',
            'account.ready',
            'account.disconnected',
          ],
          webhooks: [],
        },
      },
      {
        id: 'create-webhook',
        method: 'POST',
        path: '/api/integrations/webhooks',
        title: 'Create webhook',
        auth: true,
        body: {
          url: 'https://your-server.com/hook',
          events: ['message.received', 'campaign.completed'],
          secret: 'optional_hmac_secret',
          enabled: true,
        },
        response: { success: true, webhook: {} },
        notes: [
          'Payload: JSON POST with event, timestamp, data.',
          'If secret is set, verify X-Webhook-Signature (HMAC-SHA256 of body).',
        ],
      },
      {
        id: 'get-quota',
        method: 'GET',
        path: '/api/integrations/quota',
        title: 'Rate limits / usage',
        auth: true,
        response: {
          success: true,
          quota: {
            dailyMessageLimit: 1000,
            dailyCheckLimit: 500,
            messagesSentToday: 42,
            checksToday: 10,
          },
        },
      },
      {
        id: 'update-quota',
        method: 'PATCH',
        path: '/api/integrations/quota',
        title: 'Update rate limits',
        auth: true,
        body: { dailyMessageLimit: 2000, dailyCheckLimit: 800 },
        response: { success: true, quota: {} },
      },
    ],
  },
  {
    id: 'realtime',
    title: 'WebSocket',
    description: 'Live events for inbox, campaigns, and account status (same host as API).',
    endpoints: [
      {
        id: 'websocket',
        method: 'GET',
        path: '/ws?token=<jwt>',
        title: 'WebSocket connection',
        description:
          'Connect with JWT as query param. Server pushes JSON: { event, data, ts }.',
        auth: true,
        notes: [
          'Events: message.received, message.sent, campaign.started, campaign.completed, account.ready, account.disconnected.',
          'Example: ws://your-host:8489/ws?token=eyJ…',
          'Reconnect with backoff on disconnect.',
        ],
        response: { event: 'message.received', data: { accountId: 'work', body: 'Hi' }, ts: 1710000000000 },
      },
    ],
  },
  {
    id: 'admin-health',
    title: 'Admin — System health',
    description: 'Live server diagnostics: Chrome, RAM, WhatsApp sessions (admin only).',
    endpoints: [
      {
        id: 'admin-system-health',
        method: 'GET',
        path: '/api/admin/system-health',
        title: 'System health snapshot',
        description:
          'Chrome headless test, Node/system RAM, CPU load, WhatsApp connection counts, in-memory sessions.',
        auth: true,
        response: {
          success: true,
          overall: { ok: true, status: 'healthy' },
          memory: { systemMb: { usedPercent: 42 }, chromeMb: 512 },
          whatsapp: { connected: 2, accountsTotal: 3 },
        },
      },
    ],
  },
  {
    id: 'admin-accounts',
    title: 'Admin — WhatsApp accounts',
    description: 'Manage every user\'s WhatsApp sessions (admin only).',
    endpoints: [
      {
        id: 'admin-list-accounts',
        method: 'GET',
        path: '/api/admin/accounts',
        title: 'List all accounts',
        description: 'All WhatsApp accounts with owner username and live status.',
        auth: true,
        response: {
          success: true,
          accounts: [
            {
              accountId: 'work',
              userId: 2,
              ownerUsername: 'ammar',
              isConnected: true,
              inMemory: true,
            },
          ],
        },
      },
      {
        id: 'admin-disconnect',
        method: 'POST',
        path: '/api/admin/accounts/:userId/:accountId/disconnect',
        title: 'Stop session',
        description: 'Logout and unload client; keeps DB record.',
        auth: true,
        response: { success: true, disconnected: true },
      },
      {
        id: 'admin-reset',
        method: 'POST',
        path: '/api/admin/accounts/:userId/:accountId/reset-session',
        title: 'Reset session',
        description: 'Clear session files for re-linking.',
        auth: true,
        response: { success: true },
      },
      {
        id: 'admin-qr',
        method: 'GET',
        path: '/api/admin/accounts/:userId/:accountId/qr?regenerate=1',
        title: 'Admin QR',
        description: 'Fetch pairing QR for any user account.',
        auth: true,
        response: { success: true, qr: '2@...' },
      },
      {
        id: 'admin-delete-account',
        method: 'DELETE',
        path: '/api/admin/accounts/:userId/:accountId',
        title: 'Delete account',
        description: 'Remove account, session files, and related messages.',
        auth: true,
        response: { success: true },
      },
    ],
  },
  {
    id: 'admin',
    title: 'Admin — System users',
    description: 'User management (admin only). Set ADMIN_USER_IDS or ADMIN_USERNAMES on the server.',
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
        id: 'update-user',
        method: 'PATCH',
        path: '/api/users/:userId',
        title: 'Update user',
        description: 'Change username and/or password for any user (admin only).',
        auth: true,
        body: { username: 'renamed_user', password: 'new_password' },
        response: { success: true, user: { userId: 2, username: 'renamed_user' } },
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

export const ADMIN_SECTION_IDS = new Set([
  'admin-health',
  'admin-accounts',
  'admin',
])

/** API docs visible in Settings — admin sections hidden for regular users. */
export function getVisibleDocSections(isAdmin: boolean): DocSection[] {
  return DOC_SECTIONS.filter((section) => {
    if (ADMIN_SECTION_IDS.has(section.id)) {
      return isAdmin
    }
    return true
  })
}

export const DOC_QUICK_START = [
  'GET /health — verify apiBuild (public, no token)',
  'POST /api/auth/login — obtain JWT (or create X-API-Key under integrations)',
  'POST /api/accounts — create accountId',
  'GET /api/accounts/:id/qr — fetch pairing string, render as QR',
  'GET /api/accounts/:id/status — poll until ready',
  'POST /api/contact-groups — create group and import numbers',
  'POST /api/campaigns/send — broadcast to group (or schedule with scheduledAt)',
  'GET /api/inbox — read inbound messages; POST /api/inbox/reply to respond',
]

export const DOC_ERRORS = [
  {
    code: '401',
    title: 'Unauthorized',
    detail: 'Missing or invalid JWT / API key. Re-login or check X-API-Key header.',
  },
  {
    code: '404',
    title: 'Not found',
    detail: 'Route or resource missing. If all new routes 404, redeploy backend v11+ and restart pm2.',
  },
  {
    code: '429',
    title: 'Rate limit / quota',
    detail: 'Daily message or number-check quota exceeded. See GET /api/integrations/quota.',
  },
  {
    code: '503',
    title: 'Account not ready',
    detail: 'WhatsApp account not linked or still initializing. Poll GET /api/accounts/:id/status.',
  },
  {
    code: '4xx/5xx',
    title: 'Error body',
    detail: 'Most errors return JSON: { "success": false, "error": "..." }',
  },
]
