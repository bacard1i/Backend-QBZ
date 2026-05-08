const BASE_URL = "https://pushit.hatestar.workers.dev";

async function searchTracks(query, limit = 20) {
  try {
    const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    const data = await res.json();
    return {
      tracks: data.tracks || [],
      total: data.total || 0
    };
  } catch (e) {
    return { tracks: [], total: 0 };
  }
}

async function getTrackStreamUrl(trackId) {
  try {
    const res = await fetch(`${BASE_URL}/stream/${trackId}`);
    const data = await res.json();

    if (!data.streamUrl) {
      // Return clean error instead of crashing
      return {
        streamUrl: null,
        track: {
          id: trackId,
          audioQuality: data.track?.audioQuality || "Unavailable",
          source: data.track?.source || "Qobuz"
        },
        error: data.error || "This track is not streamable right now"
      };
    }

    return {
      streamUrl: data.streamUrl,
      track: {
        id: trackId,
        audioQuality: data.track?.audioQuality || "Hi-Res",
        source: data.track?.source || "Qobuz"
      }
    };
  } catch (e) {
    return {
      streamUrl: null,
      track: { id: trackId, audioQuality: "Error" },
      error: "Failed to get stream"
    };
  }
}

return {
  id: "rocks8ar",
  name: "Rocks8ar",
  version: "2.2",
  author: "bacardii",
  description: "Qobuz Primary + Direct Tidal Fallback",
  labels: ["QOBUZ", "HI-RES", "MERGED"],

  searchTracks,
  getTrackStreamUrl
};