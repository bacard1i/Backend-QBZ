var BACKEND_URL = "https://pushit.hatestar.workers.dev";

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
                console.error("[Rocks8ar]", err);
                reject(err);
            });
    });
}

var searchTracks = function(query, limit) {
    if (!limit) limit = 20;

    var url = BACKEND_URL + "/search?q=" + encodeURIComponent(query) + "&limit=" + limit;

    return fetchJSON(url).then(function(data) {
        return data.tracks || [];
    }).catch(function() {
        return [];
    });
};

var getTrackStreamUrl = function(trackId) {
    var url = BACKEND_URL + "/stream/" + trackId;

    return fetchJSON(url).then(function(data) {
        return {
            streamUrl: data.streamUrl,
            track: {
                audioQuality: data.track && data.track.audioQuality 
                    ? data.track.audioQuality 
                    : "24-bit Hi-Res"
            }
        };
    }).catch(function() {
        return {
            streamUrl: null,
            track: {
                audioQuality: "Unavailable"
            }
        };
    });
};

return {
    id: "rocks8ar",
    name: "Rocks8ar",
    version: "2.0",
    author: "bacardii",
    description: "Qobuz Primary + Direct Tidal Fallback",

    searchTracks: searchTracks,
    getTrackStreamUrl: getTrackStreamUrl
};