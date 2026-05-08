const BASE_URL = "https://pushit.hatestar.workers.dev";

async function searchTracks(query, limit = 20) {
  try {
    const res = await fetch(
      `${BASE_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    const data = await res.json();
    return {
      tracks: data.tracks || [],
      total: data.total || 0
    };
  } catch (e) {
    return { tracks: [], total: 0 };
  }
}

async function getTrackStreamUrl(trackId, preferredQuality) {
  try {
    const res = await fetch(`${BASE_URL}/stream/${trackId}`);
    const data = await res.json();

    return {
      streamUrl: data.streamUrl || null,
      track: {
        id: trackId,
        audioQuality: data.track?.audioQuality || data.quality || "Hi-Res"
      }
    };
  } catch (e) {
    return {
      streamUrl: null,
      track: { id: trackId, audioQuality: "Error" }
    };
  }
}

return {
  id: "rocks8ar",
  name: "Rocks8ar",
  version: "2.1",
  author: "bacardii",
  description: "Qobuz Primary + Direct Tidal Fallback",
  labels: ["QOBUZ", "HI-RES", "MERGED"],

  searchTracks,
  getTrackStreamUrl
};