let studioPlayer = null;
let studioVideoId = "";
let studioCueIn = 0;
let studioCueOut = null;

const playlistList = document.getElementById('playlist-list');
const trackList = document.getElementById('track-list');
const studioPlaylistSelect = document.getElementById('studio-playlist-select');

// Initialize YouTube API
function onYouTubeIframeAPIReady() {
    studioPlayer = new YT.Player('studio-player', {
        height: '100%',
        width: '100%',
        playerVars: { controls: 1, modestbranding: 1, rel: 0 },
        events: {
            'onReady': () => { console.log('Studio Player Ready'); }
        }
    });
}

// =======================
// CUSTOM MODAL LOGIC
// =======================
function customPrompt(title, desc, defaultVal, callback) {
    const modal = document.getElementById('custom-modal');
    const mTitle = document.getElementById('modal-title');
    const mDesc = document.getElementById('modal-desc');
    const mInput = document.getElementById('modal-input');
    const btnCancel = document.getElementById('modal-cancel');
    const btnConfirm = document.getElementById('modal-confirm');

    mTitle.textContent = title;
    mDesc.textContent = desc;
    mInput.style.display = 'block';
    mInput.value = defaultVal || '';
    modal.classList.add('active');
    
    setTimeout(() => mInput.focus(), 50);

    const newCancel = btnCancel.cloneNode(true);
    const newConfirm = btnConfirm.cloneNode(true);
    btnCancel.replaceWith(newCancel);
    btnConfirm.replaceWith(newConfirm);

    newCancel.onclick = () => {
        modal.classList.remove('active');
        callback(null);
    };

    newConfirm.onclick = () => {
        modal.classList.remove('active');
        callback(mInput.value);
    };
    
    mInput.onkeydown = (e) => {
        if(e.key === 'Enter') newConfirm.click();
    };
}

function customConfirm(title, desc, callback) {
    const modal = document.getElementById('custom-modal');
    const mTitle = document.getElementById('modal-title');
    const mDesc = document.getElementById('modal-desc');
    const mInput = document.getElementById('modal-input');
    const btnCancel = document.getElementById('modal-cancel');
    const btnConfirm = document.getElementById('modal-confirm');

    mTitle.textContent = title;
    mDesc.textContent = desc;
    mInput.style.display = 'none';
    modal.classList.add('active');

    const newCancel = btnCancel.cloneNode(true);
    const newConfirm = btnConfirm.cloneNode(true);
    btnCancel.replaceWith(newCancel);
    btnConfirm.replaceWith(newConfirm);

    newCancel.onclick = () => {
        modal.classList.remove('active');
        callback(false);
    };

    newConfirm.onclick = () => {
        modal.classList.remove('active');
        callback(true);
    };
}


// =======================
// PLAYLIST MANAGEMENT
// =======================

function deletePlaylist(name, e) {
    e.stopPropagation();
    e.preventDefault();
    customConfirm("Eliminar Playlist", `¿Estás seguro que quieres eliminar la lista "${name}"?`, (agreed) => {
        if(agreed) {
            delete djData.playlists[name];
            activePlaylist = Object.keys(djData.playlists)[0] || "";
            saveActivePlaylist(activePlaylist);
            saveData();
            renderPlaylists();
        }
    });
}

function renderPlaylists() {
    playlistList.innerHTML = '';
    studioPlaylistSelect.innerHTML = '';
    
    for (const pl in djData.playlists) {
        // Sidebar list
        const li = document.createElement('li');
        li.textContent = pl;
        if (pl === activePlaylist) {
            li.classList.add('active');
            
            // Rename Button
            let renameBtn = document.createElement('button');
            renameBtn.textContent = '✏️';
            renameBtn.className = 'delete-playlist-btn';
            renameBtn.style.marginRight = '5px';
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                customPrompt("Renombrar Playlist", "Escribe el nuevo nombre:", pl, (newName) => {
                    if (newName && newName !== pl && !djData.playlists[newName]) {
                        djData.playlists[newName] = djData.playlists[pl];
                        delete djData.playlists[pl];
                        saveActivePlaylist(newName);
                        saveData();
                        renderPlaylists();
                    }
                });
            };
            li.appendChild(renameBtn);

            // Delete Button
            let delBtn = document.createElement('button');
            delBtn.textContent = '🗑️';
            delBtn.className = 'delete-playlist-btn';
            delBtn.onclick = (e) => deletePlaylist(pl, e);
            li.appendChild(delBtn);
        }
        li.onclick = () => {
            saveActivePlaylist(pl);
            renderPlaylists();
        };
        playlistList.appendChild(li);

        // Select dropdown
        const opt = document.createElement('option');
        opt.value = pl;
        opt.textContent = pl;
        if (pl === activePlaylist) opt.selected = true;
        studioPlaylistSelect.appendChild(opt);
    }
    renderTracks();
}

function renderTracks() {
    trackList.innerHTML = '';
    const tracks = djData.playlists[activePlaylist] || [];

    tracks.forEach((track, index) => {
        const li = document.createElement('li');
        
        li.innerHTML = `
            <div class="track-title">${track.title || "Track " + (index+1)}</div>
            <div class="track-meta">
                <span>${formatTime(track.start)} - ${track.end ? formatTime(track.end) : 'End'}</span>
                <button class="track-delete" title="Remove track">Remove</button>
            </div>
        `;
        
        li.querySelector('.track-delete').onclick = (e) => {
            e.stopPropagation();
            djData.playlists[activePlaylist].splice(index, 1);
            saveData();
            renderTracks();
        };

        // Clicking a track in studio could theoretically load it back into the studio player
        li.onclick = () => {
            if (studioPlayer && studioPlayer.loadVideoById) {
                studioVideoId = track.videoId;
                studioCueIn = track.start;
                studioCueOut = track.end;
                updateStudioLabels();
                document.getElementById('studio-url-input').value = `https://youtu.be/${studioVideoId}`;
                studioPlayer.loadVideoById({
                    videoId: track.videoId,
                    startSeconds: track.start
                });
            }
        };

        trackList.appendChild(li);
    });
}

document.getElementById('btn-add-playlist').addEventListener('click', () => {
    customPrompt("Nueva Playlist", "Ingresa el nombre:", "", (name) => {
        if (name && !djData.playlists[name]) {
            djData.playlists[name] = [];
            saveActivePlaylist(name);
            saveData();
            renderPlaylists();
        }
    });
});

// =======================
// URL AND CUE PARSING
// =======================

function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

document.getElementById('btn-load-url').addEventListener('click', () => {
    const url = document.getElementById('studio-url-input').value;
    const vid = extractVideoId(url);
    if (vid) {
        studioVideoId = vid;
        studioCueIn = 0;
        studioCueOut = null;
        updateStudioLabels();
        if (studioPlayer && studioPlayer.loadVideoById) {
            studioPlayer.loadVideoById(studioVideoId);
        }
    } else {
        customConfirm("Error", "URL de YouTube no válida.", () => {});
    }
});

document.getElementById('btn-cue-in').addEventListener('click', () => {
    if (!studioPlayer) return;
    studioCueIn = studioPlayer.getCurrentTime();
    updateStudioLabels();
});

document.getElementById('btn-cue-out').addEventListener('click', () => {
    if (!studioPlayer) return;
    studioCueOut = studioPlayer.getCurrentTime();
    updateStudioLabels();
});

function updateStudioLabels() {
    document.getElementById('label-cue-in').textContent = formatTime(studioCueIn);
    document.getElementById('label-cue-out').textContent = studioCueOut ? formatTime(studioCueOut) : "End";
}

document.getElementById('btn-save-track').addEventListener('click', async () => {
    if (!studioVideoId) {
        customConfirm("Atención", "Carga un video primero.", () => {});
        return;
    }
    const plName = studioPlaylistSelect.value;
    if (!plName) {
        customConfirm("Atención", "Crea una playlist primero.", () => {});
        return;
    }

    let finalTitle = "New Track";
    try {
        const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${studioVideoId}`);
        const data = await response.json();
        if (data && data.title) {
            finalTitle = data.title;
        }
    } catch (e) {
        console.warn("Could not fetch video title automatically.");
    }

    customPrompt("Guardar Canción", "Confirma o edita el nombre (Auto-generado):", finalTitle, (titleStr) => {
        if (titleStr === null) return; 

        djData.playlists[plName].push({
            videoId: studioVideoId,
            title: titleStr || finalTitle,
            start: studioCueIn,
            end: studioCueOut
        });
        
        saveActivePlaylist(plName);
        saveData();
        renderPlaylists();
        
        document.getElementById('studio-url-input').value = '';
        studioVideoId = "";
        studioCueIn = 0; 
        studioCueOut = null;
        updateStudioLabels();
    });
});

// =======================
// IMPORT / EXPORT
// =======================

document.getElementById('btn-export').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(djData, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "dj-playlist-backup.json");
    dlAnchorElem.click();
});

document.getElementById('btn-import-url').addEventListener('click', () => {
    customPrompt("Importar desde URL", "Pega el enlace directo a tu archivo JSON (ej. GitHub Gist RAW):", "", async (url) => {
        if (!url) return;
        try {
            const resp = await fetch(url);
            const imported = await resp.json();
            if (imported && imported.playlists) {
                djData = imported;
                saveData();
                saveActivePlaylist(Object.keys(djData.playlists)[0] || "");
                renderPlaylists();
                customConfirm("Éxito", "Playlists importadas correctamente desde la web.", () => {});
            } else {
                throw new Error("Invalid structure");
            }
        } catch (e) {
            customConfirm("Error", "No se pudo leer la URL. Asegúrate de que apunte a un texto crudo (RAW JSON).", () => {});
        }
    });
});

document.getElementById('import-json').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported && imported.playlists) {
                djData = imported;
                saveData();
                saveActivePlaylist(Object.keys(djData.playlists)[0] || "");
                renderPlaylists();
                customConfirm("Éxito", "Playlists importadas correctamente.", () => {});
            }
        } catch (err) {
            customConfirm("Error", "Error al analizar el archivo JSON.", () => {});
        }
    };
    reader.readAsText(file);
});

// Init
renderPlaylists();
