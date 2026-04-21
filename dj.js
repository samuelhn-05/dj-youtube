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
    
    djPlaylistTitle.textContent = activePlaylist || "Ninguna lista seleccionada";

    tracks.forEach((track, index) => {
        const li = document.createElement('li');
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

const sidebar = document.getElementById('sidebar');

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
    // Foco en el primer item de playlist
    setTimeout(() => {
        const first = playlistList.querySelector('li');
        if (first) first.focus();
    }, 50);
}

function closeSidebar() {
    sidebar.classList.remove('open');
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

    // Si el sidebar está abierto, manejar navegación interna
    if (isSidebarOpen()) {
        const active = document.activeElement;
        const inPlaylist = playlistList.contains(active);
        const inTrack = trackList.contains(active);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (inPlaylist) {
                // Si ya está en el último item de playlist, saltar a pistas
                const plItems = Array.from(playlistList.querySelectorAll('li'));
                const idx = plItems.indexOf(active);
                if (idx === plItems.length - 1) {
                    const first = trackList.querySelector('li');
                    if (first) first.focus();
                } else {
                    navigateList(playlistList, 'down');
                }
            } else if (inTrack) {
                navigateList(trackList, 'down');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (inTrack) {
                // Si está en el primer item de pistas, subir a playlists
                const trItems = Array.from(trackList.querySelectorAll('li'));
                const idx = trItems.indexOf(active);
                if (idx === 0) {
                    const last = playlistList.querySelectorAll('li');
                    if (last.length) last[last.length - 1].focus();
                } else {
                    navigateList(trackList, 'up');
                }
            } else if (inPlaylist) {
                navigateList(playlistList, 'up');
            }
        } else if (e.key === 'ArrowRight') {
            // Derecha desde sidebar → cerrar y volver a controles
            e.preventDefault();
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

// Hacer que los items del sidebar sean navegables con teclado
// Usamos delegación en el ul para evitar listeners duplicados al re-renderizar
function makeListFocusable(ul) {
    // Asignar tabindex a nuevos items via MutationObserver
    const observer = new MutationObserver(() => {
        ul.querySelectorAll('li:not([tabindex])').forEach(li => {
            li.setAttribute('tabindex', '0');
        });
    });
    observer.observe(ul, { childList: true, subtree: true });

    // Aplicar a items ya existentes
    ul.querySelectorAll('li').forEach(li => li.setAttribute('tabindex', '0'));
}

makeListFocusable(playlistList);
makeListFocusable(trackList);

// Inicializar foco tras cargar el player
setTimeout(initFocus, 1500);
