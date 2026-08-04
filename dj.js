// ─── MOTOR DJ DE DOBLE DECK (crossfade) ──────────────────────────────────────
// Dos reproductores de YouTube superpuestos: mientras uno suena, el otro
// precarga la siguiente pista. Al llegar al punto de salida se hace una
// rampa cruzada de volumen (curva equal-power) + fundido visual, sin
// silencio entre pistas.

let djCurrentTrackIndex = 0;
let isPlaying = false;
let checkInterval = null;
let fadeTimer = null;
let crossfading = false;
let playersReady = 0;
let consecutiveErrorSkips = 0;
let wakeLock = null;

const decks = [
    { player: null, wrap: null, cuedIndex: null, cuedVideoId: null },
    { player: null, wrap: null, cuedIndex: null, cuedVideoId: null }
];
let activeDeckIdx = 0;

const playlistList = document.getElementById('playlist-list');
const trackList = document.getElementById('track-list');
const djPlaylistTitle = document.getElementById('dj-playlist-title');
const djTrackTitle = document.getElementById('dj-track-title');
const playBtn = document.getElementById('btn-play-pause');
const upNextBadge = document.getElementById('up-next-badge');
const upNextTitleEl = document.getElementById('up-next-title');
const progressFill = document.getElementById('progress-fill');
const progressMarker = document.getElementById('progress-cueout-marker');
const progressCurrentEl = document.getElementById('progress-current');
const progressTotalEl = document.getElementById('progress-total');

// Initialize YouTube API — crea los dos decks
function onYouTubeIframeAPIReady() {
    decks[0].wrap = document.getElementById('deck-a-wrap');
    decks[1].wrap = document.getElementById('deck-b-wrap');

    const deckConfig = () => ({
        height: '100%',
        width: '100%',
        playerVars: { controls: 1, modestbranding: 1, rel: 0 },
        events: {
            'onReady': onDeckReady,
            'onStateChange': onDeckStateChange,
            'onError': onDeckError
        }
    });

    decks[0].player = new YT.Player('deck-a', deckConfig());
    decks[1].player = new YT.Player('deck-b', deckConfig());
}

function onDeckReady() {
    playersReady++;
    if (playersReady < 2) return;
    // Deck A visible al inicio
    decks[0].wrap.style.opacity = '1';
    decks[0].wrap.style.zIndex = '2';
    renderPlaylists();
    loadDjTrack();
}

function deckIndexOf(player) {
    return decks[0].player === player ? 0 : 1;
}

function onDeckStateChange(event) {
    // Ignorar eventos del deck inactivo (el que precarga o se está apagando)
    if (event.target !== decks[activeDeckIdx].player) return;

    if (event.data == YT.PlayerState.PLAYING) {
        isPlaying = true;
        consecutiveErrorSkips = 0;
        updatePlayBtn();
        startCheckInterval();
        requestWakeLock();
    } else {
        isPlaying = false;
        updatePlayBtn();
        stopCheckInterval();
        if (event.data == YT.PlayerState.PAUSED) releaseWakeLock();
    }

    if (event.data == YT.PlayerState.ENDED) {
        // Pista sin punto de salida que llegó al final del video:
        // cambio instantáneo al deck precargado (sin hueco de carga).
        crossfadeTo(djCurrentTrackIndex + 1, 0);
    }
}

// Un video no se pudo reproducir (borrado, privado, bloqueado por región...).
// Lo marcamos y saltamos automáticamente para no dejar la sesión colgada.
function onDeckError(event) {
    const deckIdx = deckIndexOf(event.target);
    const deck = decks[deckIdx];

    if (deckIdx === activeDeckIdx) {
        markTrackUnavailable(djCurrentTrackIndex);
        const tracks = djData.playlists[activePlaylist] || [];
        consecutiveErrorSkips++;
        if (consecutiveErrorSkips >= Math.max(tracks.length, 1)) {
            consecutiveErrorSkips = 0;
            djTrackTitle.textContent = "Ninguna pista de esta lista se pudo reproducir.";
            return;
        }
        setTimeout(() => hardLoadTrack(djCurrentTrackIndex + 1), 300);
    } else {
        // Falló la precarga silenciosa: marcar y reintentar con la siguiente
        if (deck.cuedIndex != null) markTrackUnavailable(deck.cuedIndex);
        deck.cuedIndex = null;
        deck.cuedVideoId = null;
        setTimeout(preloadNext, 300);
    }
}

function markTrackUnavailable(index) {
    const tracks = djData.playlists[activePlaylist] || [];
    const track = tracks[index];
    if (!track) return;
    unavailableVideoIds.add(track.videoId);
    renderTracks();
}

// ─── WAKE LOCK (mantener la TV encendida durante el set) ────────────────────

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator && !wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
    } catch (e) {
        // No soportado o denegado (ej. pestaña no visible) — no es crítico
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isPlaying) requestWakeLock();
});

// ─── MITIGACIÓN DE ANUNCIOS ──────────────────────────────────────────────────
// La API de YouTube no expone si se está reproduciendo un anuncio. Como
// mitigación práctica: si pedimos arrancar en startSeconds > 3s y poco
// después el reproductor sigue cerca de 0, lo más probable es que un
// anuncio esté ocupando el inicio — forzamos el salto al punto real.
function scheduleAdGuard(deckObj, expectedStart) {
    if (!expectedStart || expectedStart < 3) return;
    const player = deckObj.player;
    setTimeout(() => {
        try {
            const t = player.getCurrentTime();
            if (t < expectedStart - 3) {
                player.seekTo(expectedStart, true);
            }
        } catch (e) { /* deck no disponible en ese momento */ }
    }, 1800);
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

        const title = document.createElement('div');
        title.className = 'track-title';
        title.textContent = track.title || "Pista " + (index + 1);

        const meta = document.createElement('div');
        meta.className = 'track-meta';
        const range = document.createElement('span');
        range.textContent = `${formatTime(track.start)} - ${track.end ? formatTime(track.end) : 'Fin'}`;
        meta.appendChild(range);

        li.appendChild(title);
        li.appendChild(meta);

        if (unavailableVideoIds.has(track.videoId)) {
            li.classList.add('track-unavailable');
            const warn = document.createElement('span');
            warn.className = 'track-unavailable-tag';
            warn.textContent = '⚠️ No disponible';
            meta.appendChild(warn);
        }

        li.onclick = () => {
            goToTrack(index, true);
        };

        trackList.appendChild(li);
    });
}

playBtn.addEventListener('click', () => {
    const deck = decks[activeDeckIdx];
    if (!deck.player) return;
    if (crossfading) finalizeFade();
    if (isPlaying) deck.player.pauseVideo();
    else deck.player.playVideo();
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

function updateNowPlaying() {
    const tracks = djData.playlists[activePlaylist] || [];
    const track = tracks[djCurrentTrackIndex];
    if (!track) {
        djTrackTitle.textContent = "No hay pistas en esta lista.";
        return;
    }
    djTrackTitle.textContent = track.title || `Reproduciendo Pista ${djCurrentTrackIndex + 1}`;
}

// ─── INDICADOR "REPRODUCIENDO AHORA" (se muestra brevemente en cada mezcla) ──

function showUpNextBadge(title) {
    if (!upNextBadge || !upNextTitleEl) return;
    upNextTitleEl.textContent = title;
    upNextBadge.style.display = 'flex';
    // Forzar reflow para que la transición de opacidad se dispare siempre
    void upNextBadge.offsetWidth;
    upNextBadge.classList.add('visible');
    clearTimeout(showUpNextBadge._t);
    showUpNextBadge._t = setTimeout(() => {
        upNextBadge.classList.remove('visible');
        setTimeout(() => { upNextBadge.style.display = 'none'; }, 400);
    }, 4000);
}

// ─── BARRA DE PROGRESO CON MARCADOR DEL PUNTO DE MEZCLA ─────────────────────

function updateProgressUI(player, track, currentTime) {
    if (!progressFill) return;
    let duration = player.getDuration ? player.getDuration() : 0;
    if (!duration || isNaN(duration)) duration = track.end || currentTime || 1;

    const pct = Math.max(0, Math.min(1, currentTime / duration)) * 100;
    progressFill.style.width = pct + '%';

    if (progressMarker) {
        if (track.end != null && duration > 0) {
            const markerPct = Math.max(0, Math.min(1, track.end / duration)) * 100;
            progressMarker.style.left = markerPct + '%';
            progressMarker.style.display = 'block';
        } else {
            progressMarker.style.display = 'none';
        }
    }

    if (progressCurrentEl) progressCurrentEl.textContent = formatTime(currentTime);
    if (progressTotalEl) progressTotalEl.textContent = formatTime(duration);
}

function resetProgressUI() {
    if (progressFill) progressFill.style.width = '0%';
    if (progressMarker) progressMarker.style.display = 'none';
    if (progressCurrentEl) progressCurrentEl.textContent = '0:00';
    if (progressTotalEl) progressTotalEl.textContent = '0:00';
}

// Duración real del fade: nunca más de la mitad del segmento de la pista
function effectiveFade(track) {
    let d = crossfadeDuration || 0;
    if (track && track.end != null) {
        const span = track.end - (track.start || 0);
        d = Math.min(d, Math.max(span / 2, 0));
    }
    return d;
}

// Carga dura en el deck activo (sin fundido): inicio, cambio de lista, o con
// el reproductor en pausa.
function hardLoadTrack(index) {
    const tracks = djData.playlists[activePlaylist] || [];
    if (tracks.length === 0) {
        djTrackTitle.textContent = "No hay pistas en esta lista.";
        return;
    }
    if (crossfading) finalizeFade();

    const len = tracks.length;
    djCurrentTrackIndex = ((index % len) + len) % len;
    const track = tracks[djCurrentTrackIndex];

    updateNowPlaying();
    renderTracks();
    resetProgressUI();

    const deck = decks[activeDeckIdx];
    if (!deck.player || !deck.player.loadVideoById) return;
    try {
        deck.player.setVolume(100);
        deck.player.loadVideoById({
            videoId: track.videoId,
            startSeconds: track.start,
            endSeconds: track.end
        });
        scheduleAdGuard(deck, track.start);
    } catch (e) { /* player aún no listo */ }
    preloadNext();
}

function loadDjTrack() {
    hardLoadTrack(djCurrentTrackIndex);
}

// Deja la siguiente pista lista (cueVideoById) en el deck inactivo, para que
// el crossfade arranque sin buffering.
function preloadNext() {
    if (crossfading || playersReady < 2) return;
    const tracks = djData.playlists[activePlaylist] || [];
    if (tracks.length === 0) return;
    const nextIndex = (djCurrentTrackIndex + 1) % tracks.length;
    const track = tracks[nextIndex];
    const idle = decks[1 - activeDeckIdx];
    if (!idle.player || !idle.player.cueVideoById) return;
    if (idle.cuedIndex === nextIndex && idle.cuedVideoId === track.videoId) return;
    try {
        idle.player.cueVideoById({
            videoId: track.videoId,
            startSeconds: track.start,
            endSeconds: track.end
        });
        idle.cuedIndex = nextIndex;
        idle.cuedVideoId = track.videoId;
    } catch (e) {
        idle.cuedIndex = null;
        idle.cuedVideoId = null;
    }
}

// Mezcla hacia la pista `index`: el deck inactivo arranca a volumen 0 y sube
// mientras el activo baja, con fundido visual de opacidad en paralelo.
// duration 0 = cambio instantáneo (aprovechando la precarga).
function crossfadeTo(index, duration) {
    const tracks = djData.playlists[activePlaylist] || [];
    if (tracks.length === 0 || playersReady < 2) return;
    if (crossfading) finalizeFade();

    const len = tracks.length;
    index = ((index % len) + len) % len;
    const track = tracks[index];
    const from = decks[activeDeckIdx];
    const to = decks[1 - activeDeckIdx];

    try {
        to.player.unMute();
        to.player.setVolume(duration > 0 ? 0 : 100);
        if (to.cuedIndex === index && to.cuedVideoId === track.videoId) {
            to.player.playVideo();
        } else {
            to.player.loadVideoById({
                videoId: track.videoId,
                startSeconds: track.start,
                endSeconds: track.end
            });
        }
        scheduleAdGuard(to, track.start);
    } catch (e) {
        // Si el deck entrante falla, caemos a carga dura en el activo
        hardLoadTrack(index);
        return;
    }

    // Swap lógico inmediato: la pista entrante pasa a ser "la actual"
    activeDeckIdx = 1 - activeDeckIdx;
    djCurrentTrackIndex = index;
    to.cuedIndex = null;
    to.cuedVideoId = null;
    updateNowPlaying();
    renderTracks();
    showUpNextBadge(track.title || `Pista ${index + 1}`);

    // Fundido visual (opacity es barato en FireTV: lo composita la GPU)
    const toWrap = to.wrap;
    const fromWrap = from.wrap;
    toWrap.style.zIndex = '2';
    fromWrap.style.zIndex = '1';
    if (duration > 0) {
        void toWrap.offsetWidth; // asegurar que opacity:0 esté aplicado antes de transicionar
        toWrap.style.transition = `opacity ${duration}s linear`;
    } else {
        toWrap.style.transition = 'none';
    }
    toWrap.style.opacity = '1';

    crossfading = true;
    if (duration <= 0) {
        finalizeFade();
        return;
    }

    // Rampa cruzada de volumen con curva equal-power (cos/sin en cuarto de
    // círculo): mantiene el volumen total percibido constante durante la
    // mezcla, sin el "hueco" que produce una rampa lineal a la mitad.
    const t0 = Date.now();
    if (fadeTimer) clearInterval(fadeTimer);
    fadeTimer = setInterval(() => {
        const p = (Date.now() - t0) / (duration * 1000);
        if (p >= 1) {
            finalizeFade();
            return;
        }
        const angle = p * (Math.PI / 2);
        try {
            from.player.setVolume(Math.round(100 * Math.cos(angle)));
            to.player.setVolume(Math.round(100 * Math.sin(angle)));
        } catch (e) { /* ignorar si un deck no responde */ }
    }, 100);
}

function finalizeFade() {
    if (fadeTimer) {
        clearInterval(fadeTimer);
        fadeTimer = null;
    }
    if (!crossfading) return;
    crossfading = false;

    const incoming = decks[activeDeckIdx];
    const outgoing = decks[1 - activeDeckIdx];

    try {
        outgoing.player.stopVideo();
        outgoing.player.setVolume(100);
    } catch (e) {}
    try {
        incoming.player.setVolume(100);
    } catch (e) {}

    outgoing.wrap.style.transition = 'none';
    outgoing.wrap.style.opacity = '0';
    incoming.wrap.style.transition = 'none';
    incoming.wrap.style.opacity = '1';
    outgoing.cuedIndex = null;
    outgoing.cuedVideoId = null;

    preloadNext();
}

// Navegación manual (botones y clic en pista): mezcla rápida si está sonando,
// carga directa si está en pausa.
function goToTrack(index, manual) {
    if (isPlaying || crossfading) {
        const dur = manual ? Math.min(crossfadeDuration || 0, 1.5) : (crossfadeDuration || 0);
        crossfadeTo(index, dur);
    } else {
        hardLoadTrack(index);
    }
}

function playNextTrack() {
    goToTrack(djCurrentTrackIndex + 1, true);
}

function playPrevTrack() {
    goToTrack(djCurrentTrackIndex - 1, true);
}

function startCheckInterval() {
    stopCheckInterval();
    checkInterval = setInterval(() => {
        if (!isPlaying) return;
        const deck = decks[activeDeckIdx];
        if (!deck.player || !deck.player.getCurrentTime) return;
        const tracks = djData.playlists[activePlaylist];
        if (!tracks) return;
        const track = tracks[djCurrentTrackIndex];
        if (!track) return;

        const currentTime = deck.player.getCurrentTime();
        updateProgressUI(deck.player, track, currentTime);

        if (crossfading) return; // ya hay una mezcla en curso, no disparar otra
        if (!track.end) return;

        const fade = effectiveFade(track);
        // Arrancar la mezcla `fade` segundos antes del punto de salida
        if (currentTime >= track.end - Math.max(fade, 0.5)) {
            crossfadeTo(djCurrentTrackIndex + 1, fade);
        }
    }, 250);
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
