let djCurrentTrackIndex = 0;
let djPlayer = null;
let isPlaying = false;
let checkInterval;

const playlistList = document.getElementById('playlist-list');
const trackList = document.getElementById('track-list');
const djPlaylistTitle = document.getElementById('dj-playlist-title');
const djTrackTitle = document.getElementById('dj-track-title');
const playBtn = document.getElementById('btn-play-pause');

// Initialize YouTube API
function onYouTubeIframeAPIReady() {
    djPlayer = new YT.Player('dj-player', {
        height: '100%',
        width: '100%',
        playerVars: { controls: 1, modestbranding: 1, rel: 0 },
        events: {
            'onReady': onDjPlayerReady,
            'onStateChange': onDjPlayerStateChange
        }
    });
}

function renderPlaylists() {
    playlistList.innerHTML = '';
    for (const pl in djData.playlists) {
        const li = document.createElement('li');
        li.textContent = pl;
        if (pl === activePlaylist) {
            li.classList.add('active');
        }
        li.onclick = () => {
            saveActivePlaylist(pl);
            djCurrentTrackIndex = 0;
            renderPlaylists();
            loadDjTrack();
        };
        playlistList.appendChild(li);
    }
    renderTracks();
}

function renderTracks() {
    trackList.innerHTML = '';
    const tracks = djData.playlists[activePlaylist] || [];
    
    djPlaylistTitle.textContent = activePlaylist || "No Playlist Selected";

    tracks.forEach((track, index) => {
        const li = document.createElement('li');
        if (index === djCurrentTrackIndex) {
            li.style.borderLeft = "3px solid #00b4d8";
            li.style.background = "rgba(255,255,255,0.1)";
        }
        
        li.innerHTML = `
            <div class="track-title">${track.title || "Track " + (index+1)}</div>
            <div class="track-meta">
                <span>${formatTime(track.start)} - ${track.end ? formatTime(track.end) : 'End'}</span>
            </div>
        `;
        
        li.onclick = () => {
            djCurrentTrackIndex = index;
            renderTracks();
            loadDjTrack();
            if (djPlayer && djPlayer.playVideo) djPlayer.playVideo();
        };

        trackList.appendChild(li);
    });
}

function onDjPlayerReady(event) {
    renderPlaylists();
    loadDjTrack();
}

function onDjPlayerStateChange(event) {
    if (event.data == YT.PlayerState.PLAYING) {
        isPlaying = true;
        updatePlayBtn();
        startCheckInterval();
    } else {
        isPlaying = false;
        updatePlayBtn();
        stopCheckInterval();
    }
    
    if (event.data == YT.PlayerState.ENDED) {
        playNextTrack();
    }
}

playBtn.addEventListener('click', () => {
    if (!djPlayer) return;
    if (isPlaying) djPlayer.pauseVideo();
    else djPlayer.playVideo();
});

document.getElementById('btn-prev').addEventListener('click', () => playPrevTrack());
document.getElementById('btn-next').addEventListener('click', () => playNextTrack());

function updatePlayBtn() {
    playBtn.textContent = isPlaying ? "⏸" : "▶️";
}

function loadDjTrack() {
    if (!djPlayer || !djPlayer.loadVideoById) return;
    const tracks = djData.playlists[activePlaylist];
    if (!tracks || tracks.length === 0) {
        djTrackTitle.textContent = "No tracks in this playlist.";
        return;
    }
    
    if (djCurrentTrackIndex >= tracks.length) djCurrentTrackIndex = 0;
    if (djCurrentTrackIndex < 0) djCurrentTrackIndex = tracks.length - 1;

    const track = tracks[djCurrentTrackIndex];
    djTrackTitle.textContent = track.title || `Playing Track ${djCurrentTrackIndex + 1}`;
    
    renderTracks(); 
    
    djPlayer.loadVideoById({
        videoId: track.videoId,
        startSeconds: track.start,
        endSeconds: track.end
    });
}

function playNextTrack() {
    const tracks = djData.playlists[activePlaylist] || [];
    djCurrentTrackIndex++;
    if (djCurrentTrackIndex >= tracks.length) djCurrentTrackIndex = 0;
    loadDjTrack();
}

function playPrevTrack() {
    const tracks = djData.playlists[activePlaylist] || [];
    djCurrentTrackIndex--;
    if (djCurrentTrackIndex < 0) djCurrentTrackIndex = tracks.length - 1;
    loadDjTrack();
}

function startCheckInterval() {
    stopCheckInterval();
    checkInterval = setInterval(() => {
        if (!djPlayer || !isPlaying) return;
        const tracks = djData.playlists[activePlaylist];
        if (!tracks) return;
        const track = tracks[djCurrentTrackIndex];
        if (!track || !track.end) return;

        const currentTime = djPlayer.getCurrentTime();
        if (currentTime >= track.end - 0.5) {
            playNextTrack();
        }
    }, 500);
}

function stopCheckInterval() {
    if (checkInterval) clearInterval(checkInterval);
}

// Init UI rendering before YT API triggers (fallback)
renderPlaylists();
