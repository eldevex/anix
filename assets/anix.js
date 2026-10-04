/* ==========================================================================
   AnixWeb — клиент. Запросы идут напрямую из браузера к API Anixart;
   через серверный прокси идёт ТОЛЬКО создание комментариев (там нужен User-Agent,
   который браузер подставить не может). Токен хранится только в localStorage.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = {
    BASE: 'https://api-s.anixsekai.com',
    VERSION_CODE: '25082901',
    STATIC_FALLBACK: 'https://s.anixmirai.com',
    IFRAME: 'https://anixmirai.com/iframe?url=',
    UA: 'AnixartApp/9.0 BETA (Android 13; SDK 33)',
    PROXY: ''   /* задаётся пользователем в Настройках (getProxy) */
  };

  var WEEK = [['monday', 'Понедельник'], ['tuesday', 'Вторник'], ['wednesday', 'Среда'],
              ['thursday', 'Четверг'], ['friday', 'Пятница'], ['saturday', 'Суббота'], ['sunday', 'Воскресенье']];

  var LIST_MAP = { watch: 1, plan: 2, completed: 3, hold: 4, dropped: 5 };
  var LIST_NAMES = { favorites: 'Избранное', watching: 'Смотрю', planned: 'В планах',
                     completed: 'Просмотрено', hold: 'Отложено', dropped: 'Брошено' };

  var GENRES = ["Экшен","Комедия","Драма","Фэнтези","Фантастика","Романтика","Приключения","Ужасы","Триллер","Тайна",
    "Спорт","Сёнен","Сёдзё","Повседневность","Исэкай","Меха","Музыка","Школа","Сверхъестественное","Этти",
    "Боевые искусства","Вампиры","Военное","Гарем","Детектив","Исторический","Гурман","Махо-сёдзё","Мифология","Психологическое",
    "Работа","Самураи","Сёдзё-ай","Сёнен-ай","Сэйнэн","Дзёсей"];

  /* -------------------------- хранилище -------------------------- */
  function stGet(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
  function stSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function stDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var Auth = {
    token: function () { return stGet('anix_token', '') || ''; },
    profile: function () { return stGet('anix_profile', null); },
    isAuth: function () { return !!Auth.token(); },
    set: function (t, p) { stSet('anix_token', t); if (p) stSet('anix_profile', p); },
    clear: function () { stDel('anix_token'); stDel('anix_profile'); }
  };

  /* --------------------------- прокси ---------------------------- */
  /* Прокси нужен ТОЛЬКО для создания комментариев: API проверяет User-Agent,
     который браузер подставить не может. Путь задаётся в Настройках. */
  function getProxy() { var u = String(stGet('anix_proxy', '') || '').trim(); return u || String(CFG.PROXY || '').trim(); }
  function setProxy(u) {
    u = String(u == null ? '' : u).trim();
    if (u) stSet('anix_proxy', u); else stDel('anix_proxy');
    return getProxy();
  }

  /* --------------------------- ошибки ---------------------------- */
  function AuthError(msg) { this.name = 'AuthError'; this.message = msg; }
  AuthError.prototype = Object.create(Error.prototype);

  /* ----------------------------- API ----------------------------- */
  function buildUrl(path, query) {
    var q = [], t = Auth.token(), k;
    if (t) q.push('token=' + encodeURIComponent(t));
    if (query) {
      for (k in query) {
        if (query[k] === undefined || query[k] === null || query[k] === '') continue;
        q.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k]));
      }
    }
    return path + (q.length ? '?' + q.join('&') : '');
  }

  /* Только эти пути требуют прокси (создание комментариев: API проверяет User-Agent,
     который браузер подставить не может). Всё остальное — напрямую. */
  function NEED_PROXY(path) {
    return /^\/release\/comment\/add\//.test(path)
        || /^\/collection\/comment\/add\//.test(path)
        || /^\/article\/comment\/add\//.test(path);
  }

  async function req(method, path, opt) {
    opt = opt || {};
    var fullPath = buildUrl(path, opt.query);
    var proxy = getProxy();
    var needP = NEED_PROXY(path);
    if (needP && !proxy) throw new Error('Комментирование недоступно: не настроен прокси-сервер. Укажите его в Настройках.');
    var viaProxy = needP && !!proxy;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (ctrl) { timer = setTimeout(function () { ctrl.abort(); }, opt.ms || 25000); }

    var res, txt;
    try {
      if (viaProxy) {
        var payload = { method: method, path: fullPath };
        if (opt.form !== undefined) payload.form = opt.form;
        else if (opt.body !== undefined) payload.body = opt.body;
        if (opt.apiV2) payload.apiV2 = true;
        /* text/plain = простой запрос, без preflight OPTIONS (иначе CORS ломается)
           proxy.php всё равно читает php://input и парсит JSON. */
        var popt = {
          method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(payload)
        };
        if (ctrl) popt.signal = ctrl.signal;
        res = await fetch(proxy, popt);
      } else {
        var init = {
          method: method, mode: 'cors', credentials: 'omit', cache: 'no-store',
          headers: { 'Accept': 'application/json' }
        };
        if (opt.form !== undefined) {
          init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
          var fp = [];
          for (var fk in opt.form) {
            if (opt.form[fk] === undefined || opt.form[fk] === null) continue;
            fp.push(encodeURIComponent(fk) + '=' + encodeURIComponent(opt.form[fk]));
          }
          init.body = fp.join('&');
        } else if (opt.body !== undefined) {
          init.headers['Content-Type'] = 'application/json';
          init.body = JSON.stringify(opt.body);
          if (opt.apiV2) init.headers['Api-Version'] = 'v2';
        }
        if (ctrl) init.signal = ctrl.signal;
        res = await fetch(CFG.BASE + fullPath, init);
      }
      txt = await res.text();
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Anixart не ответил за ' + Math.round((opt.ms || 25000) / 1000) + ' с');
      throw new Error('Сеть недоступна: ' + (e && e.message ? e.message : e));
    } finally {
      if (timer) clearTimeout(timer);
    }

    var data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }

    if (res.status === 401 && Auth.token()) {
      Auth.clear();
      throw new AuthError('Сессия Anixart истекла. Войдите заново.');
    }
    if (data === null) {
      if (res.ok) return {};
      throw new Error('Anixart вернул некорректный ответ (HTTP ' + res.status + ')');
    }
    return data;
  }

  var api = {
    /* ===================== config ===================== */
    toggles: function () { return req('GET', '/config/toggles', { query: { version_code: CFG.VERSION_CODE, is_beta: 'true' } }); },
    urls: function () { return req('GET', '/config/urls', { query: { is_beta: 'true' } }); },

    /* ===================== auth ===================== */
    signIn: function (login, password) { return req('POST', '/auth/signIn', { form: { login: login, password: password } }); },
    signUp: function (email, login, password) { return req('POST', '/auth/signUp', { form: { email: email, login: login, password: password } }); },
    verify: function (email, login, password, hash, code) { return req('POST', '/auth/verify', { form: { email: email, login: login, password: password, hash: hash, code: code } }); },
    restore: function (body) { return req('POST', '/auth/restore', { body: body }); },
    restoreVerify: function (body) { return req('POST', '/auth/restore/verify', { body: body }); },

    /* ===================== release ===================== */
    release: function (id) { return req('GET', '/release/' + id, { query: { extended_mode: 'true' } }); },
    random: function () { return req('GET', '/release/random', { query: { extended_mode: 'true' } }); },
    related: function (id, page) { return req('GET', '/related/' + id + '/' + (page || 0)); },
    streamingPlatforms: function (id) { return req('GET', '/release/streaming/platform/' + id); },
    releaseVideos: function (id) { return req('GET', '/video/release/' + id); },
    releaseVideosCategory: function (id, category, page) { return req('GET', '/video/release/' + id + '/category/' + category + '/' + (page || 0)); },
    voteAdd: function (id, vote) { return req('GET', '/release/vote/add/' + id + '/' + vote); },
    voteDelete: function (id) { return req('GET', '/release/vote/delete/' + id); },

    /* ===================== favorites & lists ===================== */
    favorites: function (page) { return req('GET', '/favorite/all/' + (page || 0), { query: { sort: 1, filter_announce: 0 } }); },
    favoriteAdd: function (id) { return req('GET', '/favorite/add/' + id); },
    favoriteDelete: function (id) { return req('GET', '/favorite/delete/' + id); },
    listAdd: function (list, id) { return req('GET', '/profile/list/add/' + list + '/' + id); },
    listDelete: function (list, id) { return req('GET', '/profile/list/delete/' + list + '/' + id); },
    listAll: function (lid, page) { return req('GET', '/profile/list/all/' + lid + '/' + (page || 0), { query: { sort: 1, filter_announce: 0 } }); },

    /* ===================== search ===================== */
    search: function (q, page) { return req('POST', '/search/releases/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchProfiles: function (q, page) { return req('POST', '/search/profiles/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchCollections: function (q, page) { return req('POST', '/search/collections/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchFavoriteCollections: function (q, page) { return req('POST', '/search/favoriteCollections/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchProfileCollections: function (q, page) { return req('POST', '/search/profileCollections/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchFavorites: function (q, page) { return req('POST', '/search/favorites/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchHistory: function (q, page) { return req('POST', '/search/history/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchProfileList: function (list, q, page) { return req('POST', '/search/profile/list/' + list + '/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchChannels: function (q, page) { return req('POST', '/search/channels/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchArticles: function (q, page) { return req('POST', '/search/articles/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchFeed: function (q, page) { return req('POST', '/search/feed/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    searchChannelSubscribers: function (id, q, page) { return req('POST', '/search/channel/' + id + '/subscribers/' + (page || 0), { body: { query: q, searchBy: 0 } }); },

    /* ===================== filter ===================== */
    filter: function (page, sort, genres) {
      var b = { sort: sort === undefined ? 3 : sort };
      if (genres && genres.length) b.genres = genres;
      return req('POST', '/filter/' + (page || 0), { body: b, query: { extended_mode: 'true' } });
    },
    filterBody: function (page, body) { return req('POST', '/filter/' + (page || 0), { body: body, query: { extended_mode: 'true' } }); },
    typeAll: function () { return req('GET', '/type/all'); },

    /* ===================== schedule / discover ===================== */
    schedule: function () { return req('GET', '/schedule'); },
    discoverWatching: function (page) { return req('GET', '/discover/watching/' + (page || 0)); },
    discoverDiscussing: function () { return req('GET', '/discover/discussing'); },
    discoverRecommendations: function (page) { return req('GET', '/discover/recommendations/' + (page || 0)); },
    discoverInteresting: function () { return req('GET', '/discover/interesting'); },
    discoverComments: function () { return req('GET', '/discover/comments'); },

    /* ===================== profile ===================== */
    profile: function (id) { return req('GET', '/profile/' + id); },
    profileInfo: function () { return req('GET', '/profile/info'); },
    userList: function (id, list, page) { return req('GET', '/profile/list/all/' + id + '/' + list + '/' + (page || 0), { query: { sort: 1, filter_announce: 0 } }); },
    history: function (page) { return req('GET', '/history/' + (page || 0)); },
    friendRecommendations: function () { return req('GET', '/profile/friend/recommendations'); },
    friends: function (id, page) { return req('GET', '/profile/friend/all/' + id + '/' + (page || 0)); },
    friendRequestsLast: function (type) { return req('GET', '/profile/friend/requests/' + type + '/last'); },
    friendRequests: function (type, page) { return req('GET', '/profile/friend/requests/' + type + '/' + (page || 0)); },
    friendRequestSend: function (id) { return req('GET', '/profile/friend/request/send/' + id); },
    friendRequestRemove: function (id) { return req('GET', '/profile/friend/request/remove/' + id); },
    friendRequestHide: function (id) { return req('GET', '/profile/friend/request/hide/' + id); },
    profileSocial: function (id) { return req('GET', '/profile/social/' + id); },
    achievement: function (id) { return req('GET', '/achivement/get/' + id); },
    blocklist: function (page) { return req('GET', '/profile/blocklist/all/' + (page || 0)); },
    blockAdd: function (id) { return req('GET', '/profile/blocklist/add/' + id); },
    blockRemove: function (id) { return req('GET', '/profile/blocklist/remove/' + id); },
    votedReleases: function (id, page) { return req('GET', '/profile/vote/release/voted/' + id + '/' + (page || 0)); },
    unvotedReleases: function (page) { return req('GET', '/profile/vote/release/unvoted/' + (page || 0)); },
    roleAll: function (page, id) { return req('GET', '/role/all/' + (page || 0) + '/' + id); },
    channelSubscriptions: function (page) { return req('GET', '/channel/subscription/all/' + (page || 0)); },
    channelSubCount: function () { return req('GET', '/channel/subscription/count'); },
    exportBookmarks: function (body) { return req('POST', '/export/bookmarks', { body: body }); },

    /* ===================== notifications ===================== */
    notifCount: function () { return req('GET', '/notification/count'); },
    notifAll: function (page) { return req('GET', '/notification/all/' + (page || 0)); },
    notifFriends: function (page) { return req('GET', '/notification/friends/' + (page || 0)); },
    notifRelatedRelease: function (page) { return req('GET', '/notification/related/release/' + (page || 0)); },
    notifEpisodes: function (page) { return req('GET', '/notification/episodes/' + (page || 0)); },
    notifReleaseComments: function (page) { return req('GET', '/notification/releaseComments/' + (page || 0)); },
    notifCollectionComments: function (page) { return req('GET', '/notification/collectionComments/' + (page || 0)); },
    notifArticles: function (page) { return req('GET', '/notification/articles/' + (page || 0)); },
    notifRead: function () { return req('GET', '/notification/read'); },
    notifDelete: function (type, id) { return req('GET', '/notification/' + type + '/delete/' + id); },
    notifDeleteAll: function () { return req('GET', '/notification/delete/all'); },

    /* ===================== collections ===================== */
    collections: function (page, where) { return req('GET', '/collection/all/' + (page || 0), { query: { where: where } }); },
    collection: function (id) { return req('GET', '/collection/' + id); },
    collectionReleases: function (id, page) { return req('GET', '/collection/' + id + '/releases/' + (page || 0)); },
    collectionFavAll: function (page) { return req('GET', '/collectionFavorite/all/' + (page || 0)); },
    collectionFavAdd: function (id) { return req('GET', '/collectionFavorite/add/' + id); },
    collectionFavDelete: function (id) { return req('GET', '/collectionFavorite/delete/' + id); },
    collectionsByRelease: function (id, page) { return req('GET', '/collection/all/release/' + id + '/' + (page || 0)); },
    collectionsByProfile: function (id, page) { return req('GET', '/collection/all/profile/' + id + '/' + (page || 0)); },
    collectionCreate: function (body) { return req('POST', '/collectionMy/create', { body: body }); },
    collectionEdit: function (id, body) { return req('POST', '/collectionMy/edit/' + id, { body: body }); },
    collectionEditImage: function (id, body) { return req('POST', '/collectionMy/editImage/' + id, { body: body }); },
    collectionDelete: function (id) { return req('GET', '/collectionMy/delete/' + id); },
    collectionRandomRelease: function (id) { return req('GET', '/release/collection/' + id + '/random'); },
    collectionAddRelease: function (id) { return req('GET', '/collectionMy/release/add/' + id); },

    /* ===================== release comments ===================== */
    releaseComments: function (id, page, sort) { return req('GET', '/release/comment/all/' + id + '/' + (page || 0), { query: { sort: sort } }); },
    releaseCommentReplies: function (id, page) { return req('GET', '/release/comment/replies/' + id + '/' + (page || 0)); },
    releaseCommentVotes: function (id, page) { return req('GET', '/release/comment/votes/' + id + '/' + (page || 0)); },
    releaseCommentAdd: function (id, body) { return req('POST', '/release/comment/add/' + id, { body: body }); },
    releaseCommentEdit: function (id, body) { return req('POST', '/release/comment/edit/' + id, { body: body }); },
    releaseCommentDelete: function (id) { return req('GET', '/release/comment/delete/' + id); },
    releaseCommentVote: function (id, vote) { return req('GET', '/release/comment/vote/' + id + '/' + vote); },

    /* ===================== collection comments ===================== */
    collectionCommentAll: function (id, page, sort) { return req('GET', '/collection/comment/all/' + id + '/' + (page || 0), { query: { sort: sort } }); },
    collectionComment: function (id) { return req('GET', '/collection/comment/' + id); },
    collectionCommentReplies: function (id, page) { return req('GET', '/collection/comment/replies/' + id + '/' + (page || 0)); },
    collectionCommentVotes: function (id, page) { return req('GET', '/collection/comment/votes/' + id + '/' + (page || 0)); },
    collectionCommentAdd: function (id, body) { return req('POST', '/collection/comment/add/' + id, { body: body }); },
    collectionCommentEdit: function (id, body) { return req('POST', '/collection/comment/edit/' + id, { body: body }); },
    collectionCommentDelete: function (id) { return req('GET', '/collection/comment/delete/' + id); },
    collectionCommentVote: function (id, vote) { return req('GET', '/collection/comment/vote/' + id + '/' + vote); },

    /* ===================== episode ===================== */
    dubbers: function (id) { return req('GET', '/episode/' + id); },
    sources: function (id, dub) { return req('GET', '/episode/' + id + '/' + dub); },
    episodes: function (id, dub, src) { return req('GET', '/episode/' + id + '/' + dub + '/' + src); },
    target: function (id, src, pos) { return req('GET', '/episode/target/' + id + '/' + src + '/' + pos); },
    episodeWatch: function (id, src, pos) { return req('GET', '/episode/watch/' + id + '/' + src + '/' + pos); },
    episodeUnwatch: function (id, src, pos) { return req('GET', '/episode/unwatch/' + id + '/' + src + '/' + pos); },
    historyAdd: function (id, src, pos) { return req('GET', '/history/add/' + id + '/' + src + '/' + pos); },
    historyDelete: function (id) { return req('GET', '/history/delete/' + id); },
    episodeUpdates: function (id, page) { return req('GET', '/episode/updates/' + id + '/' + (page || 0)); }
  };

  /* ------------------------- картинки ---------------------------- */
  var staticBaseMem = null;
  function staticBase() {
    if (staticBaseMem) return staticBaseMem;
    var c = stGet('anix_static', null);
    if (c && c.d && (Date.now() - c.t) < 86400000) { staticBaseMem = c.d; return c.d; }
    return CFG.STATIC_FALLBACK;
  }
  async function refreshStatic() {
    try {
      var d = await api.toggles();
      var dom = String((d && d.staticDomain) || '').trim() || CFG.STATIC_FALLBACK;
      if (!/^https?:\/\//i.test(dom)) dom = 'https://' + dom;
      var m = dom.match(/^(https?):\/\/([^\/]+)/i);
      if (!m) return;
      var host = m[2];
      if (host.indexOf('s.') !== 0) host = 's.' + host;
      staticBaseMem = m[1] + '://' + host;
      stSet('anix_static', { d: staticBaseMem, t: Date.now() });
    } catch (e) {}
  }
  function imgUrl(r) {
    if (!r) return '';
    var raw = (typeof r === 'string') ? r : (r.image || r.poster || '');
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.indexOf('//') === 0) return 'https:' + raw;
    return staticBase() + '/posters/' + (raw.indexOf('.') > -1 ? raw : raw + '.jpg');
  }

  /* --------------------- плеер: чистка ссылки -------------------- */
  function absUrl(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (url.indexOf('//') === 0) return 'https:' + url;
    if (!/^https?:\/\//i.test(url)) return 'https://' + url;
    return url;
  }
  function cleanEmbed(url) {
    var abs = absUrl(url);
    if (!abs) return '';
    var u;
    try { u = new URL(abs); } catch (e) { return ''; }
    u.searchParams.delete('s');
    u.searchParams.delete('ip');
    u.searchParams.delete('d');
    var qs = u.searchParams.toString();
    var clean = u.origin + u.pathname + (qs ? '?' + qs : '');
    if (u.hostname.indexOf('video.sibnet.ru') > -1) return clean;
    return CFG.IFRAME + encodeURIComponent(clean);
  }

  /* --------------------------- утилиты --------------------------- */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function statusName(r) { var s = r && r.status; return (s && typeof s === 'object') ? (s.name || '') : (s || ''); }
  function num(v, def) { var n = parseInt(v, 10); return isNaN(n) ? def : n; }

  function params() {
    var o = {};
    if (typeof URLSearchParams !== 'undefined') {
      new URLSearchParams(location.search).forEach(function (v, k) { o[k] = v; });
    } else {
      var m, re = /[?&]([^=&]+)=?([^&]*)/g;
      while ((m = re.exec(location.search))) o[decodeURIComponent(m[1])] = decodeURIComponent(m[2]);
    }
    return o;
  }

  /* --------------------------- карточки -------------------------- */
  function card(r) {
    var id = num(r && r.id, 0);
    var title = (r && (r.title_ru || r.title_original)) || 'Без названия';
    var year = (r && r.year) || '?';
    var ep = ((r && r.episodes_released) || 0) + '/' + ((r && r.episodes_total) || '?');
    var grade = (r && r.grade) || 0;
    return '<div class="card"><a href="index.html?p=release&id=' + id + '">' +
      '<img class="poster" loading="lazy" src="' + esc(imgUrl(r)) + '" alt="">' +
      '<div class="meta"><div class="title">' + esc(title) + '</div>' +
      '<div class="info">' + esc(year) + ' · ' + esc(ep) + ' сер. <span class="badge grade">★ ' + esc(grade) + '</span></div>' +
      '</div></a></div>';
  }
  function grid(items) {
    if (!items || !items.length) return '<div class="empty">Ничего не найдено.</div>';
    return '<div class="grid">' + items.map(card).join('') + '</div>';
  }
  function rowItem(r) {
    var id = num(r && r.id, 0);
    var title = (r && (r.title_ru || r.title_original)) || 'Без названия';
    var year = (r && r.year) || '?';
    var ep = ((r && r.episodes_released) || 0) + '/' + ((r && r.episodes_total) || 0);
    return '<div class="row"><img class="rposter" src="' + esc(imgUrl(r)) + '" alt="" loading="lazy">' +
      '<div class="rinfo"><div class="rtitle">' + esc(title) + '</div>' +
      '<div class="rsub">' + esc(year) + ' · ' + esc(ep) + ' эп. · ' + esc(statusName(r)) + '</div></div>' +
      '<div class="ractions"><a class="btn sm primary" href="index.html?p=release&id=' + id + '">Открыть →</a></div></div>';
  }
  function rows(items) {
    if (!items || !items.length) return '<div class="empty">Список пуст.</div>';
    return '<div class="rows">' + items.map(rowItem).join('') + '</div>';
  }
  function pager(link, page, hasNext) {
    var prev = page > 0 ? '<a href="' + esc(link(page - 1)) + '">← Назад</a>' : '<span>← Назад</span>';
    var next = hasNext ? '<a href="' + esc(link(page + 1)) + '">Вперёд →</a>' : '<span>Вперёд →</span>';
    return '<div class="pager">' + prev + '<span class="cur">' + (page + 1) + '</span>' + next + '</div>';
  }
  function notice(msg, kind) { return '<div class="notice ' + (kind || '') + '">' + msg + '</div>'; }
  function empty(msg) { return '<div class="empty">' + msg + '</div>'; }
  function loginLink() { return ' <a href="index.html?p=login">Войти</a>'; }

  window.AnixCore = { CFG: CFG, api: api, Auth: Auth, esc: esc, imgUrl: imgUrl, cleanEmbed: cleanEmbed, staticBase: staticBase, refreshStatic: refreshStatic, params: params, getProxy: getProxy, setProxy: setProxy, needProxy: NEED_PROXY };
})();
