export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = { "Access-Control-Allow-Origin": "*" };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // ==================== SEARCH (Qobuz + Tidal merged) ====================
    if (path === "/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 25;

      if (!query) {
        return json({ error: "Missing query" }, 400, cors);
      }

      const [qobuzTracks, tidalTracks] = await Promise.all([
        fetchQobuzSearch(query, limit * 2, env),
        fetchTidalSearch(query, limit * 2, env)
      ]);

      const merged = mergeResults(qobuzTracks, tidalTracks, limit);

      return json({ tracks: merged, total: merged.length }, 200, cors);
    }

    // ==================== STREAM (Qobuz first → Tidal fallback) ====================
    if (path.startsWith("/stream/")) {
      const trackId = path.split("/stream/")[1];

      // Try Qobuz first
      try {
        const qobuzStream = await getQobuzStream(trackId, env);
        if (qobuzStream?.streamUrl) {
          return json({
            streamUrl: qobuzStream.streamUrl,
            track: {
              audioQuality: qobuzStream.quality,
              source: "Qobuz"
            }
          }, 200, cors);
        }
      } catch (e) {
        console.log("[Stream] Qobuz failed:", e.message);
      }

      // Tidal fallback
      try {
        const tidalStream = await getTidalStream(trackId, env);
        if (tidalStream?.streamUrl) {
          return json({
            streamUrl: tidalStream.streamUrl,
            track: {
              audioQuality: tidalStream.quality || "HiFi",
              source: "Tidal"
            }
          }, 200, cors);
        }
      } catch (e) {
        console.log("[Stream] Tidal fallback failed:", e.message);
      }

      return json({
        streamUrl: null,
        track: { audioQuality: "Unavailable", source: "None" },
        error: "No stream available from Qobuz or Tidal"
      }, 404, cors);
    }

    return json({ message: "Rocks8ar v1.5 - Qobuz + Tidal" }, 200, cors);
  }
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

// ==================== QOBUZ ====================
async function fetchQobuzSearch(query, limit, env) {
  const res = await fetch(
    `https://www.qobuz.com/api.json/0.2/track/search?query=${encodeURIComponent(query)}&limit=${limit}&country_code=PT`,
    {
      headers: {
        "X-App-Id": env.QOBUZ_APP_ID,
        "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN
      }
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  const items = data.tracks?.items || [];

  return items
    .filter(t => (t.maximum_bit_depth || 0) >= 16)
    .slice(0, limit)
    .map(t => ({
      id: String(t.id),
      title: t.title,
      artist: t.performer?.name || "Unknown",
      album: t.album?.title || "",
      duration: t.duration || 0,
      audioQuality: `${t.maximum_bit_depth || 16}-bit / ${t.maximum_sampling_rate || 44.1} kHz`,
      cover: t.album?.image?.large || "",
      isrc: t.isrc || null,
      source: "Qobuz"
    }));
}

async function getQobuzStream(trackId, env) {
  const ts = Math.floor(Date.now() / 1000);
  const sigStr = `trackgetFileUrlformat_id27intentstreamtrack_id${trackId}${ts}${env.QOBUZ_APP_SECRET}`;
  const sig = await crypto.subtle.digest("MD5", new TextEncoder().encode(sigStr));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

  const res = await fetch(
    `https://www.qobuz.com/api.json/0.2/track/getFileUrl?track_id=${trackId}&format_id=27&intent=stream&request_ts=${ts}&request_sig=${sigHex}`,
    { headers: { "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN } }
  );

  if (!res.ok) throw new Error("Qobuz stream failed");
  const data = await res.json();

  if (!data.url) throw new Error("No stream URL from Qobuz");

  return {
    streamUrl: data.url,
    quality: `${data.bit_depth || 24}-bit / ${data.sample_rate || 0} kHz`
  };
}

// ==================== TIDAL ====================
async function fetchTidalSearch(query, limit, env) {
  const token = env.TIDAL_ACCESS_TOKEN;
  if (!token) return [];

  try {
    const res = await fetch(
      `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}&countryCode=CA`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return [];
    const data = await res.json();

    return (data.items || []).map(t => ({
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
  } catch {
    return [];
  }
}

async function getTidalStream(trackId, env) {
  const token = env.TIDAL_ACCESS_TOKEN;
  if (!token) return null;

  // For now we return metadata only.
  // Full Tidal stream can be added later if needed.
  return {
    streamUrl: null,
    quality: "HiFi",
    source: "Tidal"
  };
}

// ==================== MERGE (ISRC Deduplication) ====================
function mergeResults(qobuzTracks, tidalTracks, limit) {
  const map = new Map();

  // Qobuz first (higher priority)
  for (const track of qobuzTracks) {
    const key = track.isrc || `${track.title}|${track.artist}`.toLowerCase();
    map.set(key, track);
  }

  // Add Tidal only if not already present
  for (const track of tidalTracks) {
    const key = track.isrc || `${track.title}|${track.artist}`.toLowerCase();
    if (!map.has(key)) {
      map.set(key, track);
    }
  }

  return Array.from(map.values()).slice(0, limit);
}