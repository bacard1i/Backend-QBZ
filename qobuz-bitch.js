export default {
  id: "qobuz-rocks8ar",
  name: "Rocks8ar",
  version: "2.1",
  author: "bacardii",
  description: "Qobuz Primary + Direct Tidal Fallback • Best Hi-Res Quality",

  async searchTracks(query, limit = 20) {
    try {
      const res = await fetch(
        `https://pushit.hatestar.workers.dev/search?q=${encodeURIComponent(query)}&limit=${limit}`
      );

      if (!res.ok) throw new Error(`Search failed: ${res.status}`);

      const data = await res.json();
      return data.tracks || [];
    } catch (error) {
      console.error("[Rocks8ar] searchTracks error:", error);
      return [];
    }
  },

  async getTrackStreamUrl(trackId) {
    try {
      const res = await fetch(
        `https://pushit.hatestar.workers.dev/stream/${trackId}`
      );

      if (!res.ok) throw new Error(`Stream request failed: ${res.status}`);

      const data = await res.json();

      return {
        streamUrl: data.streamUrl || null,
        track: {
          audioQuality: data.quality || "Hi-Res",
          source: data.source || "Unknown"
        }
      };
    } catch (error) {
      console.error("[Rocks8ar] getTrackStreamUrl error:", error);
      return {
        streamUrl: null,
        track: { audioQuality: "Error", source: "None" }
      };
    }
  }
};