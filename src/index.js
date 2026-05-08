export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // ====================== SEARCH ======================
    if (path === "/search") {
      const q = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 20;

      if (!q) return json({ error: "No query" }, 400, cors);

      const [qobuz, tidal] = await Promise.all([
        qobuzSearch(q, limit * 2, env),
        tidalSearch(q, limit * 2, env)
      ]);

      const merged = mergeResults(qobuz, tidal, limit);

      return json({ tracks: merged, total: merged.length }, 200, cors);
    }

    // ====================== STREAM ======================
    if (path.startsWith("/stream/")) {
      const trackId = path.split("/stream/")[1];

      // Qobuz first (priority)
      try {
        const qobuz = await qobuzStream(trackId, env);
        if (qobuz?.streamUrl) {
          qobuz.source = "Qobuz";
          return json(qobuz, 200, cors);
        }
      } catch (e) {}

      // Tidal fallback using your token
      const tidal = await tidalStream(trackId, env);
      if (tidal) return json(tidal, 200, cors);

      return json({ error: "No stream available" }, 404, cors);
    }

    return json({ message: "Rocks8ar - Qobuz + Tidal (Direct)" }, 200, cors);
  }
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

// ==================== QOBUZ ====================
async function qobuzSearch(query, limit, env) {
  // Paste your working Qobuz search code here
  return { tracks: [] };
}

async function qobuzStream(trackId, env) {
  // Paste your working Qobuz stream code here
  return null;
}

// ==================== TIDAL (Using your valid token) ====================
async function tidalSearch(query, limit, env) {
  const token = env.TIDAL_ACCESS_TOKEN;
  if (!token) return { tracks: [] };

  try {
    const res = await fetch(
      `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}&countryCode=CA`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return { tracks: [] };
    const data = await res.json();

    return {
      tracks: (data.items || []).map(t => ({
        id: String(t.id),
        title: t.title,
        artist: t.artist?.name || "Unknown",
        album: t.album?.title || "",
        duration: t.duration || 0,
        audioQuality: "HiFi",
        cover: t.album?.cover || "",
        isrc: t.isrc || null,
        source: "T"
      }))
    };
  } catch {
    return { tracks: [] };
  }
}

async function tidalStream(trackId, env) {
  const token = env.TIDAL_ACCESS_TOKEN;
  if (!token) return null;

  // This is a basic version. Real stream logic depends on hifi or more complex code.
  // For now we return metadata + note
  return {
    streamUrl: null,
    quality: "HiFi",
    source: "Tidal",
    tidalId: trackId,
    note: "Tidal stream requires more logic (use hifi or Player SDK)"
  };
}

function mergeResults(qobuzTracks, tidalTracks, limit) {
  const map = new Map();

  for (const t of qobuzTracks) {
    const key = t.isrc || `${t.title}|${t.artist}`.toLowerCase();
    map.set(key, { ...t, source: "Q" });
  }

  for (const t of tidalTracks) {
    const key = t.isrc || `${t.title}|${t.artist}`.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { ...t, source: "T" });
    }
  }

  return Array.from(map.values()).slice(0, limit);
}