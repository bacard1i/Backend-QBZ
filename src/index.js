export default {
  async fetch(request, env, ctx) {
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

    // ==================== SEARCH (Qobuz only) ====================
    if (path === "/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 25;

      if (!query) {
        return new Response(JSON.stringify({ error: "Missing query" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      try {
        const qobuzUrl = `https://www.qobuz.com/api.json/0.2/track/search?query=${encodeURIComponent(query)}&limit=${limit * 2}&country_code=${env.COUNTRY_CODE || "PT"}`;
        
        const qobuzRes = await fetch(qobuzUrl, {
          headers: {
            "X-App-Id": env.QOBUZ_APP_ID,
            "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN
          }
        });

        const qobuzData = await qobuzRes.json();
        const items = qobuzData?.tracks?.items || [];

        const tracks = items
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
            isrc: t.isrc || null
          }));

        return new Response(JSON.stringify({
          tracks: tracks,
          total: tracks.length
        }), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
    }

    // ==================== STREAM (Qobuz + Tidal Fallback) ====================
    if (path.startsWith("/stream/")) {
      const trackId = path.split("/stream/")[1];

      // Try Qobuz first
      try {
        const ts = Math.floor(Date.now() / 1000);
        const sigString = `trackgetFileUrlformat_id27intentstreamtrack_id${trackId}${ts}${env.QOBUZ_APP_SECRET}`;
        const sig = await crypto.subtle.digest("MD5", new TextEncoder().encode(sigString));
        const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

        const streamUrl = `https://www.qobuz.com/api.json/0.2/track/getFileUrl?track_id=${trackId}&format_id=27&intent=stream&request_ts=${ts}&request_sig=${sigHex}&app_id=${env.QOBUZ_APP_ID}`;

        const qobuzStreamRes = await fetch(streamUrl, {
          headers: { "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN }
        });

        if (qobuzStreamRes.ok) {
          const data = await qobuzStreamRes.json();
          if (data.url) {
            return new Response(JSON.stringify({
              streamUrl: data.url,
              quality: `${data.bit_depth || 24}-bit / ${data.sample_rate || 0} kHz`
            }), {
              headers: { "Content-Type": "application/json", ...corsHeaders }
            });
          }
        }
      } catch (e) {}

      // Tidal Fallback
      try {
        const metaRes = await fetch(`https://www.qobuz.com/api.json/0.2/track/get?track_id=${trackId}`, {
          headers: {
            "X-App-Id": env.QOBUZ_APP_ID,
            "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN
          }
        });

        const meta = await metaRes.json();
        const title = meta.title || "";
        const artist = meta.performer?.name || "";

        const tokenRes = await fetch("https://auth.tidal.com/v1/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": "Basic " + btoa(env.TIDAL_CLIENT_ID + ":" + env.TIDAL_CLIENT_SECRET)
          },
          body: "grant_type=client_credentials"
        });

        const tokenData = await tokenRes.json();

        if (tokenData.access_token) {
          const tidalSearchUrl = `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(title + " " + artist)}&limit=3&countryCode=${env.COUNTRY_CODE || "US"}`;
          
          const tidalRes = await fetch(tidalSearchUrl, {
            headers: { "Authorization": `Bearer ${tokenData.access_token}` }
          });

          const tidalData = await tidalRes.json();
          const tidalTrack = tidalData?.items?.[0];

          if (tidalTrack) {
            return new Response(JSON.stringify({
              streamUrl: null,
              quality: "Tidal HiFi (fallback active)",
              message: "Tidal fallback triggered"
            }), {
              headers: { "Content-Type": "application/json", ...corsHeaders }
            });
          }
        }
      } catch (e) {}

      return new Response(JSON.stringify({
        error: "Track not available on Qobuz or Tidal"
      }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // Default
    return new Response(JSON.stringify({
      message: "Rocks8ar Worker is running (Qobuz + Tidal Fallback)"
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};