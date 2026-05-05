const BACKEND_URL = "https://backend-qbz-production.up.railway.app";

async function fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

const module = {
    id: "qobuz-bacardii-hires",
    name: "Qobuz’s bitch",
    author: "bacardii",
    version: "2.0",
    description: "Strict 24-bit Hi-Res Qobuz (Portugal)",
    labels: ["QOBUZ", "HI-RES", "24-BIT"],

    searchTracks: async (query, limit = 25) => {
        try {
            const url = `${BACKEND_URL}/8spine/search?q=${encodeURIComponent(query)}&limit=${limit}`;
            const data = await fetchWithTimeout(url);
            return { tracks: data.tracks || [], total: data.total || 0 };
        } catch (e) {
            console.error(e);
            return { tracks: [], total: 0 };
        }
    },

    getTrackStreamUrl: async (trackId) => {
        try {
            const url = `${BACKEND_URL}/8spine/stream/${trackId}`;
            const data = await fetchWithTimeout(url);
            return {
                streamUrl: data.streamUrl,
                track: { audioQuality: "24-bit Hi-Res" }
            };
        } catch (e) {
            console.error(e);
            throw e;
        }
    },

    getAlbum: async (albumId) => {
        try {
            const url = `${BACKEND_URL}/8spine/album?album_id=${albumId}`;
            const data = await fetchWithTimeout(url);
            return data;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
};

module;
