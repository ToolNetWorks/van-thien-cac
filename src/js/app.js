(() => {
  'use strict';
  const STORAGE_FAVORITES = 'vtc-favorites-v1';
  const STORAGE_PROGRESS = 'vtc-watch-progress-v1';
  const STORAGE_STATUSES = 'vtc-statuses-v1';
  const STORAGE_REVIEWS = 'vtc-reviews-v1';
  const STORAGE_WATCHED_EPS = 'vtc-watched-eps-v1';
  const STORAGE_ACCOUNT_DB = 'vtc-account-db-v1';
  const STORAGE_ACCOUNT_SESSION = 'vtc-account-session-v1';

  const STONES = [
    { key: 'ha-pham', name: 'Hạ Phẩm Linh Thạch', short: 'Hạ Phẩm', points: 1, tone: 'ha', desc: '1 viên = +1 điểm cống hiến (+1% tu vi). Tặng 10 viên = +10% tu vi.' },
    { key: 'trung-pham', name: 'Trung Phẩm Linh Thạch', short: 'Trung Phẩm', points: 10, tone: 'trung', desc: '1 viên = +10 điểm cống hiến (+10% tu vi). Tặng 10 viên = lên 1 cảnh giới.' },
    { key: 'thuong-pham', name: 'Thượng Phẩm Linh Thạch', short: 'Thượng Phẩm', points: 50, tone: 'thuong', desc: '1 viên = +50 điểm cống hiến (+50% tu vi). Tặng 2 viên = lên 1 cảnh giới.' },
    { key: 'cuc-pham', name: 'Cực Phẩm Linh Thạch', short: 'Cực Phẩm', points: 100, tone: 'cuc', desc: '1 viên = +100 điểm cống hiến (+100% tu vi). Đột phá ngay 1 đại cảnh giới.' },
  ];
  const STONE_BY_KEY = Object.fromEntries(STONES.map(s => [s.key, s]));

  const REALMS = [
    'Phàm Nhân',
    'Linh Khí',
    'Trúc Cơ',
    'Kim Đan',
    'Nguyên Anh',
    'Hóa Thần',
    'Luyện Hư',
    'Hợp Thể',
    'Đại Thừa',
    'Độ Kiếp',
    'Tán Tiên',
    'Chân Tiên',
    'Thái Ất Kim Tiên',
    'Đại La Kim Tiên',
    'Tiên Đế',
  ];
  const POINTS_PER_REALM = 100;

  function computeRealm(rawPoints) {
    const points = Math.max(0, Math.floor(Number(rawPoints) || 0));
    const last = REALMS.length - 1;
    const index = Math.min(last, Math.floor(points / POINTS_PER_REALM));
    const isMax = index === last;
    const pointsInRealm = isMax ? POINTS_PER_REALM : (points % POINTS_PER_REALM);
    return {
      index,
      level: index + 1,
      total: REALMS.length,
      name: REALMS[index],
      next: isMax ? null : REALMS[index + 1],
      progress: isMax ? 100 : Math.round((pointsInRealm * 100) / POINTS_PER_REALM),
      pointsInRealm,
      pointsToNext: isMax ? 0 : (POINTS_PER_REALM - pointsInRealm),
      isMax,
    };
  }

  const app = document.getElementById('app');
  const storedFavorites = readStorage(STORAGE_FAVORITES, []);
  const state = {
    movies: [],
    favorites: Array.isArray(storedFavorites) ? storedFavorites : [],
    progress: readStorage(STORAGE_PROGRESS, {}),
    statuses: readStorage(STORAGE_STATUSES, {}),
    reviews: readStorage(STORAGE_REVIEWS, {}),
    watchedEps: readStorage(STORAGE_WATCHED_EPS, {}),
    filter: 'all',
    listTab: 'all',
    detailTab: 'episodes',
    sort: 'newest',
    player: null,
    hls: null,
    searchIndex: 0,
    reviewDraftRating: 5,
    statusMenuOpen: false,
    toastTimer: null,
    partials: { header: '', footer: '' },
    user: null,
    donations: [],
    leaders: [],
    selectedStone: 'ha-pham',
    donateQty: 10,
    authMode: 'login',
  };

  // Minimal essential UI chrome icons only (no decorative/clutter icons)
  const ICONS = new Set(['search', 'menu', 'close']);

  const STATUS_META = {
    watching:  { label: 'Đang xem', tone: 'watching' },
    plan:      { label: 'Muốn xem', tone: 'plan' },
    completed: { label: 'Đã xem',   tone: 'completed' },
    dropped:   { label: 'Tạm dừng', tone: 'dropped' },
  };
  const STATUS_KEYS = Object.keys(STATUS_META);

  function readStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === 'object' ? value : fallback;
    } catch (_) { return fallback; }
  }
  function saveStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* private mode / storage unavailable */ }
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon = (name, extraClass='') => ICONS.has(name) ? `<svg class="icon ${extraClass}" aria-hidden="true"><use href="./assets/icons/icon-sprite.svg#i-${name}"></use></svg>` : '';
  const movieById = id => state.movies.find(movie => movie.id === id);
  const resolveMedia = (src, fallback) => {
    if (!src) return `./assets/${fallback}`;
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/') || src.startsWith('./')) return src;
    return `./assets/${src}`;
  };
  const posterVertical = movie => resolveMedia(movie?.poster_vertical || movie?.poster, 'movies/covers/cover-01.svg');
  const coverHorizontal = movie => resolveMedia(movie?.cover_horizontal || movie?.cover || movie?.banner || movie?.poster, 'movies/landscapes/landscape-01.svg');
  const poster = movie => coverHorizontal(movie);
  const isSaved = id => state.favorites.includes(id);
  const getStatus = id => STATUS_META[state.statuses[id]] ? state.statuses[id] : null;
  const getReview = id => {
    const r = state.reviews[id];
    return r && typeof r === 'object' && Number(r.rating) >= 1 ? r : null;
  };
  const getWatchedEps = id => Array.isArray(state.watchedEps[id]) ? state.watchedEps[id] : [];
  const nextEpisodeFor = movie => {
    const watched = getWatchedEps(movie.id);
    if (!watched.length) return 1;
    const maxW = Math.max(...watched);
    const avail = safeCount(movie.availableEpisodes);
    return Math.min(Math.max(1, maxW < avail ? maxW + 1 : maxW), Math.max(1, avail));
  };
  const movieRating = movie => Number.isFinite(Number(movie?.rating)) ? Number(movie.rating).toFixed(1) : '9.0';
  const safeCount = number => Number.isInteger(number) ? Math.max(0, Math.min(number, 9999)) : 0;
  const epLabel = movie => `Tập ${safeCount(movie.availableEpisodes)}/${safeCount(movie.episodes)}`;
  const activeRoute = () => decodeURIComponent(window.location.hash.slice(1) || '/').replace(/^([^/])/, '/$1');
  const title = (value, suffix='') => { document.title = `${value}${suffix ? ' ' + suffix : ''} | Vân Thiên Các`; };
  const formatDate = ts => {
    try { return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch (_) { return ''; }
  };

  function showToast(message) {
    let el = document.getElementById('vtc-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'vtc-toast';
      el.className = 'vtc-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.remove('visible'), 2600);
  }

  function trackedCount() {
    const ids = new Set([
      ...state.favorites,
      ...Object.keys(state.statuses).filter(id => STATUS_META[state.statuses[id]]),
      ...Object.keys(state.reviews).filter(id => getReview(id)),
    ]);
    return [...ids].filter(id => movieById(id)).length;
  }

  // Header and footer HTML live in standalone files: ./components/header.html & ./components/footer.html
  async function loadLayoutPartials() {
    const [headerRes, footerRes] = await Promise.all([
      fetch('./components/header/header.html', { cache: 'no-cache' }),
      fetch('./components/footer/footer.html', { cache: 'no-cache' }),
    ]);
    if (!headerRes.ok) throw new Error(`HTTP ${headerRes.status} khi tải components/header/header.html`);
    if (!footerRes.ok) throw new Error(`HTTP ${footerRes.status} khi tải components/footer/footer.html`);
    state.partials.header = await headerRes.text();
    state.partials.footer = await footerRes.text();
  }

  function syncHeader(route) {
    const [pathname, query = ''] = route.split('?');
    const loc = new URLSearchParams(query).get('loc');
    const isHome = pathname === '/';
    const isLibrary = pathname === '/kho-phim';
    const isFav = pathname.startsWith('/yeu-thich');
    const isCultivate = pathname.startsWith('/tu-luyen');
    const count = trackedCount();
    const countText = count ? ` (${count})` : '';

    const activeMap = {
      home: isHome,
      library: isLibrary && loc !== '3d' && loc !== 'phim-bo',
      '3d': isLibrary && loc === '3d',
      'phim-bo': isLibrary && loc === 'phim-bo',
      favorite: isFav,
      'favorite-btn': isFav,
      cultivate: isCultivate,
    };
    app.querySelectorAll('[data-nav]').forEach(el => {
      el.classList.toggle('active', Boolean(activeMap[el.dataset.nav]));
    });
    app.querySelectorAll('[data-fav-count]').forEach(el => {
      el.textContent = countText;
    });
    app.querySelectorAll('[data-account-slot]').forEach(slot => {
      if (state.user) {
        const u = state.user;
        const realm = u.realm || computeRealm(u.points);
        slot.innerHTML = `<a class="account-pill ${u.isVip ? 'is-vip' : ''}" href="#/tu-luyen" title="Đạo hiệu: ${escapeHtml(u.username)} · Chế độ: ${u.tier} · Cảnh giới: ${escapeHtml(realm.name)} (${realm.progress}%)">
          <span class="account-tier-badge ${u.isVip ? 'tier-vip' : 'tier-normal'}">${escapeHtml(u.tier)}</span>
          <span>${escapeHtml(u.username)}</span>
          <span class="account-realm-tag">${escapeHtml(realm.name)} · ${realm.progress}%</span>
        </a>`;
      } else {
        slot.innerHTML = `<button class="account-trigger" type="button" data-action="open-auth" data-mode="login">Đăng nhập</button>`;
      }
    });
  }

  // ===== Account & Linh Thạch Cultivation Database Engine (SQLite /api/* + Local DB Mirror) =====
  async function hashPasswordLocal(password, salt) {
    const raw = `${salt}:${password}`;
    if (window.crypto?.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `fnv1a_${(h >>> 0).toString(16)}`;
  }

  function readLocalDb() {
    const db = readStorage(STORAGE_ACCOUNT_DB, null);
    if (db && Array.isArray(db.users) && Array.isArray(db.donations)) return db;
    return { users: [], donations: [], nextUserId: 1, nextDonationId: 1 };
  }
  function saveLocalDb(db) {
    saveStorage(STORAGE_ACCOUNT_DB, db);
  }
  function buildLocalUserPayload(db, user) {
    if (!user) return null;
    const approved = db.donations.filter(d => d.userId === user.id && d.status === 'approved');
    const points = approved.reduce((sum, d) => sum + (Number(d.points) || 0), 0);
    user.points = points;
    const stones = Object.fromEntries(STONES.map(s => [s.key, 0]));
    for (const d of approved) {
      if (stones[d.stone] !== undefined) stones[d.stone] += Number(d.quantity) || 0;
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role || 'member',
      isAdmin: user.role === 'admin',
      isVip: points > 0,
      tier: points > 0 ? 'VIP' : 'Thường',
      points,
      realm: computeRealm(points),
      stones,
      createdAt: user.createdAt || Date.now(),
    };
  }

  async function localApiFallback(method, path, body = {}) {
    const db = readLocalDb();
    let sessId = null;
    try { sessId = Number(localStorage.getItem(STORAGE_ACCOUNT_SESSION)) || null; } catch (_) {}
    const currentUser = sessId ? db.users.find(u => u.id === sessId) || null : null;

    if (method === 'GET' && path === '/api/me') {
      return { user: buildLocalUserPayload(db, currentUser) };
    }
    if (method === 'POST' && path === '/api/auth/register') {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!/^[A-Za-z0-9_.]{3,24}$/.test(username)) {
        throw new Error('Tên tài khoản dài 3–24 ký tự, chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch dưới.');
      }
      if (password.length < 4 || password.length > 128) {
        throw new Error('Mật khẩu phải từ 4 ký tự trở lên.');
      }
      const key = username.toLowerCase();
      if (db.users.some(u => u.usernameKey === key)) {
        throw new Error('Tên tài khoản này đã tồn tại.');
      }
      const salt = Math.random().toString(36).slice(2, 10);
      const passwordHash = await hashPasswordLocal(password, salt);
      const newUser = {
        id: db.nextUserId++,
        username,
        usernameKey: key,
        salt,
        passwordHash,
        role: db.users.length === 0 ? 'admin' : 'member',
        points: 0,
        createdAt: Date.now(),
      };
      db.users.push(newUser);
      saveLocalDb(db);
      try { localStorage.setItem(STORAGE_ACCOUNT_SESSION, String(newUser.id)); } catch (_) {}
      return { user: buildLocalUserPayload(db, newUser) };
    }
    if (method === 'POST' && path === '/api/auth/login') {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const user = db.users.find(u => u.usernameKey === username.toLowerCase());
      if (!user) throw new Error('Sai tên tài khoản hoặc mật khẩu.');
      const checkHash = await hashPasswordLocal(password, user.salt);
      if (checkHash !== user.passwordHash) throw new Error('Sai tên tài khoản hoặc mật khẩu.');
      try { localStorage.setItem(STORAGE_ACCOUNT_SESSION, String(user.id)); } catch (_) {}
      return { user: buildLocalUserPayload(db, user) };
    }
    if (method === 'POST' && path === '/api/auth/logout') {
      try { localStorage.removeItem(STORAGE_ACCOUNT_SESSION); } catch (_) {}
      return { ok: true };
    }
    if (method === 'GET' && path === '/api/donations') {
      if (!currentUser) return { donations: [] };
      const list = db.donations
        .filter(d => d.userId === currentUser.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50);
      return { donations: list };
    }
    if (method === 'POST' && path === '/api/donations') {
      if (!currentUser) throw new Error('Bạn cần đăng nhập tài khoản để tặng Linh Thạch.');
      const stoneMeta = STONE_BY_KEY[body.stone];
      if (!stoneMeta) throw new Error('Loại Linh Thạch không hợp lệ.');
      const quantity = Math.floor(Number(body.quantity) || 0);
      if (quantity < 1 || quantity > 100000) throw new Error('Số lượng Linh Thạch phải từ 1 đến 100.000.');
      const points = quantity * stoneMeta.points;
      const note = String(body.note || '').trim().slice(0, 200);
      const record = {
        id: db.nextDonationId++,
        userId: currentUser.id,
        username: currentUser.username,
        stone: stoneMeta.key,
        stoneName: stoneMeta.name,
        quantity,
        points,
        note,
        status: 'approved',
        createdAt: Date.now(),
      };
      db.donations.push(record);
      const updatedUser = buildLocalUserPayload(db, currentUser);
      saveLocalDb(db);
      return { donation: record, user: updatedUser };
    }
    if (method === 'GET' && path === '/api/leaderboard') {
      for (const u of db.users) buildLocalUserPayload(db, u);
      saveLocalDb(db);
      const leaders = [...db.users]
        .filter(u => (u.points || 0) > 0)
        .sort((a, b) => b.points - a.points || a.createdAt - b.createdAt)
        .slice(0, 20)
        .map((u, idx) => ({
          rank: idx + 1,
          username: u.username,
          points: u.points,
          tier: 'VIP',
          realm: computeRealm(u.points).name,
        }));
      return { leaders };
    }
    return {};
  }

  async function apiRequest(method, path, body = null) {
    try {
      const opts = {
        method,
        headers: { 'X-Requested-With': 'vtc' },
        credentials: 'same-origin',
      };
      if (body !== null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(`.${path}`, opts);
      const ctype = res.headers.get('content-type') || '';
      if (res.status === 404 || res.status === 501 || res.status === 405 || !ctype.includes('application/json')) {
        return await localApiFallback(method, path, body || {});
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Lỗi HTTP ${res.status}`);
      return data;
    } catch (err) {
      if (err instanceof TypeError) {
        return await localApiFallback(method, path, body || {});
      }
      throw err;
    }
  }

  async function refreshAccountState() {
    try {
      const [meRes, boardRes] = await Promise.all([
        apiRequest('GET', '/api/me'),
        apiRequest('GET', '/api/leaderboard'),
      ]);
      state.user = meRes.user || null;
      if (state.user && !state.user.realm) state.user.realm = computeRealm(state.user.points);
      state.leaders = Array.isArray(boardRes.leaders) ? boardRes.leaders : [];
      if (state.user) {
        const donRes = await apiRequest('GET', '/api/donations');
        state.donations = Array.isArray(donRes.donations) ? donRes.donations : [];
      } else {
        state.donations = [];
      }
    } catch (_) {
      state.user = null;
      state.donations = [];
    }
  }

  function openAuthModal(mode = 'login') {
    closeAuthModal();
    closeSearch();
    closeReviewModal();
    state.authMode = mode === 'register' ? 'register' : 'login';
    const isReg = state.authMode === 'register';
    document.body.insertAdjacentHTML('beforeend', `<div class="search-modal" id="auth-modal" role="dialog" aria-modal="true" aria-label="${isReg ? 'Tạo tài khoản tu tiên' : 'Đăng nhập tài khoản'}" data-action="close-auth">
      <div class="search-panel auth-panel" data-action="none">
        <div class="review-modal-head">
          <div>
            <div class="section-kicker">DANH TÍNH TU TIÊN · DATABASE</div>
            <h3 id="auth-modal-title">${isReg ? 'Tạo tài khoản mới' : 'Đăng nhập đạo hiệu'}</h3>
          </div>
          <button class="icon-btn" type="button" data-action="close-auth" aria-label="Đóng">${icon('close')}</button>
        </div>
        <div class="auth-mode-tabs" role="tablist">
          <button type="button" class="auth-tab ${!isReg ? 'active' : ''}" data-action="switch-auth-mode" data-mode="login">Đăng nhập</button>
          <button type="button" class="auth-tab ${isReg ? 'active' : ''}" data-action="switch-auth-mode" data-mode="register">Tạo tài khoản</button>
        </div>
        <form id="auth-form" class="auth-form" autocomplete="on">
          <label class="auth-field">
            <span>Tên tài khoản (Đạo hiệu)</span>
            <input id="auth-username" name="username" type="text" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_.]+" autocomplete="username" placeholder="Ví dụ: han_lap_99" />
            <small>3–24 ký tự (chữ không dấu, số, dấu chấm hoặc gạch dưới, không cần Gmail)</small>
          </label>
          <label class="auth-field">
            <span>Mật khẩu</span>
            <input id="auth-password" name="password" type="password" required minlength="4" maxlength="128" autocomplete="${isReg ? 'new-password' : 'current-password'}" placeholder="Nhập mật khẩu bảo mật…" />
          </label>
          <div class="auth-note">
            Tài khoản mới mặc định ở chế độ <strong>Thường</strong> (Cảnh giới <strong>Phàm Nhân · 0%</strong>). Khi tặng <strong>Linh Thạch</strong> ủng hộ website, tài khoản tự động thăng lên <strong>VIP</strong> và tích lũy % đột phá 15 cảnh giới tu vi.
          </div>
          <div class="review-modal-footer">
            <button type="button" class="btn btn-ghost" data-action="switch-auth-mode" data-mode="${isReg ? 'login' : 'register'}">${isReg ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Tạo ngay'}</button>
            <button type="submit" class="btn btn-primary">${isReg ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
          </div>
        </form>
      </div>
    </div>`);
    document.body.classList.add('no-scroll');
    document.getElementById('auth-username')?.focus();
  }

  function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.remove();
    if (!document.getElementById('search-modal') && !document.getElementById('review-modal')) {
      document.body.classList.remove('no-scroll');
    }
  }

  function cultivationPage() {
    title('Tu luyện & Tặng Linh Thạch');
    const u = state.user;
    const points = u ? Number(u.points) || 0 : 0;
    const realm = u ? (u.realm || computeRealm(points)) : computeRealm(0);
    const selectedStone = STONE_BY_KEY[state.selectedStone] || STONES[0];
    const qty = Math.max(1, Math.min(100000, Math.floor(Number(state.donateQty) || 10)));
    const gainPoints = qty * selectedStone.points;
    const previewTotal = points + gainPoints;
    const previewRealm = computeRealm(previewTotal);
    const realmJump = previewRealm.index - realm.index;

    return `<main class="main">
      <section class="inner-hero">
        <div class="container">
          <div class="section-kicker">VÂN THIÊN CÁC · ĐỘNG PHỦ TU TIÊN & CỐNG HIẾN</div>
          <h1 class="inner-title">Tu Luyện & Tặng Linh Thạch</h1>
          <div class="breadcrumbs"><a href="#/">Trang chủ</a><span class="crumb-sep" aria-hidden="true">/</span><span>Tu luyện & Tặng Linh Thạch</span></div>
        </div>
      </section>

      <section class="container section">
        <div class="cultivate-top-grid">
          <!-- Cột trái: Hồ sơ tài khoản / VIP / Thanh Tu Vi -->
          <article class="cultivate-card profile-card ${u?.isVip ? 'is-vip-card' : ''}">
            ${u ? `
              <div class="profile-head">
                <div>
                  <div class="section-kicker">ĐẠO HIỆU ĐANG ĐĂNG NHẬP</div>
                  <div class="profile-name-row">
                    <h2 class="profile-username">${escapeHtml(u.username)}</h2>
                    <span class="account-tier-badge ${u.isVip ? 'tier-vip' : 'tier-normal'}">Tài khoản ${escapeHtml(u.tier)}</span>
                  </div>
                  <p class="profile-tier-desc">
                    ${u.isVip
                      ? 'Đạo hữu đã cống hiến Linh Thạch cho Vân Thiên Các — hưởng danh hiệu <strong>VIP</strong> vĩnh viễn.'
                      : 'Tài khoản <strong>Thường</strong> (chưa donate). Tặng bất kỳ Linh Thạch nào để thăng cấp <strong>VIP</strong> ngay lập tức.'}
                  </p>
                </div>
                <button class="btn btn-outline btn-sm" type="button" data-action="logout">Đăng xuất</button>
              </div>

              <div class="realm-banner">
                <div class="realm-banner-top">
                  <div>
                    <span class="realm-label">CẢNH GIỚI TU VI HIỆN TẠI (${realm.level}/${realm.total})</span>
                    <strong class="realm-current-name">${escapeHtml(realm.name)}</strong>
                  </div>
                  <div class="realm-pct-box">
                    <strong>${realm.progress}%</strong>
                    <span>${realm.isMax ? 'Đỉnh phong Tiên Đế' : `Còn ${realm.pointsToNext}% lên ${escapeHtml(realm.next)}`}</span>
                  </div>
                </div>
                <div class="realm-progress-track" role="progressbar" aria-valuenow="${realm.progress}" aria-valuemin="0" aria-valuemax="100">
                  <div class="realm-progress-fill" style="width:${realm.progress}%"></div>
                </div>
                <div class="realm-banner-foot">
                  <span>Tổng điểm cống hiến: <strong>${points.toLocaleString('vi-VN')} điểm Linh Thạch</strong></span>
                  <span>Quy tắc: <strong>10 điểm Linh Thạch = 10% · Đạt 100% = +1 Tu Vi</strong></span>
                </div>
              </div>

              <div class="stone-wallet-grid">
                ${STONES.map(s => {
                  const count = u.stones?.[s.key] || 0;
                  return `<div class="stone-wallet-item tone-${s.tone}">
                    <small>${escapeHtml(s.name)}</small>
                    <strong>${count.toLocaleString('vi-VN')} viên</strong>
                    <span>+${s.points}% tu vi / viên</span>
                  </div>`;
                }).join('')}
              </div>
            ` : `
              <div class="profile-guest">
                <div class="section-kicker">TÀI KHOẢN TU TIÊN · KHÔNG CẦN GMAIL</div>
                <h2 class="section-title">Khởi tạo <span>Đạo Hiệu</span> của bạn</h2>
                <p>Chỉ cần tạo tên tài khoản và mật khẩu lưu trực tiếp vào Database. Tài khoản có 2 chế độ:</p>
                <ul class="guest-tier-list">
                  <li><span class="account-tier-badge tier-normal">Thường</span> Tài khoản mới tạo, chưa donate Linh Thạch (khởi đầu ở cảnh giới <strong>Phàm Nhân · 0%</strong>).</li>
                  <li><span class="account-tier-badge tier-vip">VIP</span> Tài khoản đã donate (<strong>Tặng Linh Thạch</strong>) cho website — tích lũy % tu vi đột phá từ <strong>Phàm Nhân</strong> lên <strong>Tiên Đế</strong>.</li>
                </ul>
                <div class="guest-auth-actions">
                  <button class="btn btn-primary" type="button" data-action="open-auth" data-mode="register">Tạo tài khoản ngay</button>
                  <button class="btn btn-outline" type="button" data-action="open-auth" data-mode="login">Đăng nhập tài khoản</button>
                </div>
              </div>
            `}
          </article>

          <!-- Cột phải: Bàn Tặng Linh Thạch (4 Phẩm Cấp) -->
          <article class="cultivate-card donate-card">
            <div class="section-kicker">CỐNG HIẾN CHO WEBSITE · THĂNG CẤP VIP & TU VI</div>
            <h2 class="section-title">Tặng <span>Linh Thạch</span></h2>
            <p class="section-desc">Chọn phẩm cấp Linh Thạch muốn tặng. Ví dụ tặng <strong>10 Hạ Phẩm Linh Thạch = +10% tu vi</strong>; cứ đạt đủ <strong>100%</strong> là đột phá lên 1 cảnh giới mới.</p>

            <form id="donate-form" class="donate-form">
              <div class="stone-tier-grid" role="radiogroup" aria-label="Chọn phẩm cấp Linh Thạch">
                ${STONES.map(s => {
                  const active = s.key === selectedStone.key;
                  return `<button type="button" class="stone-tier-card tone-${s.tone} ${active ? 'active' : ''}" data-action="pick-stone" data-stone="${s.key}" aria-pressed="${active}">
                    <div class="stone-tier-head">
                      <span class="stone-orb" aria-hidden="true"></span>
                      <strong>${escapeHtml(s.name)}</strong>
                    </div>
                    <div class="stone-tier-pts">+${s.points} điểm · +${s.points}% tu vi / viên</div>
                    <p>${escapeHtml(s.desc)}</p>
                  </button>`;
                }).join('')}
              </div>

              <div class="donate-controls-row">
                <label class="auth-field donate-qty-field">
                  <span>Số lượng (${escapeHtml(selectedStone.short)})</span>
                  <input id="donate-qty-input" type="number" min="1" max="100000" step="1" value="${qty}" />
                </label>
                <div class="quick-qty-pills" aria-label="Chọn nhanh số lượng">
                  ${[1, 5, 10, 50, 100].map(n => `<button type="button" class="filter-pill ${qty === n ? 'active' : ''}" data-action="set-donate-qty" data-value="${n}">+${n} viên</button>`).join('')}
                </div>
              </div>

              <label class="auth-field">
                <span>Lời nhắn cống hiến (tùy chọn)</span>
                <input id="donate-note-input" type="text" maxlength="160" placeholder="Ví dụ: Chúc Vân Thiên Các ngày càng hưng thịnh…" />
              </label>

              <div class="donate-preview-box">
                <div>
                  <span>Điểm cống hiến nhận được:</span>
                  <strong>+${gainPoints.toLocaleString('vi-VN')} điểm (+${gainPoints.toLocaleString('vi-VN')}% tu vi)</strong>
                </div>
                <div>
                  <span>Cảnh giới sau khi tặng:</span>
                  <strong>${escapeHtml(previewRealm.name)} (${previewRealm.progress}%)${realmJump > 0 ? ` · Đột phá +${realmJump} cảnh giới!` : ''}</strong>
                </div>
                <div>
                  <span>Chế độ tài khoản:</span>
                  <span class="account-tier-badge tier-vip">VIP</span>
                </div>
              </div>

              <button type="submit" class="btn btn-primary donate-submit-btn">
                ${u ? `Tặng ${qty.toLocaleString('vi-VN')} ${escapeHtml(selectedStone.name)} (+${gainPoints.toLocaleString('vi-VN')}% Tu Vi)` : 'Đăng nhập / Tạo tài khoản để Tặng Linh Thạch'}
              </button>
            </form>
          </article>
        </div>
      </section>

      <!-- Thang 15 Cảnh Giới Tu Vi -->
      <section class="container section">
        ${sectionHeading('CON ĐƯỜNG TU TIÊN · 15 ĐẠI CẢNH GIỚI', 'Thang cảnh giới <span>Tu Vi</span>')}
        <p class="section-desc" style="margin-top:-12px;margin-bottom:18px">Cứ mỗi 100 điểm cống hiến Linh Thạch (100% tu vi) sẽ đột phá lên 1 cảnh giới kế tiếp, từ <strong>Phàm Nhân</strong> đến <strong>Tiên Đế</strong>.</p>
        <div class="realm-ladder-grid">
          ${REALMS.map((rName, idx) => {
            const reqPoints = idx * POINTS_PER_REALM;
            const isCurrent = idx === realm.index;
            const isPassed = idx < realm.index;
            const pct = isPassed ? 100 : (isCurrent ? realm.progress : 0);
            const stateLabel = isPassed ? 'Đã viên mãn' : (isCurrent ? `Đang tu luyện · ${pct}%` : `Cần ${reqPoints.toLocaleString('vi-VN')} điểm`);
            return `<div class="realm-step-card ${isCurrent ? 'is-current' : ''} ${isPassed ? 'is-passed' : ''}">
              <div class="realm-step-top">
                <span class="realm-step-num">Cảnh giới ${idx + 1}</span>
                <span class="realm-step-status">${stateLabel}</span>
              </div>
              <strong class="realm-step-name">${escapeHtml(rName)}</strong>
              <div class="realm-step-bar"><span style="width:${pct}%"></span></div>
            </div>`;
          }).join('')}
        </div>
      </section>

      <!-- Lịch sử tặng Linh Thạch & Phong Thần Bảng VIP -->
      <section class="container section">
        <div class="cultivate-bottom-grid">
          <article class="cultivate-card">
            <div class="section-kicker">NHẬT KÝ CỐNG HIẾN</div>
            <h2 class="section-title" style="font-size:24px;margin-bottom:14px">Lịch sử <span>Tặng Linh Thạch</span></h2>
            ${u && state.donations.length ? `
              <div class="donation-history-list">
                ${state.donations.slice(0, 12).map(d => `<div class="donation-history-row">
                  <div>
                    <strong>${d.quantity.toLocaleString('vi-VN')} × ${escapeHtml(d.stoneName)}</strong>
                    ${d.note ? `<p>${escapeHtml(d.note)}</p>` : ''}
                    <small>${formatDate(d.createdAt)}</small>
                  </div>
                  <span class="donation-pts-badge">+${Number(d.points).toLocaleString('vi-VN')}% Tu Vi</span>
                </div>`).join('')}
              </div>
            ` : `<div class="empty-state"><p>${u ? 'Bạn chưa tặng Linh Thạch lần nào. Hãy tặng Linh Thạch ở khung phía trên để kích hoạt VIP và tăng % Tu Vi.' : 'Đăng nhập tài khoản để xem lịch sử tặng Linh Thạch của bạn.'}</p></div>`}
          </article>

          <article class="cultivate-card">
            <div class="section-kicker">PHONG THẦN BẢNG · ĐẠO HỮU VIP</div>
            <h2 class="section-title" style="font-size:24px;margin-bottom:14px">Bảng xếp hạng <span>Cống Hiến</span></h2>
            ${state.leaders.length ? `
              <div class="leaderboard-list">
                ${state.leaders.map(item => `<div class="leaderboard-row">
                  <span class="leader-rank">#${item.rank}</span>
                  <div class="leader-info">
                    <strong>${escapeHtml(item.username)} <span class="account-tier-badge tier-vip">VIP</span></strong>
                    <small>Cảnh giới: ${escapeHtml(item.realm)}</small>
                  </div>
                  <span class="leader-points">${Number(item.points).toLocaleString('vi-VN')} điểm</span>
                </div>`).join('')}
              </div>
            ` : `<div class="empty-state"><p>Chưa có đạo hữu nào trên Phong Thần Bảng. Hãy là người đầu tiên tặng Linh Thạch để ghi danh VIP!</p></div>`}
          </article>
        </div>
      </section>
    </main>`;
  }

  function statusBadgeHtml(movieId, compact = false) {
    const statusKey = getStatus(movieId);
    if (!statusKey) return '';
    const meta = STATUS_META[statusKey];
    return `<span class="status-pill status-${meta.tone} ${compact ? 'compact' : ''}">${meta.label}</span>`;
  }

  function card(movie) {
    const statusKey = getStatus(movie.id);
    const review = getReview(movie.id);
    const watched = getWatchedEps(movie.id);
    const coverSrc = coverHorizontal(movie);
    const verticalSrc = posterVertical(movie);
    const ratingVal = movieRating(movie);
    const pct = movie.availableEpisodes ? Math.min(100, Math.round((watched.length / movie.availableEpisodes) * 100)) : 0;
    const stateText = statusKey ? STATUS_META[statusKey].label : (movie.status === 'Hoàn thành' ? 'Trọn bộ' : 'Đang cập nhật');

    return `<article class="movie-card">
      <div class="movie-thumb card-art poster-thumb">
        <a href="#/phim/${encodeURIComponent(movie.id)}" aria-label="Chi tiết phim ${escapeHtml(movie.title)}">
          <img loading="lazy" src="${coverSrc}" alt="${escapeHtml(movie.title)}" />
          <span class="card-duration">${epLabel(movie)}</span>
          ${pct > 0 ? `<span class="card-progress" aria-hidden="true"><span style="width:${pct}%"></span></span>` : ''}
        </a>
      </div>
      <div class="card-info">
        <h3 class="card-title"><a href="#/phim/${encodeURIComponent(movie.id)}">${escapeHtml(movie.title)}</a></h3>
        <div class="card-meta">
          <span class="meta-score">${ratingVal}/10</span>
          <span>${movie.year}</span>
          <span>${escapeHtml(stateText)}</span>
          ${review ? `<span class="meta-user-score">Bạn: ${review.rating}/5</span>` : ''}
        </div>
      </div>
      <div class="hover-preview" aria-hidden="true">
        <div class="hover-preview-banner"><img loading="lazy" src="${coverSrc}" alt="" /></div>
        <div class="hover-preview-body">
          <div class="hover-preview-poster"><img loading="lazy" src="${verticalSrc}" alt="" /></div>
          <div class="hover-preview-info">
            <strong>${escapeHtml(movie.title)}</strong>
            <div class="hover-preview-meta"><span>${ratingVal}/10</span><span>${movie.year}</span><span>${escapeHtml(movie.format)}</span></div>
            ${statusKey ? `<div class="hover-preview-status">${statusBadgeHtml(movie.id, true)}</div>` : ''}
            <p>${escapeHtml(movie.description)}</p>
          </div>
        </div>
      </div>
    </article>`;
  }

  function sectionHeading(kicker, heading, actionLabel='', actionHref='') {
    return `<div class="section-header"><div><div class="section-kicker">${escapeHtml(kicker)}</div><h2 class="section-title">${heading}</h2></div>${actionHref ? `<a class="link-more" href="${actionHref}">${escapeHtml(actionLabel)}</a>` : ''}</div>`;
  }

  function continueWatchingSection() {
    const watching = state.movies.filter(m => getStatus(m.id) === 'watching' || getWatchedEps(m.id).length > 0).slice(0, 5);
    if (!watching.length) return '';
    return `<section class="container section">${sectionHeading('HÀNH TRÌNH ĐANG DỞ','Tiếp tục <span>theo dõi</span>','Mở tủ phim','#/yeu-thich?tab=watching')}<div class="movie-grid">${watching.map(card).join('')}</div></section>`;
  }

  function home() {
    title('Phim tu tiên, tiên hiệp');
    const featured = state.movies.find(movie => movie.featured) || state.movies[0];
    if (!featured) return `<main class="main"><div class="container empty-state"><h3>Kho phim hiện đang trống</h3></div></main>`;
    const trending = [featured, ...state.movies.filter(m=>m.id!==featured.id)].slice(0,10);
    const recently = [...state.movies].sort((a,b)=>b.year-a.year || b.availableEpisodes-a.availableEpisodes).slice(0,10);
    const completed = state.movies.filter(m=>m.status === 'Hoàn thành').slice(0,5);
    return `<main class="main">
      ${continueWatchingSection()}
      <section class="container section">${sectionHeading('KHÁM PHÁ THẾ GIỚI TIÊN HIỆP','Tiên phẩm <span>nổi bật</span>','Xem tất cả','#/kho-phim')}<div class="movie-grid">${trending.map(card).join('')}</div></section>
      <div class="container"><div class="divider-line" aria-hidden="true"></div></div>
      <section class="container section">${sectionHeading('LỐI VÀO CÁC BÍ CẢNH','Khám phá <span>thể loại</span>')}<div class="category-band">
        <a class="category-tile" href="#/kho-phim?loc=3d"><span><small>ĐỒ HỌA SỐNG ĐỘNG</small><strong>Hoạt hình tu tiên 3D</strong></span></a>
        <a class="category-tile" href="#/kho-phim?loc=2d"><span><small>PHONG CÁCH CỔ PHONG</small><strong>Hoạt hình 2D</strong></span></a>
        <a class="category-tile" href="#/kho-phim?loc=phim-bo"><span><small>HÀNH TRÌNH DÀI TẬP</small><strong>Phim bộ tiên hiệp</strong></span></a>
      </div></section>
      <section class="container section">${sectionHeading('TIẾP TỤC HÀNH TRÌNH','Mới <span>cập nhật</span>','Vào kho phim','#/kho-phim')}<div class="movie-grid">${recently.map(card).join('')}</div></section>
      <section class="container section">${sectionHeading('THƯỞNG THỨC TRỌN BỘ','Phim <span>hoàn thành</span>','Xem thêm','#/kho-phim?loc=complete')}<div class="movie-grid">${completed.map(card).join('')}</div></section>
    </main>`;
  }

  const filterItems = [
    ['all','Tất cả'],['3d','Hoạt hình 3D'],['2d','Hoạt hình 2D'],['phim-bo','Phim bộ'],['complete','Trọn bộ'],['tu-tien','Tu tiên'],['huyen-huyen','Huyền huyễn']
  ];
  const watchlistTabs = [
    ['all','Tất cả'],
    ['favorites','Yêu thích'],
    ['watching','Đang xem'],
    ['plan','Muốn xem'],
    ['completed','Đã xem'],
    ['dropped','Tạm dừng'],
    ['reviewed','Đã đánh giá'],
  ];

  function sortMovies(list) {
    const arr = [...list];
    if (state.sort === 'name') return arr.sort((a,b)=>a.title.localeCompare(b.title,'vi'));
    if (state.sort === 'rating') return arr.sort((a,b)=>Number(b.rating||0)-Number(a.rating||0) || b.year-a.year);
    if (state.sort === 'episodes') return arr.sort((a,b)=>b.availableEpisodes-a.availableEpisodes);
    return arr.sort((a,b)=>b.year-a.year || b.availableEpisodes-a.availableEpisodes);
  }

  function filteredMovies(source) {
    const filtered = source.filter(movie => {
      if (state.filter === '3d') return movie.format === 'Hoạt hình 3D';
      if (state.filter === '2d') return movie.format === 'Hoạt hình 2D';
      if (state.filter === 'phim-bo') return movie.format === 'Phim bộ';
      if (state.filter === 'complete') return movie.status === 'Hoàn thành';
      if (state.filter === 'tu-tien') return movie.genre.includes('Tu tiên');
      if (state.filter === 'huyen-huyen') return movie.genre.includes('Huyền huyễn');
      return true;
    });
    return sortMovies(filtered);
  }

  function watchlistMovies(tab) {
    const pool = state.movies.filter(movie => {
      if (tab === 'favorites') return isSaved(movie.id);
      if (tab === 'reviewed') return Boolean(getReview(movie.id));
      if (STATUS_META[tab]) return getStatus(movie.id) === tab;
      return isSaved(movie.id) || Boolean(getStatus(movie.id)) || Boolean(getReview(movie.id));
    });
    return sortMovies(pool);
  }

  function collection(route) {
    const favoritesOnly = route.startsWith('/yeu-thich');
    const params = new URLSearchParams(route.split('?')[1] || '');
    if (favoritesOnly) {
      const desiredTab = params.get('tab');
      state.listTab = watchlistTabs.some(([v]) => v === desiredTab) ? desiredTab : 'all';
      const filtered = watchlistMovies(state.listTab);
      const countFav = state.movies.filter(m => isSaved(m.id)).length;
      const countWatching = state.movies.filter(m => getStatus(m.id) === 'watching').length;
      const countPlan = state.movies.filter(m => getStatus(m.id) === 'plan').length;
      const countCompleted = state.movies.filter(m => getStatus(m.id) === 'completed').length;
      const countReviewed = state.movies.filter(m => Boolean(getReview(m.id))).length;
      title('Tủ phim cá nhân');
      return `<main class="main"><section class="inner-hero"><div class="container"><div class="section-kicker">VÂN THIÊN CÁC · THEO DÕI PHIM</div><h1 class="inner-title">Tủ phim cá nhân</h1><div class="breadcrumbs"><a href="#/">Trang chủ</a><span class="crumb-sep" aria-hidden="true">/</span><span>Tủ phim cá nhân</span></div></div></section>
        <section class="container section">
          <div class="watchlist-stats">
            <a class="stat-box ${state.listTab==='favorites'?'active':''}" href="#/yeu-thich?tab=favorites"><strong>${countFav}</strong><span>Yêu thích</span></a>
            <a class="stat-box ${state.listTab==='watching'?'active':''}" href="#/yeu-thich?tab=watching"><strong>${countWatching}</strong><span>Đang xem</span></a>
            <a class="stat-box ${state.listTab==='plan'?'active':''}" href="#/yeu-thich?tab=plan"><strong>${countPlan}</strong><span>Muốn xem</span></a>
            <a class="stat-box ${state.listTab==='completed'?'active':''}" href="#/yeu-thich?tab=completed"><strong>${countCompleted}</strong><span>Đã xem</span></a>
            <a class="stat-box ${state.listTab==='reviewed'?'active':''}" href="#/yeu-thich?tab=reviewed"><strong>${countReviewed}</strong><span>Đánh giá</span></a>
          </div>
          <div class="collection-toolbar">
            <div class="filter-pills" role="tablist" aria-label="Phân loại tủ phim">${watchlistTabs.map(([value,label])=>`<button class="filter-pill ${state.listTab===value?'active':''}" type="button" data-action="list-tab" data-value="${value}" aria-pressed="${state.listTab===value}">${label}</button>`).join('')}</div>
            <select class="sort-select" id="movie-sort" aria-label="Sắp xếp phim"><option value="newest" ${state.sort==='newest'?'selected':''}>Mới cập nhật</option><option value="rating" ${state.sort==='rating'?'selected':''}>Đánh giá cao nhất</option><option value="episodes" ${state.sort==='episodes'?'selected':''}>Nhiều tập nhất</option><option value="name" ${state.sort==='name'?'selected':''}>Tên A – Z</option></select>
          </div>
          <div id="collection-results" class="movie-grid">${filtered.length?filtered.map(card).join(''):`<div class="empty-state"><h3>Chưa có phim trong mục này</h3><p>Mở một bộ phim để đánh dấu <strong>Đang xem / Muốn xem / Đã xem</strong>, lưu yêu thích hoặc viết đánh giá.</p><a href="#/kho-phim" class="btn btn-outline">Khám phá kho phim</a></div>`}</div>
        </section></main>`;
    }

    const desiredFilter = params.get('loc');
    state.filter = filterItems.some(([value])=>value === desiredFilter) ? desiredFilter : 'all';
    const heading = 'Tàng Kinh Các';
    title(heading);
    const filtered = filteredMovies(state.movies);
    return `<main class="main"><section class="inner-hero"><div class="container"><div class="section-kicker">VÂN THIÊN CÁC · KHO TÀNG PHIM</div><h1 class="inner-title">${heading}</h1><div class="breadcrumbs"><a href="#/">Trang chủ</a><span class="crumb-sep" aria-hidden="true">/</span><span>${heading}</span></div></div></section>
      <section class="container section"><div class="collection-toolbar">
        <div class="filter-pills" role="group" aria-label="Lọc thể loại">${filterItems.map(([value,label])=>`<button class="filter-pill ${state.filter===value?'active':''}" type="button" data-action="filter" data-value="${value}" aria-pressed="${state.filter===value}">${label}</button>`).join('')}</div>
        <select class="sort-select" id="movie-sort" aria-label="Sắp xếp phim"><option value="newest" ${state.sort==='newest'?'selected':''}>Mới cập nhật</option><option value="rating" ${state.sort==='rating'?'selected':''}>Đánh giá cao nhất</option><option value="episodes" ${state.sort==='episodes'?'selected':''}>Nhiều tập nhất</option><option value="name" ${state.sort==='name'?'selected':''}>Tên A – Z</option></select>
      </div><div id="collection-results" class="movie-grid">${filtered.length?filtered.map(card).join(''):`<div class="empty-state"><h3>Chưa có phim phù hợp</h3><p>Thử bộ lọc khác hoặc trở về kho phim.</p><a href="#/kho-phim" class="btn btn-outline">Xem kho phim</a></div>`}</div></section></main>`;
  }

  function breadcrumbs(movie) {
    return `<div class="breadcrumbs"><a href="#/">Trang chủ</a><span class="crumb-sep" aria-hidden="true">/</span><a href="#/kho-phim">Kho phim</a><span class="crumb-sep" aria-hidden="true">/</span><span>${escapeHtml(movie.title)}</span></div>`;
  }

  function episodes(movie, current=0) {
    const total = safeCount(movie.availableEpisodes);
    const watched = new Set(getWatchedEps(movie.id));
    return Array.from({length:total},(_,index)=>{
      const episode=index+1;
      const isDone = watched.has(episode);
      return `<a class="episode-link ${current===episode?'current':''} ${isDone?'watched':''}" href="#/xem/${encodeURIComponent(movie.id)}/${episode}" aria-label="Xem tập ${episode}${isDone?' (đã xem)':''}"><span>Tập ${episode}</span>${isDone?'<i class="ep-dot" aria-hidden="true"></i>':''}</a>`;
    }).join('');
  }

  function detailStatusMenu(movie) {
    const current = getStatus(movie.id);
    const currentMeta = current ? STATUS_META[current] : null;
    return `<div class="status-dropdown ${state.statusMenuOpen ? 'open' : ''}">
      <button class="btn btn-outline status-trigger ${current ? `has-status status-${currentMeta.tone}` : ''}" type="button" data-action="toggle-status-menu" aria-expanded="${state.statusMenuOpen}">
        <span>${currentMeta ? currentMeta.label : 'Trạng thái xem'}</span>
      </button>
      <div class="status-menu" role="menu">
        <div class="status-menu-label">Đánh dấu trạng thái</div>
        ${STATUS_KEYS.map(key => {
          const m = STATUS_META[key];
          const active = current === key;
          return `<button type="button" class="status-option ${active ? 'active' : ''}" role="menuitemradio" aria-checked="${active}" data-action="set-status" data-id="${escapeHtml(movie.id)}" data-value="${key}"><span>${m.label}</span>${active ? '<span class="status-active-dot" aria-hidden="true"></span>' : ''}</button>`;
        }).join('')}
        ${current ? `<div class="status-menu-sep"></div><button type="button" class="status-option danger" data-action="clear-status" data-id="${escapeHtml(movie.id)}"><span>Bỏ trạng thái</span></button>` : ''}
      </div>
    </div>`;
  }

  function detailTabContent(movie) {
    const watched = getWatchedEps(movie.id);
    const review = getReview(movie.id);
    const avail = safeCount(movie.availableEpisodes);
    const pct = avail ? Math.min(100, Math.round((watched.length / avail) * 100)) : 0;

    if (state.detailTab === 'reviews') {
      return `<div class="detail-tab-panel">
        <div class="episode-toolbar">
          <div><div class="section-kicker">CẢM NHẬN & CHẤM ĐIỂM</div><h2 class="section-title">Đánh giá <span>của bạn</span></h2></div>
          <button class="btn btn-primary" type="button" data-action="open-review" data-id="${escapeHtml(movie.id)}">${review ? 'Chỉnh sửa đánh giá' : 'Viết đánh giá'}</button>
        </div>
        ${review ? `<article class="user-review-card">
          <div class="user-review-head">
            <div class="user-review-score">Điểm của bạn: <strong>${review.rating}.0 / 5</strong></div>
            <div class="user-review-meta">
              ${review.spoiler ? '<span class="spoiler-tag">Có tiết lộ nội dung</span>' : ''}
              <span>Cập nhật ${formatDate(review.updatedAt)}</span>
            </div>
          </div>
          ${review.text ? `<p class="user-review-body ${review.spoiler ? 'is-spoiler' : ''}" ${review.spoiler ? 'data-action="reveal-spoiler" title="Nhấn để xem nội dung"' : ''}>${escapeHtml(review.text)}</p>` : '<p class="user-review-body muted">Bạn đã chấm điểm phim này mà không kèm bình luận.</p>'}
          <div class="user-review-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="open-review" data-id="${escapeHtml(movie.id)}">Sửa</button>
            <button class="btn btn-ghost btn-sm danger" type="button" data-action="delete-review" data-id="${escapeHtml(movie.id)}">Xóa</button>
          </div>
        </article>` : `<div class="empty-state"><h3>Chưa có đánh giá nào</h3><p>Chấm điểm 1–5 và ghi lại cảm nhận của bạn cho <strong>${escapeHtml(movie.title)}</strong>. Dữ liệu được lưu riêng trên trình duyệt.</p><button class="btn btn-outline" type="button" data-action="open-review" data-id="${escapeHtml(movie.id)}">Chấm điểm ngay</button></div>`}
      </div>`;
    }

    if (state.detailTab === 'info') {
      return `<div class="detail-tab-panel detail-info-grid">
        <figure class="detail-vertical-poster">
          <img src="${posterVertical(movie)}" alt="Poster dọc ${escapeHtml(movie.title)}" loading="lazy" />
          <figcaption>Poster dọc (2:3) · ${escapeHtml(movie.format)}</figcaption>
        </figure>
        <div class="detail-info-meta">
          <div class="section-kicker">HỒ SƠ TÁC PHẨM</div>
          <h2 class="section-title">${escapeHtml(movie.title)}</h2>
          <p class="detail-info-subtitle">“${escapeHtml(movie.subtitle)}”</p>
          <p class="detail-info-desc">${escapeHtml(movie.description)}</p>
          <dl class="detail-facts">
            <div><dt>Định dạng</dt><dd>${escapeHtml(movie.format)}</dd></div>
            <div><dt>Năm phát hành</dt><dd>${movie.year}</dd></div>
            <div><dt>Trạng thái phim</dt><dd>${escapeHtml(movie.status)}</dd></div>
            <div><dt>Điểm đánh giá</dt><dd>${movieRating(movie)} / 10${review ? ` · Bạn chấm ${review.rating}/5` : ''}</dd></div>
            <div><dt>Thể loại</dt><dd>${escapeHtml(movie.genre.join(', '))}</dd></div>
            <div><dt>Tiến độ của bạn</dt><dd>${watched.length}/${avail} tập đã xem (${pct}%)</dd></div>
          </dl>
          <div class="progress-track" aria-label="Tiến độ xem ${pct}%"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
      </div>`;
    }

    return `<div class="detail-tab-panel">
      <div class="episode-toolbar">
        <div><div class="section-kicker">THỨ TỰ HÀNH TRÌNH</div><h2 class="section-title">Danh sách <span>tập phim</span></h2></div>
        <span style="color:var(--muted);font-size:12px">${watched.length}/${avail} tập đã xem · ${avail} tập hiển thị</span>
      </div>
      <div class="episode-list">${episodes(movie)}</div>
    </div>`;
  }

  function detail(movie) {
    title(movie.title);
    const saved = isSaved(movie.id);
    const review = getReview(movie.id);
    const watched = getWatchedEps(movie.id);
    const resumeEp = nextEpisodeFor(movie);
    const related = state.movies.filter(item=>item.id!==movie.id && item.genre.some(genre=>movie.genre.includes(genre))).slice(0,5);

    return `<main class="main"><section class="detail-banner cinematic-detail"><div class="detail-bg" style="background-image:url('${coverHorizontal(movie)}')"></div>
      <div class="container detail-banner-inner"><div class="detail-cover poster-thumb"><img class="detail-poster" src="${coverHorizontal(movie)}" alt="Minh họa ${escapeHtml(movie.title)}" /></div>
      <div class="detail-copy">${breadcrumbs(movie)}
        <div class="detail-kicker-row"><span class="detail-score-badge">Điểm ${movieRating(movie)}/10</span>${statusBadgeHtml(movie.id)}</div>
        <h1>${escapeHtml(movie.title)}</h1>
        <div class="detail-specs"><span>${escapeHtml(movie.format)}</span><span>${movie.year}</span><span>${epLabel(movie)}</span><span>${escapeHtml(movie.status)}</span></div>
        <p>${escapeHtml(movie.description)}</p>
        <div class="detail-genre-row">${movie.genre.map(g => {
          const loc = g === 'Tu tiên' ? '?loc=tu-tien' : g === 'Huyền huyễn' ? '?loc=huyen-huyen' : '';
          return `<a class="genre-chip" href="#/kho-phim${loc}">${escapeHtml(g)}</a>`;
        }).join('')}</div>
        <div class="detail-actions">
          <a class="btn btn-primary" href="#/xem/${encodeURIComponent(movie.id)}/${resumeEp}">${watched.length ? `Tiếp tục tập ${resumeEp}` : 'Xem tập 1'}</a>
          ${detailStatusMenu(movie)}
          <button class="btn btn-outline review-button ${review ? 'has-review' : ''}" type="button" data-action="open-review" data-id="${escapeHtml(movie.id)}">${review ? `Đã chấm ${review.rating}/5` : 'Đánh giá'}</button>
          <button class="btn btn-outline favorite-button ${saved?'is-saved':''}" type="button" data-action="favorite" data-id="${escapeHtml(movie.id)}" aria-pressed="${saved}">${saved?'Đã lưu':'Lưu phim'}</button>
          <button class="btn btn-ghost share-button" type="button" data-action="share" data-id="${escapeHtml(movie.id)}">Chia sẻ</button>
        </div>
      </div></div></section>
      <section class="container section episode-section">
        <div class="detail-tabs" role="tablist" aria-label="Thông tin phim">
          <button class="detail-tab ${state.detailTab==='episodes'?'active':''}" type="button" role="tab" aria-selected="${state.detailTab==='episodes'}" data-action="detail-tab" data-value="episodes">Danh sách tập <em>${safeCount(movie.availableEpisodes)}</em></button>
          <button class="detail-tab ${state.detailTab==='reviews'?'active':''}" type="button" role="tab" aria-selected="${state.detailTab==='reviews'}" data-action="detail-tab" data-value="reviews">Đánh giá & Cảm nhận ${review ? `<em>${review.rating}/5</em>` : ''}</button>
          <button class="detail-tab ${state.detailTab==='info'?'active':''}" type="button" role="tab" aria-selected="${state.detailTab==='info'}" data-action="detail-tab" data-value="info">Thông tin & Poster</button>
        </div>
        ${detailTabContent(movie)}
      </section>
      ${related.length?`<section class="container section">${sectionHeading('CÙNG HỆ TIÊN ĐẠO','Có thể <span>bạn thích</span>')}<div class="movie-grid">${related.map(card).join('')}</div></section>`:''}
    </main>`;
  }

  function watch(movie, episode) {
    title(movie.title,`· Tập ${episode}`);
    const safeEp = Math.max(1, Math.min(episode, safeCount(movie.availableEpisodes)));
    const isEpWatched = getWatchedEps(movie.id).includes(safeEp);
    return `<main class="main"><section class="inner-hero" style="min-height:155px"><div class="container" style="padding-block:31px"><div class="section-kicker">RẠP PHIM · VÂN THIÊN CÁC</div><div class="breadcrumbs"><a href="#/">Trang chủ</a><span class="crumb-sep" aria-hidden="true">/</span><a href="#/phim/${encodeURIComponent(movie.id)}">${escapeHtml(movie.title)}</a><span class="crumb-sep" aria-hidden="true">/</span><span>Tập ${safeEp}</span></div></div></section>
      <div class="container watch-layout"><section class="player-card"><div id="player-frame" class="player-frame">
       <div class="player-placeholder" id="player-placeholder"><h2>Chưa thiết lập nguồn phát</h2><p>Thêm đường dẫn video MP4 hoặc HLS hợp lệ vào <strong>data/movies.json</strong> để phát tập phim này.</p><code>sources["${safeEp}"] = "https://.../video.mp4"</code></div>
      </div><div class="watch-info"><div><h1>${escapeHtml(movie.title)} · Tập ${safeEp}</h1><p>${escapeHtml(movie.genre.join(' / '))} · ${escapeHtml(movie.format)}</p></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-outline ${isEpWatched?'is-saved':''}" type="button" data-action="toggle-watched-ep" data-id="${escapeHtml(movie.id)}" data-value="${safeEp}">${isEpWatched?'Đã xem tập này':'Đánh dấu đã xem'}</button><a class="btn btn-outline" href="#/phim/${encodeURIComponent(movie.id)}">Chi tiết phim</a>${safeEp<movie.availableEpisodes?`<a class="btn btn-primary" href="#/xem/${encodeURIComponent(movie.id)}/${safeEp+1}">Tập tiếp</a>`:''}</div></div></section>
      <aside class="watch-side"><div class="section-kicker">CHỌN TẬP</div><h2>${escapeHtml(movie.title)}</h2><p>${epLabel(movie)} · ${escapeHtml(movie.status)}</p><div class="watch-episodes">${episodes(movie,safeEp)}</div></aside></div>
    </main>`;
  }

  function notFound() {
    title('Không tìm thấy');
    return `<main class="main"><section class="inner-hero"><div class="container"><div class="section-kicker">LẠC BƯỚC GIỮA TIÊN GIỚI</div><h1 class="inner-title">Không tìm thấy trang</h1><a class="btn btn-primary" href="#/">Quay về trang chủ</a></div></section></main>`;
  }

  function closePlayer() {
    if (state.hls) { try{state.hls.destroy()}catch(_){} state.hls=null; }
    if (state.player) {state.player.pause();state.player.src='';state.player=null;}
  }

  function videoUrl(source) {
    if (typeof source !== 'string' || !source.trim()) return null;
    try {
      const url = new URL(source, location.href);
      const sameOrigin = url.origin === location.origin;
      if (url.protocol !== 'https:' && !sameOrigin) return null;
      if (!['https:','http:'].includes(url.protocol)) return null;
      return url.href;
    } catch (_) {return null;}
  }

  function markEpisodeWatched(movieId, ep, silent = false) {
    const movie = movieById(movieId);
    if (!movie) return;
    const set = new Set(getWatchedEps(movieId));
    set.add(ep);
    state.watchedEps[movieId] = [...set].sort((a,b)=>a-b);
    saveStorage(STORAGE_WATCHED_EPS, state.watchedEps);
    if (!getStatus(movieId)) {
      state.statuses[movieId] = set.size >= movie.episodes ? 'completed' : 'watching';
      saveStorage(STORAGE_STATUSES, state.statuses);
    } else if (state.statuses[movieId] === 'watching' && set.size >= movie.episodes) {
      state.statuses[movieId] = 'completed';
      saveStorage(STORAGE_STATUSES, state.statuses);
    }
    if (!silent) showToast(`Đã đánh dấu xem xong Tập ${ep}`);
  }

  function toggleEpisodeWatched(movieId, ep) {
    const set = new Set(getWatchedEps(movieId));
    if (set.has(ep)) {
      set.delete(ep);
      state.watchedEps[movieId] = [...set].sort((a,b)=>a-b);
      saveStorage(STORAGE_WATCHED_EPS, state.watchedEps);
      showToast(`Đã bỏ đánh dấu Tập ${ep}`);
    } else {
      markEpisodeWatched(movieId, ep, false);
    }
    render(false);
  }

  function mountPlayer(movie, episode) {
    const frame = document.getElementById('player-frame');
    if (!frame) return;
    const source = movie.sources?.[String(episode)];
    const uri = videoUrl(source);
    if (!uri) return;
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('controlslist','nodownload');
    video.setAttribute('aria-label',`${movie.title} tập ${episode}`);
    frame.replaceChildren(video);
    state.player = video;
    const progressKey = `${movie.id}:${episode}`;
    video.addEventListener('loadedmetadata', () => {
      const resume = Number(state.progress[progressKey] || 0);
      if (resume > 15 && Number.isFinite(video.duration) && resume < video.duration-15) video.currentTime=resume;
    });
    let lastWritten=0;
    video.addEventListener('timeupdate', () => {
      if (Date.now()-lastWritten<5000) return;
      lastWritten=Date.now();
      state.progress[progressKey]=Math.floor(video.currentTime);
      saveStorage(STORAGE_PROGRESS,state.progress);
    });
    video.addEventListener('ended',()=>{
      delete state.progress[progressKey];
      saveStorage(STORAGE_PROGRESS,state.progress);
      markEpisodeWatched(movie.id, episode, true);
    });
    video.addEventListener('error',()=>showVideoError('Không phát được nguồn video. Hãy kiểm tra URL, CORS, codec hoặc chứng chỉ HTTPS.'));

    if (!/\.m3u8(?:$|[?#])/i.test(uri)) { video.src=uri;return; }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {video.src=uri;return;}
    loadHlsLibrary().then(() => {
      if (state.player!==video) return;
      if (!window.Hls?.isSupported()) {showVideoError('Trình duyệt không hỗ trợ HLS.');return;}
      const hls = new window.Hls({enableWorker:true});
      state.hls=hls;
      hls.loadSource(uri);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.ERROR,(_,data)=>{
        if (data.fatal) showVideoError('Luồng HLS gặp lỗi. Kiểm tra CORS và URL playlist.');
      });
    }).catch(()=>showVideoError('Không tải được thư viện HLS.js. Kiểm tra kết nối hoặc sử dụng MP4.'));
  }
  function showVideoError(message) {
    const frame=document.getElementById('player-frame');
    if (!frame) return;
    const note=document.createElement('div');note.className='player-placeholder';
    note.innerHTML=`<h2>Lỗi nguồn phát</h2><p>${escapeHtml(message)}</p>`;
    closePlayer();frame.replaceChildren(note);
  }
  function loadHlsLibrary() {
    if (window.Hls) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';
      script.onload=resolve;script.onerror=reject;
      document.head.appendChild(script);
    });
  }

  let lastDetailSlug = null;
  function render(scroll=true) {
    closePlayer();
    const route=activeRoute();
    const pathname=route.split('?')[0];
    // Keep the flying crane and backdrop across site navigation; hide during video playback.
    const isWatching = pathname.startsWith('/xem/');
    document.body.classList.toggle('is-watching', isWatching);
    let content=''; let activeId=null; let ep=0;
    if (pathname==='/') content=home();
    else if (pathname==='/kho-phim'||pathname==='/yeu-thich') content=collection(route);
    else if (pathname==='/tu-luyen') content=cultivationPage();
    else if (/^\/phim\/[a-z0-9-]+$/.test(pathname)) {
      const slug = pathname.split('/')[2];
      if (slug !== lastDetailSlug) { state.detailTab = 'episodes'; state.statusMenuOpen = false; lastDetailSlug = slug; }
      const movie=movieById(slug);
      content=movie?detail(movie):notFound();
    }
    else if (/^\/xem\/[a-z0-9-]+\/\d+$/.test(pathname)) {
      const [, , slug, epText]=pathname.split('/');
      const movie=movieById(slug);ep=Number(epText);
      if (movie&&ep>=1&&ep<=movie.availableEpisodes){
        markEpisodeWatched(movie.id, ep, true);
        content=watch(movie,ep);activeId=slug;
      } else content=notFound();
    }
    else content=notFound();
    app.innerHTML = state.partials.header + content + state.partials.footer;
    syncHeader(route);
    if (activeId) mountPlayer(movieById(activeId),ep);
    if (scroll) {
      window.scrollTo({top:0,behavior:'instant'});
      syncCraneScroll();
    }
  }

  let lastCraneScrollY = Math.max(0, window.scrollY || 0);
  function postToCrane(payload) {
    const iframe = document.querySelector('iframe.sky-crane');
    if (iframe && iframe.contentWindow) {
      try { iframe.contentWindow.postMessage(payload, location.origin); } catch (_) {}
    }
  }
  function getScrollMax() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }
  function syncCraneScroll() {
    const maxScroll = getScrollMax();
    const clampedY = Math.max(0, Math.min(window.scrollY || 0, maxScroll));
    lastCraneScrollY = clampedY;
    postToCrane({ type: 'vtc-scroll-sync', scrollY: clampedY, scrollMax: maxScroll });
  }
  window.addEventListener('scroll', () => {
    const maxScroll = getScrollMax();
    const clampedY = Math.max(0, Math.min(window.scrollY || 0, maxScroll));
    const deltaY = clampedY - lastCraneScrollY;
    lastCraneScrollY = clampedY;
    if (Math.abs(deltaY) < 1.5) return;
    postToCrane({ type: 'vtc-scroll', scrollY: clampedY, scrollMax: maxScroll, deltaY });
  }, { passive: true });
  window.addEventListener('wheel', event => {
    if (document.body.classList.contains('no-scroll')) return;
    if (!event.deltaY || Math.abs(event.deltaY) < 4) return;
    const maxScroll = getScrollMax();
    const clampedY = Math.max(0, Math.min(window.scrollY || 0, maxScroll));
    postToCrane({ type: 'vtc-scroll', scrollY: clampedY, scrollMax: maxScroll, deltaY: event.deltaY * 0.4 });
  }, { passive: true });
  document.querySelector('iframe.sky-crane')?.addEventListener('load', syncCraneScroll);

  function toggleFavorite(id) {
    const movie = movieById(id);
    if (!movie) return;
    if (isSaved(id)) {
      state.favorites = state.favorites.filter(item=>item!==id);
      showToast(`Đã bỏ lưu "${movie.title}"`);
    } else {
      state.favorites = [...state.favorites,id];
      showToast(`Đã lưu "${movie.title}" vào tủ phim`);
    }
    saveStorage(STORAGE_FAVORITES,state.favorites);
    render(false);
  }

  function setStatus(id, statusKey) {
    const movie = movieById(id);
    if (!movie || !STATUS_META[statusKey]) return;
    state.statuses[id] = statusKey;
    saveStorage(STORAGE_STATUSES, state.statuses);
    state.statusMenuOpen = false;
    showToast(`"${movie.title}" — ${STATUS_META[statusKey].label}`);
    render(false);
  }

  function clearStatus(id) {
    const movie = movieById(id);
    if (!movie) return;
    delete state.statuses[id];
    saveStorage(STORAGE_STATUSES, state.statuses);
    state.statusMenuOpen = false;
    showToast(`Đã xóa trạng thái của "${movie.title}"`);
    render(false);
  }

  function openReviewModal(id) {
    const movie = movieById(id);
    if (!movie) return;
    closeReviewModal();
    const existing = getReview(id);
    state.reviewDraftRating = existing ? existing.rating : 5;
    document.body.insertAdjacentHTML('beforeend', `<div class="search-modal" id="review-modal" role="dialog" aria-modal="true" aria-label="Đánh giá phim" data-action="close-review">
      <div class="search-panel review-panel" data-action="none">
        <div class="review-modal-head">
          <div><div class="section-kicker">ĐÁNH GIÁ PHIM</div><h3>${escapeHtml(movie.title)}</h3></div>
          <button class="icon-btn" type="button" data-action="close-review" aria-label="Đóng">${icon('close')}</button>
        </div>
        <form id="review-form" class="review-form" data-id="${escapeHtml(movie.id)}">
          <div class="score-picker" role="radiogroup" aria-label="Chọn điểm đánh giá">
            ${[1,2,3,4,5].map(n => `<button type="button" class="score-pick-btn ${n <= state.reviewDraftRating ? 'active' : ''}" data-action="pick-star" data-value="${n}" aria-label="${n} điểm">${n}</button>`).join('')}
            <span class="star-pick-label" id="star-pick-label">${state.reviewDraftRating} / 5 điểm</span>
          </div>
          <textarea id="review-text" rows="4" maxlength="600" placeholder="Chia sẻ cảm nhận của bạn về bộ phim này (không bắt buộc)…">${escapeHtml(existing?.text || '')}</textarea>
          <label class="spoiler-checkbox"><input type="checkbox" id="review-spoiler" ${existing?.spoiler ? 'checked' : ''} /><span>Đánh dấu có tiết lộ nội dung (Spoiler)</span></label>
          <div class="review-modal-footer">
            ${existing ? `<button type="button" class="btn btn-ghost danger" data-action="delete-review" data-id="${escapeHtml(movie.id)}">Xóa đánh giá</button>` : '<span></span>'}
            <div style="display:flex;gap:10px">
              <button type="button" class="btn btn-outline" data-action="close-review">Hủy</button>
              <button type="submit" class="btn btn-primary">Lưu đánh giá</button>
            </div>
          </div>
        </form>
      </div>
    </div>`);
    document.body.classList.add('no-scroll');
    document.getElementById('review-text')?.focus();
  }

  function closeReviewModal() {
    const modal = document.getElementById('review-modal');
    if (!modal) return;
    modal.remove();
    if (!document.getElementById('search-modal')) document.body.classList.remove('no-scroll');
  }

  function deleteReview(id) {
    const movie = movieById(id);
    if (!movie) return;
    delete state.reviews[id];
    saveStorage(STORAGE_REVIEWS, state.reviews);
    closeReviewModal();
    showToast(`Đã xóa đánh giá cho "${movie.title}"`);
    render(false);
  }

  async function shareMovie(id) {
    const movie = movieById(id);
    if (!movie) return;
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${movie.title} | Vân Thiên Các`, text: movie.subtitle, url }); return; }
      catch (_) { /* fall back to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Đã sao chép liên kết phim vào bộ nhớ tạm');
    } catch (_) {
      showToast('Hãy sao chép URL trên thanh địa chỉ trình duyệt');
    }
  }

  const QUICK_COMMANDS = [
    { label: 'Trang chủ Vân Thiên Các', hint: 'Điều hướng', href: '#/' },
    { label: 'Tàng Kinh Các (Kho phim)', hint: 'Tất cả phim', href: '#/kho-phim' },
    { label: 'Tủ phim cá nhân', hint: 'Đang xem · Yêu thích · Đánh giá', href: '#/yeu-thich' },
    { label: 'Tu luyện & Tặng Linh Thạch (VIP)', hint: 'Tài khoản · 15 cảnh giới Tu Vi', href: '#/tu-luyen' },
    { label: 'Hoạt hình tu tiên 3D', hint: 'Bộ lọc nhanh', href: '#/kho-phim?loc=3d' },
    { label: 'Phim đã hoàn thành (Trọn bộ)', hint: 'Bộ lọc nhanh', href: '#/kho-phim?loc=complete' },
  ];

  function searchResults(query) {
    const norm = query.trim().toLocaleLowerCase('vi');
    const matches = state.movies.filter(movie =>
      !norm || `${movie.title} ${movie.subtitle} ${movie.genre.join(' ')} ${movie.format} ${movie.description}`.toLocaleLowerCase('vi').includes(norm)
    ).slice(0, 7);
    const cmds = norm ? QUICK_COMMANDS.filter(c => `${c.label} ${c.hint}`.toLocaleLowerCase('vi').includes(norm)) : QUICK_COMMANDS.slice(0, 3);
    if (!matches.length && !cmds.length) return `<div class="search-empty">Không tìm thấy phim hay lối tắt phù hợp. Thử từ khóa khác.</div>`;
    let idx = 0;
    let html = '';
    if (matches.length) {
      html += `<div class="search-group-label">Phim (${matches.length})</div>`;
      html += matches.map(movie => {
        const st = getStatus(movie.id);
        const active = idx === state.searchIndex ? 'active' : '';
        const item = `<a class="search-item ${active}" data-cmd-idx="${idx}" href="#/phim/${encodeURIComponent(movie.id)}"><img src="${coverHorizontal(movie)}" alt="" loading="lazy"><span class="search-item-copy"><strong>${escapeHtml(movie.title)}</strong><small>${movieRating(movie)} · ${escapeHtml(movie.genre.join(' · '))} · ${epLabel(movie)}</small></span>${st ? `<span class="search-item-badge">${STATUS_META[st].label}</span>` : ''}</a>`;
        idx++;
        return item;
      }).join('');
    }
    if (cmds.length) {
      html += `<div class="search-group-label">Lối tắt nhanh</div>`;
      html += cmds.map(c => {
        const active = idx === state.searchIndex ? 'active' : '';
        const item = `<a class="search-item search-cmd ${active}" data-cmd-idx="${idx}" href="${c.href}"><span class="search-item-copy"><strong>${escapeHtml(c.label)}</strong><small>${escapeHtml(c.hint)}</small></span></a>`;
        idx++;
        return item;
      }).join('');
    }
    return html;
  }

  function updateSearchHighlight() {
    const items = [...document.querySelectorAll('#search-results .search-item')];
    if (!items.length) return;
    state.searchIndex = ((state.searchIndex % items.length) + items.length) % items.length;
    items.forEach((el, i) => {
      const on = i === state.searchIndex;
      el.classList.toggle('active', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function closeSearch() {
    const modal=document.getElementById('search-modal');
    if (!modal) return;
    modal.remove();
    if (!document.getElementById('review-modal')) document.body.classList.remove('no-scroll');
  }
  function openSearch() {
    if (document.getElementById('search-modal')) return;
    closeReviewModal();
    state.searchIndex = 0;
    document.body.insertAdjacentHTML('beforeend',`<div class="search-modal" id="search-modal" role="dialog" aria-modal="true" aria-label="Tìm kiếm phim" data-action="overlay"><div class="search-panel" data-action="none"><div class="search-bar">${icon('search')}<input id="search-input" type="search" autocomplete="off" placeholder="Tìm tên phim, thể loại hoặc lối tắt…" aria-label="Nhập tên phim"><button class="icon-btn" data-action="close-search" aria-label="Đóng tìm kiếm">${icon('close')}</button></div><div class="search-results" id="search-results">${searchResults('')}</div><div class="search-hint">Phím mũi tên để chọn · Enter để mở · ESC để đóng</div></div></div>`);
    document.body.classList.add('no-scroll');
    document.getElementById('search-input')?.focus();
  }

  document.addEventListener('click', event => {
    const insideStatus = event.target.closest('.status-dropdown');
    if (!insideStatus && state.statusMenuOpen) {
      state.statusMenuOpen = false;
      document.querySelectorAll('.status-dropdown.open').forEach(el => el.classList.remove('open'));
    }

    const target=event.target.closest('[data-action]');
    if (!target) return;
    const {action,id,value,mode,stone}=target.dataset;
    if (action==='none') return;
    if (action==='favorite') {toggleFavorite(id);return;}
    if (action==='search') {openSearch();return;}
    if (action==='close-search'||action==='overlay') {closeSearch();return;}
    if (action==='open-auth') {openAuthModal(mode || 'login');return;}
    if (action==='close-auth') {closeAuthModal();return;}
    if (action==='switch-auth-mode') {openAuthModal(mode || 'login');return;}
    if (action==='logout') {
      apiRequest('POST', '/api/auth/logout').then(() => refreshAccountState()).then(() => {
        showToast('Đã đăng xuất tài khoản');
        render(false);
      });
      return;
    }
    if (action==='pick-stone') {
      if (STONE_BY_KEY[stone]) {
        state.selectedStone = stone;
        const qInput = document.getElementById('donate-qty-input');
        if (qInput) state.donateQty = Math.max(1, Number(qInput.value) || 10);
        render(false);
      }
      return;
    }
    if (action==='set-donate-qty') {
      state.donateQty = Math.max(1, Number(value) || 10);
      render(false);
      return;
    }
    if (action==='toggle-status-menu') {
      state.statusMenuOpen = !state.statusMenuOpen;
      const dd = target.closest('.status-dropdown');
      if (dd) dd.classList.toggle('open', state.statusMenuOpen);
      target.setAttribute('aria-expanded', String(state.statusMenuOpen));
      return;
    }
    if (action==='set-status') {setStatus(id, value);return;}
    if (action==='clear-status') {clearStatus(id);return;}
    if (action==='open-review') {openReviewModal(id);return;}
    if (action==='close-review') {closeReviewModal();return;}
    if (action==='delete-review') {deleteReview(id);return;}
    if (action==='pick-star') {
      const n = Number(value);
      if (n >= 1 && n <= 5) {
        state.reviewDraftRating = n;
        document.querySelectorAll('.score-pick-btn').forEach(btn => {
          btn.classList.toggle('active', Number(btn.dataset.value) <= n);
        });
        const lbl = document.getElementById('star-pick-label');
        if (lbl) lbl.textContent = `${n} / 5 điểm`;
      }
      return;
    }
    if (action==='reveal-spoiler') {target.classList.remove('is-spoiler');return;}
    if (action==='share') {shareMovie(id);return;}
    if (action==='detail-tab') {state.detailTab = value;render(false);return;}
    if (action==='toggle-watched-ep') {toggleEpisodeWatched(id, Number(value));return;}
    if (action==='list-tab') {
      const href = value === 'all' ? '#/yeu-thich' : `#/yeu-thich?tab=${encodeURIComponent(value)}`;
      if (location.hash === href) render(false);
      else location.hash = href;
      return;
    }
    if (action==='menu') {
      const menu=document.getElementById('mobile-nav');
      if (!menu) return;
      menu.hidden=!menu.hidden;target.setAttribute('aria-expanded',String(!menu.hidden));return;
    }
    if (action==='filter') {
      const href=value==='all' ? '#/kho-phim' : `#/kho-phim?loc=${encodeURIComponent(value)}`;
      if (location.hash===href) render(false);
      else location.hash=href;
      return;
    }
  });

  document.addEventListener('submit', async event => {
    if (event.target.id === 'auth-form') {
      event.preventDefault();
      const username = (document.getElementById('auth-username')?.value || '').trim();
      const password = document.getElementById('auth-password')?.value || '';
      const endpoint = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      try {
        await apiRequest('POST', endpoint, { username, password });
        await refreshAccountState();
        closeAuthModal();
        showToast(state.authMode === 'register'
          ? `Đã tạo tài khoản "${username}" (Cảnh giới Phàm Nhân · Thường)`
          : `Chào mừng đạo hữu "${username}" trở lại Vân Thiên Các!`);
        render(false);
      } catch (err) {
        showToast(err.message || 'Không thể xác thực tài khoản');
      }
      return;
    }
    if (event.target.id === 'donate-form') {
      event.preventDefault();
      if (!state.user) {
        openAuthModal('register');
        showToast('Hãy tạo tài khoản hoặc đăng nhập trước khi tặng Linh Thạch');
        return;
      }
      const qInput = document.getElementById('donate-qty-input');
      const noteInput = document.getElementById('donate-note-input');
      const quantity = Math.max(1, Math.min(100000, Math.floor(Number(qInput?.value || state.donateQty) || 1)));
      const note = (noteInput?.value || '').trim();
      const stoneMeta = STONE_BY_KEY[state.selectedStone] || STONES[0];
      const prevRealm = state.user.realm || computeRealm(state.user.points);
      try {
        await apiRequest('POST', '/api/donations', {
          stone: stoneMeta.key,
          quantity,
          note,
        });
        await refreshAccountState();
        const newRealm = state.user?.realm || computeRealm(state.user?.points);
        if (newRealm.index > prevRealm.index) {
          showToast(`Đột phá thành công lên cảnh giới ${newRealm.name} (${newRealm.progress}%) · Tài khoản VIP!`);
        } else {
          showToast(`Đã tặng ${quantity} ${stoneMeta.name} (+${quantity * stoneMeta.points}% Tu Vi) · Tài khoản VIP!`);
        }
        render(false);
      } catch (err) {
        showToast(err.message || 'Không thể ghi nhận Linh Thạch');
      }
      return;
    }
    if (event.target.id !== 'review-form') return;
    event.preventDefault();
    const id = event.target.dataset.id;
    const movie = movieById(id);
    if (!movie) return;
    const text = (document.getElementById('review-text')?.value || '').trim().slice(0, 600);
    const spoiler = Boolean(document.getElementById('review-spoiler')?.checked);
    state.reviews[id] = { rating: state.reviewDraftRating || 5, text, spoiler, updatedAt: Date.now() };
    saveStorage(STORAGE_REVIEWS, state.reviews);
    closeReviewModal();
    state.detailTab = 'reviews';
    showToast(`Đã lưu đánh giá ${state.reviewDraftRating}/5 điểm cho "${movie.title}"`);
    render(false);
  });

  document.addEventListener('input', event => {
    if (event.target.id==='search-input') {
      state.searchIndex = 0;
      document.getElementById('search-results').innerHTML=searchResults(event.target.value);
    }
    if (event.target.id==='donate-qty-input') {
      const n = Math.max(1, Math.min(100000, Math.floor(Number(event.target.value) || 1)));
      state.donateQty = n;
    }
  });
  document.addEventListener('change',event => {
    if (event.target.id==='movie-sort') {state.sort=event.target.value;render(false);}
    if (event.target.id==='donate-qty-input') {render(false);}
  });
  document.addEventListener('keydown',event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (document.getElementById('search-modal')) closeSearch();
      else openSearch();
      return;
    }
    if (event.key==='Escape') {closeSearch();closeReviewModal();closeAuthModal();return;}
    if (document.getElementById('search-modal')) {
      if (event.key==='ArrowDown') {event.preventDefault();state.searchIndex++;updateSearchHighlight();return;}
      if (event.key==='ArrowUp') {event.preventDefault();state.searchIndex--;updateSearchHighlight();return;}
      if (event.key==='Enter') {
        const active = document.querySelector('#search-results .search-item.active');
        if (active) {event.preventDefault();location.hash = active.getAttribute('href');closeSearch();}
        return;
      }
    }
    if (event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {event.preventDefault();openSearch();}
  });
  window.addEventListener('hashchange',()=>{closeSearch();closeReviewModal();closeAuthModal();state.statusMenuOpen=false;render(true);});
  window.addEventListener('pagehide',closePlayer);

  async function init() {
    try {
      const [response] = await Promise.all([
        fetch('./data/movies.json',{cache:'no-cache'}),
        loadLayoutPartials(),
        refreshAccountState(),
      ]);
      if (!response.ok) throw new Error(`HTTP ${response.status} khi tải data/movies.json`);
      const result=await response.json();
      if (!Array.isArray(result)) throw new Error('data/movies.json phải là một mảng phim.');
      const slugs=new Set();
      state.movies=result.filter(movie=>{
        if (!movie||typeof movie!=='object') return false;
        if (typeof movie.id!=='string'||!(/^[a-z0-9-]+$/).test(movie.id)||slugs.has(movie.id)) return false;
        if (typeof movie.title!=='string'||!Array.isArray(movie.genre)||!Number.isInteger(movie.availableEpisodes)) return false;
        slugs.add(movie.id);
        movie.sources=movie.sources&&typeof movie.sources==='object'?movie.sources:{};
        return true;
      });
      render(false);
    } catch (error) {
      app.innerHTML=`<main class="error-panel"><h2>Không tải được dữ liệu website</h2><p>Hãy chạy bằng HTTP server, không mở file HTML trực tiếp bằng file://.</p><pre>${escapeHtml(error.message)}</pre><code>python3 -m http.server 8081 --bind 0.0.0.0</code></main>`;
      console.error('Vân Thiên Các:',error);
    }
  }
  init();
})();
