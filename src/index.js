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
        return new Response(JSON.stringify({ error: "Missing query" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }

      let tidalTracks = [];

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

        if (!tokenData.access_token) {
          return new Response(JSON.stringify({
            error: "Failed to get Tidal token",
            details: tokenData
          }), { 
            status: 401, 
            headers: { "Content-Type": "application/json", ...corsHeaders } 
          });
        }

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
        return new Response(JSON.stringify({
          error: "Exception during Tidal search",
          message: e.message
        }), { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }

      return new Response(JSON.stringify({
        tracks: tidalTracks,
        total: tidalTracks.length,
        debug: {
          tidalResults: tidalTracks.length,
          message: "Tidal-only search test"
        }
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({
      message: "Tidal Test Worker"
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};
