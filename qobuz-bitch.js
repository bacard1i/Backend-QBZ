export default {
  id: "rocks8ar",
  name: "Rocks8ar",
  version: "2.1",
  author: "bacardii",
  description: "Qobuz Primary + Tidal Fallback",

  async searchTracks(query, limit = 20) {
    try {
      const res = await fetch(
        `https://pushit.hatestar.workers.dev/search?q=${encodeURIComponent(query)}&limit=${limit}`
      );
      const data = await res.json();
      return data.tracks || [];
    } catch (e) {
      return [];
    }
  },

  async getTrackStreamUrl(trackId) {
    try {
      const res = await fetch(
        `https://pushit.hatestar.workers.dev/stream/${trackId}`
      );
      return await res.json();
    } catch (e) {
      return { streamUrl: null };
    }
  }
};