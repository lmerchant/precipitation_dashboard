/* US Precipitation Data Sources — app logic */
(function () {
  'use strict';

  var DATA = window.PRECIP_DATA;
  var ENTRIES = DATA.entries;
  var AGENCIES = ['NASA', 'NOAA', 'NSF', 'NWS', 'Other US', 'State agencies', 'International', 'Extra'];
  var AGENCY_LABELS = {
    NASA: 'NASA', NOAA: 'NOAA', NSF: 'NSF', NWS: 'NWS', 'Other US': 'Other US',
    'State agencies': 'State agencies', International: 'International', Extra: 'Research projects',
  };
  var STAT_LABELS = {
    'Other US': 'Other US sources',
    International: 'International sources',
    Extra: 'Research projects',
  };

  // The Dashboard, State agencies and International tabs share one panel; each shows only its own sources.
  var SCOPE_GROUPS = { states: 'State agencies', international: 'International' };
  var SCOPE_TITLES = {
    dashboard: 'US Precipitation Data Sources',
    states: 'US State and Local Precipitation Data Sources',
    international: 'International Precipitation Data Sources',
  };
  var SCOPE_FILES = { dashboard: 'us', states: 'us-state-and-local', international: 'international' };

  // scope: which source list the shared panel last showed ('dashboard', 'states' or 'international').
  // stateCode: the State filter on the State agencies tab ('' for all states).
  var state = { view: 'dashboard', scope: null, query: '', agencies: {}, topics: {}, stateCode: '', sort: 'agency', expanded: {} };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function link(url, text) {
    return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + '</a>' : esc(text);
  }

  function fmtVolume(tb) {
    if (tb == null) return 'NA';
    if (tb >= 1000) return (tb / 1000).toFixed(1) + ' PB';
    return (tb >= 100 ? tb.toFixed(0) : tb.toFixed(1)) + ' TB';
  }

  function fmtCount(n) { return n == null ? 'NA' : n.toLocaleString('en-US'); }

  // Agency names as CSS class and color-variable suffixes ("Other US" -> "other-us").
  function cssKey(agency) { return agency.toLowerCase().replace(/\s+/g, '-'); }

  function badge(agency) { return '<span class="agency agency-' + cssKey(agency) + '">' + esc(agency) + '</span>'; }

  function groupScope(agency) {
    return Object.keys(SCOPE_GROUPS).filter(function (s) { return SCOPE_GROUPS[s] === agency; })[0] || 'dashboard';
  }

  function scopeEntries() {
    return ENTRIES.filter(function (e) { return groupScope(e.agency) === state.scope; });
  }

  function isStates() { return state.scope === 'states'; }

  // State names by two-letter code, from entries that cover a single state.
  var STATE_NAMES = {};
  ENTRIES.forEach(function (e) { if (e.stateCodes && e.stateCodes.length === 1) STATE_NAMES[e.stateCodes[0]] = e.state; });

  function scopeAgencies() {
    var present = {};
    scopeEntries().forEach(function (e) { present[e.agency] = true; });
    return AGENCIES.filter(function (a) { return present[a]; });
  }

  /* ── theme ──────────────────────────────────────────── */

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('precip-theme'); } catch (e) { /* storage unavailable */ }
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    $('theme-toggle').addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('precip-theme', next); } catch (e) { /* storage unavailable */ }
    });
  }

  /* ── tabs ───────────────────────────────────────────── */

  function showView(view) {
    state.view = SCOPE_GROUPS[view] ? view : 'dashboard';
    document.querySelectorAll('.tab').forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.view === state.view));
    });
    if (state.view !== state.scope) {
      state.scope = state.view;
      $('view-dashboard').setAttribute('aria-labelledby', 'tab-' + state.view);
      // Filters from the other tab may name agencies this one doesn't have, so start clean.
      state.query = ''; state.agencies = {}; state.topics = {}; state.stateCode = ''; state.expanded = {};
      $('search').value = '';
      note('export-note', '');
      $('state-filter-label').hidden = !isStates();
      $('col-agency').textContent = isStates() ? 'State' : 'Agency';
      $('sort-agency').textContent = isStates() ? 'State' : 'Agency';
      renderDashboard();
    }
  }

  function renderDashboard() {
    renderStats();
    renderStateFilter();
    renderChips();
    renderTable();
    renderNotes();
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        showView(t.dataset.view);
        history.replaceState(null, '', t.dataset.view === 'dashboard' ? '#' : '#' + t.dataset.view);
      });
    });
    window.addEventListener('hashchange', function () { showView(location.hash.slice(1)); });
    showView(location.hash.slice(1));
  }

  /* ── summary ────────────────────────────────────────── */

  function renderStats() {
    if (isStates()) { renderStateStats(); return; }
    var entries = scopeEntries(), agencies = scopeAgencies();
    var byAgency = {};
    entries.forEach(function (e) { byAgency[e.agency] = (byAgency[e.agency] || 0) + 1; });
    var total = entries.length;
    var bar = agencies.map(function (a) {
      return '<span style="width:' + (100 * (byAgency[a] || 0) / total) + '%;background:var(--' + cssKey(a) +
        ')" title="' + AGENCY_LABELS[a] + ': ' + (byAgency[a] || 0) + '"></span>';
    }).join('');
    $('stats').innerHTML =
      stat(total, state.scope === 'international' ? 'International sources' : 'Sources on the dashboard',
        '<div class="stat-bar" aria-hidden="true">' + bar + '</div>') +
      (agencies.length > 1 ? agencies.map(function (a) {
        return stat(byAgency[a] || 0, STAT_LABELS[a] || AGENCY_LABELS[a] + ' data centers & systems');
      }).join('') : '');
    $('stats').classList.toggle('is-single', agencies.length < 2);
  }

  function renderStateStats() {
    var entries = scopeEntries(), codes = {}, datasets = 0, tested = 0;
    entries.forEach(function (e) {
      e.stateCodes.forEach(function (c) { codes[c] = true; });
      datasets += e.datasetDetails.length;
      tested += e.datasetDetails.filter(function (d) { return d.verification === 'download tested'; }).length;
    });
    $('stats').innerHTML = stat(entries.length, 'State and local sources') +
      stat(Object.keys(codes).length, 'States with a source') +
      stat(datasets, 'Datasets') + stat(tested, 'Downloads tested');
    $('stats').classList.remove('is-single');
  }

  function stat(value, label, extra) {
    return '<div class="stat"><span class="stat-value">' + value + '</span><span class="stat-label">' +
      esc(label) + '</span>' + (extra || '') + '</div>';
  }

  /* ── filters ────────────────────────────────────────── */

  function renderStateFilter() {
    if (!isStates()) return;
    var counts = {};
    scopeEntries().forEach(function (e) { e.stateCodes.forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
    var codes = Object.keys(counts).filter(function (c) { return STATE_NAMES[c]; })
      .sort(function (a, b) { return STATE_NAMES[a].localeCompare(STATE_NAMES[b]); });
    $('state-filter').innerHTML = '<option value="">All states</option>' + codes.map(function (c) {
      return '<option value="' + c + '"' + (c === state.stateCode ? ' selected' : '') + '>' +
        esc(STATE_NAMES[c]) + ' (' + counts[c] + ')</option>';
    }).join('');
  }

  function renderChips() {
    var aCounts = {}, tCounts = {}, agencies = scopeAgencies();
    scopeEntries().forEach(function (e) {
      aCounts[e.agency] = (aCounts[e.agency] || 0) + 1;
      e.topics.forEach(function (t) { tCounts[t] = (tCounts[t] || 0) + 1; });
    });
    $('agency-filter').hidden = agencies.length < 2;
    $('agency-chips').innerHTML = agencies.map(function (a) {
      return chip('agency', a, AGENCY_LABELS[a], aCounts[a] || 0, 'var(--' + cssKey(a) + ')', state.agencies[a]);
    }).join('');
    $('topic-chips').innerHTML = Object.keys(DATA.topics).filter(function (t) { return tCounts[t]; }).map(function (t) {
      return chip('topic', t, DATA.topics[t], tCounts[t], null, state.topics[t]);
    }).join('');
  }

  function chip(kind, key, label, count, color, on) {
    return '<button class="chip" type="button" data-kind="' + kind + '" data-key="' + esc(key) + '" aria-pressed="' + !!on + '">' +
      (color ? '<span class="chip-dot" style="background:' + color + '"></span>' : '') +
      esc(label) + ' <span class="chip-count">' + count + '</span></button>';
  }

  function matches(e) {
    if (state.query) {
      var hay = [e.name, e.fullName, e.host, e.location, e.discipline, e.blurb, e.agency, e.state, e.orgType,
        e.holdings.join(' '), e.formats.join(' '),
        e.endpoints.map(function (x) { return x.name; }).join(' ')].join(' ').toLowerCase();
      if (hay.indexOf(state.query) === -1) return false;
    }
    if (state.stateCode && (!e.stateCodes || e.stateCodes.indexOf(state.stateCode) === -1)) return false;
    var agencies = Object.keys(state.agencies);
    if (agencies.length && agencies.indexOf(e.agency) === -1) return false;
    var topics = Object.keys(state.topics);
    if (topics.length && !topics.some(function (t) { return e.topics.indexOf(t) !== -1; })) return false;
    return true;
  }

  function sortList(list) {
    var byName = function (a, b) { return a.name.localeCompare(b.name); };
    var byAgency = function (a, b) {
      return AGENCIES.indexOf(a.agency) - AGENCIES.indexOf(b.agency) || (a.state || '').localeCompare(b.state || '');
    };
    var desc = function (key) {
      return function (a, b) { return (b[key] == null ? -1 : b[key]) - (a[key] == null ? -1 : a[key]) || byName(a, b); };
    };
    var cmp = {
      agency: function (a, b) { return byAgency(a, b) || byName(a, b); },
      name: byName,
      volume: desc('volumeTB'),
      datasets: desc('datasets'),
    }[state.sort];
    return list.slice().sort(cmp);
  }

  /* ── table ──────────────────────────────────────────── */

  var CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var COLS = 7;

  function host(url) { return url.replace(/^https?:\/\//, '').replace(/\/$/, ''); }

  function more(n, word) {
    return n > 0 ? '<li class="more">+ ' + n + ' more ' + word + (n > 1 ? 's' : '') + '</li>' : '';
  }

  function holdingsCell(e) {
    if (!e.holdings.length) return '<span class="dim">—</span>';
    var shown = e.holdings.slice(0, 3).map(function (h) { return '<li>' + esc(h.split(' (')[0]) + '</li>'; }).join('');
    return '<ul class="cell-list">' + shown + more(e.holdings.length - 3, 'item') + '</ul>';
  }

  function accessCell(e) {
    if (!e.endpoints.length) return '<span class="dim">—</span>';
    var shown = e.endpoints.slice(0, 2).map(function (x) { return '<li>' + link(x.url, x.name) + '</li>'; }).join('');
    return '<ul class="cell-list">' + shown + more(e.endpoints.length - 2, 'link') + '</ul>';
  }

  function shownEntries() { return sortList(scopeEntries().filter(matches)); }

  function renderTable() {
    var list = shownEntries();
    $('result-count').textContent = 'Showing ' + list.length + ' of ' + scopeEntries().length + ' sources';
    $('empty').hidden = list.length > 0;
    $('source-table').hidden = list.length === 0;
    $('table-body').innerHTML = list.map(rowHtml).join('');
  }

  function rowHtml(e) {
    var open = !!state.expanded[e.id];
    var main = '<tr class="row-main" data-id="' + esc(e.id) + '" aria-expanded="' + open + '">' +
      '<td><span class="src-name">' + esc(e.name) + '</span>' +
        (e.fullName !== e.name ? '<span class="src-full">' + esc(e.fullName) + '</span>' : '') + '</td>' +
      '<td>' + (e.state ? '<span class="state-name">' + esc(e.state) + '</span>' : badge(e.agency)) + '</td>' +
      '<td class="col-wide">' + esc(e.discipline) + '</td>' +
      '<td><div class="topic-list">' +
        e.topics.map(function (t) { return '<span class="topic">' + esc(DATA.topics[t]) + '</span>'; }).join('') + '</div></td>' +
      '<td class="col-wide">' + holdingsCell(e) + '</td>' +
      '<td class="col-access">' + accessCell(e) + '</td>' +
      '<td><button class="expand-btn" type="button" aria-expanded="' + open + '" aria-label="' +
        (open ? 'Hide' : 'Show') + ' all ' + e.endpoints.length + ' data access endpoints for ' + esc(e.name) + '">' +
        'Endpoints <span class="ep-count">' + e.endpoints.length + '</span>' + CHEVRON + '</button></td>' +
      '</tr>';
    if (!open) return main;
    return main + '<tr class="row-detail"><td colspan="' + COLS + '">' + detailHtml(e) + '</td></tr>';
  }

  function list(title, items, cls) {
    if (!items.length) return '';
    return '<div class="detail-col ' + (cls || '') + '"><h4>' + esc(title) + '</h4><ul>' +
      items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul></div>';
  }

  function endpointsTable(e) {
    if (!e.endpoints.length) return '';
    return '<div class="detail-col detail-col-endpoints"><h4>Data access endpoints</h4>' +
      '<table class="ep-table"><thead><tr><th scope="col">Name</th><th scope="col">Link address</th></tr></thead><tbody>' +
      e.endpoints.map(function (x) {
        return '<tr><td>' + esc(x.name) + '</td><td class="mono">' + link(x.url, host(x.url)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // State entries list each dataset with its time step, period of record and whether a download was tested.
  function datasetsTable(e) {
    return '<div class="detail-col detail-col-endpoints"><h4>Datasets</h4>' +
      '<table class="ep-table"><thead><tr><th scope="col">Dataset</th><th scope="col">Time step</th>' +
      '<th scope="col">Period of record</th><th scope="col">Download</th></tr></thead><tbody>' +
      e.datasetDetails.map(function (d) {
        return '<tr><td>' + link(d.accessUrl, d.name) + '</td><td>' + esc(d.temporalResolution) + '</td><td>' +
          esc(d.periodOfRecord) + '</td><td>' + esc(d.verification) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function metricsLine(e) {
    var items = [
      ['Archive volume', fmtVolume(e.volumeTB)],
      ['Datasets', fmtCount(e.datasets)],
    ];
    if (e.filesM != null) items.push(['Files', fmtCount(e.filesM) + ' million']);
    return '<dl class="metrics">' + items.map(function (m) {
      return '<div><dt>' + m[0] + '</dt><dd class="mono">' + m[1] + '</dd></div>';
    }).join('') + '</dl>';
  }

  function detailHtml(e) {
    var isProject = e.kind === 'research-project';
    var facts = [];
    if (e.state) facts.push((e.stateCodes.length > 1 ? 'States: ' + esc(e.stateCodes.join(', ')) : 'State: ' + esc(e.state)));
    if (e.orgType) facts.push('Host type: ' + esc(e.orgType));
    if (e.host) facts.push((isProject ? 'Organizations: ' : 'Host: ') + esc(e.host));
    if (e.location) facts.push('Location: ' + esc(e.location));
    if (e.years) facts.push('Years: ' + esc(e.years) + (e.ongoing ? ' (ongoing)' : ''));
    if (e.formats.length) facts.push('Formats: <span class="mono">' + esc(e.formats.join(', ')) + '</span>');
    var cited = e.sources.map(function (s) { return link(s.url, s.label); });
    var cols = [
      list('About', facts),
      list('Holdings', e.holdings.map(esc)),
      isProject ? '' : list('Sources', cited),
      e.datasetDetails ? datasetsTable(e) : endpointsTable(e),
      isProject ? list('References', cited, 'detail-col-refs') : '',
    ].join('');
    return (e.datasetDetails ? '' : metricsLine(e)) + '<p class="detail-blurb">' + esc(e.blurb) + '</p><div class="detail">' + cols + '</div>';
  }

  function renderNotes() {
    var files = {};
    // "Other US" and "International" share one source file, so list each file once.
    $('notes').innerHTML = scopeAgencies().map(function (a) { return DATA.meta[a]; }).filter(function (m) {
      if (files[m.file]) return false;
      files[m.file] = true;
      return true;
    }).map(function (m) {
      return '<div><h3>' + esc(m.title) + ' <span class="mono dim">(' + esc(m.file) + ')</span></h3><ul>' +
        m.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
  }

  function saveBlob(text, filename, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function note(id, text, isError) {
    var el = $(id);
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  /* ── Excel export ───────────────────────────────────── */

  function joinLinks(items, nameKey) {
    return items.map(function (x) { return x[nameKey] + (x.url ? ': ' + x.url : ''); }).join('\n');
  }

  function centerRow(e) {
    var row = e.state ? { 'State': e.stateCodes.length > 1 ? e.stateCodes.join(', ') : e.state, 'Host type': e.orgType } : {};
    return Object.assign(row, {
      'Name': e.name,
      'Full name': e.fullName,
      'Focus': e.discipline,
      'Topics': e.topics.map(function (t) { return DATA.topics[t]; }).join(', '),
      'Host': e.host,
      'Location': e.location,
      'Description': e.blurb,
      'Holdings': e.holdings.join('\n'),
      'Formats': e.formats.join(', '),
      'Archive volume (TB)': e.volumeTB,
      'Files (millions)': e.filesM,
      'Datasets': e.datasets,
      'Data access': joinLinks(e.endpoints, 'name'),
      'Sources': joinLinks(e.sources, 'label'),
    });
  }

  function projectRow(e) {
    return {
      'Project': e.name,
      'Years': e.years,
      'Start year': e.startYear,
      'End year': e.endYear,
      'Ongoing': e.ongoing ? 'Yes' : 'No',
      'Topics': e.topics.map(function (t) { return DATA.topics[t]; }).join(', '),
      'Organizations': e.organizations.join('\n'),
      'Project URL': e.endpoints.length && e.endpoints[0].name === 'Project overview' ? e.endpoints[0].url : '',
      'Archival sources': e.archivalSources.map(function (a) {
        return a.name + (a.url ? ': ' + a.url : '') + (a.note ? ' (' + a.note + ')' : '');
      }).join('\n'),
      'References': joinLinks(e.sources, 'label'),
    };
  }

  function sheetFrom(rows) {
    var ws = XLSX.utils.json_to_sheet(rows);
    var cols = Object.keys(rows[0]);
    ws['!cols'] = cols.map(function (c) {
      var longest = rows.reduce(function (m, r) {
        var first = String(r[c] == null ? '' : r[c]).split('\n')[0];
        return Math.max(m, first.length);
      }, c.length);
      return { wch: Math.min(60, Math.max(10, longest + 2)) };
    });
    ws['!autofilter'] = { ref: ws['!ref'] };
    return ws;
  }

  // Groups entries by agency, in agency order, skipping agencies with no entries.
  function byAgency(list, rowFn) {
    var groups = {};
    AGENCIES.forEach(function (a) {
      var rows = list.filter(function (e) { return e.agency === a; });
      if (rows.length) groups[a] = sortList(rows).map(rowFn);
    });
    return groups;
  }

  function exportFile(filtered, ext) {
    return SCOPE_FILES[state.scope] + '-precipitation-data-sources' + (filtered ? '-filtered' : '') + ext;
  }

  function exportSummary(file, groups, filtered) {
    var n = Object.keys(groups).reduce(function (s, a) { return s + groups[a].length; }, 0);
    note('export-note', 'Saved ' + file + ' (' + (filtered ? n + ' of ' + scopeEntries().length : 'all ' + n) +
      ' sources; ' + Object.keys(groups).join(', ') + ').');
  }

  function exportExcel(list, filtered) {
    if (typeof XLSX === 'undefined') {
      note('export-note', 'The Excel library did not load. Check your internet connection and reload the page.', true);
      return;
    }
    var wb = XLSX.utils.book_new();
    var sheets = byAgency(list, function (e) { return e.agency === 'Extra' ? projectRow(e) : centerRow(e); });
    Object.keys(sheets).forEach(function (a) { XLSX.utils.book_append_sheet(wb, sheetFrom(sheets[a]), a); });
    var file = exportFile(filtered, '.xlsx');
    XLSX.writeFile(wb, file);
    exportSummary(file, sheets, filtered);
  }

  function exportJson(list, filtered) {
    var sources = byAgency(list, function (e) { return e; });
    var doc = { title: SCOPE_TITLES[state.scope], topics: DATA.topics };
    if (filtered) {
      doc.filters = {
        search: state.query,
        state: state.stateCode ? STATE_NAMES[state.stateCode] : '',
        agencies: Object.keys(state.agencies),
        topics: Object.keys(state.topics).map(function (t) { return DATA.topics[t]; }),
      };
    }
    doc.sources = sources;
    var file = exportFile(filtered, '.json');
    saveBlob(JSON.stringify(doc, null, 2) + '\n', file, 'application/json');
    exportSummary(file, sources, filtered);
  }

  /* ── events ─────────────────────────────────────────── */

  // Two menus: "Save all as" exports every source, "Save filtered as" only the rows the table shows.
  function bindSaveMenus() {
    var menus = Array.prototype.slice.call(document.querySelectorAll('.save-menu'));
    function btn(m) { return m.querySelector('.btn'); }
    function panel(m) { return m.querySelector('.menu'); }
    function setOpen(m, open) {
      panel(m).hidden = !open;
      btn(m).setAttribute('aria-expanded', String(open));
    }
    menus.forEach(function (m) {
      btn(m).addEventListener('click', function (ev) {
        ev.stopPropagation();
        var open = panel(m).hidden;
        menus.forEach(function (o) { setOpen(o, false); });
        setOpen(m, open);
      });
      panel(m).addEventListener('click', function (ev) {
        var item = ev.target.closest('.menu-item');
        if (!item) return;
        setOpen(m, false);
        var filtered = m.dataset.scope === 'filtered';
        var list = filtered ? shownEntries() : sortList(scopeEntries());
        if (!list.length) { note('export-note', 'No sources match these filters, so there is nothing to save.', true); return; }
        (item.dataset.format === 'excel' ? exportExcel : exportJson)(list, filtered);
      });
    });
    document.addEventListener('click', function (ev) {
      menus.forEach(function (m) { if (!m.contains(ev.target)) setOpen(m, false); });
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      menus.forEach(function (m) {
        if (!panel(m).hidden) { setOpen(m, false); btn(m).focus(); }
      });
    });
  }

  function toggleIn(map, key) { if (map[key]) delete map[key]; else map[key] = true; }

  function bind() {
    $('search').addEventListener('input', function (ev) { state.query = ev.target.value.trim().toLowerCase(); renderTable(); });
    $('sort').addEventListener('change', function (ev) { state.sort = ev.target.value; renderTable(); });
    $('state-filter').addEventListener('change', function (ev) { state.stateCode = ev.target.value; renderTable(); });
    document.querySelector('.controls').addEventListener('click', function (ev) {
      var c = ev.target.closest('.chip');
      if (!c) return;
      toggleIn(c.dataset.kind === 'agency' ? state.agencies : state.topics, c.dataset.key);
      renderChips();
      renderTable();
    });
    $('table-body').addEventListener('click', function (ev) {
      if (ev.target.closest('a')) return;
      var row = ev.target.closest('.row-main');
      if (!row) return;
      toggleIn(state.expanded, row.dataset.id);
      renderTable();
    });
    $('reset').addEventListener('click', function () {
      state.query = ''; state.agencies = {}; state.topics = {}; state.stateCode = '';
      $('search').value = '';
      renderStateFilter();
      renderChips();
      renderTable();
    });
    bindSaveMenus();
  }

  initTheme();
  bind();
  initTabs();
})();
