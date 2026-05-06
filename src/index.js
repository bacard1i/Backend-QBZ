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

    // ==================== TIDAL LOGIN ====================
    if (path === "/tidal/login") {
      // Generate PKCE values
      const codeVerifier = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const encoder = new TextEncoder();
      const digest = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
      const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const authUrl = `https://login.tidal.com/authorize?` +
        `response_type=code` +
        `&client_id=${env.TIDAL_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent("https://pushit.hatestar.workers.dev/tidal/callback")}` +
        `&scope=r_usr+w_usr` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`;

      return new Response(JSON.stringify({
        message: "Open this link and log in with your Tidal account",
        login_url: authUrl,
        code_verifier: codeVerifier
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // ==================== SEARCH ====================
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

    return new Response(JSON.stringify({
      message: "Rocks8ar Worker is running"
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};