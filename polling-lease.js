const POLLING_LEASE_KEY = 'telegram_polling_lease';
const POLLING_LEASE_DURATION_MS = 20000;
const POLLING_LEASE_RENEW_INTERVAL_MS = 5000;
const POLLING_LEASE_RETRY_INTERVAL_MS = 1000;

function createLeaseExpiry(now = Date.now()) {
  return new Date(now + POLLING_LEASE_DURATION_MS);
}

function getLeaseRetryDelay(expiresAt, now = Date.now()) {
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return POLLING_LEASE_RETRY_INTERVAL_MS;
  return Math.max(100, Math.min(POLLING_LEASE_RETRY_INTERVAL_MS, expiry - now));
}

module.exports = {
  POLLING_LEASE_KEY,
  POLLING_LEASE_DURATION_MS,
  POLLING_LEASE_RENEW_INTERVAL_MS,
  POLLING_LEASE_RETRY_INTERVAL_MS,
  createLeaseExpiry,
  getLeaseRetryDelay
};
