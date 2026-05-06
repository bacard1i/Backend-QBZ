var BACKEND_URL = "https://pushit.hatestar.workers.dev";

function fetchJSON(url) {
    return fetch(url)
        .then(r => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        });
}

var searchTracks = function(query, limit) {
    if (!limit) limit = 25;
    var url = BACKEND_URL + "/search?q=" + encodeURIComponent(query) + "&limit=" + limit;
    return fetchJSON(url).then(function(data) {
        return { 
            tracks: data.tracks || [], 
            total: data.total || 0 
        };
    });
};

var getTrackStreamUrl = function(trackId) {
    var url = BACKEND_URL + "/stream/" + trackId;
    return fetchJSON(url).then(function(data) {
        return {
            streamUrl: data.streamUrl,
            track: { 
                audioQuality: data.quality || "24-bit Hi-Res" 
            }
        };
    });
};

var getAlbum = function(albumId) {
    var url = BACKEND_URL + "/album?album_id=" + albumId;
    return fetchJSON(url);
};

var preloadTrack = function(trackId) {
    var url = BACKEND_URL + "/preload/" + trackId;
    return fetchJSON(url).catch(() => ({ status: "ok" }));
};

return {
    id: "rocks8ar",
    name: "Rocks8ar",
    author: "bacardii",
    version: "1.1",
    description: "Qobuz Priority + Smart Tidal Fallback",
    labels: ["QOBUZ", "TIDAL", "FALLBACK", "HI-RES", "STABLE"],
    searchTracks: searchTracks,
    getTrackStreamUrl: getTrackStreamUrl,
    getAlbum: getAlbum,
    preloadTrack: preloadTrack
};