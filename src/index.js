export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ==================== MERGED SEARCH ====================
    if (path === "/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 20;

      if (!query) {
        return jsonResponse({ error: "Missing query" }, 400, corsHeaders);
      }

      const [qobuzData, tidalData] = await Promise.all([
        fetchQobuzSearch(query, limit * 2, env),
        fetchTidalSearch(query, limit * 2, env)
      ]);

      const merged = mergeResults(qobuzData.tracks || [], tidalData.tracks || [], limit);

      return jsonResponse({
        tracks: merged,
        total: merged.length,
        sources: ["Qobuz", "Tidal"]
      }, 200, corsHeaders);
    }

    // ==================== STREAM (Qobuz First + Tidal Fallback) ====================
    if (path.startsWith("/stream/")) {
      const trackId = path.split("/stream/")[1];

      // Try Qobuz first
      try {
        const qobuz = await getQobuzStream(trackId, env);
        if (qobuz?.streamUrl) {
          qobuz.source = "Qobuz";
          return jsonResponse(qobuz, 200, corsHeaders);
        }
      } catch (e) {
        console.log(`[Stream] Qobuz failed for ${trackId}`);
      }

      // Tidal fallback
      const tidal = await getTidalStreamFallback({}, env);
      if (tidal) {
        return jsonResponse(tidal, 200, corsHeaders);
      }

      return jsonResponse({ error: "No stream available" }, 404, corsHeaders);
    }

    return jsonResponse({
      message: "Rocks8ar - Qobuz Primary + Tidal Fallback"
    }, 200, corsHeaders);
  }
};

// ==================== HELPER ====================
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

// ==================== QOBUZ (Working) ====================
async function fetchQobuzSearch(query, limit, env) {
  const res = await fetch(
    `https://www.qobuz.com/api.json/0.2/track/search?query=${encodeURIComponent(query)}&limit=${limit}&country_code=${env.QOBUZ_COUNTRY_CODE || "PT"}`,
    {
      headers: {
        "X-App-Id": env.QOBUZ_APP_ID,
        "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN
      }
    }
  );

  if (!res.ok) return { tracks: [] };

  const data = await res.json();
  const items = data.tracks?.items || [];

  const tracks = items
    .filter(t => (t.maximum_bit_depth || t.bit_depth || 0) >= 24)
    .slice(0, limit)
    .map(t => ({
      id: String(t.id),
      title: t.title,
      artist: t.performer?.name || "Unknown",
      album: t.album?.title || "",
      duration: t.duration || 0,
      audioQuality: `${t.maximum_bit_depth || t.bit_depth}-bit / ${t.maximum_sampling_rate || t.sampling_rate} kHz`,
      cover: t.album?.image?.large || "",
      isrc: t.isrc || null,
      source: "Q"
    }));

  return { tracks };
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
  return {
    streamUrl: data.url,
    quality: `${data.bit_depth || 24}-bit / ${data.sample_rate || 0} kHz`
  };
}

// ==================== TIDAL FALLBACK ====================
async function fetchTidalSearch(query, limit, env) {
  const token = env.TIDAL_ACCESS_TOKEN;
  if (!token) return { tracks: [] };

  try {
    const res = await fetch(
      `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}&countryCode=${env.TIDAL_COUNTRY_CODE || "CA"}`,
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
  } catch (e) {
    return { tracks: [] };
  }
}

async function getTidalStreamFallback(trackMeta, env) {
  const token = env.TIDAL_ACCESS_TOKEN;
  if (!token) return null;

  return {
    streamUrl: null,
    quality: "HiFi",
    source: "Tidal",
    note: "Tidal fallback - metadata only (playback limited)"
  };
}

function mergeResults(qobuzTracks, tidalTracks, limit) {
  const merged = new Map();

  // Qobuz first (priority)
  for (const t of qobuzTracks) {
    const key = t.isrc || `${t.title?.toLowerCase()}|${t.artist?.toLowerCase()}`;
    merged.set(key, { ...t, source: "Q" });
  }

  // Tidal as fallback
  for (const t of tidalTracks) {
    const key = t.isrc || `${t.title?.toLowerCase()}|${t.artist?.toLowerCase()}`;
    if (!merged.has(key)) {
      merged.set(key, { ...t, source: "T" });
    }
  }

  return Array.from(merged.values()).slice(0, limit);
}