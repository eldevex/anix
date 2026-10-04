/* ==========================================================================
   AnixWeb — клиент. Все запросы к API Anixart идут напрямую из браузера
   (никакого серверного прокси). Токен хранится только в localStorage.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = {
    BASE: 'https://api-s.anixsekai.com',
    VERSION_CODE: '25082901',
    STATIC_FALLBACK: 'https://s.anixmirai.com',
    IFRAME: 'https://anixmirai.com/iframe?url='
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
    return CFG.BASE + path + (q.length ? '?' + q.join('&') : '');
  }

  async function req(method, path, opt) {
    opt = opt || {};
    var init = {
      method: method, mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    };
    if (opt.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opt.body);
      if (opt.apiV2) init.headers['Api-Version'] = 'v2';
    }
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (ctrl) { init.signal = ctrl.signal; timer = setTimeout(function () { ctrl.abort(); }, opt.ms || 25000); }

    var res, txt;
    try {
      res = await fetch(buildUrl(path, opt.query), init);
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
    if (data === null) throw new Error('Anixart вернул некорректный ответ (HTTP ' + res.status + ')');
    return data;
  }

  var api = {
    toggles: function () { return req('GET', '/config/toggles', { query: { version_code: CFG.VERSION_CODE, is_beta: 'true' } }); },
    signIn: function (login, password) { return req('POST', '/auth/signIn', { query: { login: login, password: password } }); },
    release: function (id) { return req('GET', '/release/' + id, { query: { extended_mode: 'true' } }); },
    random: function () { return req('GET', '/release/random', { query: { extended_mode: 'true' } }); },
    search: function (q, page) { return req('POST', '/search/releases/' + (page || 0), { body: { query: q, searchBy: 0 } }); },
    filter: function (page, sort, genres) {
      var b = { sort: sort === undefined ? 3 : sort };
      if (genres && genres.length) b.genres = genres;
      return req('POST', '/filter/' + (page || 0), { body: b, query: { extended_mode: 'true' } });
    },
    schedule: function () { return req('GET', '/schedule'); },
    favorites: function (page) { return req('GET', '/favorite/all/' + (page || 0), { query: { sort: 1, filter_announce: 0 } }); },
    listAll: function (lid, page) { return req('GET', '/profile/list/all/' + lid + '/' + (page || 0), { query: { sort: 1, filter_announce: 0 } }); },
    profile: function (id) { return req('GET', '/profile/' + id); },
    searchProfiles: function (q) { return req('POST', '/search/profiles/0', { body: { query: q, searchBy: 0 } }); },
    dubbers: function (id) { return req('GET', '/episode/' + id); },
    sources: function (id, dub) { return req('GET', '/episode/' + id + '/' + dub); },
    episodes: function (id, dub, src) { return req('GET', '/episode/' + id + '/' + dub + '/' + src); },
    target: function (id, src, pos) { return req('GET', '/episode/target/' + id + '/' + src + '/' + pos); }
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

  window.AnixCore = { CFG: CFG, api: api, Auth: Auth, esc: esc, imgUrl: imgUrl, cleanEmbed: cleanEmbed, staticBase: staticBase, refreshStatic: refreshStatic, params: params };
})();
