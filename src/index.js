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

    // ==================== SEARCH (Merged Qobuz + Tidal) ====================
    if (path === "/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 25;

      if (!query) {
        return new Response(JSON.stringify({ error: "Missing query" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }

      let qobuzTracks = [];
      let tidalTracks = [];

      // === Search Qobuz ===
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

        qobuzTracks = items
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
      } catch (e) {}

      // === Search Tidal (Client Credentials) ===
      try {
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
          const tidalUrl = `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}&countryCode=${env.COUNTRY_CODE || "US"}`;
          const tidalRes = await fetch(tidalUrl, {
            headers: { "Authorization": `Bearer ${tokenData.access_token}` }
          });

          if (tidalRes.ok) {
            const tidalData = await tidalRes.json();
            const items = tidalData?.items || [];

            tidalTracks = items.slice(0, limit).map(t => ({
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
          }
        }
      } catch (e) {}

      // === Merge + Deduplicate by ISRC ===
      const allTracks = [...qobuzTracks, ...tidalTracks];
      const seen = new Set();
      const finalTracks = allTracks.filter(track => {
        const key = track.isrc || (track.title + track.artist).toLowerCase().replace(/\s/g, "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return new Response(JSON.stringify({
        tracks: finalTracks.slice(0, limit),
        total: finalTracks.length
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // ==================== STREAM (Qobuz first → Tidal fallback) ====================
    if (path.startsWith("/stream/")) {
      const trackId = path.split("/stream/")[1];

      // Try Qobuz first
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

      // Fallback to Tidal
      return new Response(JSON.stringify({
        streamUrl: null,
        quality: "Tidal HiFi (fallback)",
        message: "Tidal fallback triggered"
      }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({
      message: "Rocks8ar Merged Worker - Qobuz + Tidal"
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
}; Code + PKCE

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
      const codeVerifier = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const encoder = new TextEncoder();
      const digest = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
      const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const loginUrl = `https://login.tidal.com/authorize?` +
        `response_type=code` +
        `&client_id=${env.TIDAL_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent("https://pushit.hatestar.workers.dev/tidal/callback")}` +
        `&scope=r_usr+w_usr` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`;

      return new Response(JSON.stringify({
        message: "Open this link and log in with your Tidal account",
        login_url: loginUrl,
        code_verifier: codeVerifier
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // ==================== TIDAL CALLBACK ====================
    if (path === "/tidal/callback") {
      return new Response("Tidal login successful! You can close this tab.", {
        headers: { "Content-Type": "text/html" }
      });
    }

    // ==================== SEARCH (Qobuz only for now) ====================
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

    // Default
    return new Response(JSON.stringify({
      message: "Rocks8ar Worker is running"
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};