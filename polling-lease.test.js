const assert = require('node:assert/strict');
const test = require('node:test');
const {
  POLLING_LEASE_DURATION_MS,
  POLLING_LEASE_RENEW_INTERVAL_MS,
  POLLING_LEASE_RETRY_INTERVAL_MS,
  createLeaseExpiry,
  getLeaseRetryDelay
} = require('./polling-lease');

test('polling leases renew well before expiration to limit stale deploy waits', () => {
  assert.equal(POLLING_LEASE_DURATION_MS, 20000);
  assert.equal(POLLING_LEASE_RENEW_INTERVAL_MS, 5000);
  assert.ok(POLLING_LEASE_RENEW_INTERVAL_MS < POLLING_LEASE_DURATION_MS);
});

test('waiters retry at most once per second and honor near lease expiration', () => {
  assert.equal(getLeaseRetryDelay(60000, 0), POLLING_LEASE_RETRY_INTERVAL_MS);
  assert.equal(getLeaseRetryDelay(500, 0), 500);
  assert.equal(getLeaseRetryDelay(0, 1000), 100);
});

test('new lease expiration is based on the requested timestamp', () => {
  assert.equal(createLeaseExpiry(1000).getTime(), 1000 + POLLING_LEASE_DURATION_MS);
});
