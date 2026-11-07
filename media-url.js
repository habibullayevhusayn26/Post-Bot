const net = require('node:net');
const path = require('node:path');

const SOCIAL_HOSTS = [
  'youtube.com', 'youtu.be', 'instagram.com', 'instagr.am', 'tiktok.com',
  'x.com', 'twitter.com', 'fb.com', 'facebook.com', 'vk.com', 'vimeo.com'
];
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.ogg', '.avi']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

function isPublicHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host.endsWith('.internal') || net.isIP(host)) {
    return false;
  }
  return host.includes('.');
}

function parseMediaUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    !isPublicHostname(url.hostname)) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const isSocial = SOCIAL_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (isSocial) return { url: url.toString(), type: 'social' };

  const extension = path.extname(url.pathname).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return { url: url.toString(), type: 'video' };
  if (IMAGE_EXTENSIONS.has(extension)) return { url: url.toString(), type: 'image' };
  return null;
}

module.exports = { parseMediaUrl };
