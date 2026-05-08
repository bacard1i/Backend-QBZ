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

    try {
      // ==================== SEARCH ====================
      if (path === "/search") {
        const query = url.searchParams.get("q") || "";
        const limit = parseInt(url.searchParams.get("limit")) || 20;

        if (!query) {
          return jsonResponse({ error: "Missing query parameter" }, 400, corsHeaders);
        }

        const [qobuzData, tidalData] = await Promise.all([
          searchQobuz(query, limit * 2, env),
          searchTidal(query, limit * 2, env)
        ]);

        const mergedResults = mergeAndDeduplicate(qobuzData.tracks || [], tidalData.tracks || [], limit);

        return jsonResponse({
          tracks: mergedResults,
          total: mergedResults.length,
          sources: ["Qobuz", "Tidal"]
        }, 200, corsHeaders);
      }

      // ==================== STREAM ====================
      if (path.startsWith("/stream/")) {
        const trackId = path.split("/stream/")[1];

        // Try Qobuz first (priority for quality)
        try {
          const qobuzStream = await getQobuzStream(trackId, env);
          if (qobuzStream?.streamUrl) {
            qobuzStream.source = "Qobuz";
            return jsonResponse(qobuzStream, 200, corsHeaders);
          }
        } catch (error) {
          console.log(`[Stream] Qobuz failed for track ${trackId}:`, error.message);
        }

        // Fallback to Tidal
        try {
          const tidalStream = await getTidalStream(trackId, env);
          if (tidalStream) {
            return jsonResponse(tidalStream, 200, corsHeaders);
          }
        } catch (error) {
          console.log(`[Stream] Tidal fallback failed for track ${trackId}:`, error.message);
        }

        return jsonResponse({ error: "No stream available from Qobuz or Tidal" }, 404, corsHeaders);
      }

      // ==================== HEALTH CHECK ====================
      if (path === "/health") {
        return jsonResponse({ status: "ok", service: "Rocks8ar" }, 200, corsHeaders);
      }

      return jsonResponse({ message: "Rocks8ar Worker v2.0" }, 200, corsHeaders);

    } catch (error) {
      console.error("[Worker Error]", error);
      return jsonResponse({ error: "Internal server error" }, 500, corsHeaders);
    }
  }
};

// ==================== HELPER ====================
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

// ==================== QOBUZ ====================
async function searchQobuz(query, limit, env) {
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

  return {
    tracks: items
      .filter(track => (track.maximum_bit_depth || track.bit_depth || 0) >= 24)
      .slice(0, limit)
      .map(track => ({
        id: String(track.id),
        title: track.title,
        artist: track.performer?.name || "Unknown",
        album: track.album?.title || "",
        duration: track.duration || 0,
        audioQuality: `${track.maximum_bit_depth || track.bit_depth}-bit / ${track.maximum_sampling_rate || track.sampling_rate} kHz`,
        cover: track.album?.image?.large || "",
        isrc: track.isrc || null,
        source: "Q"
      }))
  };
}

async function getQobuzStream(trackId, env) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureString = `trackgetFileUrlformat_id27intentstreamtrack_id${trackId}${timestamp}${env.QOBUZ_APP_SECRET}`;
  
  const signatureBuffer = await crypto.subtle.digest("MD5", new TextEncoder().encode(signatureString));
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  const res = await fetch(
    `https://www.qobuz.com/api.json/0.2/track/getFileUrl?track_id=${trackId}&format_id=27&intent=stream&request_ts=${timestamp}&request_sig=${signatureHex}`,
    { headers: { "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN } }
  );

  if (!res.ok) throw new Error("Qobuz stream request failed");

  const data = await res.json();
  if (!data.url) throw new Error("No stream URL returned from Qobuz");

  return {
    streamUrl: data.url,
    quality: `${data.bit_depth || 24}-bit / ${data.sample_rate || 0} kHz`
  };
}

// ==================== TIDAL ====================
async function searchTidal(query, limit, env) {
  const token = env.TIDAL_ACCESS_TOKEN;
  if (!token) return { tracks: [] };

  const res = await fetch(
    `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}&countryCode=${env.TIDAL_COUNTRY_CODE || "CA"}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return { tracks: [] };

  const data = await res.json();

  return {
    tracks: (data.items || []).map(track => ({
      id: String(track.id),
      title: track.title,
      artist: track.artist?.name || "Unknown",
      album: track.album?.title || "",
      duration: track.duration || 0,
      audioQuality: "HiFi",
      cover: track.album?.cover || "",
      isrc: track.isrc || null,
      source: "T"
    }))
  };
}

async function getTidalStream(trackId, env) {
  const token = env.TIDAL_ACCESS_TOKEN;
  if (!token) return null;

  // Currently returns metadata only.
  // Full stream URL logic can be added later if needed.
  return {
    streamUrl: null,
    quality: "HiFi",
    source: "Tidal",
    tidalId: trackId,
    note: "Tidal direct stream is limited. Using metadata fallback."
  };
}

// ==================== MERGE & DEDUPLICATE ====================
function mergeAndDeduplicate(qobuzTracks, tidalTracks, limit) {
  const trackMap = new Map();

  // Add Qobuz tracks first (higher priority)
  for (const track of qobuzTracks) {
    const key = track.isrc || `${track.title.toLowerCase()}|${track.artist.toLowerCase()}`;
    trackMap.set(key, { ...track, source: "Q" });
  }

  // Add Tidal tracks only if not already present
  for (const track of tidalTracks) {
    const key = track.isrc || `${track.title.toLowerCase()}|${track.artist.toLowerCase()}`;
    if (!trackMap.has(key)) {
      trackMap.set(key, { ...track, source: "T" });
    }
  }

  return Array.from(trackMap.values()).slice(0, limit);
}