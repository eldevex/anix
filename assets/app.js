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
  var REG_ERR = { 2: 'Недопустимый логин', 3: 'Недопустимый email', 4: 'Недопустимый пароль',
                  5: 'Логин уже занят', 6: 'Email уже занят', 7: 'Код уже отправлен',
                  8: 'Не удалось отправить код', 9: 'Email-сервис запрещён', 10: 'Слишком много регистраций',
                  11: 'Неверный код' };

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
    /* Настройки прячем, если сайт сам нашёл свой proxy.php */
    if (!C.CFG.AUTO_PROXY) html += a('index.html?p=settings', 'Настройки', p === 'settings');
    if (Auth.isAuth()) {
      html += a('index.html?p=lists&list=watching', 'Мои списки', p === 'lists')
        + a('index.html?p=notifs', 'Уведомления', p === 'notifs')
        + a('index.html?p=friends', 'Друзья', p === 'friends')
        + a('index.html?p=collections', 'Мои коллекции', p === 'collections' || p === 'mylists')
        + a('index.html?p=profile', 'Профиль', p === 'profile');
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
    h += '<div class="comments" id="comments" data-id="' + id + '">' +
         '<div class="page-title">Комментарии</div>' +
         '<div id="commentsList"><div class="empty">Загрузка комментариев…</div></div></div>';
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
        loadComments(id, 0, false);
      }
    };
  }

  /* ---------------------- комментарии ----------------------------- */
  var CMT_SORT = [[1, 'Новые'], [2, 'Старые'], [3, 'Популярные']];
  var cmtState = { id: 0, page: 0, sort: 3 };

  function fmtDate(ts) {
    if (!ts) return '';
    try { return new Date(ts * 1000).toLocaleString('ru-RU'); } catch (e) { return ''; }
  }
  function cmtVoteOf(c) {
    var v = c && c.vote;
    if (v && typeof v === 'object') return { likes: num(v.likes, 0), dislikes: num(v.dislikes, 0), vote: num(v.vote, 0) };
    return { likes: num(c && c.likes, 0), dislikes: num(c && c.dislikes, 0), vote: 0 };
  }
  function cmtProfile(c) {
    var p = (c && c.profile) || {};
    var login = p.login || ('user' + num(p.id, 0));
    var av = C.imgUrl(p);
    return { login: login, id: num(p.id, 0), av: av };
  }

  function commentItem(c, level) {
    level = level || 0;
    var id = num(c.id, 0);
    var pr = cmtProfile(c);
    var vv = cmtVoteOf(c);
    var msg = c.message || c.text || '';
    if (c.is_deleted) msg = '<i style="color:var(--text-mute)">Комментарий удалён</i>';
    else msg = esc(msg).replace(/\n/g, '<br>');
    var myId = (Auth.profile() && num(Auth.profile().id, 0)) || 0;
    var mine = myId && pr.id === myId;
    var h = '<div class="cmt" data-id="' + id + '" style="margin-left:' + (level * 18) + 'px">';
    h += '<div class="cmt-head">';
    h += pr.av ? '<img class="cmt-av" src="' + esc(pr.av) + '" alt="" loading="lazy">' : '<div class="cmt-av ph">' + esc(pr.login.slice(0, 1).toUpperCase()) + '</div>';
    h += '<div class="cmt-meta"><a class="cmt-login" href="index.html?p=profile&id=' + pr.id + '"><b>' + esc(pr.login) + '</b></a>';
    if (c.is_edited) h += ' <span class="cmt-tag">изм.</span>';
    h += '<span class="cmt-date">' + esc(fmtDate(c.timestamp || c.date)) + '</span></div></div>';
    h += '<div class="cmt-body">' + msg + '</div>';
    if (!c.is_deleted) {
      h += '<div class="cmt-actions">';
      h += '<button class="cmt-act" data-act="like" data-id="' + id + '"> ' + vv.likes + '</button>';
      h += '<button class="cmt-act" data-act="dislike" data-id="' + id + '"> ' + vv.dislikes + '</button>';
      if (Auth.isAuth()) {
        h += '<button class="cmt-act" data-act="reply" data-id="' + id + '" data-login="' + esc(pr.login) + '">Ответить</button>';
        if (mine) h += '<button class="cmt-act" data-act="del" data-id="' + id + '">Удалить</button>';
      }
      var rc = num(c.replies_count, 0) || num(c.replies, 0);
      if (rc) h += '<button class="cmt-act" data-act="replies" data-id="' + id + '">Ответы (' + rc + ')</button>';
      h += '</div>';
    }
    h += '<div class="cmt-replies" id="cmtReplies' + id + '"></div>';
    if (level === 0) {
      h += '<div class="cmt-replybox" id="cmtReply' + id + '" style="display:none"></div>';
    }
    h += '</div>';
    return h;
  }

  function commentForm(id, parentId, placeholder) {
    return '<div class="cmt-form" id="cmtForm' + (parentId || id) + '">' +
      '<textarea class="cmt-input" id="cmtText' + (parentId || id) + '" rows="2" placeholder="' + esc(placeholder || 'Написать комментарий…') + '"></textarea>' +
      '<button class="btn primary sm" data-act="send" data-id="' + id + '" data-parent="' + (parentId || 0) + '">Отправить</button>' +
      (parentId ? '<button class="btn sm" data-act="cancel" data-parent="' + parentId + '">Отмена</button>' : '') +
      '</div>';
  }

  async function loadComments(id, page, append) {
    cmtState.id = id;
    cmtState.page = page || 0;
    var box = document.getElementById('commentsList');
    if (!box) return;
    if (!append) box.innerHTML = '<div class="empty">Загрузка комментариев…</div>';
    var d;
    try { d = await api.releaseComments(id, cmtState.page, cmtState.sort); }
    catch (e) { box.innerHTML = errBox(e); return; }
    var list = (d && (d.comments || d.content)) || [];

    var toolbar = '<div class="cmt-toolbar"><div class="cmt-sorts">' +
      CMT_SORT.map(function (s) { return '<button class="cmt-sort' + (cmtState.sort === s[0] ? ' on' : '') + '" data-sort="' + s[0] + '">' + s[1] + '</button>'; }).join('') +
      '</div><button class="btn sm" data-act="refresh"></button></div>';
    var form;
    if (!Auth.isAuth()) {
      form = notice('Чтобы писать комментарии, <a href="index.html?p=login">войдите</a>.', '');
    } else if (!C.getProxy()) {
      form = notice('Чтобы писать комментарии, укажите прокси-сервер в <a href="index.html?p=settings">Настройках</a>.', '');
    } else {
      form = commentForm(id, 0, 'Написать комментарий…');
    }
    var body = list.length ? list.map(function (c) { return commentItem(c, 0); }).join('')
      : '<div class="empty">Комментариев пока нет.</div>';

    if (append) {
      var old = box.querySelector('.cmt-list');
      if (old) old.insertAdjacentHTML('beforeend', list.map(function (c) { return commentItem(c, 0); }).join(''));
    } else {
      box.innerHTML = toolbar + form + '<div class="cmt-list">' + body + '</div>';
    }

    // pagination
    var last = list.length ? list[list.length - 1] : null;
    if (!append || last) {
      var moreWrap = document.getElementById('cmtMoreWrap');
      if (moreWrap) moreWrap.remove();
      box.insertAdjacentHTML('beforeend', '<div id="cmtMoreWrap" style="margin-top:12px">' +
        (list.length >= 20 ? '<button class="btn sm" data-act="more">Показать ещё</button>' : '') + '</div>');
    }
    wireComments();
  }

  function cmtReplyToggle(cid, login) {
    var box = document.getElementById('cmtReply' + cid);
    if (!box) return;
    if (box.style.display === 'none') {
      box.style.display = 'block';
      box.innerHTML = commentForm(cmtState.id, cid, 'Ответ @' + login + '…');
    } else {
      box.style.display = 'none';
    }
  }

  async function loadReplies(cid) {
    var box = document.getElementById('cmtReplies' + cid);
    if (!box) return;
    if (box.getAttribute('data-open') === '1') { box.innerHTML = ''; box.removeAttribute('data-open'); return; }
    box.innerHTML = '<div class="empty" style="padding:10px 0">Загрузка…</div>';
    var d;
    try { d = await api.releaseCommentReplies(cid, 0); }
    catch (e) { box.innerHTML = errBox(e); return; }
    var list = (d && (d.comments || d.content)) || [];
    box.setAttribute('data-open', '1');
    box.innerHTML = list.length ? list.map(function (c) { return commentItem(c, 1); }).join('')
      : '<div class="empty" style="padding:10px 0">Нет ответов.</div>';
  }

  async function doCommentAction(act, id, parent) {
    if (!Auth.isAuth()) { location.href = 'index.html?p=login'; return; }
    try {
      if (act === 'send') {
        var ta = document.getElementById('cmtText' + (parent || id));
        var text = ta ? ta.value.trim() : '';
        if (!text) return;
        var body = { message: text };
        if (parent) body.parentCommentId = parent;
        await api.releaseCommentAdd(id, body);
        if (ta) ta.value = '';
        await loadComments(id, 0, false);
      } else if (act === 'like') {
        await api.releaseCommentVote(id, 2); loadComments(cmtState.id, 0, false);
      } else if (act === 'dislike') {
        await api.releaseCommentVote(id, 1); loadComments(cmtState.id, 0, false);
      } else if (act === 'del') {
        if (!confirm('Удалить комментарий?')) return;
        await api.releaseCommentDelete(id); loadComments(cmtState.id, 0, false);
      }
    } catch (e) { alert(e && e.message ? e.message : e); }
  }

  function wireComments() {
    var box = document.getElementById('commentsList');
    if (!box || box.getAttribute('data-wired') === '1') return;
    box.setAttribute('data-wired', '1');
    box.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      var sort = t.getAttribute('data-sort');
      if (sort) { cmtState.sort = num(sort, 3); loadComments(cmtState.id, 0, false); return; }
      var act = t.getAttribute('data-act');
      if (!act) return;
      if (act === 'more') { loadComments(cmtState.id, cmtState.page + 1, true); return; }
      if (act === 'refresh') { loadComments(cmtState.id, 0, false); return; }
      var id = num(t.getAttribute('data-id'), 0);
      if (act === 'reply') { cmtReplyToggle(id, t.getAttribute('data-login') || ''); return; }
      if (act === 'replies') { loadReplies(id); return; }
      if (act === 'cancel') { var pb = document.getElementById('cmtReply' + id); if (pb) pb.style.display = 'none'; return; }
      doCommentAction(act, id, num(t.getAttribute('data-parent'), 0));
    });
  }

  /* ---------------------- уведомления ----------------------------- */
  var NOTIF_TABS = [
    ['all', 'Все', 'notifAll'],
    ['friends', 'Друзья', 'notifFriends'],
    ['release', 'Релизы', 'notifRelatedRelease'],
    ['episodes', 'Серии', 'notifEpisodes'],
    ['relcomments', 'Коммент. к релизам', 'notifReleaseComments'],
    ['colcomments', 'Коммент. к коллекциям', 'notifCollectionComments'],
    ['articles', 'Статьи', 'notifArticles']
  ];
  var ntfState = { tab: 'all', page: 0 };

  function ntfIcon(t) {
    switch (num(t, 0)) {
      case 0: return '';   // серия/релиз
      case 1: return '';   // комментарий
      case 2: return '';   // друзья
      case 3: return '';
      case 4: return '⭐';
      default: return '';
    }
  }
  function ntfItem(n) {
    var id = num(n.id, 0);
    var rel = n.release || {};
    var rid = num(rel.id || n.release_id, 0);
    var prof = n.profile || {};
    var login = prof.login || '';
    var txt = n.text || n.message || n.title || 'Уведомление';
    var date = n.timestamp || n.date || n.time;
    var isNew = !(n.is_read || n.watched);
    var h = '<div class="ntf' + (isNew ? ' new' : '') + '" data-id="' + id + '">';
    h += '<div class="ntf-ico">' + ntfIcon(n.type) + '</div>';
    h += '<div class="ntf-main">';
    if (login) h += '<div class="ntf-who">@' + esc(login) + '</div>';
    h += '<div class="ntf-txt">' + esc(txt) + '</div>';
    if (rid) h += '<a class="ntf-link" href="index.html?p=release&id=' + rid + '">' + esc(rel.title_ru || rel.title_original || 'Открыть релиз') + ' →</a>';
    h += '<div class="ntf-date">' + esc(fmtDate(date)) + '</div>';
    h += '</div>';
    h += '<div class="ntf-acts"><button class="ntf-del" data-act="del" data-id="' + id + '" title="Удалить">✕</button></div>';
    h += '</div>';
    return h;
  }

  async function loadNotifs(tab, page, append) {
    ntfState.tab = tab || 'all';
    ntfState.page = page || 0;
    var box = document.getElementById('ntfList');
    if (!box) return;
    if (!append) box.innerHTML = '<div class="empty">Загрузка уведомлений…</div>';
    var meta = null;
    for (var i = 0; i < NOTIF_TABS.length; i++) { if (NOTIF_TABS[i][0] === ntfState.tab) meta = NOTIF_TABS[i]; }
    var fn = api[meta ? meta[2] : 'notifAll'];
    var d;
    try { d = await fn(ntfState.page); }
    catch (e) { box.innerHTML = errBox(e); return; }
    var list = (d && (d.notifications || d.content)) || [];
    var body = list.length ? list.map(ntfItem).join('') : '<div class="empty">Уведомлений нет.</div>';
    if (append) {
      var old = box.querySelector('.ntf-list');
      if (old) old.insertAdjacentHTML('beforeend', list.map(ntfItem).join(''));
    } else {
      box.innerHTML = '<div class="ntf-list">' + body + '</div>';
    }
    var moreWrap = document.getElementById('ntfMoreWrap');
    if (moreWrap) moreWrap.remove();
    box.insertAdjacentHTML('beforeend', '<div id="ntfMoreWrap" style="margin-top:12px">' +
      (list.length >= 20 ? '<button class="btn sm" data-act="more">Показать ещё</button>' : '') + '</div>');
    wireNotifs();
  }

  function wireNotifs() {
    var box = document.getElementById('ntfList');
    if (!box || box.getAttribute('data-wired') === '1') return;
    box.setAttribute('data-wired', '1');
    box.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button,a') : null;
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'more') { loadNotifs(ntfState.tab, ntfState.page + 1, true); return; }
      if (act === 'del') {
        var id = num(t.getAttribute('data-id'), 0);
        api.notifDelete(ntfState.tab, id).then(function () { loadNotifs(ntfState.tab, 0, false); }).catch(function (er) { alert(er.message || er); });
      }
    });
  }

  async function viewNotifs(q) {
    if (!Auth.isAuth()) return { html: notice(' Уведомления доступны после <a href="index.html?p=login">входа</a>.', 'err') };
    var tab = q.tab || 'all';
    ntfState.tab = tab; ntfState.page = 0;
    var tabs = '<div class="ntf-tabs">' + NOTIF_TABS.map(function (t) {
      return '<button class="ntf-tab' + (t[0] === tab ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    var actions = '<div class="ntf-top"><button class="btn sm" data-nact="read">Отметить прочитанными</button>' +
      '<button class="btn sm" data-nact="clear">Очистить все</button></div>';
    return {
      html: '<div class="page-title"> Уведомления</div>' + tabs + actions +
            '<div id="ntfList"><div class="empty">Загрузка…</div></div>',
      after: function () {
        var root = document.getElementById('ntfList');
        if (!root) return;
        // tabs + actions
        var page = document.getElementById('app');
        var tabBar = page ? page.querySelector('.ntf-tabs') : null;
        if (tabBar) tabBar.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('button[data-tab]') : null;
          if (!b) return;
          location.href = 'index.html?p=notifs&tab=' + b.getAttribute('data-tab');
        });
        var top = page ? page.querySelector('.ntf-top') : null;
        if (top) top.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('button[data-nact]') : null;
          if (!b) return;
          var act = b.getAttribute('data-nact');
          var pr = act === 'read' ? api.notifRead() : api.notifDeleteAll();
          pr.then(function () { loadNotifs(ntfState.tab, 0, false); }).catch(function (er) { alert(er.message || er); });
        });
        loadNotifs(tab, 0, false);
      }
    };
  }

  /* ---------------------- друзья и подписки ----------------------- */
  var frState = { tab: 'friends', page: 0 };

  function myId() { return num((Auth.profile() || {}).id, 0); }

  function profCard(p) {
    var id = num(p.id, 0);
    var login = p.login || ('user' + id);
    var av = C.imgUrl(p);
    var tags = [];
    if (p.is_online) tags.push('');
    if (p.is_verified) tags.push('✅');
    if (p.is_sponsor) tags.push('✨');
    var h = '<div class="fr-item">';
    h += av ? '<img class="cmt-av" src="' + esc(av) + '" alt="" loading="lazy">' : '<div class="cmt-av ph">' + esc(login.slice(0, 1).toUpperCase()) + '</div>';
    h += '<div class="fr-main"><div class="fr-login">@' + esc(login) + ' ' + tags.join('') + '</div>';
    if (p.status) h += '<div class="fr-status">' + esc(p.status) + '</div>';
    h += '</div>';
    h += '<div class="fr-acts"><a class="btn sm primary" href="index.html?p=profile&id=' + id + '">Открыть →</a></div>';
    h += '</div>';
    return h;
  }

  async function loadFriends(tab, page, append) {
    frState.tab = tab; frState.page = page || 0;
    var box = document.getElementById('frList');
    if (!box) return;
    if (!append) box.innerHTML = '<div class="empty">Загрузка…</div>';
    var d, list = [], meta = null;
    try {
      if (tab === 'friends') d = await api.friends(myId(), frState.page);
      else if (tab === 'in') d = await api.friendRequests('in', frState.page);
      else if (tab === 'out') d = await api.friendRequests('out', frState.page);
      else if (tab === 'reco') d = await api.friendRecommendations();
      else if (tab === 'subs') d = await api.channelSubscriptions(frState.page);
    } catch (e) { box.innerHTML = errBox(e); return; }
    list = (d && (d.content || d.profiles || d.friends || d.channels || d.subscriptions)) || [];
    if (!list.length) { box.innerHTML = '<div class="empty">Пусто.</div>'; return; }
    var html = list.map(function (p) {
      if (p.channel) p = p.channel; // subscriptions may wrap
      return profCard(p);
    }).join('');
    if (append) {
      var old = box.querySelector('.fr-list');
      if (old) old.insertAdjacentHTML('beforeend', html);
    } else {
      box.innerHTML = '<div class="fr-list">' + html + '</div>';
    }
    var mw = document.getElementById('frMoreWrap'); if (mw) mw.remove();
    box.insertAdjacentHTML('beforeend', '<div id="frMoreWrap" style="margin-top:12px">' +
      (list.length >= 25 ? '<button class="btn sm" data-fact="more">Показать ещё</button>' : '') + '</div>');
    wireFriends();
  }

  function wireFriends() {
    var box = document.getElementById('frList');
    if (!box || box.getAttribute('data-wired') === '1') return;
    box.setAttribute('data-wired', '1');
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-fact]') : null;
      if (!b) return;
      if (b.getAttribute('data-fact') === 'more') loadFriends(frState.tab, frState.page + 1, true);
    });
  }

  async function viewFriends(q) {
    if (!Auth.isAuth()) return { html: notice(' Друзья доступны после <a href="index.html?p=login">входа</a>.', 'err') };
    var tab = q.tab || 'friends';
    frState.tab = tab; frState.page = 0;
    var TABS = [['friends', 'Друзья'], ['in', 'Входящие'], ['out', 'Исходящие'], ['reco', 'Рекомендации'], ['subs', 'Подписки']];
    var tabs = '<div class="ntf-tabs">' + TABS.map(function (t) {
      return '<button class="ntf-tab' + (t[0] === tab ? ' on' : '') + '" data-ftab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    return {
      html: '<div class="page-title"> Друзья</div>' + '<div class="searchbar fr-search"><input type="text" id="frFind" placeholder="Добавить друга по логину…"><button type="button" id="frFindBtn">Найти</button></div>' + '<div id="frFindRes"></div>' + tabs + '<div id="frList"><div class="empty">Загрузка…</div></div>',
      after: function () {
        var page = document.getElementById('app');
        var bar = page ? page.querySelector('.ntf-tabs') : null;
        if (bar) bar.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('button[data-ftab]') : null;
          if (!b) return;
          location.href = 'index.html?p=friends&tab=' + b.getAttribute('data-ftab');
        });
        loadFriends(tab, 0, false);
        wireFriendSearch();
      }
    };
  }

  function wireFriendSearch() {
    var inp = document.getElementById('frFind');
    var btn = document.getElementById('frFindBtn');
    var res = document.getElementById('frFindRes');
    if (!inp || !btn || !res) return;
    function go() {
      var q = (inp.value || '').trim();
      if (q.length < 2) { res.innerHTML = notice('Введите хотя бы 2 символа.', 'err'); return; }
      res.innerHTML = '<div class="empty">Поиск…</div>';
      api.searchProfiles(q, 0).then(function (d) {
        var list = (d && (d.content || d.profiles)) || [];
        if (!list.length) { res.innerHTML = '<div class="empty">Никого не найдено.</div>'; return; }
        res.innerHTML = '<div class="fr-list">' + list.map(function (p) { return profCard(p); }).join('') + '</div>';
      }).catch(function (e) { res.innerHTML = errBox(e); });
    }
    btn.addEventListener('click', go);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }

  /* ---------------------- коллекции Anixart (API) ----------------- */
  var colState = { tab: 'mine', page: 0 };

  function colCard(c) {
    var id = num(c.id, 0);
    var title = c.title || 'Без названия';
    var cnt = num(c.count || c.releases_count, 0);
    var av = C.imgUrl(c.image ? { image: c.image } : (c.poster ? { poster: c.poster } : {}));
    var pr = c.profile || {};
    var h = '<div class="col-card" data-id="' + id + '">';
    h += '<a class="col-link" href="index.html?p=collection&id=' + id + '">';
    h += av ? '<img class="col-img" src="' + esc(av) + '" alt="" loading="lazy">' : '<div class="col-img ph"></div>';
    h += '<div class="col-meta"><div class="col-title">' + esc(title) + '</div>';
    h += '<div class="col-sub">' + cnt + ' релизов' + (pr.login ? ' · @' + esc(pr.login) : '') + '</div></div></a>';
    h += '</div>';
    return h;
  }

  function colRelRow(r) {
    var id = num(r && r.id, 0);
    var title = (r && (r.title_ru || r.title_original)) || 'Без названия';
    var year = (r && r.year) || '?';
    var ep = ((r && r.episodes_released) || 0) + '/' + ((r && r.episodes_total) || 0);
    return '<div class="row"><img class="rposter" src="' + esc(C.imgUrl(r)) + '" alt="" loading="lazy">' +
      '<div class="rinfo"><div class="rtitle">' + esc(title) + '</div>' +
      '<div class="rsub">' + esc(year) + ' · ' + esc(ep) + ' эп. · ' + esc(statusName(r)) + '</div></div>' +
      '<div class="ractions"><a class="btn sm primary" href="index.html?p=release&id=' + id + '">Открыть →</a></div></div>';
  }

  async function loadCollections(tab, page, append) {
    colState.tab = tab; colState.page = page || 0;
    var box = document.getElementById('colList');
    if (!box) return;
    if (!append) box.innerHTML = '<div class="empty">Загрузка…</div>';
    var d = null;
    try {
      if (tab === 'mine') d = await api.collectionsByProfile(myId(), colState.page);
      else if (tab === 'fav') d = await api.collectionFavAll(colState.page);
      else d = await api.collections(colState.page);
    } catch (e) {
      if (tab === 'mine') { d = { content: [] }; }
      else { box.innerHTML = errBox(e); return; }
    }
    var list = (d && (d.content || d.collections)) || [];
    if (append) {
      var g = box.querySelector('.col-grid.srv');
      if (g) g.insertAdjacentHTML('beforeend', list.map(colCard).join(''));
      var mw0 = document.getElementById('colMore'); if (mw0) mw0.remove();
      if (list.length >= 20) box.insertAdjacentHTML('beforeend', '<div id="colMore" style="margin-top:12px"><button class="btn sm" data-cact="more">Показать ещё</button></div>');
      wireCollections();
      return;
    }
    var out = '';
    if (tab === 'mine') {
      var cols = getCols(), names = Object.keys(cols);
      out += '<div class="col-sec-title"> Мои подборки <span class="badge">локальные</span></div>';
      if (!names.length) out += '<div class="empty">Локальных подборок нет. Создайте кнопкой «Локальная».</div>';
      else out += '<div class="rows" id="locRows">' + names.map(function (n) {
        return '<div class="row"><div class="rinfo"><div class="rtitle">' + esc(n) + '</div>' +
          '<div class="rsub">' + cols[n].length + ' аниме</div></div>' +
          '<div class="ractions">' +
          '<a class="btn sm primary" href="index.html?p=mylists&name=' + encodeURIComponent(n) + '">Открыть</a>' +
          '<button class="btn sm" data-drop="' + esc(n) + '">Удалить</button></div></div>';
      }).join('') + '</div>';
      out += '<div class="col-sec-title"> Коллекции Anixart</div>';
    }
    if (!list.length) out += '<div class="empty">' + (tab === 'mine' ? 'На сервере коллекций нет.' : 'Коллекций нет.') + '</div>';
    else out += '<div class="col-grid srv">' + list.map(colCard).join('') + '</div>';
    box.innerHTML = out;
    if (list.length >= 20) box.insertAdjacentHTML('beforeend', '<div id="colMore" style="margin-top:12px"><button class="btn sm" data-cact="more">Показать ещё</button></div>');
    wireCollections();
  }

  function wireCollections() {
    var box = document.getElementById('colList');
    if (!box || box.getAttribute('data-wired') === '1') return;
    box.setAttribute('data-wired', '1');
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-cact]') : null;
      if (b && b.getAttribute('data-cact') === 'more') { loadCollections(colState.tab, colState.page + 1, true); return; }
      var dr = e.target.closest ? e.target.closest('[data-drop]') : null;
      if (dr) {
        var n = dr.getAttribute('data-drop');
        if (confirm('Удалить локальную подборку «' + n + '»?')) { colDrop(n); loadCollections('mine', 0, false); }
        return;
      }
      var op = e.target.closest ? e.target.closest('[data-open]') : null;
      if (op) { location.href = 'index.html?p=mylists&name=' + encodeURIComponent(op.getAttribute('data-open')); return; }
    });
  }

  async function viewCollections(q) {
    if (!Auth.isAuth()) return { html: notice(' Коллекции доступны после <a href="index.html?p=login">входа</a>.', 'err') };
    var tab = q.tab || 'mine';
    var TABS = [['mine', 'Мои'], ['fav', 'Избранные'], ['all', 'Все']];
    var tabs = '<div class="ntf-tabs">' + TABS.map(function (t) {
      return '<button class="ntf-tab' + (t[0] === tab ? ' on' : '') + '" data-ctab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    var top = '<div class="btn-row" style="margin-bottom:14px">' +
      '<button class="btn primary" id="colNewLocal">➕ Локальная</button>' +
      '</div>';
    var ptitle = (tab === 'mine' ? 'Мои коллекции' : 'Коллекции');
    return {
      html: '<div class="page-title"> ' + ptitle + '</div>' + top + tabs + '<div id="colList"><div class="empty">Загрузка…</div></div>',
      after: function () {
        var page = document.getElementById('app');
        var bar = page ? page.querySelector('.ntf-tabs') : null;
        if (bar) bar.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('button[data-ctab]') : null;
          if (!b) return;
          location.href = 'index.html?p=collections&tab=' + b.getAttribute('data-ctab');
        });
        var nl = document.getElementById('colNewLocal');
        if (nl) nl.addEventListener('click', function () {
          var n = prompt('Название локальной коллекции:'); if (!n) return;
          colCreate(n); loadCollections('mine', 0, false);
        });
        loadCollections(tab, 0, false);
      }
    };
  }

  /* ---- просмотр одной коллекции ---- */
  async function viewCollection(q) {
    if (!Auth.isAuth()) return { html: notice(' Войдите для просмотра коллекций. <a href="index.html?p=login">Войти</a>', 'err') };
    var id = num(q.id, 0);
    if (!id) return { html: empty('Неверный ID коллекции.') };
    var d = await api.collection(id);
    var c = d.collection || d;
    if (!c || !c.id) return { html: empty('Коллекция не найдена.') };
    var title = c.title || 'Без названия';
    var pr = c.profile || {};
    var mine = num(pr.id, 0) === myId();
    var h = '<div class="page-title"> ' + esc(title) + '</div>';
    h += '<div class="page-sub">' + (pr.login ? '@' + esc(pr.login) + ' · ' : '') + num(c.count || c.releases_count, 0) + ' релизов</div>';
    if (c.description) h += '<div class="desc">' + esc(String(c.description).slice(0, 1500)).replace(/\n/g, '<br>') + '</div>';
    h += '<div class="btn-row" style="margin:10px 0 16px">';
    h += '<button class="btn sm" data-cact2="fav">⭐ В избранное</button>';
    h += '<button class="btn sm" data-cact2="unfav">Убрать из избранного</button>';
    if (mine) h += '<button class="btn sm" data-cact2="del"> Удалить коллекцию</button>';
    h += '</div>';
    h += '<div id="colRel"><div class="empty">Загрузка релизов…</div></div>';
    h += '<div class="comments" id="colComments" data-id="' + id + '"><div class="page-title"> Комментарии</div><div id="colCmtList"><div class="empty">Загрузка…</div></div></div>';
    return {
      html: h,
      after: function () {
        var page = document.getElementById('app');
        var bar = page ? page.querySelector('.btn-row') : null;
        if (bar) bar.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('button[data-cact2]') : null;
          if (!b) return;
          var a = b.getAttribute('data-cact2');
          var pr2 = a === 'fav' ? api.collectionFavAdd(id) : a === 'unfav' ? api.collectionFavDelete(id)
            : api.collectionDelete(id);
          pr2.then(function () {
            if (a === 'del') { alert('Удалено'); location.href = 'index.html?p=collections'; }
            else alert('Готово');
          }).catch(function (er) { alert(er.message || er); });
        });
        loadCollectionReleases(id, 0, false);
        loadColComments(id, 0, false);
      }
    };
  }

  async function loadCollectionReleases(id, page, append) {
    var box = document.getElementById('colRel');
    if (!box) return;
    if (!append) box.innerHTML = '<div class="empty">Загрузка релизов…</div>';
    var d;
    try { d = await api.collectionReleases(id, page || 0); } catch (e) { box.innerHTML = errBox(e); return; }
    var list = (d && (d.content || d.releases)) || [];
    if (!list.length) { box.innerHTML = '<div class="empty">Релизов нет.</div>'; return; }
    var html = list.map(function (r) { return colRelRow(r); }).join('');
    if (append) { var o = box.querySelector('.rows'); if (o) o.insertAdjacentHTML('beforeend', html); }
    else box.innerHTML = '<div class="rows">' + html + '</div>';
  }

  /* ---- комментарии коллекции ---- */
  var colCmtState = { id: 0, page: 0, sort: 3 };
  function ccProfile(c) { var p = (c && c.profile) || {}; return { login: p.login || ('user' + num(p.id,0)), id: num(p.id,0), av: C.imgUrl(p) }; }
  function ccVote(c) { var v = c && c.vote; if (v && typeof v==='object') return { likes:num(v.likes,0), dislikes:num(v.dislikes,0) }; return { likes:num(c&&c.likes,0), dislikes:num(c&&c.dislikes,0) }; }
  function ccItem(c, level) {
    level = level || 0;
    var id = num(c.id, 0), pr = ccProfile(c), vv = ccVote(c);
    var msg = c.message || c.text || '';
    msg = c.is_deleted ? '<i style="color:var(--text-mute)">Комментарий удалён</i>' : esc(msg).replace(/\n/g,'<br>');
    var mine = myId() && pr.id === myId();
    var h = '<div class="cmt" data-id="' + id + '" style="margin-left:' + (level*18) + 'px">';
    h += '<div class="cmt-head">';
    h += pr.av ? '<img class="cmt-av" src="' + esc(pr.av) + '" alt="" loading="lazy">' : '<div class="cmt-av ph">' + esc(pr.login.slice(0,1).toUpperCase()) + '</div>';
    h += '<div class="cmt-meta"><a class="cmt-login" href="index.html?p=profile&id=' + pr.id + '"><b>' + esc(pr.login) + '</b></a><span class="cmt-date">' + esc(fmtDate(c.timestamp || c.date)) + '</span></div></div>';
    h += '<div class="cmt-body">' + msg + '</div>';
    if (!c.is_deleted) {
      h += '<div class="cmt-actions">';
      h += '<button class="cmt-act" data-cact3="like" data-id="' + id + '"> ' + vv.likes + '</button>';
      h += '<button class="cmt-act" data-cact3="dislike" data-id="' + id + '"> ' + vv.dislikes + '</button>';
      if (mine) h += '<button class="cmt-act" data-cact3="del" data-id="' + id + '">Удалить</button>';
      h += '</div>';
    }
    h += '</div>';
    return h;
  }
  function ccForm(id) {
    return '<div class="cmt-form"><textarea class="cmt-input" id="ccText" rows="2" placeholder="Написать комментарий…"></textarea>' +
      '<button class="btn primary sm" data-cact3="send" data-id="' + id + '">Отправить</button></div>';
  }
  async function loadColComments(id, page, append) {
    colCmtState.id = id; colCmtState.page = page || 0;
    var box = document.getElementById('colCmtList');
    if (!box) return;
    if (!append) box.innerHTML = '<div class="empty">Загрузка комментариев…</div>';
    var d;
    try { d = await api.collectionCommentAll(id, colCmtState.page, colCmtState.sort); } catch (e) { box.innerHTML = errBox(e); return; }
    var list = (d && (d.comments || d.content)) || [];
    var body = list.length ? list.map(function (c) { return ccItem(c, 0); }).join('') : '<div class="empty">Комментариев нет.</div>';
    if (append) { var o = box.querySelector('.cmt-list'); if (o) o.insertAdjacentHTML('beforeend', list.map(function (c){return ccItem(c,0);}).join('')); }
    else box.innerHTML = ccForm(id) + '<div class="cmt-list">' + body + '</div>';
    wireColComments();
  }
  function wireColComments() {
    var box = document.getElementById('colCmtList');
    if (!box || box.getAttribute('data-wired') === '1') return;
    box.setAttribute('data-wired', '1');
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-cact3]') : null;
      if (!b) return;
      var a = b.getAttribute('data-cact3'), id = num(b.getAttribute('data-id'), 0);
      if (a === 'send') {
        var ta = document.getElementById('ccText'); var tx = ta ? ta.value.trim() : ''; if (!tx) return;
        api.collectionCommentAdd(id, { message: tx }).then(function(){ loadColComments(id,0,false); }).catch(function(er){alert(er.message||er);});
      } else if (a === 'like') { api.collectionCommentVote(id, 2).then(function(){ loadColComments(colCmtState.id,0,false); }).catch(function(er){alert(er.message||er);}); }
      else if (a === 'dislike') { api.collectionCommentVote(id, 1).then(function(){ loadColComments(colCmtState.id,0,false); }).catch(function(er){alert(er.message||er);}); }
      else if (a === 'del') { if (!confirm('Удалить комментарий?')) return; api.collectionCommentDelete(id).then(function(){ loadColComments(colCmtState.id,0,false); }).catch(function(er){alert(er.message||er);}); }
    });
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
        '<button class="btn primary" type="submit" id="lgBtn">Войти</button></form><div id="lgMsg"></div><div class="auth-alt">Нет аккаунта? <a href="index.html?p=register">Зарегистрироваться</a></div></div>' +
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

  function viewSettings() {
    var cur = C.getProxy();
    return {
      html: '<div class="authbox"><h2>⚙️ Настройки</h2>' +
        '<div class="field"><label>Прокси-сервер для комментариев (URL скрипта)</label>' +
        '<input type="url" id="stProxy" placeholder="https://ваш-сервер/proxy.php" value="' + esc(cur) + '"></div>' +
        '<div class="btn-row"><button class="btn primary" id="stSave">Сохранить</button>' +
        '<button class="btn sm" id="stClear">Очистить</button></div>' +
        '<div id="stMsg"></div></div>' +
        notice('Прокси нужен только для <b>отправки</b> комментариев (API требует заголовок User-Agent, который браузер подставить не может). Без прокси можно читать комментарии, голосовать, добавлять в друзья.') +
        notice('Скрипт-пример прокси — в файле <b>proxy.php</b> на GitHub-репозитории.'),
      after: function () {
        var inp = document.getElementById('stProxy');
        var msg = document.getElementById('stMsg');
        var save = document.getElementById('stSave');
        var clr = document.getElementById('stClear');
        if (save) save.addEventListener('click', function () {
          C.setProxy(inp.value);
          msg.innerHTML = notice('Сохранено.', 'ok');
        });
        if (clr) clr.addEventListener('click', function () {
          inp.value = ''; C.setProxy('');
          msg.innerHTML = notice('Прокси очищен. Комментирование отключено.', 'ok');
        });
      }
    };
  }

  function viewRegister() {
    if (Auth.isAuth()) return { html: notice('Вы уже вошли как <b>' + esc((Auth.profile() || {}).login || '') + '</b>. <a href="index.html?p=profile">Профиль</a>') };
    var H = '<div class="authbox"><h2> Регистрация в Anixart</h2>' +
      '<div id="regStep1"><form id="regForm1">' +
      '<div class="field"><label>Email</label><input type="email" id="rgEmail" autocomplete="email" required></div>' +
      '<div class="field"><label>Логин</label><input type="text" id="rgLogin" autocomplete="username" required></div>' +
      '<div class="field"><label>Пароль</label><input type="password" id="rgPass" autocomplete="new-password" required></div>' +
      '<div class="field"><label>Повтор пароля</label><input type="password" id="rgPass2" autocomplete="new-password" required></div>' +
      '<button class="btn primary" type="submit" id="rgBtn1">Получить код</button></form>' +
      '<div id="rgMsg1"></div></div>' +
      '<div id="regStep2" style="display:none"><div class="notice">Код отправлен на <b id="rgEmailShow"></b>. Введите его ниже.</div>' +
      '<form id="regForm2"><div class="field"><label>Код из письма</label><input type="text" id="rgCode" inputmode="numeric" maxlength="6" placeholder="0000" required></div>' +
      '<button class="btn primary" type="submit" id="rgBtn2">Подтвердить</button> ' +
      '<button class="btn sm" type="button" id="rgBack">Назад</button></form>' +
      '<div id="rgMsg2"></div></div>' +
      '<div class="auth-alt">Уже есть аккаунт? <a href="index.html?p=login">Войти</a></div></div>' +
      notice('Код приходит на указанную почту. Запрос уходит напрямую к API Anixart.');
    return {
      html: H,
      after: function () {
        var email = '', login = '', pass = '', hash = '';
        var f1 = document.getElementById('regForm1');
        var f2 = document.getElementById('regForm2');
        if (f1) f1.addEventListener('submit', async function (e) {
          e.preventDefault();
          email = document.getElementById('rgEmail').value.trim();
          login = document.getElementById('rgLogin').value.trim();
          pass = document.getElementById('rgPass').value;
          var pass2 = document.getElementById('rgPass2').value;
          var msg = document.getElementById('rgMsg1'), btn = document.getElementById('rgBtn1');
          if (!email || !login || !pass) { msg.innerHTML = notice('Заполните все поля.', 'err'); return; }
          if (pass !== pass2) { msg.innerHTML = notice('Пароли не совпадают.', 'err'); return; }
          btn.disabled = true; btn.textContent = 'Отправляем…';
          try {
            var res = await api.signUp(email, login, pass);
            var rc = num(res && res.code, -1);
            if (rc !== 0) throw new Error(REG_ERR[rc] || ERR_CODES[rc] || ('Код ' + rc));
            hash = res.hash || '';
            document.getElementById('rgEmailShow').textContent = email;
            document.getElementById('regStep1').style.display = 'none';
            document.getElementById('regStep2').style.display = '';
          } catch (err) {
            msg.innerHTML = notice('Ошибка: ' + esc(err.message), 'err');
            btn.disabled = false; btn.textContent = 'Получить код';
          }
        });
        if (f2) f2.addEventListener('submit', async function (e) {
          e.preventDefault();
          var code = document.getElementById('rgCode').value.trim();
          var msg = document.getElementById('rgMsg2'), btn = document.getElementById('rgBtn2');
          if (!code) { msg.innerHTML = notice('Введите код.', 'err'); return; }
          btn.disabled = true; btn.textContent = 'Проверяем…';
          try {
            var res = await api.verify(email, login, pass, hash, code);
            var rc = num(res && res.code, -1);
            if (rc !== 0) throw new Error(REG_ERR[rc] || ERR_CODES[rc] || ('Код ' + rc));
            var tok = res.profileToken && res.profileToken.token;
            if (!tok) throw new Error('Не удалось получить токен.');
            Auth.set(tok, res.profile || null);
            location.href = 'index.html?p=profile';
          } catch (err) {
            msg.innerHTML = notice('Ошибка: ' + esc(err.message), 'err');
            btn.disabled = false; btn.textContent = 'Подтвердить';
          }
        });
        var back = document.getElementById('rgBack');
        if (back) back.addEventListener('click', function () {
          document.getElementById('regStep2').style.display = 'none';
          document.getElementById('regStep1').style.display = '';
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
    var _pid = num(p.id, 0), _my = myId();
    if (Auth.isAuth() && _pid && _pid !== _my) {
      var _fs = (p.friend_status === 2) ? 2 : 0;
      h += '<div id="frActMsg"></div>';
      h += '<div class="btn-row" id="frAct">';
      if (_fs === 2) {
        h += '<button class="btn sm primary" data-fr="remove">Удалить из друзей</button>';
      } else {
        h += '<button class="btn sm primary" data-fr="send">В друзья</button>';
        h += '<button class="btn sm" data-fr="remove">Отменить заявку</button>';
      }
      h += '<button class="btn sm" data-fr="block">Блок</button>';
      h += '</div>';
    }
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
    var out = profileView(d.profile);
    var _tp = num(d.profile.id, 0);
    out.after = function () { if (Auth.isAuth() && _tp && _tp !== myId()) wireFriendActions(_tp); };
    return out;
  }

  function wireFriendActions(pid) {
    var box = document.getElementById('frAct');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-fr]') : null;
      if (!b) return;
      var act = b.getAttribute('data-fr');
      var msg = document.getElementById('frActMsg');
      var btns = box.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
      var fn = act === 'send' ? api.friendRequestSend(pid) : act === 'remove' ? api.friendRequestRemove(pid) : api.blockAdd(pid);
      Promise.resolve(fn).then(function (r) {
        if (msg) msg.innerHTML = frMsg(r && r.code);
        setTimeout(function () { location.reload(); }, 900);
      }).catch(function (err) {
        if (msg) msg.innerHTML = notice('Ошибка: ' + esc(err.message), 'err');
        for (var j = 0; j < btns.length; j++) btns[j].disabled = false;
      });
    });
  }

  function frMsg(code) {
    var c = (code === undefined || code === null) ? 0 : code;
    if (c === 0) return notice('Готово.', 'ok');
    if (c === 2) return notice('Заявка подтверждена — теперь вы друзья.', 'ok');
    if (c === 3) return notice('Заявка уже отправлена.', 'ok');
    if (c === 4) return notice('Профиль заблокирован.', 'err');
    if (c === 5) return notice('Вы заблокированы этим пользователем.', 'err');
    if (c === 6) return notice('Достигнут лимит друзей.', 'err');
    if (c === 402) return notice('Действие запрещено (402).', 'err');
    return notice('Код ответа: ' + c, 'err');
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
    var out = '<div class="page-title">📋 Мои подборки</div>' +
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
    login: viewLogin, register: viewRegister, settings: viewSettings, profile: viewProfile, lists: viewLists,
    mylists: viewMylists, mylist: viewMylists, notifs: viewNotifs, friends: viewFriends, collections: viewCollections, collection: viewCollection
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

  async function boot() {
    if (C.detectProxy) { try { await C.detectProxy(); } catch (e) {} }
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
