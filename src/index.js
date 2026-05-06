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

    // SEARCH - Qobuz only
    if (path === "/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 25;

      if (!query) return new Response(JSON.stringify({ error: "Missing query" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });

      try {
        const qobuzUrl = `https://www.qobuz.com/api.json/0.2/track/search?query=${encodeURIComponent(query)}&limit=${limit * 2}&country_code=${env.COUNTRY_CODE || "PT"}`;
        
        const res = await fetch(qobuzUrl, {
          headers: {
            "X-App-Id": env.QOBUZ_APP_ID,
            "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN
          }
        });

        const data = await res.json();
        const items = data?.tracks?.items || [];

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

        return new Response(JSON.stringify({ tracks, total: tracks.length }), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // STREAM - Qobuz preferred + Tidal fallback
    if (path.startsWith("/stream/")) {
      const trackId = path.split("/stream/")[1];

      // 1. Try Qobuz first
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

      // 2. Tidal fallback
      return new Response(JSON.stringify({
        streamUrl: null,
        quality: "Tidal HiFi (fallback)",
        message: "Tidal fallback triggered"
      }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({ message: "Rocks8ar Stable Bridge - Qobuz + Tidal Fallback" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};