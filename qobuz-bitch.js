var BACKEND_URL = "https://backend-qbz-production.up.railway.app";

function fetchJSON(url) {
    return new Promise(function(resolve, reject) {
        fetch(url)
            .then(function(r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(function(data) {
                resolve(data);
            })
            .catch(function(err) {
                console.error("[Qobuz Bitch]", err);
                reject(err);
            });
    });
}

var searchTracks = function(query, limit) {
    if (!limit) limit = 25;
    var url = BACKEND_URL + "/8spine/search?q=" + encodeURIComponent(query) + "&limit=" + limit;
    
    return fetchJSON(url).then(function(data) {
        return { tracks: data.tracks || [], total: data.total || 0 };
    });
};

var getTrackStreamUrl = function(trackId) {
    var url = BACKEND_URL + "/8spine/stream/" + trackId;
    
    return fetchJSON(url).then(function(data) {
        return {
            streamUrl: data.streamUrl,
            track: { audioQuality: "24-bit Hi-Res" }
        };
    });
};

var getAlbum = function(albumId) {
    var url = BACKEND_URL + "/8spine/album?album_id=" + albumId;
    
    return fetchJSON(url).then(function(data) {
        return data;
    });
};

return {
    id: "qobuz-bacardii-hires",
    name: "Qobuz’s bitch",
    author: "bacardii",
    version: "2.7",
    description: "Strict 24-bit Hi-Res Qobuz (Portugal) - Personal Backend",
    labels: ["QOBUZ", "HI-RES", "24-BIT", "FLAC"],
    
    searchTracks: searchTracks,
    getTrackStreamUrl: getTrackStreamUrl,
    getAlbum: getAlbum
};