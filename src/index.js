export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = { "Access-Control-Allow-Origin": "*" };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // ==================== TIDAL SEARCH ====================
    if (path === "/tidal/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 25;

      if (!query) return json({ error: "Missing query" }, 400, cors);

      const token = env.TIDAL_ACCESS_TOKEN;
      if (!token) return json({ tracks: [], error: "No Tidal token" }, 200, cors);

      try {
        const res = await fetch(
          `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}&countryCode=CA`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) return json({ tracks: [] }, 200, cors);

        const data = await res.json();
        const tracks = (data.items || []).map(t => ({
          id: String(t.id),
          title: t.title,
          artist: t.artist?.name || "Unknown",
          album: t.album?.title || "",
          duration: t.duration || 0,
          audioQuality: "HiFi",
          cover: t.album?.cover || "",
          isrc: t.isrc || null,
          source: "Tidal"
        }));

        return json({ tracks, total: tracks.length }, 200, cors);
      } catch (e) {
        return json({ tracks: [] }, 200, cors);
      }
    }

    // ==================== TIDAL STREAM ====================
    if (path.startsWith("/tidal/stream/")) {
      const trackId = path.split("/tidal/stream/")[1];
      // For now we return metadata only (real Tidal streaming needs more work)
      return json({
        streamUrl: null,
        track: {
          audioQuality: "HiFi",
          source: "Tidal"
        },
        note: "Tidal direct stream not implemented yet"
      }, 200, cors);
    }

    return json({ message: "Rocks8ar Tidal Worker" }, 200, cors);
  }
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}