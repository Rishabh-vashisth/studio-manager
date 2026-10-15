(function () {
  'use strict';
  const L = StudioLogic;

  // ---------- Small helpers ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (arr) => {
    const m = {};
    arr.forEach((x) => (m[x.id] = x));
    return m;
  };
  const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = (o) => JSON.parse(JSON.stringify(o));
  const nowISO = () => new Date().toISOString();

  const prefs = {
    get(k, d) {
      try {
        const v = localStorage.getItem('sm:' + k);
        return v === null ? d : v;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('sm:' + k, v);
      } catch (e) {}
    },
  };

  let toastTimer;
  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast' + (kind === 'error' ? ' error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 4600);
  }

  function errMsg(e) {
    const code = e && e.code;
    if (code === 'quota_exceeded') return 'The studio database is full. Remove old items to add new ones.';
    if (code === 'invalid_argument' || code === 'not_granted') return 'That change was refused. If you can only view this studio, ask the owner for edit access.';
    if (code === 'resource_exhausted') return 'Too many changes at once. Wait a moment and try again.';
    return (e && e.message) || 'Something went wrong. Try again.';
  }

  // ---------- Storage: shared database when available, this device otherwise ----------
  function mergeDeep(a, b) {
    const out = Object.assign({}, a);
    Object.keys(b).forEach((k) => {
      const v = b[k];
      const plain = (x) => x && typeof x === 'object' && !Array.isArray(x);
      out[k] = plain(v) && plain(a && a[k]) ? mergeDeep(a[k], v) : v;
    });
    return out;
  }

  function makeLocalStore() {
    const KEY = 'studio-manager-v1';
    let data = {};
    try {
      data = JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch (e) {
      data = {};
    }
    const subs = {};
    const persist = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) {}
    };
    const rows = (c) => Object.entries(data[c] || {}).map(([id, v]) => Object.assign({ id: id }, v));
    const emit = (c) => (subs[c] || []).forEach((f) => f(rows(c)));
    return {
      shared: false,
      subscribe(c, f) {
        (subs[c] = subs[c] || []).push(f);
        f(rows(c));
        return () => {};
      },
      async set(c, id, v) {
        (data[c] = data[c] || {})[id] = clean(v);
        persist();
        emit(c);
      },
      async update(c, id, patch) {
        const cur = (data[c] || {})[id];
        if (!cur) throw new Error('That item no longer exists.');
        data[c][id] = mergeDeep(cur, clean(patch));
        persist();
        emit(c);
      },
      async remove(c, id) {
        if (data[c]) delete data[c][id];
        persist();
        emit(c);
      },
    };
  }

  function makeDbStore(db) {
    const chain = {};
    const enqueue = (key, fn) => {
      const p = (chain[key] || Promise.resolve()).catch(() => {}).then(fn);
      chain[key] = p;
      return p;
    };
    return {
      shared: true,
      subscribe(c, f, onErr) {
        return db.collection(c).onSnapshot((snap) => f(snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))), onErr);
      },
      set: (c, id, v) => enqueue(c + '/' + id, () => db.doc(c + '/' + id).set(clean(v))),
      update: (c, id, patch) => enqueue(c + '/' + id, () => db.doc(c + '/' + id).update(clean(patch))),
      remove: (c, id) => enqueue(c + '/' + id, () => db.doc(c + '/' + id).delete()),
    };
  }

  // ---------- State ----------
  const COLLECTIONS = ['clients', 'projects', 'team', 'tasks', 'settings'];
  const state = { ready: false, failed: '', shared: false, canWrite: null, studio: {}, clients: [], projects: [], team: [], tasks: [] };
  const loaded = new Set();
  const VIEWS = ['today', 'projects', 'team', 'clients', 'studio'];
  const ui = { view: prefs.get('view', 'today'), projectId: null, open: {}, armed: null, viewAs: prefs.get('viewAs', '') };
  if (VIEWS.indexOf(ui.view) === -1) ui.view = 'today';
  let store = null;
  let sampleFn = null;
  let armTimer;
  let renderQueued = false;

  function connect(s) {
    store = s;
    state.shared = s.shared;
    COLLECTIONS.forEach((c) =>
      s.subscribe(
        c,
        (rows) => {
          if (c === 'settings') state.studio = rows.find((r) => r.id === 'studio') || {};
          else state[c] = rows;
          loaded.add(c);
          if (loaded.size === COLLECTIONS.length) state.ready = true;
          scheduleRender();
        },
        (e) => {
          state.failed = (e && e.message) || 'The studio data could not be loaded.';
          scheduleRender();
        }
      )
    );
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  const clientCtx = (p) => {
    const c = state.clients.find((x) => x.id === p.clientId);
    return { clientName: c ? c.name : 'The client', worry: c && c.worry ? c.worry : '' };
  };
  function saveProject(p) {
    const rest = Object.assign({}, p);
    delete rest.id;
    delete rest.brief; // the brief is saved field by field, so a stale copy never overwrites a teammate's answers
    return store.update('projects', p.id, rest);
  }

  // ---------- Shared pieces of markup ----------
  function statePill(st, daysLeft) {
    const labels = {
      overdue: 'Overdue ' + L.plural(-daysLeft, 'day', 'days'),
      'at-risk': 'At risk, due ' + L.relDays(daysLeft),
      'due-today': 'Due today',
      'on-track': 'On track',
      upcoming: 'Upcoming',
      planning: 'Dates not locked',
      done: 'Delivered',
    };
    const cls = st === 'upcoming' || st === 'planning' ? '' : st;
    return '<span class="pill ' + cls + '">' + esc(labels[st] || st) + '</span>';
  }

  function projectPill(sum) {
    if (sum.status === 'delivered') return statePill('done');
    if (sum.status === 'planning') return statePill('planning');
    const worst = sum.states.find((s) => s.state === sum.status);
    return statePill(sum.status, worst ? worst.daysLeft : 0);
  }

  function segsHtml(p, sum) {
    const cells = p.stages
      .map((_, i) => {
        const s = sum.states[i].state;
        return '<span class="seg ' + (s === 'planning' || s === 'upcoming' ? '' : s) + '"></span>';
      })
      .join('');
    return '<div class="segs" role="img" aria-label="' + sum.doneCount + ' of ' + p.stages.length + ' deliverables delivered">' + cells + '</div>';
  }

  function moodHtml(p, withQuote) {
    const mood = typeof p.mood === 'number' ? p.mood : 75;
    const mi = L.moodInfo(mood);
    const last = (p.log || []).slice().reverse().find((e) => e.reaction);
    return (
      '<div class="mood"><div class="mood-top"><span>Client mood</span><span>' + esc(mi.label) + '</span></div>' +
      '<div class="meter ' + (mi.tone === 'good' ? '' : mi.tone) + '"><span style="width:' + mood + '%"></span></div></div>' +
      (withQuote && last ? '<p class="quote">' + esc(last.reaction) + '</p>' : '')
    );
  }

  function memberOptions(sel) {
    return (
      '<option value="">Unassigned</option>' +
      state.team.map((m) => '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('')
    );
  }

  function armButton(key, confirmAction, id, label) {
    if (ui.armed === key) return '<button type="button" class="btn danger sm" data-action="' + confirmAction + '" data-id="' + esc(id) + '">Confirm remove</button>';
    return '<button type="button" class="btn line sm" data-action="arm" data-key="' + esc(key) + '">' + esc(label || 'Remove') + '</button>';
  }

  function taskCount(pr) {
    if (!pr.total) return 'No tasks yet';
    return pr.done + ' of ' + pr.total + (pr.total === 1 ? ' task' : ' tasks') + ' done';
  }

  function exampleTag(x) {
    return x && x.example ? '<span class="pill example">Example</span>' : '';
  }

  function taskRow(t, p, opts) {
    opts = opts || {};
    const mb = byId(state.team);
    const who = t.assigneeId && mb[t.assigneeId] ? mb[t.assigneeId].name : 'Unassigned';
    const due = L.taskDue(t, p);
    const d = due ? L.daysBetween(L.todayISO(), due) : null;
    const late = !t.done && d !== null && d < 0;
    const when = t.done ? 'Done' : due ? L.fmt(due) + ', ' + L.relDays(d) : '';
    const def = L.stageDef(t.stageKey);
    const meta = opts.detail
      ? ''
      : '<div class="t-meta"><span>' + esc(p ? p.name : '') + '</span><span>' + esc(def ? def.name : '') + '</span><span>' + esc(who) + '</span></div>';
    const right = opts.detail
      ? '<div class="acts"><select class="sel-sm" data-change="assign-task" data-id="' + esc(t.id) + '" aria-label="Assignee">' + memberOptions(t.assigneeId) + '</select>' +
        armButton('task:' + t.id, 'remove-task', t.id, 'Remove') + '</div>'
      : '<span class="t-when' + (late ? ' late' : '') + '">' + esc(when) + '</span>';
    return (
      '<div class="task' + (t.done ? ' done' : '') + '"><input type="checkbox" data-change="toggle-task" data-id="' + esc(t.id) + '"' + (t.done ? ' checked' : '') +
      ' aria-label="Done: ' + esc(t.title) + '"><div><div class="t-title">' + esc(t.title) + '</div>' + meta + '</div>' + right + '</div>'
    );
  }

  // ---------- Views ----------
  function renderToday() {
    const today = L.todayISO();
    const clients = byId(state.clients);
    const active = state.projects.filter((p) => L.currentIndex(p) !== -1);
    const an = L.analyze(state.projects, state.tasks, clients, today);
    const gaps = L.briefGaps(state.projects, clients);
    const brief = L.buildBrief({
      projectCount: state.projects.length,
      activeCount: active.length,
      attention: an.attention,
      upcoming: an.upcoming,
      gaps: gaps,
      hour: new Date().getHours(),
      streak: L.onTimeStreak(state.projects),
    });

    let acts = '';
    if (!state.projects.length) {
      acts =
        '<button type="button" class="btn on-hero" data-action="new-client">Add a client</button>' +
        (state.clients.length ? '<button type="button" class="btn on-hero" data-action="new-project">Create a project</button>' : '');
    } else if (brief.focus) {
      acts = '<button type="button" class="btn on-hero" data-action="open-project" data-id="' + esc(brief.focus.projectId) + '">Open ' + esc(brief.focus.projectName) + '</button>';
      if (brief.focus.canDeliver) acts += '<button type="button" class="btn on-hero" data-action="deliver-stage" data-id="' + esc(brief.focus.projectId) + '" data-stage="' + esc(brief.focus.stageKey) + '">Review and deliver</button>';
    } else if (brief.gap) {
      acts = '<button type="button" class="btn on-hero" data-action="open-project" data-id="' + esc(brief.gap.projectId) + '">' + (brief.gap.kind === 'brief' ? 'Open the brief' : 'Agree the dates') + '</button>';
    } else if (!active.length) {
      acts = '<button type="button" class="btn on-hero" data-action="new-project">New project</button>';
    }

    const hero =
      '<section class="hero"><p class="greet">' + esc(brief.greeting) + '</p><h1>' + esc(brief.headline) + '</h1><p class="body">' + esc(brief.body) + '</p>' +
      (acts ? '<div class="acts">' + acts + '</div>' : '') + '</section>';

    let attention = '';
    if (an.attention.length) {
      attention =
        '<section class="sec"><div class="sec-head"><h2>Needs attention</h2><span class="muted small">' + L.plural(an.attention.length, 'deliverable', 'deliverables') + '</span></div><div class="card rows">' +
        an.attention
          .map((a) => {
            const rescue = a.rescue.length
              ? '<div class="rescue">' +
                a.rescue
                  .map(
                    (r) =>
                      '<div class="rescue-item"><strong>' + esc(r.title) + '</strong><p>' + esc(r.text) + '</p>' +
                      (r.kind === 'date' ? '<button type="button" class="btn quiet sm" data-action="change-date" data-id="' + esc(a.projectId) + '" data-stage="' + esc(a.stageKey) + '">Change date</button>' : '') +
                      '</div>'
                  )
                  .join('') +
                '</div>'
              : '';
            return (
              '<div class="row attn"><div class="attn-top">' + statePill(a.state, a.daysLeft) + '<span class="attn-title">' + esc(a.stageName) + '</span><span class="muted">' + esc(a.projectName) + '</span></div>' +
              '<div class="muted small">Locked date ' + esc(L.fmtDay(a.deadline)) + '. ' + taskCount(a.progress) + '.</div>' + rescue +
              '<div class="acts"><button type="button" class="btn line sm" data-action="open-project" data-id="' + esc(a.projectId) + '">Open project</button>' +
              (a.canDeliver ? '<button type="button" class="btn sm" data-action="deliver-stage" data-id="' + esc(a.projectId) + '" data-stage="' + esc(a.stageKey) + '">Review and deliver</button>' : '') +
              '</div></div>'
            );
          })
          .join('') +
        '</div></section>';
    }

    const waiting = gaps.length
      ? '<section class="sec"><div class="sec-head"><h2>Waiting on a brief or dates</h2><span class="muted small">' + L.plural(gaps.length, 'project', 'projects') + '</span></div><div class="card rows">' +
        gaps
          .map((g) => {
            const isBrief = g.kind === 'brief';
            const line = isBrief
              ? g.essentialsDone + ' of ' + g.essentialsTotal + ' essential answers. Ask next: ' + g.next.label
              : 'The brief is complete. Agree the dates with the client and lock them.';
            return (
              '<div class="row attn"><div class="attn-top"><span class="pill' + (isBrief ? '' : ' due-today') + '">' + (isBrief ? 'Brief open' : 'Ready to lock') + '</span><span class="attn-title">' + esc(g.projectName) +
              '</span><span class="muted">' + esc(g.clientName) + '</span></div><div class="muted small">' + esc(line) + '</div>' +
              '<div class="acts"><button type="button" class="btn line sm" data-action="open-project" data-id="' + esc(g.projectId) + '">' + (isBrief ? 'Open the brief' : 'Agree the dates') + '</button></div></div>'
            );
          })
          .join('') +
        '</div></section>'
      : '';

    // Tasks
    const pb = byId(state.projects);
    const rows = [];
    state.tasks.forEach((t) => {
      if (t.done) return;
      const p = pb[t.projectId];
      if (!p || L.currentIndex(p) === -1) return;
      if (ui.viewAs && t.assigneeId && t.assigneeId !== ui.viewAs) return;
      const due = L.taskDue(t, p);
      if (!due) return;
      const d = L.daysBetween(today, due);
      if (d > 7) return;
      rows.push({ t: t, p: p, d: d });
    });
    rows.sort((a, b) => a.d - b.d);
    const picker = state.team.length
      ? '<label class="small muted" style="display:flex;gap:8px;align-items:center">Showing <select class="sel-sm" data-change="view-as" aria-label="Whose tasks">' +
        '<option value="">Everyone</option>' +
        state.team.map((m) => '<option value="' + esc(m.id) + '"' + (m.id === ui.viewAs ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') +
        '</select></label>'
      : '';
    const tasks =
      '<section class="sec"><div class="sec-head"><h2>Tasks due in the next 7 days</h2>' + picker + '</div>' +
      (rows.length
        ? '<div class="card rows">' + rows.map((r) => '<div class="row">' + taskRow(r.t, r.p) + '</div>').join('') + '</div>'
        : '<div class="empty"><h3>Nothing due this week</h3><p>' + (state.projects.length ? 'Add tasks to a deliverable so I can track them against its date.' : 'Tasks appear here once a project has deliverables with tasks.') + '</p></div>') +
      '</section>';

    const upcoming =
      '<section class="sec"><h2>Locked dates in the next two weeks</h2>' +
      (an.upcoming.length
        ? '<div class="card rows">' +
          an.upcoming
            .map(
              (u) =>
                '<div class="row" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><strong>' + esc(u.stageName) + '</strong> <span class="muted">' + esc(u.projectName) +
                '</span></div><span class="muted">' + esc(L.fmtDay(u.deadline)) + ', ' + esc(L.relDays(u.daysLeft)) + '</span></div>'
            )
            .join('') +
          '</div>'
        : '<p class="muted">No locked dates fall in the next two weeks.</p>') +
      '</section>';

    const sc = L.scorecard(state.projects);
    const pct = (v) => (v === null ? 'None yet' : v + '%');
    const score =
      '<section class="sec"><h2>Studio scorecard</h2><div class="score">' +
      '<div><div class="num">' + pct(sc.onTimeRate) + '</div><div class="lbl">Deliverables sent on time</div></div>' +
      '<div><div class="num">' + pct(sc.firstPassRate) + '</div><div class="lbl">Passed the quality gate first time</div></div>' +
      '<div><div class="num">' + sc.delivered + '</div><div class="lbl">Deliverables sent</div></div>' +
      '<div><div class="num">' + sc.portfolioReady + '</div><div class="lbl">Portfolio-ready projects</div></div></div></section>';

    return hero + attention + waiting + tasks + upcoming + score;
  }

  function briefFact(p) {
    if (p.locked || L.currentIndex(p) === -1) return '';
    const bs = L.briefState(p);
    return bs.complete ? '' : '<span>Brief <b>' + bs.essentialsDone + ' of ' + bs.essentialsTotal + '</b></span>';
  }

  function renderProjects() {
    const today = L.todayISO();
    const clients = byId(state.clients);
    const head =
      '<div class="head-row"><h1 class="view-title">Projects</h1><button type="button" class="btn" data-action="new-project">New project</button></div>';
    if (!state.projects.length) {
      return (
        head +
        '<div class="empty"><h3>No projects yet</h3><p>' +
        (state.clients.length
          ? 'Create a project for one of your clients. Take the full brief, agree the dates, then lock them.'
          : 'Add a client first. Every project belongs to a client with a need and an emotional goal.') +
        '</p><button type="button" class="btn" data-action="' + (state.clients.length ? 'new-project' : 'new-client') + '">' + (state.clients.length ? 'Create a project' : 'Add a client') + '</button></div>'
      );
    }
    const list = state.projects
      .map((p) => ({ p: p, sum: L.projectSummary(p, state.tasks, today) }))
      .sort((a, b) => (a.sum.status === 'delivered') - (b.sum.status === 'delivered') || (a.p.end < b.p.end ? -1 : 1));
    return (
      head +
      '<div class="grid">' +
      list
        .map(({ p, sum }) => {
          const c = clients[p.clientId];
          return (
            '<button type="button" class="proj" data-action="open-project" data-id="' + esc(p.id) + '"><div class="proj-top"><div><h3>' + esc(p.name) + '</h3><div class="muted small">' + esc(c ? c.name : 'Unknown client') + '</div></div>' + projectPill(sum) + '</div>' +
            segsHtml(p, sum) +
            '<div class="facts"><span>Delivery <b>' + esc(L.fmt(p.end)) + '</b></span><span>' + sum.doneCount + ' of ' + p.stages.length + (p.stages.length === 1 ? ' deliverable' : ' deliverables') + '</span>' + briefFact(p) + '</div>' +
            moodHtml(p, false) + (p.example ? '<div>' + exampleTag(p) + '</div>' : '') + '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function isStageOpen(p, i, sum) {
    const key = p.id + ':' + p.stages[i].key;
    return key in ui.open ? ui.open[key] : i === sum.currentIdx;
  }

  function stageHtml(p, i, sum) {
    const st = p.stages[i];
    const def = L.stageDef(st.key);
    const demand = p.brief && p.brief.demands && typeof p.brief.demands[st.key] === 'string' ? p.brief.demands[st.key].trim() : '';
    const s = sum.states[i];
    const isCur = i === sum.currentIdx;
    const open = isStageOpen(p, i, sum);
    const tasks = state.tasks.filter((t) => t.projectId === p.id && t.stageKey === st.key);
    const node = s.state === 'done' ? 'done' : s.state === 'overdue' ? 'cur overdue' : isCur ? 'cur' : '';
    const dateLine =
      s.state === 'done'
        ? 'Delivered ' + L.fmt(st.doneAt) + (s.lateDays ? ', ' + L.plural(s.lateDays, 'day', 'days') + ' late' : ', on time')
        : 'Due ' + L.fmtDay(st.deadline) + (p.locked ? ', locked' : '');

    let body = '';
    if (open) {
      const returned = st.returned && st.returned.length
        ? '<div class="returned"><strong>Sent back. These checks were not met:</strong><ul>' + st.returned.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul></div>'
        : '';
      const list = tasks.length ? '<div class="rows">' + tasks.map((t) => '<div class="row">' + taskRow(t, p, { detail: true }) + '</div>').join('') + '</div>' : '<p class="muted small">No tasks yet. Add the first one below.</p>';
      const form =
        '<form class="inline-form" data-form="add-task" data-id="' + esc(p.id) + '" data-stage="' + esc(st.key) + '">' +
        '<input type="text" id="nt-' + esc(st.key) + '" data-keep placeholder="Add a task to this deliverable" aria-label="New task" required maxlength="140">' +
        '<select id="na-' + esc(st.key) + '" data-keep aria-label="Assign to">' + memberOptions('') + '</select>' +
        '<button type="submit" class="btn quiet sm">Add task</button></form>';
      let acts = '';
      if (p.locked && s.state !== 'done') acts += '<button type="button" class="btn quiet sm" data-action="change-date" data-id="' + esc(p.id) + '" data-stage="' + esc(st.key) + '">Change date</button>';
      if (p.locked && isCur) acts += '<button type="button" class="btn sm" data-action="deliver-stage" data-id="' + esc(p.id) + '" data-stage="' + esc(st.key) + '">Review and deliver</button>';
      body = returned + '<div class="tasks-box">' + list + form + '</div>' + (acts ? '<div class="acts">' + acts + '</div>' : '');
    }

    return (
      '<div class="stage"><div class="rail"><span class="node ' + node + '"></span></div><div class="s-body"><div class="s-head"><div><div class="s-name"><button type="button" data-action="toggle-stage" data-id="' + esc(p.id) + '" data-stage="' + esc(st.key) + '" aria-expanded="' + open + '">' +
      esc(def.name) + '</button></div><div class="s-date">' + esc(dateLine) + '. ' + taskCount(s.progress) + '.</div>' + (demand ? '<div class="s-date">The client asked for: ' + esc(demand) + '</div>' : '') + '</div>' +
      statePill(s.state, s.daysLeft) + '</div>' + body + '</div></div>'
    );
  }

  function planHtml(p) {
    const problems = L.validateDates(p);
    const bs = L.briefState(p);
    return (
      '<section class="card sec"><div><h2>Agree the dates</h2><p class="muted">Talk through each deliverable with the client and set its date. When everyone agrees, lock them. After that every change needs a reason, is logged, and the client notices.</p></div>' +
      '<div class="fgrid"><label class="f">Start date<input type="date" id="plan-start" data-keep value="' + esc(p.start) + '"></label>' +
      '<label class="f">Delivery date<input type="date" id="plan-end" data-keep value="' + esc(p.end) + '"></label></div>' +
      '<div class="acts"><button type="button" class="btn quiet sm" data-action="propose-dates">Suggest dates from these two</button></div>' +
      '<div class="plan-dates">' +
      p.stages.map((s) => '<label>' + esc(L.stageDef(s.key).name) + '<input type="date" id="sd-' + esc(s.key) + '" data-keep data-change="set-stage-date" data-stage="' + esc(s.key) + '" value="' + esc(s.deadline) + '"></label>').join('') +
      '</div>' + (problems.length ? '<p class="problems">' + esc(problems[0]) + '</p>' : '') +
      (bs.complete ? '' : '<p class="muted">Finish the brief before locking: ' + bs.essentialsDone + ' of ' + bs.essentialsTotal + ' essential answers are in.</p>') +
      '<div class="acts"><button type="button" class="btn" data-action="lock-dates"' + (problems.length || !bs.complete ? ' disabled' : '') + '>Lock the dates</button></div></section>'
    );
  }

  // ---------- Client brief ----------

  function ensureBriefOpen(p) {
    ui.briefInit = ui.briefInit || {};
    if (ui.briefInit[p.id]) return;
    ui.briefInit[p.id] = true;
    const first = L.BRIEF_GROUPS.findIndex((g) => g.questions.some((q) => q.essential && !L.isAnswered(p, q.key)));
    L.BRIEF_GROUPS.forEach((g, i) => {
      const k = 'bg:' + p.id + ':' + g.key;
      if (!(k in ui.open)) ui.open[k] = i === first;
    });
  }

  function questionHtml(p, q) {
    return (
      '<label class="f">' + esc(q.label) + ' ' + (q.essential ? '<span class="tag">Essential</span>' : '<span class="muted">(optional)</span>') +
      '<span class="hint">' + esc(q.hint) + '</span><textarea id="bq-' + q.key + '" data-keep data-change="brief-answer" data-key="' + q.key + '" maxlength="700">' + esc(L.answerText(p, q.key)) + '</textarea></label>'
    );
  }

  function answerTargets(p) {
    const chosen = p.stages.map((s) => s.key);
    const demands = (p.brief && p.brief.demands) || {};
    return (
      '<option value="">Save to...</option>' +
      '<optgroup label="Brief questions">' +
      L.BRIEF_QUESTIONS.map((q) => '<option value="q:' + q.key + '">' + esc(L.clip(q.label, 56)) + (L.isAnswered(p, q.key) ? ' (answered)' : q.essential ? ' (essential)' : '') + '</option>').join('') +
      '</optgroup><optgroup label="What they expect">' +
      L.DELIVERABLES.filter((d) => chosen.indexOf(d.key) !== -1)
        .map((d) => '<option value="d:' + d.key + '">' + esc(d.name) + (String(demands[d.key] || '').trim() ? ' (answered)' : '') + '</option>')
        .join('') +
      '</optgroup>'
    );
  }

  function interviewHtml(p) {
    const c = state.clients.find((x) => x.id === p.clientId);
    const head = '<div class="sec-head"><h3>Interview the client</h3>' + (c ? '<span class="muted small">Speaking with ' + esc(c.name) + '</span>' : '') + '</div>';
    if (!sampleFn) {
      return '<div class="sec">' + head + '<p class="muted small">The simulated client is not available here. Type the answers into the brief yourself, as if you had asked the client in person.</p></div>';
    }
    const talk = (p.brief && p.brief.talk) || [];
    const opts = answerTargets(p);
    const turns = talk
      .map(
        (t, i) =>
          '<div class="turn"><p class="turn-q">' + esc(t.q) + '</p><p class="turn-a">' + esc(t.a) + '</p><div class="turn-save"><select id="tk-' + i + '" class="sel-sm" data-keep aria-label="Where to save this answer">' + opts +
          '</select><button type="button" class="btn quiet sm" data-action="save-turn" data-i="' + i + '">Save to brief</button></div></div>'
      )
      .join('');
    const chips = L.nextQuestions(p, 3)
      .map((q) => '<button type="button" class="chip-btn" data-action="fill-ask" data-q="' + esc(q.label) + '">' + esc(q.label) + '</button>')
      .join('');
    return (
      '<div class="sec">' + head +
      '<p class="muted small">Ask a question as you would in a meeting. The client answers from their own story. Save the useful answers into the brief below. The first question asks your permission to use Claude on this page.</p>' +
      (turns ? '<div class="talk">' + turns + '</div>' : '') +
      '<form class="ask-form" data-form="ask-client" data-id="' + esc(p.id) + '"><input type="text" id="ask-q" data-keep required placeholder="Ask the client a question" aria-label="Question for the client" maxlength="300" autocomplete="off"' + (ui.asking ? ' disabled' : '') + '>' +
      '<button type="submit" class="btn sm"' + (ui.asking ? ' disabled' : '') + '>' + (ui.asking ? 'Asking' : 'Ask') + '</button></form>' +
      (ui.asking ? '<p class="muted small" role="status">The client is thinking about it.</p>' : '') +
      (ui.askNote ? '<p class="problems" role="alert">' + esc(ui.askNote) + '</p>' : '') +
      (chips ? '<div class="chips"><span class="muted small">Not sure what to ask? Start here:</span>' + chips + '</div>' : '') +
      '</div>'
    );
  }

  function briefHtml(p) {
    const bs = L.briefState(p);
    const chosen = p.stages.map((s) => s.key);
    const older = chosen.some((k) => !L.DELIVERABLES.some((d) => d.key === k));
    const pct = Math.round((bs.essentialsDone / bs.essentialsTotal) * 100);
    const pill = bs.complete ? '<span class="pill ready">Brief complete</span>' : '<span class="pill">' + bs.essentialsDone + ' of ' + bs.essentialsTotal + ' essential answers</span>';
    const picker = L.DELIVERABLES.map(
      (d) =>
        '<label class="check dv"><input type="checkbox" data-change="set-deliverable" data-key="' + d.key + '"' + (chosen.indexOf(d.key) !== -1 ? ' checked' : '') + (p.locked ? ' disabled' : '') +
        '><span><strong>' + esc(d.name) + '</strong><span class="hint">' + esc(d.purpose) + '</span></span></label>'
    ).join('');
    const demands = L.DELIVERABLES.filter((d) => chosen.indexOf(d.key) !== -1)
      .map((d) => {
        const v = p.brief && p.brief.demands && typeof p.brief.demands[d.key] === 'string' ? p.brief.demands[d.key] : '';
        return (
          '<label class="f">' + esc(d.name) + '<span class="hint">What do they expect from this, in their own words?</span><textarea id="dm-' + d.key + '" data-keep data-change="brief-demand" data-key="' + d.key +
          '" maxlength="500" placeholder="' + esc(d.example) + '">' + esc(v) + '</textarea></label>'
        );
      })
      .join('');
    const groups = L.BRIEF_GROUPS.map((g) => {
      const open = !!ui.open['bg:' + p.id + ':' + g.key];
      const miss = g.questions.filter((q) => q.essential && !L.isAnswered(p, q.key)).length;
      return (
        '<div class="grp"><button type="button" class="grp-head" data-action="toggle-group" data-id="' + esc(p.id) + '" data-group="' + g.key + '" aria-expanded="' + open + '"><span>' + esc(g.title) +
        '</span><span class="muted small">' + (miss ? miss + ' essential to go' : 'Essentials done') + '</span></button>' +
        (open ? '<div class="stack grp-body">' + g.questions.map((q) => questionHtml(p, q)).join('') + '</div>' : '') + '</div>'
      );
    }).join('');
    return (
      '<section class="card sec"><div class="sec-head"><h2>Client brief</h2>' + pill + '</div>' +
      '<p class="muted">Take the full brief before agreeing any date. Dates and deliverables lock only when every essential answer is in.</p>' +
      '<div class="meter' + (bs.complete ? '' : ' warn') + '"><span style="width:' + pct + '%"></span></div>' +
      '<div class="sec"><h3>What the client wants delivered</h3>' +
      (older && !p.locked ? '<p class="muted small">This project uses the older stage list. Choosing deliverables replaces it.</p>' : '') +
      '<div class="dv-grid">' + picker + '</div>' +
      '<p class="muted small">' + (p.locked ? 'Deliverables are locked together with the dates.' : 'Changing the deliverables suggests new dates for all of them.') + '</p></div>' +
      interviewHtml(p) +
      (demands ? '<div class="sec"><h3>What they expect, in their own words</h3><div class="stack">' + demands + '</div></div>' : '') +
      '<div class="sec"><h3>Brief questions</h3><div class="grps">' + groups + '</div></div></section>'
    );
  }

  async function askClient(projectId) {
    const p = getProject(projectId);
    const inp = $('#ask-q');
    const q = inp ? inp.value.trim() : '';
    if (!p || !q || !sampleFn || ui.asking) return;
    const c = state.clients.find((x) => x.id === p.clientId);
    const talk = (p.brief && p.brief.talk) || [];
    ui.asking = true;
    ui.askNote = '';
    render();
    try {
      const r = await sampleFn(L.interviewPrompt(c, p, talk, q), { cache: false, modelTier: 'quick' });
      const a = String((r && r.text) || '').trim();
      if (!a) throw { code: 'empty_completion' };
      const next = talk.concat([{ q: q, a: a, t: nowISO() }]).slice(-40);
      await store.update('projects', projectId, { brief: { talk: next } });
      if (inp) inp.value = '';
    } catch (e) {
      const code = e && e.code;
      if (code === 'not_granted') ui.askNote = 'You chose not to let the client answer. Ask again if you change your mind, or type the answers into the brief yourself.';
      else if (code === 'rate_limited') ui.askNote = 'Too many questions in a short time. Wait a moment and ask again.';
      else if (code === 'session_expired') ui.askNote = 'Your session expired. Reload the page and try again.';
      else if (code === 'refused' || code === 'empty_completion') ui.askNote = 'The client had no answer to that. Try asking it another way.';
      else if (code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled' || code === 'capability_removed') {
        sampleFn = null;
      } else ui.askNote = 'The client could not answer just now. Try again.';
    } finally {
      ui.asking = false;
      render();
      const again = $('#ask-q');
      if (again && !sampleFn === false) again.focus();
    }
  }

  function renderProject() {
    const p = state.projects.find((x) => x.id === ui.projectId);
    if (!p) {
      ui.projectId = null;
      return renderProjects();
    }
    const today = L.todayISO();
    ensureBriefOpen(p);
    const sum = L.projectSummary(p, state.tasks, today);
    const c = state.clients.find((x) => x.id === p.clientId);

    const facts =
      '<div class="card" style="display:flex;gap:20px 36px;flex-wrap:wrap;align-items:flex-start"><div class="facts" style="flex-direction:column;gap:6px"><span>Delivery <b>' + esc(L.fmtDay(p.end)) + '</b></span>' +
      '<span>Dates <b>' + (p.locked ? 'Locked ' + esc(L.fmt(L.todayISO(new Date(p.lockedAt)))) : 'Not locked yet') + '</b></span><span>Deliverables <b>' + sum.doneCount + ' of ' + p.stages.length + ' delivered</b></span></div>' +
      '<div style="flex:1;min-width:230px;display:flex;flex-direction:column;gap:8px">' + moodHtml(p, true) + '</div></div>';

    let portfolio = '';
    if (sum.status === 'delivered') {
      const checks = (p.portfolio && p.portfolio.checks) || {};
      portfolio =
        '<section class="card sec"><div class="sec-head"><h2>Portfolio check</h2>' + (p.portfolio && p.portfolio.ready ? '<span class="pill ready">Portfolio-ready</span>' : '<span class="pill">Not ready yet</span>') + '</div>' +
        '<p class="muted">This project is delivered. Before it goes on the website, it has to show what the studio stands for: lively, positive homes.</p>' +
        '<div class="stack">' +
        L.PORTFOLIO_CHECKS.map((c2) => '<label class="check"><input type="checkbox" data-change="portfolio-check" data-key="' + c2.key + '"' + (checks[c2.key] ? ' checked' : '') + '><span>' + esc(c2.label) + '</span></label>').join('') +
        '</div></section>';
    }

    const log = (p.log || []).slice(-12).reverse();
    const logHtml =
      '<section class="sec"><h2>Activity</h2><div class="log">' +
      log.map((e) => '<div><div class="when">' + esc(L.fmt(L.todayISO(new Date(e.t)))) + '</div><div>' + esc(e.text) + '</div>' + (e.reaction ? '<p class="quote">' + esc(e.reaction) + '</p>' : '') + '</div>').join('') +
      '</div></section>';

    return (
      '<div><button type="button" class="btn line sm" data-action="back">All projects</button></div>' +
      '<div class="head-row"><div><h1 class="view-title">' + esc(p.name) + '</h1><p class="muted" style="margin-top:6px">' + esc(c ? c.name : 'Unknown client') + (c && c.need ? '. ' + esc(c.need) : '') + '</p></div><div class="acts">' + exampleTag(p) + projectPill(sum) + '</div></div>' +
      facts + briefHtml(p) + (p.locked ? '' : planHtml(p)) +
      '<section class="sec"><h2>Deliverables</h2><div class="stages">' + p.stages.map((_, i) => stageHtml(p, i, sum)).join('') + '</div></section>' +
      portfolio + logHtml
    );
  }

  function renderTeam() {
    const head = '<div class="head-row"><h1 class="view-title">Team</h1><button type="button" class="btn" data-action="new-member">Add a team member</button></div>';
    if (!state.team.length) {
      return head + '<div class="empty"><h3>No one on the team yet</h3><p>Add the people who work on your projects. You can assign tasks to them, and each person sees their own tasks on Today.</p><button type="button" class="btn" data-action="new-member">Add a team member</button></div>';
    }
    const pb = byId(state.projects);
    const unassigned = state.tasks.filter((t) => !t.done && !t.assigneeId).length;
    return (
      head +
      (unassigned ? '<p class="muted">' + L.plural(unassigned, 'open task has', 'open tasks have') + ' no one assigned.</p>' : '') +
      '<div class="people">' +
      state.team
        .map((m) => {
          const st = L.memberStats(m.id, state.tasks, state.projects);
          const mine = state.tasks.filter((t) => t.assigneeId === m.id && !t.done).slice(0, 5);
          return (
            '<div class="card person"><div><h3>' + esc(m.name) + '</h3><div class="muted small">' + esc(m.role || 'Team member') + '</div></div>' +
            '<div class="stat-row"><div><b>' + st.open + '</b>Open</div><div><b>' + st.done + '</b>Done</div><div><b>' + (st.onTimeRate === null ? 'None yet' : st.onTimeRate + '%') + '</b>On time</div></div>' +
            (mine.length ? '<div class="rows">' + mine.map((t) => '<div class="row">' + taskRow(t, pb[t.projectId]) + '</div>').join('') + '</div>' : '<p class="muted small">No open tasks.</p>') +
            '<div>' + armButton('member:' + m.id, 'remove-member', m.id) + '</div></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderClients() {
    const head = '<div class="head-row"><h1 class="view-title">Clients</h1><button type="button" class="btn" data-action="new-client">Add a client</button></div>';
    if (!state.clients.length) {
      return head + '<div class="empty"><h3>No clients yet</h3><p>A client is a household with a need, an emotional goal and a worry. The manager uses these to write the client\'s reactions as you deliver.</p><button type="button" class="btn" data-action="new-client">Add a client</button></div>';
    }
    return (
      head +
      '<div class="people">' +
      state.clients
        .map((c) => {
          const projects = state.projects.filter((p) => p.clientId === c.id);
          const rows = [['Household', c.type], ['Budget', c.budget], ['Taste', c.taste], ['Need', c.need], ['Main worry', c.worry]].filter((r) => r[1]);
          return (
            '<div class="card person"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><h3>' + esc(c.name) + '</h3>' + exampleTag(c) + '</div>' +
            '<dl class="kv">' + rows.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl>' +
            (projects.length ? '<div class="rows">' + projects.map((p) => '<div class="row">' + '<div class="muted small" style="margin-bottom:6px">' + esc(p.name) + '</div>' + moodHtml(p, false) + '</div>').join('') + '</div>' : '<p class="muted small">No projects yet.</p>') +
            '<div>' + armButton('client:' + c.id, 'remove-client', c.id) + '</div></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderStudio() {
    const hasExample = [].concat(state.clients, state.projects, state.tasks).some((x) => x.example);
    const stageChecks = L.DELIVERABLES.map(
      (s) =>
        '<details class="acc"><summary>' + esc(s.name) + '</summary><ul>' + L.checksFor(s.key, null).map((c) => '<li>' + esc(c.label) + '</li>').join('') + '</ul></details>'
    ).join('');
    return (
      '<h1 class="view-title">Studio</h1>' +
      '<section class="card sec"><label class="f">Studio name<input type="text" id="studio-name" data-keep data-change="studio-name" maxlength="60" value="' + esc(state.studio.name || '') + '" placeholder="Your studio"></label></section>' +
      '<section class="sec"><h2>What we stand for</h2><p style="max-width:62ch">Give every client the best lively environment. Our interiors are made for Indian homes: rich in fabric, wood and stone, full of color and positive energy.</p></section>' +
      '<section class="sec"><div><h2>Quality gate, by deliverable</h2><p class="muted">Before a deliverable goes out, every check for it must be true, plus what the client asked for in the brief. Anything unmet sends it back.</p></div><div>' + stageChecks + '</div></section>' +
      '<section class="sec"><div><h2>The client brief</h2><p class="muted">Dates lock only after these essentials are answered.</p></div><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">' + L.BRIEF_QUESTIONS.filter((q) => q.essential).map((q) => '<li>' + esc(q.label) + '</li>').join('') + '</ul></section>' +
      '<section class="sec"><div><h2>Portfolio gate</h2><p class="muted">Applies to every finished project before it goes on the website.</p></div><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">' +
      L.PORTFOLIO_CHECKS.map((c) => '<li>' + esc(c.label) + '</li>').join('') + '</ul></section>' +
      (hasExample ? '<section class="sec"><h2>Example data</h2><p class="muted">The clients, project and tasks marked Example show how the app works. Remove them when you are ready to start with your own.</p><div>' + armButton('examples', 'remove-examples', 'all', 'Remove example data') + '</div></section>' : '')
    );
  }

  const NAV = [['today', 'Today'], ['projects', 'Projects'], ['team', 'Team'], ['clients', 'Clients'], ['studio', 'Studio']];

  function renderChrome() {
    $('#nav').innerHTML = NAV.map((n) => '<button type="button" data-action="nav" data-view="' + n[0] + '"' + (ui.view === n[0] ? ' aria-current="page"' : '') + '>' + n[1] + '</button>').join('');
    $('#studio-name').textContent = state.studio.name || 'Your studio';
    $('#sync').textContent = !state.ready ? 'Opening' : state.shared ? 'Shared with your team' : 'Saved on this device only';
    $('#banner').hidden = state.canWrite !== false;
  }

  function capture(root) {
    const out = [];
    root.querySelectorAll('[data-keep]').forEach((el) => {
      if (!el.id) return;
      out.push({ id: el.id, value: el.value, focused: document.activeElement === el, a: el.selectionStart, b: el.selectionEnd });
    });
    return out;
  }
  function restore(root, saved) {
    saved.forEach((s) => {
      const el = root.querySelector('#' + CSS.escape(s.id));
      if (!el) return;
      if (s.value !== el.value && el.tagName !== 'SELECT') el.value = s.value;
      if (el.tagName === 'SELECT' && s.value) el.value = s.value;
      if (s.focused) {
        el.focus();
        try {
          if (s.a != null) el.setSelectionRange(s.a, s.b);
        } catch (e) {}
      }
    });
  }

  function render() {
    const view = $('#view');
    renderChrome();
    if (state.failed) {
      view.innerHTML = '<div class="empty"><h3>The studio could not be opened</h3><p>' + esc(state.failed) + ' Reload the page to try again.</p></div>';
      return;
    }
    if (!state.ready) {
      view.innerHTML = '<p class="loading">Opening your studio.</p>';
      return;
    }
    const saved = capture(view);
    let html;
    if (ui.view === 'today') html = renderToday();
    else if (ui.view === 'projects') html = ui.projectId ? renderProject() : renderProjects();
    else if (ui.view === 'team') html = renderTeam();
    else if (ui.view === 'clients') html = renderClients();
    else html = renderStudio();
    view.innerHTML = html;
    restore(view, saved);
  }

  // ---------- Modals ----------
  let opener = null;
  function openModal(title, bodyHtml) {
    closeModal(true);
    opener = document.activeElement;
    const root = $('#modal-root');
    root.innerHTML = '<div class="scrim" data-action="modal-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="m-title"><h2 id="m-title">' + esc(title) + '</h2>' + bodyHtml + '</div>';
    root.hidden = false;
    const first = root.querySelector('input:not([type=checkbox]), textarea, select, input[type=checkbox], button');
    if (first) first.focus();
  }
  function closeModal(silent) {
    const root = $('#modal-root');
    root.hidden = true;
    root.innerHTML = '';
    if (!silent && opener && opener.focus && document.contains(opener)) opener.focus();
  }
  const foot = (primary, extra) =>
    '<div class="foot"><button type="button" class="btn line" data-action="modal-close">Cancel</button>' + (extra || '') + '<button type="submit" class="btn" data-role="submit">' + esc(primary) + '</button></div>';
  const errLine = '<p class="problems" data-role="err" role="alert"></p>';
  const field = (label, id, extra, hint) =>
    '<label class="f">' + esc(label) + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '<input type="text" id="' + id + '" name="' + id + '" ' + (extra || '') + '></label>';

  function modalClient() {
    openModal(
      'Add a client',
      '<form class="stack" data-form="new-client">' +
        field('Household or client name', 'name', 'required maxlength="60" placeholder="The Mehta family"') +
        '<div class="fgrid">' + field('Household type', 'type', 'maxlength="60" placeholder="Joint family, young couple"') + field('Budget', 'budget', 'maxlength="60" placeholder="18 to 25 lakh"') + '</div>' +
        field('Taste', 'taste', 'maxlength="120" placeholder="Bold color, handloom, brass"') +
        '<label class="f">What they need, emotionally<span class="hint">One or two sentences in their own words.</span><textarea id="need" name="need" required maxlength="300"></textarea></label>' +
        field('Main worry', 'worry', 'maxlength="120" placeholder="the rooms will feel crowded"', 'Finish the sentence: "My worry is that..."') +
        errLine + foot('Add client') + '</form>'
    );
  }

  function modalMember() {
    openModal(
      'Add a team member',
      '<form class="stack" data-form="new-member">' +
        field('Name', 'name', 'required maxlength="60"') +
        '<label class="f">Role<input type="text" id="role" name="role" list="roles" maxlength="60" placeholder="3D artist"></label>' +
        '<datalist id="roles"><option value="Designer"><option value="3D artist"><option value="Visualizer"><option value="Project coordinator"><option value="Site supervisor"></datalist>' +
        errLine + foot('Add member') + '</form>'
    );
  }

  function modalProject() {
    if (!state.clients.length) {
      toast('Add a client first. Every project belongs to one.', 'error');
      return;
    }
    const today = L.todayISO();
    openModal(
      'New project',
      '<form class="stack" data-form="new-project">' +
        field('Project name', 'name', 'required maxlength="80" placeholder="Mehta 3BHK, Ahmedabad"') +
        '<label class="f">Client<select id="client" name="client" required>' + state.clients.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('') + '</select></label>' +
        '<div class="fgrid"><label class="f">Start date<input type="date" id="start" name="start" required value="' + today + '"></label>' +
        '<label class="f">Delivery date<input type="date" id="end" name="end" required value="' + L.addDays(today, 56) + '"></label></div>' +
        '<fieldset class="dv-set"><legend>What the client wants delivered</legend><div class="dv-grid">' +
        L.DELIVERABLES.map((d) => '<label class="check dv"><input type="checkbox" name="dv" value="' + d.key + '"' + (L.CORE_DELIVERABLES.indexOf(d.key) !== -1 ? ' checked' : '') + '><span><strong>' + esc(d.name) + '</strong><span class="hint">' + esc(d.purpose) + '</span></span></label>').join('') +
        '</div></fieldset>' +
        '<p class="muted small">I will suggest a date for each deliverable. Take the full brief next, then agree and lock the dates.</p>' +
        errLine + foot('Create project') + '</form>'
    );
  }

  function modalReview(p, stageKey) {
    const def = L.stageDef(stageKey);
    const checks = L.checksFor(stageKey, p);
    openModal(
      'Review: ' + def.name,
      '<form class="stack" data-form="review" data-id="' + esc(p.id) + '" data-stage="' + esc(stageKey) + '">' +
        '<p class="muted">Tick what is true for this stage. Anything unticked sends it back to work and the client hears about the delay.</p>' +
        checks.map((c) => '<label class="check"><input type="checkbox" name="chk" value="' + c.key + '" data-change="review-sync"><span>' + esc(c.label) + '<span class="hint">' + esc(c.hint) + '</span></span></label>').join('') +
        errLine + foot('Send back for fixes') + '</form>'
    );
    syncReview();
  }
  function syncReview() {
    const root = $('#modal-root');
    const boxes = Array.prototype.slice.call(root.querySelectorAll('input[name=chk]'));
    const btn = root.querySelector('[data-role=submit]');
    if (!btn || !boxes.length) return;
    const all = boxes.every((b) => b.checked);
    btn.textContent = all ? 'Pass and deliver' : 'Send back for fixes';
    btn.classList.toggle('danger', !all);
  }

  function modalDate(p, stageKey) {
    const idx = p.stages.findIndex((s) => s.key === stageKey);
    const st = p.stages[idx];
    const lower = idx > 0 ? p.stages[idx - 1].deadline : p.start;
    const upper = idx < p.stages.length - 1 ? p.stages[idx + 1].deadline : null;
    openModal(
      'Change date: ' + L.stageDef(stageKey).name,
      '<form class="stack" data-form="change-date" data-id="' + esc(p.id) + '" data-stage="' + esc(stageKey) + '">' +
        '<p class="muted">Currently ' + esc(L.fmtDay(st.deadline)) + '. You can pick a date from ' + esc(L.fmt(lower)) + (upper ? ' to ' + esc(L.fmt(upper)) : ' onward') + '.</p>' +
        '<label class="f">New date<input type="date" id="cd-date" name="date" required value="' + esc(st.deadline) + '"></label>' +
        (p.locked
          ? '<label class="f">Reason<span class="hint">Goes in the log, and the client reads it. Moving a date later lowers their mood.</span><textarea id="cd-reason" name="reason" required maxlength="200"></textarea></label>'
          : '') +
        errLine + foot('Change date') + '</form>'
    );
  }

  // ---------- Actions ----------
  async function run(fn) {
    try {
      await fn();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  const getProject = (id) => state.projects.find((p) => p.id === id);

  function setView(v, projectId) {
    ui.view = v;
    ui.projectId = projectId || null;
    prefs.set('view', v);
    window.scrollTo(0, 0);
    render();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (ui.armed && a !== 'arm' && !/^remove-/.test(a)) {
      ui.armed = null;
      clearTimeout(armTimer);
    }
    const id = el.dataset.id;
    switch (a) {
      case 'nav':
        return setView(el.dataset.view, null);
      case 'back':
        return setView('projects', null);
      case 'open-project':
        return setView('projects', id);
      case 'modal-close':
        return closeModal();
      case 'new-client':
        return modalClient();
      case 'new-member':
        return modalMember();
      case 'new-project':
        return modalProject();
      case 'arm':
        ui.armed = el.dataset.key;
        clearTimeout(armTimer);
        armTimer = setTimeout(() => {
          ui.armed = null;
          render();
        }, 5000);
        return render();
      case 'toggle-stage': {
        const p = getProject(id);
        if (!p) return;
        const sum = L.projectSummary(p, state.tasks, L.todayISO());
        const i = p.stages.findIndex((s) => s.key === el.dataset.stage);
        ui.open[p.id + ':' + el.dataset.stage] = !isStageOpen(p, i, sum);
        return render();
      }
      case 'deliver-stage': {
        const p = getProject(id);
        if (!p) return;
        if (!p.locked) return toast('Lock the dates before delivering anything.', 'error');
        const cur = L.currentIndex(p);
        if (cur === -1) return;
        return modalReview(p, p.stages[cur].key);
      }
      case 'change-date': {
        const p = getProject(id);
        if (p) modalDate(p, el.dataset.stage);
        return;
      }
      case 'propose-dates':
        return run(async () => {
          const p = getProject(ui.projectId);
          const s = $('#plan-start').value;
          const en = $('#plan-end').value;
          if (!L.isISO(s) || !L.isISO(en)) return toast('Pick a start date and a delivery date.', 'error');
          const dates = L.proposeDates(s, en, p.stages.map((x) => x.key));
          if (!dates) return toast('The delivery date has to be after the start date.', 'error');
          await saveProject(Object.assign({}, p, { start: s, end: en, stages: p.stages.map((st, i) => Object.assign({}, st, { deadline: dates[i] })) }));
          toast('Dates suggested. Adjust any of them, then lock.');
        });
      case 'toggle-group': {
        const k = 'bg:' + id + ':' + el.dataset.group;
        ui.open[k] = !ui.open[k];
        return render();
      }
      case 'fill-ask': {
        const inp = $('#ask-q');
        if (inp) {
          inp.value = el.dataset.q;
          inp.focus();
        }
        return;
      }
      case 'save-turn':
        return run(async () => {
          const p = getProject(id);
          const t = p && p.brief && p.brief.talk && p.brief.talk[Number(el.dataset.i)];
          const sel = $('#tk-' + el.dataset.i);
          if (!t || !sel || !sel.value) return toast('Pick where to save this answer.', 'error');
          const parts = sel.value.split(':');
          const patch = parts[0] === 'd' ? { brief: { demands: { [parts[1]]: t.a } } } : { brief: { answers: { [parts[1]]: t.a } } };
          await store.update('projects', id, patch);
          toast('Saved to the brief.');
        });
      case 'lock-dates':
        return run(async () => {
          const p = getProject(ui.projectId);
          const r = L.lockProject(p, clientCtx(p), nowISO());
          if (r.error) return toast(r.error, 'error');
          await saveProject(r.project);
          toast('Dates locked. I will hold every one of them.');
        });
      case 'remove-task':
        ui.armed = null;
        return run(() => store.remove('tasks', id));
      case 'remove-member':
        ui.armed = null;
        return run(async () => {
          const mine = state.tasks.filter((t) => t.assigneeId === id);
          for (const t of mine) await store.update('tasks', t.id, { assigneeId: '' });
          await store.remove('team', id);
        });
      case 'remove-client':
        ui.armed = null;
        return run(async () => {
          if (state.projects.some((p) => p.clientId === id)) return toast('Remove or finish this client\'s projects first.', 'error');
          await store.remove('clients', id);
        });
      case 'remove-examples':
        ui.armed = null;
        return run(async () => {
          const ex = (c, arr) => arr.filter((x) => x.example).map((x) => store.remove(c, x.id));
          await Promise.all([].concat(ex('tasks', state.tasks), ex('projects', state.projects), ex('clients', state.clients)));
          ui.projectId = null;
          toast('Example data removed.');
        });
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const kind = el.dataset.change;
    if (kind === 'review-sync') return syncReview();
    if (kind === 'view-as') {
      ui.viewAs = el.value;
      prefs.set('viewAs', el.value);
      return render();
    }
    run(async () => {
      if (kind === 'toggle-task') {
        await store.update('tasks', el.dataset.id, { done: el.checked, doneAt: el.checked ? L.todayISO() : null });
      } else if (kind === 'assign-task') {
        await store.update('tasks', el.dataset.id, { assigneeId: el.value });
      } else if (kind === 'studio-name') {
        await store.set('settings', 'studio', { name: el.value.trim() });
      } else if (kind === 'set-stage-date') {
        const p = getProject(ui.projectId);
        if (!p || !L.isISO(el.value)) return;
        const stages = p.stages.map((s) => (s.key === el.dataset.stage ? Object.assign({}, s, { deadline: el.value }) : s));
        const last = stages[stages.length - 1].deadline;
        await saveProject(Object.assign({}, p, { stages: stages, end: last }));
      } else if (kind === 'brief-answer') {
        await store.update('projects', ui.projectId, { brief: { answers: { [el.dataset.key]: el.value.trim() } } });
      } else if (kind === 'brief-demand') {
        await store.update('projects', ui.projectId, { brief: { demands: { [el.dataset.key]: el.value.trim() } } });
      } else if (kind === 'set-deliverable') {
        const p = getProject(ui.projectId);
        const keys = Array.prototype.slice.call(document.querySelectorAll('input[data-change=set-deliverable]:checked')).map((i) => i.dataset.key);
        const r = L.setDeliverables(p, keys);
        if (r.error) {
          toast(r.error, 'error');
          return render();
        }
        await saveProject(r.project);
      } else if (kind === 'portfolio-check') {
        const p = getProject(ui.projectId);
        const pf = L.setPortfolioCheck(p, el.dataset.key, el.checked, nowISO());
        let next = Object.assign({}, p, { portfolio: pf });
        if (pf.ready && !(p.portfolio && p.portfolio.ready)) {
          next = L.applyEvent(next, { t: nowISO(), type: 'portfolio', stageKey: null, text: 'Marked portfolio-ready', delta: 0, reaction: '' });
          toast('Portfolio-ready. This one can go on the website.');
        }
        await saveProject(next);
      }
    });
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const fd = new FormData(form);
    const val = (k) => String(fd.get(k) || '').trim();
    const fail = (msg) => {
      const o = form.querySelector('[data-role=err]');
      if (o) o.textContent = msg;
    };
    run(async () => {
      if (kind === 'new-client') {
        const name = val('name');
        const need = val('need');
        if (!name || !need) return fail('Give the client a name and their need.');
        await store.set('clients', newId('c'), { name: name, type: val('type'), budget: val('budget'), taste: val('taste'), need: need, worry: val('worry'), created: nowISO() });
        closeModal();
        toast('Client added.');
      } else if (kind === 'new-member') {
        const name = val('name');
        if (!name) return fail('Give the team member a name.');
        await store.set('team', newId('m'), { name: name, role: val('role') });
        closeModal();
        toast('Team member added.');
      } else if (kind === 'new-project') {
        const name = val('name');
        const start = val('start');
        const end = val('end');
        if (!name) return fail('Give the project a name.');
        if (!L.isISO(start) || !L.isISO(end) || L.daysBetween(start, end) < 1) return fail('The delivery date has to be after the start date.');
        const dv = fd.getAll('dv').map(String);
        if (!dv.length) return fail('Choose at least one deliverable.');
        const doc = L.newProject({ name: name, clientId: val('client'), start: start, end: end, deliverables: dv, nowISO: nowISO() });
        const id = newId('p');
        await store.set('projects', id, doc);
        closeModal();
        setView('projects', id);
        toast('Project created. Take the full brief next.');
      } else if (kind === 'add-task') {
        const input = form.querySelector('input[type=text]');
        const sel = form.querySelector('select');
        const t = input.value.trim();
        if (!t) return;
        await store.set('tasks', newId('t'), { projectId: form.dataset.id, stageKey: form.dataset.stage, title: t, assigneeId: sel.value, done: false, doneAt: null, due: null, created: nowISO() });
        input.value = '';
        input.focus();
      } else if (kind === 'review') {
        const p = getProject(form.dataset.id);
        const checked = Array.prototype.slice.call(form.querySelectorAll('input[name=chk]:checked')).map((i) => i.value);
        const r = L.deliverStage(p, form.dataset.stage, checked, clientCtx(p), L.todayISO(), nowISO());
        if (r.error) return fail(r.error);
        await saveProject(r.project);
        closeModal();
        if (r.passed) toast(r.late ? 'Delivered, ' + L.plural(r.lateDays, 'day', 'days') + ' late. The client noticed.' : 'Delivered on time. The client is pleased.');
        else toast('Sent back to work: ' + L.plural(r.missing.length, 'check', 'checks') + ' not met.');
      } else if (kind === 'ask-client') {
        await askClient(form.dataset.id);
      } else if (kind === 'change-date') {
        const p = getProject(form.dataset.id);
        const r = L.changeDate(p, form.dataset.stage, val('date'), val('reason'), clientCtx(p), nowISO());
        if (r.error) return fail(r.error);
        await saveProject(r.project);
        closeModal();
        toast('Date changed and logged.');
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal-root').hidden) closeModal();
  });

  // ---------- Start ----------
  async function boot() {
    render();
    let db = null;
    let user = null;
    try {
      if (window.claude && window.claude.use) {
        db = await window.claude.use('db');
        user = await window.claude.use('user');
        try {
          sampleFn = await window.claude.use('sample');
        } catch (e) {
          sampleFn = null;
        }
      }
    } catch (e) {
      db = null;
    }
    if (user && db) {
      try {
        state.canWrite = await user.can('data.write');
      } catch (e) {
        state.canWrite = null;
      }
    }
    connect(db ? makeDbStore(db) : makeLocalStore());
  }
  boot();
})();
