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

    // ==================== TIDAL ONLY (For Testing) ====================
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
        return new Response(JSON.stringify({ error: "No Tidal token found" }), { 
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

    // ==================== STREAM ====================
    if (path.startsWith("/stream/")) {
      const trackId = path.split("/stream/")[1];

      try {
        const ts = Math.floor(Date.now() / 1000);
        const sigStr = `trackgetFileUrlformat_id27intentstreamtrack_id${trackId}${ts}${env.QOBUZ_APP_SECRET}`;
        const sig = await crypto.subtle.digest("MD5", new TextEncoder().encode(sigStr));
        const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

        const qUrl = `https://www.qobuz.com/api.json/0.2/track/getFileUrl?track_id=${trackId}&format_id=27&intent=stream&request_ts=${ts}&request_sig=${sigHex}&app_id=${env.QOBUZ_APP_ID}`;

        const qRes = await fetch(qUrl, {
          headers: { "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN }
        });

        if (qRes.ok) {
          const data = await qRes.json();
          if (data.url) {
            return new Response(JSON.stringify({
              streamUrl: data.url,
              quality: `${data.bit_depth || 24}-bit / ${data.sample_rate || 0} kHz`
            }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
        }
      } catch (e) {}

      return new Response(JSON.stringify({
        streamUrl: null,
        quality: "Tidal HiFi (fallback)"
      }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({
      message: "Rocks8ar Worker - Use /search or /tidal/search"
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};