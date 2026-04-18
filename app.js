// =============================================
// MEG MUSIC — APP.JS (OPTIMIZED)
// Prefetch & Smart Caching Logic
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
// API — proxy Vercel untuk hindari CORS
// =============================================
const API_SEARCH   = q   => `/api/search?q=${encodeURIComponent(q)}`;
const API_DOWNLOAD = url => `/api/download?url=${encodeURIComponent(url)}`;

// =============================================
// STATE
// =============================================
let userId     = null;
let userName   = null;
let tracks     = [];
let currentIdx = -1;
let isLoading  = false;
let isPlaying  = false;
let currentTab = 'search';
let likedSongs = [];
let playlist   = [];

// Cache MP3 links: { [youtubeLink]: mp3Url | 'loading' | 'error' }
const mp3Cache = {};

// Last search results
let lastSearchResults = [];

// =============================================
// ELEMENTS
// =============================================
const nameModal     = document.getElementById('nameModal');
const nameInput     = document.getElementById('nameInput');
const nameSubmit    = document.getElementById('nameSubmit');
const appWrapper    = document.getElementById('appWrapper');
const searchInput   = document.getElementById('searchInput');
const searchBtn     = document.getElementById('searchBtn');
const mainContent   = document.getElementById('mainContent');
const searchSection = document.getElementById('searchSection');
const player        = document.getElementById('player');
const playerThumb   = document.getElementById('playerThumb');
const playerTitle   = document.getElementById('playerTitle');
const playerChannel = document.getElementById('playerChannel');
const playPauseBtn  = document.getElementById('playPauseBtn');
const prevBtn       = document.getElementById('prevBtn');
const nextBtn       = document.getElementById('nextBtn');
const progressFill  = document.getElementById('progressFill');
const progressTrack = document.getElementById('progressTrack');
const playerTime    = document.getElementById('playerTime');
const audioEl       = document.getElementById('audioEl');
const statusTag     = document.getElementById('statusTag');
const toast         = document.getElementById('toast');
const themeBtn      = document.getElementById('themeBtn');
const userBadge     = document.getElementById('userBadge');
const likeBtn       = document.getElementById('likeBtn');
const tabSearch     = document.getElementById('tabSearch');
const tabLikes      = document.getElementById('tabLikes');
const tabPlaylist   = document.getElementById('tabPlaylist');

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
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function fallbackThumb() {
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'><rect width='16' height='9' fill='%23222'/></svg>`;
}

function getDeviceId() {
  let id = localStorage.getItem('meg-device-id');
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    localStorage.setItem('meg-device-id', id);
  }
  return id;
}

// =============================================
// PREFETCH — fetch MP3 link silently in background
// =============================================
async function prefetchMp3(track) {
  if (!track || !track.link) return;
  const key = track.link;
  if (mp3Cache[key]) return;
  
  mp3Cache[key] = 'loading';
  try {
    const res  = await fetch(API_DOWNLOAD(key));
    const data = await res.json();
    const mp3  = data?.result?.result?.link;
    mp3Cache[key] = mp3 || 'error';
    if (mp3) console.log(`%c[Prefetch] Ready: ${track.title}`, 'color: #00ff00');
  } catch {
    mp3Cache[key] = 'error';
  }
}

// Prefetch first N tracks with small stagger
function prefetchBatch(list, count = 4) {
  list.slice(0, count).forEach((t, i) => {
    setTimeout(() => prefetchMp3(t), i * 400);
  });
}

// Poll cache until resolved (max 15s)
function waitForCache(key, timeout = 15000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      if (mp3Cache[key] !== 'loading' || Date.now() - start > timeout) resolve();
      else setTimeout(check, 200);
    };
    check();
  });
}

// =============================================
// FIREBASE: USER DATA
// =============================================
async function loadUserData() {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      const data = snap.data();
      userName   = data.name;
      likedSongs = data.likes    || [];
      playlist   = data.playlist || [];
    }
  } catch (e) { console.error('Load user error:', e); }
}

async function saveUserName(name) {
  try {
    await setDoc(doc(db, 'users', userId), { name, likes: [], playlist: [] }, { merge: true });
  } catch (e) { console.error('Save name error:', e); }
}

// =============================================
// INIT & TABS
// =============================================
async function init() {
  userId = getDeviceId();
  await loadUserData();
  if (userName) enterApp();
  else { nameModal.style.display = 'flex'; nameInput.focus(); }
}

function enterApp() {
  nameModal.style.display  = 'none';
  appWrapper.style.display = 'grid';
  userBadge.innerHTML = `<i class="fa-solid fa-user"></i> ${userName.toUpperCase()}`;
  doSearch('hindia');
}

nameSubmit.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  userName = name;
  await saveUserName(name);
  enterApp();
});
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameSubmit.click(); });

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
// SEARCH LOGIC
// =============================================
searchBtn.addEventListener('click', () => doSearch(searchInput.value));
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(searchInput.value); });

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
    renderTracks(list);
    setStatus(`${list.length} results`);
    
    // FETCH 4 LAGU PERTAMA DI BACKGROUND
    prefetchBatch(list);

  } catch (e) {
    mainContent.innerHTML = `<div class="state-msg"><span class="big">Err.</span>FAILED TO FETCH</div>`;
    setStatus('error');
  } finally {
    isLoading = false;
    searchBtn.disabled = false;
  }
}

function renderCurrentSearch() {
  if (lastSearchResults.length > 0) {
    tracks = lastSearchResults;
    renderTracks(lastSearchResults);
  } else {
    mainContent.innerHTML = `<div class="state-msg"><span class="big">Listen.</span>SEARCH TO START</div>`;
  }
}

// =============================================
// RENDER TRACKS (HOVER PREFETCH)
// =============================================
function renderTracks(list, sourceLabel = null) {
  const label = sourceLabel || `Results — ${list.length} tracks`;
  mainContent.innerHTML = `
    <div class="section-title">${label}</div>
    <div class="results-grid" id="resultsGrid"></div>
  `;

  const grid = document.getElementById('resultsGrid');
  list.forEach((track, i) => {
    const isLiked = likedSongs.some(t => t.link === track.link);
    const card = document.createElement('div');
    card.className = 'track-card' + (isLiked ? ' liked' : '');
    card.style.animationDelay = `${i * 35}ms`;

    card.innerHTML = `
      <div style="position:relative;">
        <img class="track-thumb" src="${track.imageUrl || fallbackThumb()}" alt="${track.title}" loading="lazy" onerror="this.src='${fallbackThumb()}'"/>
        <div class="liked-dot"></div>
        <div class="play-overlay"><i class="fa-solid fa-play"></i></div>
      </div>
      <div class="track-info">
        <div class="track-title">${track.title}</div>
        <div class="track-meta">
          <span>${track.duration || ''}</span>
          <span>${track.channel || ''}</span>
        </div>
      </div>
    `;

    // PREFETCH SAAT HOVER/TAP
    const triggerPrefetch = () => prefetchMp3(track);
    card.addEventListener('mouseenter', triggerPrefetch, { once: true });
    card.addEventListener('touchstart', triggerPrefetch, { once: true, passive: true });

    card.addEventListener('click', () => { tracks = list; playTrack(i); });
    grid.appendChild(card);
  });
}

// =============================================
// PLAY LOGIC (INSTANT FROM CACHE)
// =============================================
async function playTrack(idx) {
  if (idx < 0 || idx >= tracks.length) return;
  currentIdx = idx;
  const track = tracks[idx];

  document.querySelectorAll('.track-card').forEach((c, i) => c.classList.toggle('active', i === idx));

  player.classList.remove('hidden');
  playerThumb.src           = track.imageUrl || fallbackThumb();
  playerTitle.textContent   = track.title;
  playerChannel.textContent = track.channel;
  progressFill.style.width  = '0%';
  playerTime.textContent    = '0:00 / 0:00';
  updateLikeBtn(track);

  audioEl.pause();
  audioEl.src = '';
  isPlaying   = false;

  const cached = mp3Cache[track.link];

  // CACHE HIT — Langsung Play tanpa loading API
  if (cached && cached !== 'loading' && cached !== 'error') {
    playMp3(cached);
    return;
  }

  playPauseBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  playPauseBtn.disabled  = true;
  setStatus('loading');

  if (cached === 'loading') {
    await waitForCache(track.link);
    const result = mp3Cache[track.link];
    if (result && result !== 'error') playMp3(result);
    else onPlayError();
    return;
  }

  // Fetch Manual jika belum masuk cache
  mp3Cache[track.link] = 'loading';
  try {
    const res  = await fetch(API_DOWNLOAD(track.link));
    const data = await res.json();
    const mp3  = data?.result?.result?.link;
    if (!mp3) throw new Error();
    mp3Cache[track.link] = mp3;
    playMp3(mp3);
  } catch {
    mp3Cache[track.link] = 'error';
    onPlayError();
  }
}

function playMp3(url) {
  audioEl.src = url;
  audioEl.play().then(() => {
    isPlaying = true;
    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    playPauseBtn.disabled  = false;
    setStatus('playing');

    // CONTINUOUS PREFETCH — Ambil 3 lagu kedepan secara otomatis
    for (let i = 1; i <= 3; i++) {
        if (currentIdx + i < tracks.length) {
            prefetchMp3(tracks[currentIdx + i]);
        }
    }
  }).catch(onPlayError);
}

function onPlayError() {
  showToast('GAGAL MEMUAT AUDIO');
  playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  playPauseBtn.disabled  = false;
  setStatus('error');
}

// =============================================
// PLAYER CONTROLS & LISTENERS
// =============================================
playPauseBtn.addEventListener('click', () => {
  if (!audioEl.src) return;
  if (isPlaying) {
    audioEl.pause();
    isPlaying = false;
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  } else {
    audioEl.play();
    isPlaying = true;
    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  }
});

prevBtn.addEventListener('click', () => playTrack(currentIdx - 1));
nextBtn.addEventListener('click', () => playTrack(currentIdx + 1));

audioEl.addEventListener('timeupdate', () => {
  if (!audioEl.duration) return;
  const pct = (audioEl.currentTime / audioEl.duration) * 100;
  progressFill.style.width = `${pct}%`;
  playerTime.textContent = `${fmtTime(audioEl.currentTime)} / ${fmtTime(audioEl.duration)}`;
});

audioEl.addEventListener('ended', () => {
  if (currentIdx < tracks.length - 1) playTrack(currentIdx + 1);
});

// Progress Bar Click
progressTrack.addEventListener('click', (e) => {
  if (!audioEl.duration) return;
  const rect = progressTrack.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  audioEl.currentTime = pos * audioEl.duration;
});

// Update UI Functions (Likes/Theme)
function updateLikeBtn(track) {
  if (!track) return;
  likeBtn.classList.toggle('liked', likedSongs.some(t => t.link === track.link));
}

function renderLikes() {
    if (likedSongs.length === 0) {
      mainContent.innerHTML = `<div class="state-msg"><span class="big">♥</span>BELUM ADA LAGU YANG DI-LIKE</div>`;
      return;
    }
    tracks = likedSongs;
    renderTracks(likedSongs, `Liked Songs — ${likedSongs.length} tracks`);
    prefetchBatch(likedSongs);
}

function renderPlaylist() {
    if (playlist.length === 0) {
      mainContent.innerHTML = `<div class="state-msg"><span class="big">♪</span>PLAYLIST KOSONG</div>`;
      return;
    }
    renderTracks(playlist, `Playlist — ${playlist.length} tracks`);
    prefetchBatch(playlist);
}

// Theme Toggle
let theme = localStorage.getItem('meg-theme') || 'dark';
document.documentElement.setAttribute('data-theme', theme);
themeBtn.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('meg-theme', theme);
});

// START
init();
