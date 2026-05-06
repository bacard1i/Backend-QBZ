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
      const limit = parseInt(url.searchParams.get("limit")) || 10;

      let debug = {
        tidalTokenSuccess: false,
        tidalSearchStatus: null,
        tidalResultsCount: 0,
        tidalError: null
      };

      let tidalTracks = [];

      try {
        // Refresh Token
        const refreshBody = new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: env.TIDAL_REFRESH_TOKEN,
          client_id: env.TIDAL_CLIENT_ID,
          client_secret: env.TIDAL_CLIENT_SECRET
        });

        const tokenRes = await fetch("https://auth.tidal.com/v1/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: refreshBody.toString()
        });

        const tokenData = await tokenRes.json();

        if (tokenData.access_token) {
          debug.tidalTokenSuccess = true;

          const tidalUrl = `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=${limit}&countryCode=${env.COUNTRY_CODE || "US"}`;
          
          const tidalRes = await fetch(tidalUrl, {
            headers: { "Authorization": `Bearer ${tokenData.access_token}` }
          });

          debug.tidalSearchStatus = tidalRes.status;

          if (tidalRes.ok) {
            const tidalData = await tidalRes.json();
            const items = tidalData?.items || [];
            debug.tidalResultsCount = items.length;

            tidalTracks = items.map(t => ({
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
          } else {
            debug.tidalError = await tidalRes.text();
          }
        } else {
          debug.tidalError = tokenData;
        }

      } catch (e) {
        debug.tidalError = e.message;
      }

      return new Response(JSON.stringify({
        tracks: tidalTracks,
        total: tidalTracks.length,
        debug: debug
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ message: "Debug Worker" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};