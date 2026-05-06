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

var preloadTrack = function(trackId) {
    var url = BACKEND_URL + "/preload/" + trackId;
    return fetchJSON(url).catch(() => ({ status: "ok" }));
};

var getAlbum = function(albumId) {
    var url = BACKEND_URL + "/album?album_id=" + albumId;
    return fetchJSON(url).catch(() => null);
};

return {
    id: "qobuz-rocks8ar",
    name: "Rocks8ar",
    author: "bacardii",
    version: "1.5",
    description: "Direct QOBUZ PRO Hi-Res with Merged Tidal Search & Instant Playback",
    labels: ["QOBUZ PRO", "HI-RES", "MERGED", "INSTANT PLAYBACK"],
    searchTracks: searchTracks,
    getTrackStreamUrl: getTrackStreamUrl,
    getAlbum: getAlbum,
    preloadTrack: preloadTrack
};