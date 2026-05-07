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

    // ==================== MERGED SEARCH (Qobuz + Tidal) ====================
    if (path === "/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 25;

      if (!query) {
        return new Response(JSON.stringify({ error: "Missing query" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }

      let results = [];

      // Qobuz
      try {
        const qobuzUrl = `https://www.qobuz.com/api.json/0.2/track/search?query=${encodeURIComponent(query)}&limit=${limit * 2}&country_code=${env.QOBUZ_COUNTRY_CODE || "PT"}`;
        const res = await fetch(qobuzUrl, {
          headers: {
            "X-App-Id": env.QOBUZ_APP_ID,
            "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN
          }
        });
        const data = await res.json();

        if (data?.tracks?.items) {
          const qobuzTracks = data.tracks.items
            .filter(t => (t.maximum_bit_depth || t.bit_depth || 0) >= 16)
            .slice(0, limit)
            .map(t => ({
              id: String(t.id),
              title: t.title,
              artist: t.performer?.name || "Unknown",
              album: t.album?.title || "",
              duration: t.duration || 0,
              audioQuality: `${t.maximum_bit_depth || t.bit_depth || 16}-bit / ${t.maximum_sampling_rate || t.sampling_rate || 0} kHz`,
              cover: t.album?.image?.large || "",
              isrc: t.isrc || null,
              source: "Q"
            }));
          results = results.concat(qobuzTracks);
        }
      } catch (e) {}

      // Tidal
      try {
        const accessToken = env.TIDAL_ACCESS_TOKEN;
        if (accessToken) {
          const tidalUrl = `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}&countryCode=${env.TIDAL_COUNTRY_CODE || "CA"}`;
          const tidalRes = await fetch(tidalUrl, {
            headers: { "Authorization": `Bearer ${accessToken}` }
          });

          if (tidalRes.ok) {
            const tidalData = await tidalRes.json();
            const tidalTracks = (tidalData?.items || []).map(t => ({
              id: String(t.id),
              title: t.title,
              artist: t.artist?.name || "Unknown",
              album: t.album?.title || "",
              duration: t.duration || 0,
              audioQuality: "HiFi",
              cover: t.album?.cover || "",
              isrc: t.isrc || null,
              source: "T"
            }));
            results = results.concat(tidalTracks);
          }
        }
      } catch (e) {}

      // Deduplicate
      const seen = new Set();
      const finalResults = results.filter(track => {
        const key = track.isrc || (track.title + track.artist).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return new Response(JSON.stringify({
        tracks: finalResults.slice(0, limit),
        total: finalResults.length
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // ==================== TIDAL ONLY (TEST ENDPOINT) ====================
    if (path === "/tidal/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 25;

      if (!query) {
        return new Response(JSON.stringify({ error: "Missing query" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }

      const accessToken = env.TIDAL_ACCESS_TOKEN;
      if (!accessToken) {
        return new Response(JSON.stringify({ error: "TIDAL_ACCESS_TOKEN not set" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }

      try {
        const tidalUrl = `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}&countryCode=${env.TIDAL_COUNTRY_CODE || "CA"}`;
        const tidalRes = await fetch(tidalUrl, {
          headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (tidalRes.ok) {
          const tidalData = await tidalRes.json();
          const tidalTracks = (tidalData?.items || []).map(t => ({
            id: String(t.id),
            title: t.title,
            artist: t.artist?.name || "Unknown",
            album: t.album?.title || "",
            duration: t.duration || 0,
            audioQuality: "HiFi",
            cover: t.album?.cover || "",
            isrc: t.isrc || null,
            source: "T"
          }));

          return new Response(JSON.stringify({
            tracks: tidalTracks.slice(0, limit),
            total: tidalTracks.length
          }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        } else {
          return new Response(JSON.stringify({ 
            error: "Tidal search failed", 
            status: tidalRes.status 
          }), { 
            status: tidalRes.status, 
            headers: { "Content-Type": "application/json", ...corsHeaders } 
          });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }
    }

    // Default message
    return new Response(JSON.stringify({
      message: "Rocks8ar - Use /search or /tidal/search"
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};