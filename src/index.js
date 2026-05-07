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
          status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }

      const [qobuzData, tidalData] = await Promise.all([
        fetchQobuzSearch(query, limit * 2, env),
        fetchTidalSearch(query, limit * 2, env)
      ]);

      const merged = mergeResults(qobuzData.tracks || [], tidalData.tracks || [], limit);

      return new Response(JSON.stringify({
        tracks: merged,
        total: merged.length,
        sources: ["Qobuz", "Tidal"]
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // ==================== STREAM ====================
    if (path.startsWith("/stream/")) {
      const trackId = path.split("/stream/")[1];

      try {
        const qobuzStream = await getQobuzStream(trackId, env);
        if (qobuzStream?.streamUrl) {
          qobuzStream.source = "Qobuz";
          return new Response(JSON.stringify(qobuzStream), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }
      } catch (_) {}

      const tidalFallback = await getTidalStreamFallback({}, env);
      if (tidalFallback) {
        return new Response(JSON.stringify(tidalFallback), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      return new Response(JSON.stringify({ error: "No stream available" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // ==================== TIDAL USER LOGIN (Simple Testing) ====================
    if (path === "/tidal/login") {
      const clientId = env.TIDAL_CLIENT_ID;
      const redirectUri = "http://localhost:3000/callback"; // Must match dashboard

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      // Store code_verifier temporarily (in real app use KV or cookie)
      // For now we just show it in the response for testing

      const authUrl = `https://login.tidal.com/authorize?` +
        `response_type=code` +
        `&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=r_usr+w_usr` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`;

      return new Response(JSON.stringify({
        message: "Open this URL in your browser and login with your Tidal account",
        login_url: authUrl,
        note: "After login you will be redirected. Copy the 'code' from the URL."
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    if (path === "/tidal/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response(JSON.stringify({ error: "No code received" }), {
          status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      // Exchange code for tokens
      const tokenRes = await fetch("https://auth.tidal.com/v1/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: env.TIDAL_CLIENT_ID,
          code: code,
          redirect_uri: "http://localhost:3000/callback",
          code_verifier: "TEMP_CODE_VERIFIER" // You need to store this properly
        })
      });

      const tokens = await tokenRes.json();

      return new Response(JSON.stringify({
        message: "Login successful! Copy these tokens into your .env / Cloudflare variables",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({
      message: "Rocks8ar Worker - Merged + Tidal Fallback + Login"
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};

// ==================== YOUR EXISTING QOBUZ FUNCTIONS ====================
// (Keep your working fetchQobuzSearch and getQobuzStream here)

async function fetchQobuzSearch(query, limit, env) {
  // Paste your working Qobuz search code
  return { tracks: [] };
}

async function getQobuzStream(trackId, env) {
  // Paste your working Qobuz stream code (MD5 signature)
  return null;
}

// ==================== IMPROVED TIDAL FALLBACK ====================
async function getTidalStreamFallback(trackMeta, env) {
  // Same improved function I gave you earlier
  const token = env.TIDAL_ACCESS_TOKEN;
  if (!token) return null;

  // ... (use the improved version from previous message)
  return null;
}

// ==================== HELPER FUNCTIONS ====================
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mergeResults(qobuzTracks, tidalTracks, limit) {
  // Your existing merge logic
  const merged = new Map();
  // ... (paste your merge function)
  return Array.from(merged.values()).slice(0, limit);
}