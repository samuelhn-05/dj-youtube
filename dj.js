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
        li.setAttribute('tabindex', '0');
        if (pl === activePlaylist) {
            li.classList.add('active');
        }
        li.onclick = () => {
            saveActivePlaylist(pl);
            djCurrentTrackIndex = 0;
            renderPlaylists();
            loadDjTrack();
            showTrackPanel();
        };
        playlistList.appendChild(li);
    }
    renderTracks();
}

function renderTracks() {
    trackList.innerHTML = '';
    const tracks = djData.playlists[activePlaylist] || [];
    
    djPlaylistTitle.textContent = activePlaylist || "Ninguna lista seleccionada";

    tracks.forEach((track, index) => {
        const li = document.createElement('li');
        li.setAttribute('tabindex', '0');
        if (index === djCurrentTrackIndex) {
            li.style.borderLeft = "3px solid #00b4d8";
            li.style.background = "rgba(255,255,255,0.1)";
        }

        li.innerHTML = `
            <div class="track-title">${track.title || "Pista " + (index+1)}</div>
            <div class="track-meta">
                <span>${formatTime(track.start)} - ${track.end ? formatTime(track.end) : 'Fin'}</span>
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

const btnFullscreen = document.getElementById('btn-fullscreen');
if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
        const playerWrapper = document.querySelector('.player-wrapper');
        if (!document.fullscreenElement) {
            if (playerWrapper.requestFullscreen) {
                playerWrapper.requestFullscreen();
            } else if (playerWrapper.webkitRequestFullscreen) { /* Safari */
                playerWrapper.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            }
        }
    });
}

function updatePlayBtn() {
    const playSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const pauseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    playBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
}

function loadDjTrack() {
    if (!djPlayer || !djPlayer.loadVideoById) return;
    const tracks = djData.playlists[activePlaylist];
    if (!tracks || tracks.length === 0) {
        djTrackTitle.textContent = "No hay pistas en esta lista.";
        return;
    }
    
    if (djCurrentTrackIndex >= tracks.length) djCurrentTrackIndex = 0;
    if (djCurrentTrackIndex < 0) djCurrentTrackIndex = tracks.length - 1;

    const track = tracks[djCurrentTrackIndex];
    djTrackTitle.textContent = track.title || `Reproduciendo Pista ${djCurrentTrackIndex + 1}`;
    
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

// ─── FireTV D-PAD NAVIGATION ─────────────────────────────────────────────────

const sidebar       = document.getElementById('sidebar');
const panelPlaylists = document.getElementById('panel-playlists');
const panelTracks    = document.getElementById('panel-tracks');
const panelTracksTitle = document.getElementById('panel-tracks-title');
const btnBackToPlaylists = document.getElementById('btn-back-to-playlists');

function showPlaylistPanel() {
    panelPlaylists.style.display = 'flex';
    panelTracks.style.display    = 'none';
    setTimeout(() => {
        const active = playlistList.querySelector('li.active') || playlistList.querySelector('li');
        if (active) active.focus();
    }, 50);
}

function showTrackPanel() {
    panelPlaylists.style.display = 'none';
    panelTracks.style.display    = 'flex';
    if (panelTracksTitle) panelTracksTitle.textContent = activePlaylist;
    setTimeout(() => {
        const first = trackList.querySelector('li');
        if (first) first.focus();
    }, 50);
}

if (btnBackToPlaylists) {
    btnBackToPlaylists.addEventListener('click', showPlaylistPanel);
    btnBackToPlaylists.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); showPlaylistPanel(); }
    });
}

// Orden de foco en los controles principales
const mainControls = [
    document.getElementById('menu-toggle') || document.querySelector('.dj-controls .control-btn'),
    document.getElementById('btn-prev'),
    document.getElementById('btn-play-pause'),
    document.getElementById('btn-next'),
    document.getElementById('btn-fullscreen')
].filter(Boolean);

let focusedControlIndex = 2; // empieza en play/pause

function focusControl(index) {
    focusedControlIndex = Math.max(0, Math.min(mainControls.length - 1, index));
    mainControls[focusedControlIndex].focus();
}

// Foco inicial cuando el player esté listo
function initFocus() {
    setTimeout(() => focusControl(2), 500);
}

function isSidebarOpen() {
    return sidebar.classList.contains('open');
}

function openSidebar() {
    sidebar.classList.add('open');
    document.body.classList.add('sidebar-open');
    showPlaylistPanel();
}

function closeSidebar() {
    sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');
    setTimeout(() => focusControl(focusedControlIndex), 50);
}

// Navegación dentro de una lista del sidebar con flechas
function navigateList(listEl, direction) {
    const items = Array.from(listEl.querySelectorAll('li'));
    const current = document.activeElement;
    const idx = items.indexOf(current);
    let next;
    if (direction === 'down') next = items[Math.min(idx + 1, items.length - 1)];
    else next = items[Math.max(idx - 1, 0)];
    if (next) next.focus();
}

document.addEventListener('keydown', (e) => {
    // Botón Back del FireTV = GoBack o tecla BrowserBack
    if (e.key === 'GoBack' || e.key === 'BrowserBack') {
        if (isSidebarOpen()) {
            e.preventDefault();
            closeSidebar();
        }
        return;
    }

    if (e.key === 'Escape') {
        if (isSidebarOpen()) {
            e.preventDefault();
            closeSidebar();
        }
        return;
    }

    // Si el sidebar está abierto, bloquear scroll de página en TODAS las flechas
    if (isSidebarOpen()) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }

        const active = document.activeElement;
        const inPlaylist = playlistList.contains(active);
        const inTrack = trackList.contains(active);

        const tracksVisible = panelTracks.style.display !== 'none';

        if (e.key === 'ArrowDown') {
            if (inPlaylist) navigateList(playlistList, 'down');
            else if (inTrack) navigateList(trackList, 'down');
            else if (active === btnBackToPlaylists) {
                const first = trackList.querySelector('li');
                if (first) first.focus();
            }
        } else if (e.key === 'ArrowUp') {
            if (inTrack) {
                const trItems = Array.from(trackList.querySelectorAll('li'));
                if (trItems.indexOf(active) === 0) {
                    // Primer pista con ↑ → foco en botón volver
                    if (btnBackToPlaylists) btnBackToPlaylists.focus();
                } else {
                    navigateList(trackList, 'up');
                }
            } else if (inPlaylist) {
                navigateList(playlistList, 'up');
            }
        } else if (e.key === 'ArrowLeft') {
            // Izquierda en panel de pistas → volver a listas
            if (tracksVisible) showPlaylistPanel();
        } else if (e.key === 'ArrowRight') {
            // Derecha → cerrar sidebar y volver a controles
            closeSidebar();
        }
        return;
    }

    // Sidebar cerrado: navegar entre controles
    if (e.key === 'ArrowRight') {
        e.preventDefault();
        focusControl(focusedControlIndex + 1);
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (focusedControlIndex === 0) {
            // Izquierda desde el primer botón (menú) → abrir sidebar
            openSidebar();
        } else {
            focusControl(focusedControlIndex - 1);
        }
    } else if (e.key === 'Enter') {
        // Enter activa el botón enfocado
        const active = document.activeElement;
        if (active && mainControls.includes(active)) {
            active.click();
        }
    }
});

// Rastrear qué control tiene foco cuando el usuario hace clic o tab
mainControls.forEach((btn, i) => {
    btn.addEventListener('focus', () => { focusedControlIndex = i; });
});

// Delegación de Enter en los ul del sidebar (evita listeners duplicados al re-renderizar)
[playlistList, trackList].forEach(ul => {
    ul.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'LI') {
            e.preventDefault();
            e.target.click();
        }
    });
});

// Inicializar foco tras cargar el player
setTimeout(initFocus, 1500);
