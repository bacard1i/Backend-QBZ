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

      let result = {
        step: "",
        success: false,
        error: null,
        tokenData: null,
        searchStatus: null,
        resultsCount: 0
      };

      try {
        // Step 1: Refresh Token
        result.step = "refresh_token";

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
        result.tokenData = tokenData;

        if (!tokenData.access_token) {
          result.error = "Failed to get access token";
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // Step 2: Search Tidal
        result.step = "search_tidal";

        const tidalUrl = `https://api.tidal.com/v1/search/tracks?query=${encodeURIComponent(query)}&limit=10&countryCode=${env.COUNTRY_CODE || "US"}`;
        
        const tidalRes = await fetch(tidalUrl, {
          headers: { "Authorization": `Bearer ${tokenData.access_token}` }
        });

        result.searchStatus = tidalRes.status;

        if (tidalRes.ok) {
          const tidalData = await tidalRes.json();
          result.resultsCount = tidalData?.items?.length || 0;
          result.success = true;
        } else {
          result.error = await tidalRes.text();
        }

      } catch (e) {
        result.error = e.message;
      }

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ message: "Debug Mode" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};