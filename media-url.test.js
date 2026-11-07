const assert = require('node:assert/strict');
const test = require('node:test');
const { parseMediaUrl } = require('./media-url');

test('accepts supported social media URLs and direct media files', () => {
  assert.equal(parseMediaUrl('https://www.youtube.com/watch?v=abc')?.type, 'social');
  assert.equal(parseMediaUrl('https://cdn.example.com/video.mp4?token=1')?.type, 'video');
  assert.equal(parseMediaUrl('https://cdn.example.com/photo.jpg')?.type, 'image');
});

test('rejects unsupported, malformed, and local URLs', () => {
  for (const value of [
    'not a URL',
    'ftp://example.com/video.mp4',
    'https://localhost/video.mp4',
    'http://127.0.0.1/video.mp4',
    'http://192.168.1.5/video.mp4',
    'https://example.com/page',
    'https://user:password@example.com/video.mp4'
  ]) {
    assert.equal(parseMediaUrl(value), null, value);
  }
});

test('does not trust social-site names embedded in other hostnames', () => {
  assert.equal(parseMediaUrl('https://youtube.com.attacker.example/watch?v=abc'), null);
});
