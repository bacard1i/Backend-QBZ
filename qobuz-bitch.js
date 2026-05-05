const BACKEND_URL = "https://backend-qbz-production.up.railway.app";

function fetchWithTimeout(url, timeout) {
    return new Promise(function(resolve, reject) {
        var controller = new AbortController();
        var signal = controller.signal;
        var timer = setTimeout(function() {
            controller.abort();
            reject(new Error("Request timeout"));
        }, timeout || 15000);

        fetch(url, { signal: signal }).then(function(res) {
            clearTimeout(timer);
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        }).then(function(data) {
            resolve(data);
        }).catch(function(err) {
            clearTimeout(timer);
            reject(err);
        });
    });
}

var module = {
    id: "qobuz-bacardii-hires",
    name: "Qobuz’s bitch",
    author: "bacardii",
    version: "2.2",
    description: "Strict 24-bit Hi-Res Qobuz (Portugal) - Personal Backend",

    searchTracks: function(query, limit) {
        limit = limit || 25;
        var url = BACKEND_URL + "/8spine/search?q=" + encodeURIComponent(query) + "&limit=" + limit;
        
        return fetchWithTimeout(url, 15000).then(function(data) {
            return { tracks: data.tracks || [], total: data.total || 0 };
        }).catch(function(e) {
            console.error(e);
            return { tracks: [], total: 0 };
        });
    },

    getTrackStreamUrl: function(trackId) {
        var url = BACKEND_URL + "/8spine/stream/" + trackId;
        
        return fetchWithTimeout(url, 15000).then(function(data) {
            return {
                streamUrl: data.streamUrl,
                track: { audioQuality: "24-bit Hi-Res" }
            };
        }).catch(function(e) {
            console.error(e);
            throw e;
        });
    },

    getAlbum: function(albumId) {
        var url = BACKEND_URL + "/8spine/album?album_id=" + albumId;
        
        return fetchWithTimeout(url, 15000).then(function(data) {
            return data;
        }).catch(function(e) {
            console.error(e);
            throw e;
        });
    }
};

module;