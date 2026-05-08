export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = { "Access-Control-Allow-Origin": "*" };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // ==================== SEARCH ====================
    if (path === "/search") {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 20;

      const res = await fetch(
        `https://www.qobuz.com/api.json/0.2/track/search?query=${encodeURIComponent(query)}&limit=${limit}&country_code=PT`,
        {
          headers: {
            "X-App-Id": env.QOBUZ_APP_ID,
            "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN
          }
        }
      );

      const data = await res.json();
      const items = data.tracks?.items || [];

      const tracks = items
        .filter(t => (t.maximum_bit_depth || 0) >= 24)
        .slice(0, limit)
        .map(t => ({
          id: String(t.id),
          title: t.title,
          artist: t.performer?.name || "Unknown",
          album: t.album?.title || "",
          duration: t.duration || 0,
          audioQuality: `${t.maximum_bit_depth || 24}-bit / ${t.maximum_sampling_rate || 44.1} kHz`,
          cover: t.album?.image?.large || "",
          isrc: t.isrc || null,
          source: "Q"
        }));

      return new Response(JSON.stringify({ tracks, total: tracks.length }), {
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    // ==================== STREAM ====================
    if (path.startsWith("/stream/")) {
      const trackId = path.split("/stream/")[1];

      try {
        const ts = Math.floor(Date.now() / 1000);
        const sigStr = `trackgetFileUrlformat_id27intentstreamtrack_id${trackId}${ts}${env.QOBUZ_APP_SECRET}`;
        const sigBuffer = await crypto.subtle.digest("MD5", new TextEncoder().encode(sigStr));
        const sigHex = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

        const streamRes = await fetch(
          `https://www.qobuz.com/api.json/0.2/track/getFileUrl?track_id=${trackId}&format_id=27&intent=stream&request_ts=${ts}&request_sig=${sigHex}`,
          { headers: { "X-User-Auth-Token": env.QOBUZ_USER_AUTH_TOKEN } }
        );

        const streamData = await streamRes.json();

        if (streamData.url) {
          return new Response(JSON.stringify({
            streamUrl: streamData.url,
            track: {
              audioQuality: `${streamData.bit_depth || 24}-bit / ${streamData.sample_rate || 0} kHz`,
              source: "Qobuz"
            }
          }), {
            headers: { "Content-Type": "application/json", ...cors }
          });
        }
      } catch (e) {
        console.log("Qobuz stream error:", e.message);
      }

      // If Qobuz fails, return clear error instead of broken Tidal fallback
      return new Response(JSON.stringify({
        streamUrl: null,
        track: {
          audioQuality: "Unavailable",
          source: "None"
        },
        error: "Qobuz stream failed for this track"
      }), {
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    return new Response(JSON.stringify({ message: "Rocks8ar Worker" }), {
      headers: { "Content-Type": "application/json", ...cors }
    });
  }
};