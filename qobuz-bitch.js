var BACKEND_URL = "https://pushit.hatestar.workers.dev";

function fetchJSON(url) {
  return fetch(url).then(r => r.ok ? r.json() : Promise.reject(r));
}

var searchTracks = (query, limit = 25) => fetchJSON(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`);

var getTrackStreamUrl = (trackId) => fetchJSON(`${BACKEND_URL}/stream/${trackId}`);

var getAlbum = (albumId) => fetchJSON(`${BACKEND_URL}/album?album_id=${albumId}`);

return {
  id: "rocks8ar",
  name: "Rocks8ar",
  author: "bacardii",
  version: "1.1",
  description: "Qobuz Priority + Smart Tidal Fallback",
  labels: ["QOBUZ", "TIDAL", "FALLBACK", "HI-RES"],
  searchTracks,
  getTrackStreamUrl,
  getAlbum
};