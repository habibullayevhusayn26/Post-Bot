function buildMiniAppStatistics(account, channels) {
  const channelNames = new Map((channels || []).map((channel) => [String(channel.id), channel.title || channel.username || String(channel.id)]));
  const records = (Array.isArray(account.postStats) ? account.postStats : [])
    .map((entry) => {
      const channelIds = Array.isArray(entry.channelIds) ? entry.channelIds : [];
      return {
        publishedAt: entry.publishedAt || null,
        channelCount: Number(entry.channelCount) || channelIds.length,
        channels: channelIds.map((id) => ({
          id,
          name: channelNames.get(String(id)) || String(id)
        })),
        mediaType: entry.mediaType || 'text'
      };
    })
    .sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0))
    .slice(0, 100);
  const lastPublishedAt = account.lastPublishedAt ||
    records.find((entry) => entry.publishedAt)?.publishedAt ||
    null;

  return {
    publishedPosts: Math.max(Number(account.publishedPosts) || 0, records.length),
    publishedChannels: Math.max(
      Number(account.publishedChannels) || 0,
      records.reduce((total, entry) => total + entry.channelCount, 0)
    ),
    templateCount: Array.isArray(account.templates) ? account.templates.length : 0,
    lastPublishedAt,
    records
  };
}

module.exports = { buildMiniAppStatistics };
