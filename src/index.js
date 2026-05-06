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
    login_url: loginUrl,
    code_verifier: codeVerifier
  }), { headers: { "Content-Type": "application/json" } });
}