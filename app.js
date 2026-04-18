// =============================================
// MEG MUSIC — APP.JS
// Firebase: user data, likes, playlist
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyCxjsQEqBqfDer_k9xD8iqepoqsxPkG5nQ",
  authDomain: "meg-music.firebaseapp.com",
  projectId: "meg-music",
  storageBucket: "meg-music.firebasestorage.app",
  messagingSenderId: "730092861403",
  appId: "1:730092861403:web:0ff7ccafe24f6e918559fe",
  measurementId: "G-PYL10BT9DY"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// =============================================
// API — pakai proxy Vercel (/api/) untuk hindari CORS
// =============================================
const API_SEARCH   = q   => `/api/search?q=${encodeURIComponent(q)}`;
const API_DOWNLOAD = url => `/api/download?url=${encodeURIComponent(url)}`;

// =============================================
// STATE
// =============================================
let userId    = null;   // unique device ID
let userName  = null;
let tracks    = [];     // current search results
let currentIdx = -1;
let isLoading  = false;
let isPlaying  = false;
let currentTab = 'search';
let likedSongs  = [];   // array of track objects
let playlist    = [];   // array of track objects

// =============================================
// ELEMENTS
// =============================================
const nameModal    = document.getElementById('nameModal');
const nameInput    = document.getElementById('nameInput');
const nameSubmit   = document.getElementById('nameSubmit');
const appWrapper   = document.getElementById('appWrapper');
const searchInput  = document.getElementById('searchInput');
const searchBtn    = document.getElementById('searchBtn');
const mainContent  = document.getElementById('mainContent');
const searchSection = document.getElementById('searchSection');
const player       = document.getElementById('player');
const playerThumb  = document.getElementById('playerThumb');
const playerTitle  = document.getElementById('playerTitle');
const playerChannel= document.getElementById('playerChannel');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn      = document.getElementById('prevBtn');
const nextBtn      = document.getElementById('nextBtn');
const progressFill = document.getElementById('progressFill');
const progressTrack= document.getElementById('progressTrack');
const playerTime   = document.getElementById('playerTime');
const audioEl      = document.getElementById('audioEl');
const statusTag    = document.getElementById('statusTag');
const toast        = document.getElementById('toast');
const themeBtn     = document.getElementById('themeBtn');
const userBadge    = document.getElementById('userBadge');
const likeBtn      = document.getElementById('likeBtn');
const tabSearch    = document.getElementById('tabSearch');
const tabLikes     = document.getElementById('tabLikes');
const tabPlaylist  = document.getElementById('tabPlaylist');

// =============================================
// UTILS
// =============================================
function setStatus(s) { statusTag.textContent = s; }

function showToast(msg, dur = 2500) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), dur);
}

function fmtTime(s) {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function fallbackThumb() {
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'><rect width='16' height='9' fill='%23222'/></svg>`;
}

// Generate unique device ID
function getDeviceId() {
  let id = localStorage.getItem('meg-device-id');
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    localStorage.setItem('meg-device-id', id);
  }
  return id;
}

// =============================================
// THEME
// =============================================
let theme = localStorage.getItem('meg-theme') || 'dark';
document.documentElement.setAttribute('data-theme', theme);
themeBtn.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('meg-theme', theme);
});

// =============================================
// FIREBASE: USER DATA
// =============================================
async function loadUserData() {
  try {
    const ref  = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      userName  = data.name;
      likedSongs = data.likes    || [];
      playlist   = data.playlist || [];
    }
  } catch (e) {
    console.error('Load user error:', e);
  }
}

async function saveUserName(name) {
  try {
    const ref = doc(db, 'users', userId);
    await setDoc(ref, { name, likes: [], playlist: [] }, { merge: true });
  } catch (e) {
    console.error('Save name error:', e);
  }
}

async function toggleLikeFirebase(track) {
  const ref = doc(db, 'users', userId);
  const isLiked = likedSongs.some(t => t.link === track.link);
  try {
    if (isLiked) {
      // Remove — Firestore arrayRemove matches exact object, so filter locally
      likedSongs = likedSongs.filter(t => t.link !== track.link);
      await setDoc(ref, { likes: likedSongs }, { merge: true });
    } else {
      likedSongs.push(track);
      await setDoc(ref, { likes: likedSongs }, { merge: true });
    }
  } catch (e) {
    console.error('Like error:', e);
  }
}

async function addToPlaylistFirebase(track) {
  const exists = playlist.some(t => t.link === track.link);
  if (exists) { showToast('SUDAH ADA DI PLAYLIST'); return; }
  try {
    playlist.push(track);
    const ref = doc(db, 'users', userId);
    await setDoc(ref, { playlist }, { merge: true });
    showToast('DITAMBAHKAN KE PLAYLIST ✓');
  } catch (e) {
    console.error('Playlist add error:', e);
  }
}

async function removeFromPlaylistFirebase(link) {
  try {
    playlist = playlist.filter(t => t.link !== link);
    const ref = doc(db, 'users', userId);
    await setDoc(ref, { playlist }, { merge: true });
  } catch (e) {
    console.error('Playlist remove error:', e);
  }
}

// =============================================
// INIT: NAME MODAL
// =============================================
async function init() {
  userId = getDeviceId();
  await loadUserData();

  if (userName) {
    // Already registered
    enterApp();
  } else {
    // Show modal
    nameModal.style.display = 'flex';
    nameInput.focus();
  }
}

function enterApp() {
  nameModal.style.display = 'none';
  appWrapper.style.display = 'grid';
  userBadge.textContent = userName.toUpperCase();
  doSearch('hindia');
}

nameSubmit.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  userName = name;
  await saveUserName(name);
  enterApp();
});

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') nameSubmit.click();
});

// =============================================
// TABS
// =============================================
function setTab(tab) {
  currentTab = tab;
  [tabSearch, tabLikes, tabPlaylist].forEach(t => t.classList.remove('active'));
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');

  if (tab === 'search') {
    searchSection.style.display = '';
    renderCurrentSearch();
  } else if (tab === 'likes') {
    searchSection.style.display = 'none';
    renderLikes();
  } else if (tab === 'playlist') {
    searchSection.style.display = 'none';
    renderPlaylist();
  }
}

tabSearch.addEventListener('click',   () => setTab('search'));
tabLikes.addEventListener('click',    () => setTab('likes'));
tabPlaylist.addEventListener('click', () => setTab('playlist'));

// =============================================
// SEARCH
// =============================================
let lastSearchResults = [];

async function doSearch(q) {
  if (!q.trim() || isLoading) return;
  isLoading = true;
  searchBtn.disabled = true;
  setStatus('searching');

  mainContent.innerHTML = `<div class="state-msg"><div class="spinner"></div>SEARCHING "${q.toUpperCase()}"</div>`;

  try {
    const res  = await fetch(API_SEARCH(q));
    const data = await res.json();
    const list = data?.result?.result || data?.result || [];

    if (!Array.isArray(list) || list.length === 0) {
      mainContent.innerHTML = `<div class="state-msg"><span class="big">Nope.</span>NO RESULTS FOUND</div>`;
      setStatus('idle');
      return;
    }

    tracks = list;
    lastSearchResults = list;
    renderTracks(list, true);
    setStatus(`${list.length} results`);
  } catch (e) {
    mainContent.innerHTML = `<div class="state-msg"><span class="big">Err.</span>FAILED TO FETCH</div>`;
    setStatus('error');
    showToast('SEARCH FAILED');
  } finally {
    isLoading = false;
    searchBtn.disabled = false;
  }
}

function renderCurrentSearch() {
  if (lastSearchResults.length > 0) {
    tracks = lastSearchResults;
    renderTracks(lastSearchResults, false);
  } else {
    mainContent.innerHTML = `<div class="state-msg"><span class="big">Listen.</span>SEARCH TO START</div>`;
  }
}

// =============================================
// RENDER TRACKS
// =============================================
function renderTracks(list, isSearch = true, sourceLabel = null) {
  const label = sourceLabel || `Results — ${list.length} tracks`;
  mainContent.innerHTML = `
    <div class="section-title">${label}</div>
    <div class="results-grid" id="resultsGrid"></div>
  `;

  const grid = document.getElementById('resultsGrid');
  list.forEach((track, i) => {
    const isLiked = likedSongs.some(t => t.link === track.link);
    const card = document.createElement('div');
    card.className = 'track-card' + (isLiked ? ' liked' : '') + (i === currentIdx && isSearch ? ' active' : '');
    card.style.animationDelay = `${i * 35}ms`;
    card.dataset.link = track.link;

    card.innerHTML = `
      <div style="position:relative;">
        <img class="track-thumb" src="${track.imageUrl || fallbackThumb()}" alt="${track.title}" loading="lazy" onerror="this.src='${fallbackThumb()}'"/>
        <div class="liked-dot"></div>
        <div class="play-overlay">▷</div>
      </div>
      <div class="track-info">
        <div class="track-title">${track.title}</div>
        <div class="track-meta">
          <span>${track.duration || ''}</span>
          <span>${track.channel || ''}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      tracks = list;
      playTrack(i);
    });
    grid.appendChild(card);
  });
}

// =============================================
// LIKES TAB
// =============================================
function renderLikes() {
  if (likedSongs.length === 0) {
    mainContent.innerHTML = `<div class="state-msg"><span class="big">♥</span>BELUM ADA LAGU YANG DI-LIKE</div>`;
    return;
  }
  renderTracks(likedSongs, false, `Liked Songs — ${likedSongs.length} tracks`);
}

// =============================================
// PLAYLIST TAB
// =============================================
function renderPlaylist() {
  if (playlist.length === 0) {
    mainContent.innerHTML = `<div class="state-msg"><span class="big">♪</span>PLAYLIST KOSONG</div>`;
    return;
  }

  mainContent.innerHTML = `
    <div class="section-title">Playlist — ${playlist.length} tracks</div>
    <div class="playlist-actions">
      <button class="small-btn" id="playAllBtn">▷ Play All</button>
    </div>
    <div class="results-grid" id="resultsGrid"></div>
  `;

  document.getElementById('playAllBtn').addEventListener('click', () => {
    tracks = [...playlist];
    playTrack(0);
  });

  const grid = document.getElementById('resultsGrid');
  playlist.forEach((track, i) => {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.style.animationDelay = `${i * 35}ms`;
    card.dataset.link = track.link;

    card.innerHTML = `
      <div style="position:relative;">
        <img class="track-thumb" src="${track.imageUrl || fallbackThumb()}" alt="${track.title}" loading="lazy" onerror="this.src='${fallbackThumb()}'"/>
        <div class="play-overlay">▷</div>
      </div>
      <div class="track-info">
        <div class="track-title">${track.title}</div>
        <div class="track-meta">
          <span>${track.duration || ''}</span>
          <span>${track.channel || ''}</span>
        </div>
      </div>
    `;

    // Long press or right click to remove
    const removeBtn = document.createElement('button');
    removeBtn.className = 'small-btn danger';
    removeBtn.style.cssText = 'width:100%;border-top:1px solid var(--border);border-left:none;border-right:none;border-bottom:none;padding:6px;';
    removeBtn.textContent = '✕ Hapus';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await removeFromPlaylistFirebase(track.link);
      renderPlaylist();
      showToast('DIHAPUS DARI PLAYLIST');
    });
    card.appendChild(removeBtn);

    card.addEventListener('click', () => {
      tracks = [...playlist];
      playTrack(i);
    });

    grid.appendChild(card);
  });
}

// =============================================
// PLAY TRACK
// =============================================
async function playTrack(idx) {
  if (idx < 0 || idx >= tracks.length) return;
  currentIdx = idx;
  const track = tracks[idx];

  // Highlight card
  document.querySelectorAll('.track-card').forEach((c, i) => {
    c.classList.toggle('active', i === idx);
  });

  // Show player
  player.classList.remove('hidden');
  playerThumb.src        = track.imageUrl || fallbackThumb();
  playerTitle.textContent   = track.title;
  playerChannel.textContent = track.channel;
  playPauseBtn.textContent  = '…';
  playPauseBtn.disabled     = true;
  progressFill.style.width  = '0%';
  playerTime.textContent    = '0:00 / 0:00';
  setStatus('loading');
  showToast('LOADING AUDIO...');

  // Update like button state
  updateLikeBtn(track);

  audioEl.pause();
  audioEl.src = '';
  isPlaying = false;

  try {
    const res  = await fetch(API_DOWNLOAD(track.link));
    const data = await res.json();
    const mp3  = data?.result?.result?.link;
    if (!mp3) throw new Error('no link');

    audioEl.src = mp3;
    await audioEl.play();
    isPlaying = true;
    playPauseBtn.textContent = '⏸';
    playPauseBtn.disabled    = false;
    setStatus('playing');
  } catch (e) {
    showToast('GAGAL MEMUAT AUDIO');
    playPauseBtn.textContent = '▷';
    playPauseBtn.disabled    = false;
    setStatus('error');
  }
}

// =============================================
// LIKE BUTTON
// =============================================
function updateLikeBtn(track) {
  if (!track) return;
  const isLiked = likedSongs.some(t => t.link === track.link);
  likeBtn.classList.toggle('liked', isLiked);
  likeBtn.title = isLiked ? 'Unlike' : 'Like';
}

likeBtn.addEventListener('click', async () => {
  if (currentIdx < 0 || !tracks[currentIdx]) return;
  const track = tracks[currentIdx];
  await toggleLikeFirebase(track);
  updateLikeBtn(track);

  // Update card liked dot if visible
  document.querySelectorAll('.track-card').forEach((c, i) => {
    if (i === currentIdx) {
      const isLiked = likedSongs.some(t => t.link === track.link);
      c.classList.toggle('liked', isLiked);
    }
  });

  const isNowLiked = likedSongs.some(t => t.link === track.link);
  showToast(isNowLiked ? '♥ LIKED' : '♡ UNLIKED');

  if (currentTab === 'likes') renderLikes();
});

// =============================================
// ADD TO PLAYLIST (right-click on card or hold)
// Context: we use a global right-click handler
// =============================================
document.addEventListener('contextmenu', async (e) => {
  const card = e.target.closest('.track-card');
  if (!card) return;
  e.preventDefault();

  // Find track by index
  const grid = card.closest('.results-grid');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('.track-card')];
  const idx   = cards.indexOf(card);
  if (idx < 0 || idx >= tracks.length) return;

  await addToPlaylistFirebase(tracks[idx]);
  if (currentTab === 'playlist') renderPlaylist();
});

// =============================================
// PLAYER CONTROLS
// =============================================
playPauseBtn.addEventListener('click', () => {
  if (!audioEl.src) return;
  if (isPlaying) {
    audioEl.pause();
    isPlaying = false;
    playPauseBtn.textContent = '▷';
    setStatus('paused');
  } else {
    audioEl.play();
    isPlaying = true;
    playPauseBtn.textContent = '⏸';
    setStatus('playing');
  }
});

prevBtn.addEventListener('click', () => {
  if (currentIdx > 0) playTrack(currentIdx - 1);
});

nextBtn.addEventListener('click', () => {
  if (currentIdx < tracks.length - 1) playTrack(currentIdx + 1);
});

audioEl.addEventListener('ended', () => {
  if (currentIdx < tracks.length - 1) {
    playTrack(currentIdx + 1);
  } else {
    isPlaying = false;
    playPauseBtn.textContent = '▷';
    setStatus('idle');
  }
});

audioEl.addEventListener('timeupdate', () => {
  if (!audioEl.duration) return;
  const pct = (audioEl.currentTime / audioEl.duration) * 100;
  progressFill.style.width = pct + '%';
  playerTime.textContent   = `${fmtTime(audioEl.currentTime)} / ${fmtTime(audioEl.duration)}`;
});

progressTrack.addEventListener('click', (e) => {
  if (!audioEl.duration) return;
  const rect = progressTrack.getBoundingClientRect();
  audioEl.currentTime = ((e.clientX - rect.left) / rect.width) * audioEl.duration;
});

// =============================================
// KEYBOARD SHORTCUTS
// =============================================
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space')      { e.preventDefault(); playPauseBtn.click(); }
  if (e.code === 'ArrowLeft')  prevBtn.click();
  if (e.code === 'ArrowRight') nextBtn.click();
});

// =============================================
// SEARCH TRIGGERS
// =============================================
searchBtn.addEventListener('click', () => doSearch(searchInput.value));
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch(searchInput.value);
});

// =============================================
// START
// =============================================
init();
