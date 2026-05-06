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

    if (path === "/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 25;

      if (!query) {
        return new Response(JSON.stringify({ error: "Missing query" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      let qobuzTracks = [];
      let tidalTracks = [];
      let tidalError = null;

      // Qobuz Search
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
            provider: "Qobuz"
          }));
      } catch (e) {}

      // Tidal Search (using patterns from the hifi-api-workers repo)
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
              provider: "Tidal"
            }));
          } else {
            tidalError = `Tidal status ${tidalRes.status}`;
          }
        }
      } catch (e) {
        tidalError = e.message;
      }

      // Merge + Deduplication
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
        total: finalTracks.length,
        tidalDebug: tidalError || "Tidal search attempted"
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({
      message: "Rocks8ar Merged Search Bridge"
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};