export default {
  id: "qobuz-rocks8ar",
  name: "Rocks8ar",
  version: "2.0",
  author: "bacardii",
  description: "Qobuz Primary + Direct Tidal Fallback (Best Hi-Res quality)",

  async searchTracks(query, limit = 20) {
    const res = await fetch(
      `https://pushit.hatestar.workers.dev/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    const data = await res.json();
    return data.tracks || [];
  },

  async getTrackStreamUrl(trackId) {
    const res = await fetch(
      `https://pushit.hatestar.workers.dev/stream/${trackId}`
    );
    return await res.json();
  }
};