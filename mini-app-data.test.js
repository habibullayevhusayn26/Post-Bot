const assert = require('node:assert/strict');
const test = require('node:test');
const { buildMiniAppStatistics } = require('./mini-app-data');

test('builds user statistics and resolves channel names for recent sent posts', () => {
  const stats = buildMiniAppStatistics({
    publishedPosts: 2,
    publishedChannels: 3,
    templates: [{ id: 1 }],
    postStats: [
      { publishedAt: '2026-01-01T10:00:00Z', channelIds: [-1001], channelCount: 1, mediaType: 'text' },
      { publishedAt: '2026-01-02T10:00:00Z', channelIds: [-1001, -1002], channelCount: 2, mediaType: 'photo' }
    ]
  }, [
    { id: -1001, title: 'Birinchi kanal' },
    { id: -1002, title: 'Ikkinchi kanal' }
  ]);

  assert.equal(stats.publishedPosts, 2);
  assert.equal(stats.publishedChannels, 3);
  assert.equal(stats.templateCount, 1);
  assert.equal(stats.lastPublishedAt, '2026-01-02T10:00:00Z');
  assert.deepEqual(stats.records[0].channels.map((channel) => channel.name), ['Birinchi kanal', 'Ikkinchi kanal']);
});

test('uses available post records when aggregate counters are missing', () => {
  const stats = buildMiniAppStatistics({
    postStats: [{ channelIds: [-1001], channelCount: 1 }]
  }, []);

  assert.equal(stats.publishedPosts, 1);
  assert.equal(stats.publishedChannels, 1);
  assert.equal(stats.lastPublishedAt, null);
});
