/** Per-account WhatsApp lifecycle statuses */
const ACCOUNT_STATUSES = Object.freeze({
  INITIALIZING: 'initializing',
  QR: 'qr',
  AUTHENTICATED: 'authenticated',
  LOADING: 'loading',
  READY: 'ready',
  DISCONNECTED: 'disconnected',
  LOGGED_OUT: 'logged_out',
  FAILED: 'failed',
});

const MESSAGING_BLOCKED = new Set([
  ACCOUNT_STATUSES.INITIALIZING,
  ACCOUNT_STATUSES.QR,
  ACCOUNT_STATUSES.AUTHENTICATED,
  ACCOUNT_STATUSES.LOADING,
  ACCOUNT_STATUSES.DISCONNECTED,
  ACCOUNT_STATUSES.LOGGED_OUT,
  ACCOUNT_STATUSES.FAILED,
]);

class AccountNotReadyError extends Error {
  constructor(accountId, status) {
    super('WhatsApp account is not ready');
    this.name = 'AccountNotReadyError';
    this.accountId = accountId;
    this.status = status;
    this.statusCode = 503;
  }
}

function isMessagingAllowed(status) {
  return status === ACCOUNT_STATUSES.READY;
}

function isInitInProgress(status) {
  return [
    ACCOUNT_STATUSES.INITIALIZING,
    ACCOUNT_STATUSES.QR,
    ACCOUNT_STATUSES.AUTHENTICATED,
    ACCOUNT_STATUSES.LOADING,
  ].includes(status);
}

module.exports = {
  ACCOUNT_STATUSES,
  AccountNotReadyError,
  isMessagingAllowed,
  isInitInProgress,
};
