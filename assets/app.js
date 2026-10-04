/* ==========================================================================
   AnixWeb — представления и роутер. Работает поверх AnixCore (assets/anix.js).
   Все данные берутся напрямую из браузера.
   ========================================================================== */
(function () {
  'use strict';

  var C = window.AnixCore;
  if (!C) {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.getElementById('app');
      if (b) b.innerHTML = '<div class="notice err">Не загрузилось ядро assets/anix.js</div>';
    });
    return;
  }
  var api = C.api, esc = C.esc, Auth = C.Auth;
  var app = null;

  var LIST_MAP = { watch: 1, plan: 2, completed: 3, hold: 4, dropped: 5 };
  var LIST_NAMES = { favorites: 'Избранное', watching: 'Смотрю', planned: 'В планах',
                     completed: 'Просмотрено', hold: 'Отложено', dropped: 'Брошено' };
  var SORT_LABELS = [[0, 'По умолчанию'], [1, 'По рейтингу'], [2, 'Новинки'], [3, 'Популярное сейчас']];
  var WEEK = [['monday', 'Понедельник'], ['tuesday', 'Вторник'], ['wednesday', 'Среда'],
              ['thursday', 'Четверг'], ['friday', 'Пятница'], ['saturday', 'Суббота'], ['sunday', 'Воскресенье']];
  var GENRES = ["Экшен","Комедия","Драма","Фэнтези","Фантастика","Романтика","Приключения","Ужасы","Триллер","Тайна",
    "Спорт","Сёнен","Сёдзё","Повседневность","Исэкай","Меха","Музыка","Школа","Сверхъестественное","Этти",
    "Боевые искусства","Вампиры","Военное","Гарем","Детектив","Исторический","Гурман","Махо-сёдзё","Мифология","Психологическое",
    "Работа","Самураи","Сёдзё-ай","Сёнен-ай","Сэйнэн","Дзёсей"];
  var ERR_CODES = { 0: 'Успех', 1: 'Неизвестная ошибка', 2: 'Неверный логин', 3: 'Неверный пароль',
                    401: 'Не авторизован', 402: 'Бан', 403: 'Перманентный бан' };

  /* ------------------------- мелкие утилиты ------------------------- */
  function stGet(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
  function stSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function num(v, def) { var n = parseInt(v, 10); return isNaN(n) ? def : n; }
  function empty(m) { return '<div class="empty">' + m + '</div>'; }
  function notice(m, k) { return '<div class="notice ' + (k || '') + '">' + m + '</div>'; }
  function errBox(e) {
    var m = esc(e && e.message ? e.message : e);
    if (e && e.name === 'AuthError') return notice('🔒 ' + m + ' <a href="index.html?p=login">Войти</a>', 'err');
    return notice('Ошибка: ' + m, 'err');
  }

  /* --------------------------- коллекции --------------------------- */
  function getCols() { var v = stGet('anix_collections', {}); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function setCols(o) { stSet('anix_collections', o); }
  function colCreate(n) { n = String(n || '').trim(); if (!n) return; var c = getCols(); if (!c[n]) { c[n] = []; setCols(c); } }
  function colAdd(n, id) { var c = getCols(); if (!c[n]) c[n] = []; if (c[n].indexOf(id) === -1) c[n].push(id); setCols(c); }
  function colDel(n, id) { var c = getCols(); if (c[n]) { c[n] = c[n].filter(function (x) { return x !== id; }); setCols(c); } }
  function colDrop(n) { var c = getCols(); delete c[n]; setCols(c); }

  /* ------------------------- шапка и меню -------------------------- */
  function renderNav() {
    var nav = document.getElementById('mainNav');
    if (!nav) return;
    var q = C.params(), p = q.p || 'home';
    function a(href, label, active) { return '<a href="' + href + '"' + (active ? ' class="active"' : '') + '>' + label + '</a>'; }
    var html = a('index.html', 'Каталог', p === 'home')
      + a('index.html?p=calendar', 'Календарь', p === 'calendar')
      + a('index.html?p=random', 'Случайное', p === 'random')
      + a('index.html?p=genres', 'Жанры', p === 'genres');
    if (Auth.isAuth()) {
      html += a('index.html?p=lists&list=watching', 'Мои списки', p === 'lists')
        + a('index.html?p=profile', 'Профиль', p === 'profile')
        + a('index.html?p=mylists', 'Коллекции', p === 'mylists');
    }
    var btn = Auth.isAuth()
      ? '<a class="btn sm ghost" href="index.html?p=logout">Выйти</a>'
      : '<a class="btn sm primary" href="index.html?p=login">Войти</a>';
    nav.innerHTML = html + '<div class="nav-auth">' + btn + '</div>';

    var ab = document.getElementById('authBox');
    if (ab) {
      ab.innerHTML = Auth.isAuth()
        ? '<span class="userpill">👤 ' + esc((Auth.profile() || {}).login || 'user') + '</span>' + btn
        : btn;
    }
  }

  function wireBurger() {
    var burger = document.getElementById('burgerBtn'), nav = document.getElementById('mainNav');
    if (!burger || !nav) return;
    burger.addEventListener('click', function () {
      burger.classList.toggle('open');
      nav.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('open') && !nav.contains(e.target) && !burger.contains(e.target)) {
        burger.classList.remove('open');
        nav.classList.remove('open');
      }
    });
  }

  /* --------------------------- страницы ---------------------------- */
  function sortChips(sort) {
    return '<div class="filters">' + SORT_LABELS.map(function (s) {
      return '<a class="chip' + (s[0] === sort ? ' active' : '') + '" href="index.html?p=home&sort=' + s[0] + '">' + s[1] + '</a>';
    }).join(' ') + '</div>';
  }

  async function viewHome(q) {
    var sort = num(q.sort, 3), page = Math.max(0, num(q.page, 0));
    var d = await api.filter(page, sort);
    var items = d.content || [];
    var html = '<div class="page-title">📚 Каталог</div>' + sortChips(sort) +
      (items.length ? '<div class="grid">' + items.map(cardOf).join('') + '</div>' : empty('Ничего не найдено.'));
    if (items.length) {
      html += pagerOf(function (p) { return 'index.html?p=home&sort=' + sort + '&page=' + p; }, page, items.length >= 25);
    }
    return { html: html };
  }

  async function viewGenres() {
    return { html: '<div class="page-title">🎭 Жанры</div>' +
      '<div class="page-sub">Выберите жанр для просмотра каталога</div>' +
      '<div class="filters">' + GENRES.map(function (g) {
        return '<a class="chip" href="index.html?p=filter&genre=' + encodeURIComponent(g.toLowerCase()) + '">' + esc(g) + '</a>';
      }).join(' ') + '</div>' };
  }

  async function viewFilter(q) {
    var genre = (q.genre || '').trim(), page = Math.max(0, num(q.page, 0));
    if (!genre) return { html: empty('Жанр не указан. <a href="index.html?p=genres">Выбрать жанр</a>') };
    var d = await api.filter(page, 0, [genre]);
    var items = d.content || [];
    var title = '<div class="page-title">🎭 ' + esc(genre.charAt(0).toUpperCase() + genre.slice(1)) + '</div>';
    if (!items.length) return { html: title + empty('По жанру «' + esc(genre) + '» ничего не найдено.') };
    return { html: title + '<div class="grid">' + items.map(cardOf).join('') + '</div>' +
      pagerOf(function (p) { return 'index.html?p=filter&genre=' + encodeURIComponent(genre) + '&page=' + p; }, page, items.length >= 25) };
  }

  async function viewSearch(q) {
    var query = (q.q || '').trim(), page = Math.max(0, num(q.page, 0));
    var head = '<div class="page-title">🔍 Результаты</div>';
    if (!query) return { html: head + empty('Введите запрос в поиске выше.') };
    var d = await api.search(query, page);
    var items = d.releases || d.content || [];
    var sub = '<div class="page-sub">По запросу «' + esc(query) + '» найдено: ' + items.length + '</div>';
    if (!items.length) return { html: head + sub + empty('Ничего не найдено.') };
    return { html: head + sub + '<div class="grid">' + items.map(cardOf).join('') + '</div>' +
      pagerOf(function (p) { return 'index.html?p=search&q=' + encodeURIComponent(query) + '&page=' + p; }, page, items.length >= 25) };
  }

  async function viewCalendar() {
    var sched = await api.schedule();
    var today = new Date().getDay(); // 0=вс
    var map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    var html = '<div class="page-title">📅 Календарь выхода серий</div><div class="filters">';
    html += WEEK.map(function (d) {
      var cnt = (sched[d[0]] || []).length;
      var cls = map[d[0]] === today ? 'chip active' : 'chip';
      return '<a class="' + cls + '" href="#day-' + d[0] + '">' + d[1] + ' (' + cnt + ')</a>';
    }).join(' ');
    html += '</div>';
    html += WEEK.map(function (d) {
      var items = sched[d[0]] || [];
      var out = '<div id="day-' + d[0] + '" class="page-sub" style="margin-top:18px;font-weight:700;color:var(--text)">📌 ' + d[1] + '</div>';
      out += items.length ? '<div class="grid">' + items.map(cardOf).join('') + '</div>'
                          : '<div class="empty" style="padding:14px 0">Нет запланированных релизов.</div>';
      return out;
    }).join('');
    return { html: html };
  }

  async function viewRandom() {
    var d = await api.random();
    if (!d.release) return { html: empty('Не удалось получить случайный релиз.') };
    return releaseView(d.release);
  }

  /* ---------------------- страница релиза ------------------------- */
  function releaseView(r) {
    if (!r) return { html: empty('Релиз не найден.') };
    var id = num(r.id, 0);
    var title = r.title_ru || r.title_original || 'Без названия';
    var orig = r.title_original || '', alt = r.title_alt || '';
    var year = r.year || '?', grade = r.grade || 0;
    var status = (r.status && typeof r.status === 'object') ? (r.status.name || '') : (r.status || '');
    var epR = r.episodes_released || 0, epT = r.episodes_total || 0;
    var fav = r.favorites_count || 0, rating = r.rating || 0;
    var desc = r.description || '';
    var playDisabled = !!r.is_play_disabled;

    var h = '<div class="detail"><div><img class="poster-big" src="' + esc(C.imgUrl(r)) + '" alt=""></div><div>';
    h += '<h1>' + esc(title) + '</h1>';
    if (orig && orig !== title) h += '<div class="orig">' + esc(orig) + '</div>';
    if (alt && alt !== title && alt !== orig) h += '<div class="orig">' + esc(alt) + '</div>';
    h += '<div class="dt"><span class="badge status">' + esc(status) + '</span> <span class="badge grade">★ ' + esc(grade) +
         '</span> <span class="badge">📅 ' + esc(year) + '</span> <span class="badge">👁 ' + esc(fav) + '</span></div>';
    h += '<div class="dt"><span class="k">Эпизоды:</span> ' + esc(epR) + ' / ' + esc(epT || '?') +
         ' &nbsp; <span class="k">Рейтинг:</span> ' + esc(rating) + '</div>';
    var gl = String(r.genres || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (gl.length) h += '<div class="genres">' + gl.map(function (g) { return '<span class="tag">' + esc(g) + '</span>'; }).join('') + '</div>';

    h += '<div class="btn-row" style="margin:10px 0 16px">';
    if (!playDisabled) h += '<a class="btn primary" href="#releasePlayer" onclick="document.getElementById(\'releasePlayer\').scrollIntoView({behavior:\'smooth\'});return false;">▶ Смотреть</a> ';
    h += '<a class="btn" href="https://anixart.app/release/' + id + '" target="_blank" rel="noopener">Открыть в приложении ↗</a></div>';

    if (Auth.isAuth()) {
      var cols = getCols(), names = Object.keys(cols);
      if (names.length) {
        h += '<div class="btn-row" style="margin-bottom:14px" id="colAddRow">';
        names.forEach(function (n) {
          var has = cols[n].indexOf(id) > -1;
          h += '<button class="btn sm" data-col="' + esc(n) + '" data-has="' + (has ? '1' : '0') + '">' +
               (has ? '✓ ' : '+ ') + esc(n) + '</button> ';
        });
        h += '</div>';
      } else {
        h += notice('Нет коллекций. Создайте в <a href="index.html?p=mylists">Коллекциях</a>, чтобы добавлять сюда аниме.');
      }
    }
    h += desc ? '<div class="desc">' + esc(desc.slice(0, 2000)).replace(/\n/g, '<br>') + '</div>'
              : '<div class="desc" style="color:var(--text-mute)">Описание отсутствует.</div>';
    h += '</div></div>';

    if (!playDisabled) {
      h += '<div class="release-player" id="releasePlayer" data-id="' + id + '">' +
           '<div class="player-selectors" id="plSels"></div>' +
           '<div class="player-wrap" id="plFrame"><div class="empty">Загрузка плеера…</div></div></div>';
    }
    return {
      html: h,
      after: function () {
        var row = document.getElementById('colAddRow');
        if (row) {
          row.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('button[data-col]') : null;
            if (!b) return;
            var n = b.getAttribute('data-col');
            if (b.getAttribute('data-has') === '1') colDel(n, id); else colAdd(n, id);
            b.setAttribute('data-has', b.getAttribute('data-has') === '1' ? '0' : '1');
            b.textContent = (b.getAttribute('data-has') === '1' ? '✓ ' : '+ ') + n;
          });
        }
        var root = document.getElementById('releasePlayer');
        if (root) loadPlayer(root, id, savedState(id), 'embed');
      }
    };
  }

  async function viewRelease(q) {
    var id = num(q.id, 0);
    if (!id) return { html: empty('Неверный ID релиза.') };
    var d = await api.release(id);
    if (!d.release) return { html: empty('Релиз ' + id + ' не найден.') };
    return releaseView(d.release);
  }

  /* --------------------------- плеер ------------------------------ */
  function savedState(id) {
    var s = stGet('anix_watch_' + id, null);
    return { dub: num(s && s.dub, 0), src: num(s && s.src, 0), pos: num(s && s.pos, 0) };
  }
  function saveState(id, st) { stSet('anix_watch_' + id, st); }
  function playerUrl(id, st) {
    return 'index.html?p=player&id=' + id + '&dub=' + st.dub + '&src=' + st.src + '&pos=' + st.pos;
  }

  async function loadPlayer(root, id, st, mode) {
    root.innerHTML = '<div class="player-selectors" id="plSels"></div>' +
      '<div class="player-wrap" id="plFrame"><div class="empty">Загрузка плеера…</div></div>';
    var sels = document.getElementById('plSels');
    var frame = document.getElementById('plFrame');
    if (!sels || !frame) return;

    var dubbers, sources, episodes;
    try {
      dubbers = ((await api.dubbers(id)).types) || [];
    } catch (e) { sels.innerHTML = errBox(e); frame.innerHTML = empty('Плеер недоступен.'); return; }
    if (!dubbers.length) { frame.innerHTML = empty('Нет доступных озвучек.'); return; }
    if (!st.dub || !dubbers.some(function (d) { return +d.id === +st.dub; })) st.dub = +dubbers[0].id;

    try {
      sources = ((await api.sources(id, st.dub)).sources) || [];
    } catch (e) { sels.innerHTML = errBox(e); frame.innerHTML = empty('Плеер недоступен.'); return; }
    if (!sources.length) { frame.innerHTML = empty('Нет источников для выбранной озвучки.'); return; }
    if (!st.src || !sources.some(function (s) { return +s.id === +st.src; })) st.src = +sources[0].id;

    try {
      episodes = ((await api.episodes(id, st.dub, st.src)).episodes) || [];
    } catch (e) { sels.innerHTML = errBox(e); frame.innerHTML = empty('Плеер недоступен.'); return; }
    if (!episodes.length) { frame.innerHTML = empty('Нет серий для этого источника.'); return; }
    if (!st.pos || !episodes.some(function (e) { return +e.position === +st.pos; })) st.pos = +episodes[0].position;

    saveState(id, st);

    function selectFor(label, selId, list, cur, value, text) {
      return '<div class="sel-group"><label>' + label + '</label><select id="' + selId + '">' +
        list.map(function (o) {
          return '<option value="' + esc(value(o)) + '"' + (+value(o) === +cur ? ' selected' : '') + '>' + esc(text(o)) + '</option>';
        }).join('') + '</select></div>';
    }
    sels.innerHTML =
      selectFor('Озвучка', 'plDub', dubbers, st.dub, function (d) { return d.id; },
        function (d) { return (d.name || 'Без названия') + (d.is_sub ? ' [SUB]' : ''); }) +
      selectFor('Источник', 'plSrc', sources, st.src, function (s) { return s.id; }, function (s) { return s.name || 'Без названия'; }) +
      selectFor('Серия', 'plEp', episodes, st.pos, function (e) { return e.position; },
        function (e) { return e.name || ('Серия ' + e.position); });

    function apply(next, navigate) {
      st.dub = num(next.dub, st.dub); st.src = num(next.src, st.src); st.pos = num(next.pos, st.pos);
      saveState(id, st);
      if (navigate) { location.href = playerUrl(id, st); return; }
      loadPlayer(root, id, st, mode);
    }
    var dEl = document.getElementById('plDub'), sEl = document.getElementById('plSrc'), eEl = document.getElementById('plEp');
    if (dEl) dEl.addEventListener('change', function () { apply({ dub: this.value, src: 0, pos: 0 }, mode === 'page'); });
    if (sEl) sEl.addEventListener('change', function () { apply({ dub: dEl ? dEl.value : st.dub, src: this.value, pos: 0 }, mode === 'page'); });
    if (eEl) eEl.addEventListener('change', function () { apply({ dub: dEl ? dEl.value : st.dub, src: sEl ? sEl.value : st.src, pos: this.value }, mode === 'page'); });

    var t;
    try { t = await api.target(id, st.src, st.pos); }
    catch (e) { frame.innerHTML = errBox(e); return; }
    var raw = t.episode && t.episode.url;
    var embed = C.cleanEmbed(raw);
    if (!embed) { frame.innerHTML = empty('Ссылка на серию не найдена.'); return; }
    frame.innerHTML = '<iframe src="' + esc(embed) + '" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>' +
      '<div class="player-meta"><a class="btn sm" href="index.html?p=release&id=' + id + '">← К странице релиза</a>' +
      '<a class="btn sm" href="' + esc(embed) + '" target="_blank" rel="noopener">Открыть в новой вкладке ↗</a></div>';
  }

  async function viewPlayer(q) {
    var id = num(q.id, 0);
    if (!id) return { html: empty('Неверный ID.') };
    var st = { dub: num(q.dub, 0), src: num(q.src, 0), pos: num(q.pos, 0) };
    if (!st.dub) { var s = savedState(id); st = s; }
    return {
      html: '<div class="page-title">🎬 Плеер</div>' +
            '<div id="playerPage"><div class="player-selectors" id="plSels"></div>' +
            '<div class="player-wrap" id="plFrame"><div class="empty">Загрузка плеера…</div></div></div>',
      after: function () { var r = document.getElementById('playerPage'); if (r) loadPlayer(r, id, st, 'page'); }
    };
  }

  async function viewWatch(q) {
    var id = num(q.id, 0);
    if (!id) return { html: empty('Неверный ID.') };
    return viewPlayer(q);
  }

  async function viewEpisodes(q) {
    var id = num(q.id, 0), dub = num(q.dub, 0), src = num(q.src, 0);
    if (!id || !dub || !src) return { html: empty('Неверные параметры.') };
    var eps = ((await api.episodes(id, dub, src)).episodes) || [];
    if (!eps.length) return { html: empty('Нет серий для этого источника.') };
    var title = '';
    try { var r = await api.release(id); title = (r.release && r.release.title_ru) || ''; } catch (e) {}
    return { html: '<div class="page-title">🎬 ' + esc(title) + '</div>' +
      '<div class="page-sub">Озвучка #' + dub + ' · Источник #' + src + ' — выберите серию</div>' +
      '<div class="ep-grid">' + eps.map(function (e) {
        var pos = num(e.position, 0);
        return '<a class="ep" href="index.html?p=player&id=' + id + '&dub=' + dub + '&src=' + src + '&pos=' + pos + '">' +
          '<div>' + esc(e.name || ('Серия ' + pos)) + '</div><div class="num">#' + pos + '</div></a>';
      }).join('') + '</div>' };
  }

  /* ------------------------- вход и профиль ----------------------- */
  function viewLogin() {
    if (Auth.isAuth()) return { html: notice('Вы уже вошли как <b>' + esc((Auth.profile() || {}).login || '') + '</b>. <a href="index.html?p=profile">Профиль</a>') };
    return {
      html: '<div class="authbox"><h2>🔑 Вход в Anixart</h2><form id="loginForm">' +
        '<div class="field"><label>Логин или Email</label><input name="login" id="lgLogin" autocomplete="username" required></div>' +
        '<div class="field"><label>Пароль</label><input type="password" name="password" id="lgPass" autocomplete="current-password" required></div>' +
        '<button class="btn primary" type="submit" id="lgBtn">Войти</button></form><div id="lgMsg"></div></div>' +
        notice('Запрос уходит напрямую из браузера к API Anixart. Токен сохраняется только в этом браузере.'),
      after: function () {
        var f = document.getElementById('loginForm');
        if (!f) return;
        f.addEventListener('submit', async function (e) {
          e.preventDefault();
          var login = document.getElementById('lgLogin').value.trim();
          var pass = document.getElementById('lgPass').value;
          var msg = document.getElementById('lgMsg'), btn = document.getElementById('lgBtn');
          if (!login || !pass) { msg.innerHTML = notice('Введите логин и пароль.', 'err'); return; }
          btn.disabled = true; btn.textContent = 'Входим…';
          try {
            var res = await api.signIn(login, pass);
            var code = num(res && res.code, -1);
            if (code !== 0) throw new Error(ERR_CODES[code] || ('Код ' + code));
            var tok = res.profileToken && res.profileToken.token;
            if (!tok) throw new Error('Не удалось получить токен.');
            Auth.set(tok, res.profile || null);
            location.href = 'index.html?p=profile';
          } catch (err) {
            msg.innerHTML = notice('Ошибка входа: ' + esc(err.message), 'err');
            btn.disabled = false; btn.textContent = 'Войти';
          }
        });
      }
    };
  }

  function profileView(p) {
    var login = esc(p.login || 'Unknown');
    var status = esc(p.status || '');
    var badge = (p.badge && typeof p.badge === 'object') ? (p.badge.name || '') : '';
    var roles = (p.roles || []).map(function (r) { return esc(r.name || ''); }).filter(Boolean);
    var tags = [];
    if (p.is_verified) tags.push('✅ Verified');
    if (p.is_sponsor) tags.push('✨ Sponsor');
    if (p.is_banned && !p.is_perm_banned) tags.push('🚫 Бан');
    if (p.is_perm_banned) tags.push('⛔ Перманентный бан');

    var h = '<div class="profile-head"><div class="av">' + login.slice(0, 1) + '</div><div>' +
      '<h1 style="margin:0">@' + login + '</h1>' + (status ? '<div class="orig">' + status + '</div>' : '') + '</div></div>';
    if (p.is_online || badge || roles.length || tags.length) {
      h += '<div class="dt" style="margin-top:0">';
      if (p.is_online) h += '<span class="badge status">🟢 Онлайн</span> ';
      if (badge) h += '<span class="badge">🏷 ' + esc(badge) + '</span> ';
      if (roles.length) h += '<span class="badge">🎭 ' + roles.join(', ') + '</span> ';
      h += tags.map(function (t) { return '<span class="badge">' + t + '</span>'; }).join(' ');
      h += '</div>';
    }
    h += '<div class="divider"></div>';

    if (p.is_counts_hidden || p.is_stats_hidden) {
      h += notice('🔒 Статистика скрыта');
    } else {
      var stats = [['📺 Смотрю', p.watching_count], ['📅 В планах', p.plan_count], ['✅ Просмотрено', p.completed_count],
                   ['⏸ Отложено', p.hold_on_count], ['❌ Брошено', p.dropped_count], ['❤️ Избранное', p.favorite_count],
                   ['⭐ Рейтинг', p.rating_score], ['👥 Друзья', p.friend_count], ['📁 Коллекции', p.collection_count],
                   ['💬 Комментарии', p.comment_count], ['▶️ Серий просмотрено', p.watched_episode_count]];
      h += '<div class="stat-grid">' + stats.filter(function (s) { return s[1] !== null && s[1] !== undefined; })
        .map(function (s) { return '<div class="stat"><div class="v">' + esc(s[1]) + '</div><div class="l">' + s[0] + '</div></div>'; }).join('') + '</div>';
      if (p.watched_time !== undefined) {
        var hours = Math.floor(p.watched_time / 60), days = Math.floor(hours / 24);
        h += notice('⏱ Время просмотра: <b>' + (days > 0 ? days + ' д. ' + (hours % 24) + ' ч.' : hours + ' ч.') + '</b>');
      }
    }
    h += '<div class="divider"></div>';
    var soc = [];
    [['vk_page', 'VK'], ['tg_page', 'TG'], ['inst_page', 'IG'], ['tt_page', 'TT'], ['discord_page', 'DC']].forEach(function (s) {
      if (p[s[0]]) soc.push(s[1] + ': ' + esc(p[s[0]]));
    });
    if (p.register_date) h += '📆 Регистрация: <b>' + new Date(p.register_date * 1000).toLocaleDateString('ru-RU') + '</b><br>';
    if (p.last_activity_time) h += '🕐 Активность: <b>' + new Date(p.last_activity_time * 1000).toLocaleString('ru-RU') + '</b><br>';
    if (soc.length) h += '<div style="margin-top:10px">🔗 ' + soc.join(' | ') + '</div>';
    h += '<div class="divider"></div>' +
      '<div class="btn-row"><a class="btn" href="index.html?p=lists&list=watching">📺 Смотрю</a>' +
      '<a class="btn" href="index.html?p=lists&list=completed">✅ Просмотрено</a>' +
      '<a class="btn" href="index.html?p=lists&list=favorites">❤️ Избранное</a></div>';
    h += '<div style="margin-top:10px"><form class="searchbar" style="margin:0;padding:0;max-width:none" method="get" action="index.html">' +
      '<input type="hidden" name="p" value="profile"><input type="text" name="q" placeholder="Поиск другого профиля по логину…"><button>🔍</button></form></div>';
    return { html: h };
  }

  async function viewProfile(q) {
    var query = (q.q || '').trim();
    if (query) {
      var res = await api.searchProfiles(query);
      var content = res.content || [];
      if (content.length === 1) return viewProfile({ id: content[0].id });
      var h = '<div class="page-title">🔍 ' + esc(query) + '</div>';
      if (!content.length) return { html: h + empty('Профиль не найден.') };
      h += '<div class="rows">' + content.map(function (c) {
        var tags = [];
        if (c.is_online) tags.push('🟢');
        if (c.is_verified) tags.push('✅');
        if (c.is_sponsor) tags.push('✨');
        var sub = tags.join(' ') + ((c.badge_name) ? ' (' + esc(c.badge_name) + ')' : '');
        return '<div class="row"><div class="rinfo"><div class="rtitle">' + esc(c.login || 'Unknown') + '</div>' +
          '<div class="rsub">' + sub + '</div></div><div class="ractions">' +
          '<a class="btn sm primary" href="index.html?p=profile&id=' + num(c.id, 0) + '">Открыть →</a></div></div>';
      }).join('') + '</div>';
      return { html: h };
    }
    var pid = num(q.id, 0);
    if (!pid) {
      if (!Auth.isAuth()) return { html: notice('🔒 Для просмотра профиля нужна авторизация. <a href="index.html?p=login">Войти</a>', 'err') };
      pid = num((Auth.profile() || {}).id, 0);
    }
    if (!pid) return { html: empty('Не удалось определить ID профиля.') };
    var d = await api.profile(pid);
    if (!d.profile) return { html: empty('Профиль не найден.') };
    return profileView(d.profile);
  }

  async function viewLists(q) {
    if (!Auth.isAuth()) return { html: notice('🔒 Для просмотра списков нужна авторизация. <a href="index.html?p=login">Войти</a>', 'err') };
    var list = q.list || 'watching', page = Math.max(0, num(q.page, 0));
    var name = LIST_NAMES[list] || list;
    var h = '<div class="page-title">📂 ' + esc(name) + '</div><div class="filters">' +
      Object.keys(LIST_NAMES).map(function (k) {
        return '<a class="chip' + (k === list ? ' active' : '') + '" href="index.html?p=lists&list=' + k + '">' + LIST_NAMES[k] + '</a>';
      }).join(' ') + '</div>';
    var d = (list === 'favorites') ? await api.favorites(page) : await api.listAll(LIST_MAP[list] || 1, page);
    var items = d.content || [];
    if (!items.length) return { html: h + empty('Список пуст.') };
    h += '<div class="rows">' + items.map(function (r) {
      var id = num(r.id, 0);
      var t = r.title_ru || r.title_original || 'Без названия';
      return '<div class="row"><img class="rposter" src="' + esc(C.imgUrl(r)) + '" alt="" loading="lazy">' +
        '<div class="rinfo"><div class="rtitle">' + esc(t) + '</div><div class="rsub">' + esc(r.year || '?') + ' · ' +
        esc(r.episodes_released || 0) + '/' + esc(r.episodes_total || 0) + ' эп. · ' +
        esc((r.status && typeof r.status === 'object') ? (r.status.name || '') : (r.status || '')) + '</div></div>' +
        '<div class="ractions"><a class="btn sm primary" href="index.html?p=release&id=' + id + '">Открыть →</a></div></div>';
    }).join('') + '</div>';
    h += pagerOf(function (p) { return 'index.html?p=lists&list=' + list + '&page=' + p; }, page, items.length >= 25);
    return { html: h };
  }

  async function viewMylists(q) {
    if (!Auth.isAuth()) return { html: notice('🔒 Войдите, чтобы использовать коллекции. <a href="index.html?p=login">Войти</a>', 'err') };
    var cols = getCols();
    if (q.name) {
      var nm = q.name;
      if (!cols[nm]) return { html: empty('Список не найден.') };
      var ids = cols[nm];
      var h = '<div class="page-title">📋 ' + esc(nm) + '</div><div class="page-sub">Всего: ' + ids.length +
        ' · <a href="index.html?p=mylists">← к коллекциям</a></div>';
      if (!ids.length) return { html: h + empty('Список пуст.') };
      var parts = [];
      for (var i = 0; i < ids.length; i++) {
        var rid = num(ids[i], 0);
        try {
          var d = await api.release(rid);
          var r = d.release;
          if (!r) throw new Error('empty');
          parts.push(rowItemOf(r, nm));
        } catch (e) {
          parts.push('<div class="row"><div class="rinfo"><div class="rtitle">ID:' + rid + '</div>' +
            '<div class="rsub">ошибка загрузки</div></div><div class="ractions">' +
            '<button class="btn sm" data-rm="' + esc(nm) + '" data-id="' + rid + '">Удалить</button></div></div>');
        }
      }
      h += '<div class="rows" id="colRows">' + parts.join('') + '</div>';
      return { html: h, after: wireColRows };
    }
    var names = Object.keys(cols);
    var out = '<div class="page-title">📋 Мои коллекции</div>' +
      '<div class="btn-row" style="margin-bottom:16px"><button class="btn primary" id="colNew">➕ Создать коллекцию</button></div>';
    if (!names.length) return { html: out + empty('Пока нет коллекций. Создавайте и добавляйте аниме из карточки релиза.'), after: wireColNew };
    out += '<div class="rows" id="colRows">' + names.map(function (n) {
      return '<div class="row"><div class="rinfo"><div class="rtitle">' + esc(n) + '</div><div class="rsub">' + cols[n].length +
        ' аниме</div></div><div class="ractions">' +
        '<a class="btn sm primary" href="index.html?p=mylists&name=' + encodeURIComponent(n) + '">Открыть</a>' +
        '<button class="btn sm" data-drop="' + esc(n) + '">Удалить</button></div></div>';
    }).join('') + '</div>';
    return { html: out, after: function () { wireColNew(); wireColRows(); } };
  }

  function rowItemOf(r, nm) {
    var id = num(r.id, 0);
    var t = r.title_ru || r.title_original || 'Без названия';
    return '<div class="row"><img class="rposter" src="' + esc(C.imgUrl(r)) + '" alt="" loading="lazy">' +
      '<div class="rinfo"><div class="rtitle">' + esc(t) + '</div><div class="rsub">' + esc(r.year || '?') + ' · ' +
      esc(r.episodes_released || 0) + '/' + esc(r.episodes_total || 0) + ' эп. · ' +
      esc((r.status && typeof r.status === 'object') ? (r.status.name || '') : (r.status || '')) + '</div></div>' +
      '<div class="ractions"><a class="btn sm primary" href="index.html?p=release&id=' + id + '">Открыть</a>' +
      '<button class="btn sm" data-rm="' + esc(nm) + '" data-id="' + id + '">Удалить</button></div></div>';
  }
  function wireColNew() {
    var b = document.getElementById('colNew');
    if (!b) return;
    b.addEventListener('click', function () {
      var n = prompt('Название коллекции:');
      if (n) { colCreate(n); location.href = 'index.html?p=mylists'; }
    });
  }
  function wireColRows() {
    var box = document.getElementById('colRows');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var rm = e.target.closest && e.target.closest('button[data-rm]');
      if (rm) { colDel(rm.getAttribute('data-rm'), num(rm.getAttribute('data-id'), 0)); location.reload(); return; }
      var dr = e.target.closest && e.target.closest('button[data-drop]');
      if (dr) {
        var n = dr.getAttribute('data-drop');
        if (confirm('Удалить коллекцию «' + n + '»?')) { colDrop(n); location.reload(); }
      }
    });
  }

  /* ------------------------ карточки/пейджер ---------------------- */
  function cardOf(r) {
    var id = num(r && r.id, 0);
    var t = (r && (r.title_ru || r.title_original)) || 'Без названия';
    var year = (r && r.year) || '?';
    var ep = ((r && r.episodes_released) || 0) + '/' + ((r && r.episodes_total) || '?');
    var grade = (r && r.grade) || 0;
    return '<div class="card"><a href="index.html?p=release&id=' + id + '">' +
      '<img class="poster" loading="lazy" src="' + esc(C.imgUrl(r)) + '" alt="">' +
      '<div class="meta"><div class="title">' + esc(t) + '</div><div class="info">' + esc(year) + ' · ' + esc(ep) +
      ' сер. <span class="badge grade">★ ' + esc(grade) + '</span></div></div></a></div>';
  }
  function pagerOf(link, page, hasNext) {
    var prev = page > 0 ? '<a href="' + esc(link(page - 1)) + '">← Назад</a>' : '<span>← Назад</span>';
    var next = hasNext ? '<a href="' + esc(link(page + 1)) + '">Вперёд →</a>' : '<span>Вперёд →</span>';
    return '<div class="pager">' + prev + '<span class="cur">' + (page + 1) + '</span>' + next + '</div>';
  }

  /* --------------------------- роутер ----------------------------- */
  var ROUTES = {
    home: viewHome, genres: viewGenres, filter: viewFilter, search: viewSearch,
    calendar: viewCalendar, random: viewRandom, release: viewRelease,
    player: viewPlayer, watch: viewWatch, episodes: viewEpisodes,
    login: viewLogin, profile: viewProfile, lists: viewLists,
    mylists: viewMylists, mylist: viewMylists
  };

  async function render() {
    app = app || document.getElementById('app');
    if (!app) return;
    var q = C.params();
    var p = q.p || 'home';
    if (p === 'logout') { Auth.clear(); location.href = 'index.html'; return; }
    var out;
    try {
      var fn = ROUTES[p];
      out = fn ? await fn(q) : { html: empty('Страница не найдена.') };
    } catch (e) {
      out = { html: errBox(e) };
    }
    app.innerHTML = out.html;
    if (out.after) { try { out.after(); } catch (e) {} }
    document.title = 'AnixWeb — Anixart';
  }

  function boot() {
    renderNav();
    wireBurger();
    C.refreshStatic();
    render();
  }

  window.AnixApp = { render: render, boot: boot, routes: ROUTES, loadPlayer: loadPlayer,
                     cols: { get: getCols, add: colAdd, del: colDel, drop: colDrop, create: colCreate },
                     login: viewLogin, _esc: esc };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
