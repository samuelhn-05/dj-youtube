// Shared data management between DJ Mode and Studio Mode using LocalStorage

let djData = JSON.parse(localStorage.getItem('dj-data'));

if (!djData) {
    // Default fallback data
    djData = {
        playlists: {
            "Salsa Mix": [
                { videoId: "14kyBUvsgss", title: "Salsa Track 1", start: 0, end: 130 },
                { videoId: "MjdPy3njToM", title: "Salsa Track 2", start: 10, end: 238 }
            ]
        }
    };
    saveData();
}

function saveData() {
    localStorage.setItem('dj-data', JSON.stringify(djData));
}

function formatTime(seconds) {
    if (seconds === null || seconds === undefined) return "0:00";
    seconds = Math.floor(seconds);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Global active element reference for syncing if needed
let activePlaylist = localStorage.getItem('dj-active-playlist') || Object.keys(djData.playlists)[0] || "";

function saveActivePlaylist(pl) {
    activePlaylist = pl;
    localStorage.setItem('dj-active-playlist', pl);
}
