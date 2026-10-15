const StudioLogic = (function () {
  'use strict';

  // ---------- Deliverables the studio offers (clients choose from these) ----------

  const DELIVERABLES = [
    { key: 'concept', name: 'Interior concept and space planning', purpose: 'Establish layout, zoning and furniture arrangement', weight: 18, example: 'e.g. Keep the pooja corner apart from the TV area' },
    { key: 'variations', name: 'Design variations', purpose: 'Compare different arrangements or design directions', weight: 10, example: 'e.g. One traditional and one contemporary option for the living room' },
    { key: 'materials', name: 'Material variations', purpose: 'Compare flooring, walls, wood, stone, fabrics and more', weight: 12, example: 'e.g. Three flooring options, with Kota stone on the balcony' },
    { key: 'lighting', name: 'Lighting variations', purpose: 'Daylight, warm evening, dramatic and functional lighting', weight: 8, example: 'e.g. Show the living room at 7pm with the diyas lit' },
    { key: 'renders', name: 'Photorealistic renders', purpose: 'Final presentation-quality images', weight: 24, example: 'e.g. Living room, kitchen and master bedroom, two angles each' },
    { key: 'walkthrough', name: 'Walkthroughs', purpose: 'Understand the space spatially', weight: 12, example: 'e.g. A video the family can show relatives' },
    { key: 'interactive', name: '360° and interactive', purpose: 'Explore the space more immersively', weight: 8, example: 'e.g. A link the elders can open on a phone' },
    { key: 'cinematic', name: 'Unreal cinematic', purpose: 'Premium presentation and marketing content', weight: 14, example: 'e.g. A film for the housewarming and for our website' },
  ];
  const CORE_DELIVERABLES = ['concept', 'materials', 'renders'];

  // Older projects used these stage names. They still open and deliver.
  const LEGACY = {
    brief: { key: 'brief', name: 'Brief and emotional goal', weight: 10 },
    layout: { key: 'layout', name: 'Spatial layout options', weight: 15 },
    final: { key: 'final', name: 'Final presentation', weight: 10 },
  };

  // ---------- Quality gate ----------

  const UNIVERSAL_CHECKS = [
    { key: 'need', label: "Meets this client's stated need and emotion", hint: 'Check it against the brief, not only our own taste.' },
    { key: 'promise', label: 'Matches what we promised the client', hint: 'Number of options, rooms covered and format agreed.' },
    { key: 'lively', label: 'Feels lively and positive, not cold or sterile', hint: 'The home should feel warm the moment you see it.' },
  ];

  const STAGE_CHECKS = {
    concept: [
      { key: 'zoning', label: 'Zoning is clear: public, private and service areas', hint: 'A guest knows where to sit. The family has privacy.' },
      { key: 'routine', label: 'The furniture arrangement fits how this family actually lives', hint: 'Check it against the routine in the brief.' },
      { key: 'rest', label: 'Every room has a calm resting area', hint: 'Rich areas need somewhere quiet to breathe.' },
      { key: 'flow', label: 'Circulation works for elders, children and guests', hint: 'Walk the plan with each of them in mind.' },
    ],
    variations: [
      { key: 'different', label: 'Options are genuinely different from each other', hint: 'Different directions, not three versions of the same plan.' },
      { key: 'answers', label: "Each option answers the client's need in its own way", hint: 'Every option should still feel like a home for this family.' },
      { key: 'tradeoffs', label: 'The trade-offs between options are explained plainly', hint: 'What the client gains and gives up with each one.' },
    ],
    materials: [
      { key: 'rich', label: 'Rich fabric, wood and stone in every room', hint: 'Materials should be visible and generous.' },
      { key: 'variety', label: 'Material options are genuinely different from each other', hint: 'Different character, not small tone changes.' },
      { key: 'craft', label: 'Handcrafted or heritage pieces are included', hint: 'Carved or inlaid wood, handloom textiles, antique rugs.' },
      { key: 'together', label: 'Flooring, walls and fabrics are shown together on one board', hint: 'Materials are judged side by side, never alone.' },
    ],
    lighting: [
      { key: 'modes', label: 'Every lighting mode the client asked for is shown', hint: 'Daylight, warm evening, dramatic, functional.' },
      { key: 'same', label: 'Each mode uses the same camera angle', hint: 'So the client compares the light, not the framing.' },
      { key: 'warm', label: 'Evening lighting is warm and layered', hint: 'Lamps and brass or glass accents, not one flat source.' },
    ],
    renders: [
      { key: 'anchor', label: 'Each room has one strong anchor', hint: 'A saturated wall color or a hero piece sets the room.' },
      { key: 'palette', label: 'Layered patterns repeat 2 to 3 colors', hint: 'Rich, never chaotic.' },
      { key: 'art', label: 'There is large, colorful art with presence', hint: 'Art that sets the mood of the room.' },
      { key: 'life', label: 'Fresh flowers or greenery are in the frame', hint: 'Life in every hero view.' },
      { key: 'light', label: 'Lighting is warm and layered', hint: 'Lamps and brass or glass accents, not one flat source.' },
      { key: 'sharp', label: 'Renders are sharp and well lit', hint: 'Would you put it on the website as it is?' },
      { key: 'consistent', label: 'Style is consistent across all rooms', hint: 'One home, one story.' },
    ],
    walkthrough: [
      { key: 'smooth', label: 'The walkthrough is smooth and covers the whole home', hint: 'No jumps, no missing rooms.' },
      { key: 'match', label: 'Colors and materials match the renders', hint: 'What the client approved is what they see.' },
    ],
    interactive: [
      { key: 'rooms', label: 'Every key room has a viewpoint', hint: 'Living, dining, bedrooms and entrance at least.' },
      { key: 'phone', label: 'It loads and moves smoothly on a phone', hint: 'Most clients will open it on their phone first.' },
      { key: 'match', label: 'Colors and materials match the renders', hint: 'What the client approved is what they see.' },
      { key: 'self', label: 'The client can explore it without help', hint: 'A clear starting point and simple controls.' },
    ],
    cinematic: [
      { key: 'story', label: 'It tells a short story with an emotional beat', hint: 'Arriving home, the family gathering, the evening glow.' },
      { key: 'hero', label: 'Hero shots look like editorial photography', hint: 'Frame them as you would for a magazine.' },
      { key: 'match', label: 'The look matches the approved renders', hint: 'Same colors, same materials, same mood.' },
      { key: 'polish', label: 'No engine artifacts: flicker, pop-in, clipping or placeholder assets', hint: 'Watch it full screen, start to end.' },
      { key: 'fit', label: 'It works for the website and for marketing', hint: 'Right length, right aspect ratios, and sound we may legally use.' },
    ],
    // Older projects
    brief: [{ key: 'words', label: "The emotional goal is written in the client's own words", hint: 'One or two sentences they would sign off on.' }],
    layout: [
      { key: 'different', label: 'Layout options are genuinely different from each other', hint: 'Not three versions of the same plan.' },
      { key: 'rest', label: 'Every room has a calm resting area', hint: 'Rich areas need somewhere quiet to breathe.' },
    ],
    final: [
      { key: 'story', label: "The presentation tells the client's story", hint: 'Their need, their emotion, how the design answers it.' },
      { key: 'consistent', label: 'Style is consistent across the whole project', hint: 'Every image looks like the same home.' },
    ],
  };

  const PORTFOLIO_CHECKS = [
    { key: 'hero', label: 'Hero renders look like editorial photos' },
    { key: 'closeups', label: 'Each room has close-ups of fabric, wood and stone' },
    { key: 'walk', label: 'The walkthrough is smooth and shows the full home' },
    { key: 'consistent', label: 'Colors and materials look the same across all images' },
    { key: 'story', label: 'The project has a short story: need, emotion, answer' },
    { key: 'lively', label: 'Every image clearly reads as lively and positive' },
    { key: 'own', label: 'Only our own work is shown, no magazine reference photos' },
  ];

  function stageDef(key) {
    return DELIVERABLES.find((s) => s.key === key) || LEGACY[key] || { key: key, name: key, weight: 10 };
  }

  function clip(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  }

  function checksFor(stageKey, project) {
    const demand = project && project.brief && project.brief.demands ? String(project.brief.demands[stageKey] || '').trim() : '';
    const extra = demand ? [{ key: 'demand', label: 'Delivers what the client asked for: "' + clip(demand, 90) + '"', hint: 'Their own words from the brief.' }] : [];
    return (STAGE_CHECKS[stageKey] || []).concat(extra, UNIVERSAL_CHECKS);
  }

  // ---------- The client brief ----------

  const BRIEF_GROUPS = [
    {
      key: 'people', title: 'Who lives here',
      questions: [
        { key: 'household', essential: true, label: 'Who will live in the home, and how old are they?', hint: 'Include elders, children, pets and anyone who stays for long visits.' },
        { key: 'routine', label: 'What do a normal weekday and a weekend look like at home?', hint: 'Where do people cook, gather, work and rest?' },
        { key: 'hosting', label: 'How often do you host guests or festivals, and how many people come?', hint: 'Think Diwali, birthdays and relatives staying over.' },
      ],
    },
    {
      key: 'feel', title: 'How it should feel',
      questions: [
        { key: 'feel', essential: true, label: 'When you walk in after a long day, how should the home make you feel?', hint: 'Their own words. Feelings first, objects later.' },
        { key: 'memory', label: 'Is there a home, place or memory you want this one to echo?', hint: "A grandparent's house, a trip, a festival." },
        { key: 'worry', essential: true, label: 'What worries you most about this project?', hint: 'Cost, delays, clutter, or taste clashing across the family.' },
      ],
    },
    {
      key: 'space', title: 'The space',
      questions: [
        { key: 'rooms', essential: true, label: 'Which rooms are in scope?', hint: 'List each room and who uses it.' },
        { key: 'property', label: 'What is the property, how big is it, and what stage is it at?', hint: 'For example a 3BHK flat of 1,450 sq ft, possession next month.' },
        { key: 'keep', label: 'Which furniture, art or heirlooms must stay?', hint: 'Anything with sentimental value.' },
        { key: 'vastu', label: 'Are there Vastu or religious requirements, such as a pooja space?', hint: 'Ask early. These change the layout.' },
      ],
    },
    {
      key: 'taste', title: 'Taste',
      questions: [
        { key: 'colors', essential: true, label: 'Which colors do you love, and which do you want to avoid?', hint: 'Ask about colors in clothes, saris and festivals too.' },
        { key: 'materials', label: 'Which fabrics, woods, stones or finishes are you drawn to or dislike?', hint: 'Silk, cotton, teak, marble, brass.' },
        { key: 'references', label: 'Which homes, photos or moodboards do you love, and what do you like in them?', hint: 'The reason matters more than the picture.' },
      ],
    },
    {
      key: 'practical', title: 'Budget, dates and decisions',
      questions: [
        { key: 'budget', essential: true, label: 'What is the budget, and what does it cover?', hint: 'Design only, or furniture, fabric and fittings too.' },
        { key: 'occasion', essential: true, label: 'Is there a date that matters, such as a housewarming, wedding or festival?', hint: 'This often decides the delivery date.' },
        { key: 'deciders', essential: true, label: 'Who decides, and who has to approve before we move ahead?', hint: 'Often more than one person.' },
      ],
    },
  ];

  const BRIEF_QUESTIONS = [];
  BRIEF_GROUPS.forEach((g) => g.questions.forEach((q) => BRIEF_QUESTIONS.push(Object.assign({ group: g.title }, q))));

  function answerText(project, key) {
    const a = project && project.brief && project.brief.answers;
    return a && typeof a[key] === 'string' ? a[key].trim() : '';
  }
  function isAnswered(project, key) {
    return answerText(project, key).length >= 6;
  }

  function briefState(project) {
    const essentials = BRIEF_QUESTIONS.filter((q) => q.essential);
    const missing = essentials.filter((q) => !isAnswered(project, q.key));
    return {
      essentialsTotal: essentials.length,
      essentialsDone: essentials.length - missing.length,
      missing: missing,
      answered: BRIEF_QUESTIONS.filter((q) => isAnswered(project, q.key)).length,
      total: BRIEF_QUESTIONS.length,
      complete: missing.length === 0,
    };
  }

  function nextQuestions(project, n) {
    const open = BRIEF_QUESTIONS.filter((q) => !isAnswered(project, q.key));
    open.sort((a, b) => (b.essential ? 1 : 0) - (a.essential ? 1 : 0));
    return open.slice(0, n);
  }

  // ---------- Dates (ISO strings, local calendar days) ----------

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseISO(s) {
    const p = String(s).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
  }
  function isISO(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && todayISO(parseISO(s)) === s;
  }
  function addDays(iso, n) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return todayISO(d);
  }
  function daysBetween(a, b) {
    return Math.round((parseISO(b) - parseISO(a)) / 86400000);
  }
  function fmt(iso) {
    const d = parseISO(iso);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  function fmtDay(iso) {
    return DAYS[parseISO(iso).getDay()] + ', ' + fmt(iso);
  }
  function relDays(n) {
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
  }
  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  // ---------- Planning dates ----------

  function orderKeys(keys) {
    return DELIVERABLES.filter((d) => keys.indexOf(d.key) !== -1).map((d) => d.key);
  }

  function proposeDates(start, end, keys) {
    const total = daysBetween(start, end);
    if (!(total >= 1)) return null;
    const ks = keys && keys.length ? keys : DELIVERABLES.map((d) => d.key);
    const sum = ks.reduce((n, k) => n + stageDef(k).weight, 0);
    let cum = 0;
    let prev = start;
    return ks.map((k, i) => {
      cum += stageDef(k).weight;
      let d = i === ks.length - 1 ? end : addDays(start, Math.round((total * cum) / sum));
      if (daysBetween(prev, d) < 0) d = prev;
      prev = d;
      return d;
    });
  }

  function validateDates(project) {
    const problems = [];
    let prev = project.start;
    project.stages.forEach((st) => {
      if (!isISO(st.deadline)) problems.push('Pick a date for ' + stageDef(st.key).name + '.');
      else if (daysBetween(prev, st.deadline) < 0) problems.push(stageDef(st.key).name + ' falls before the deliverable ahead of it.');
      if (isISO(st.deadline)) prev = st.deadline;
    });
    return problems;
  }

  function buildStages(keys, start, end) {
    const chosen = orderKeys(keys);
    const dates = proposeDates(start, end, chosen);
    if (!dates) return null;
    return chosen.map((k, i) => ({ key: k, deadline: dates[i], doneAt: null, returned: null, attempts: 0 }));
  }

  function newProject(opts) {
    const stages = buildStages(opts.deliverables && opts.deliverables.length ? opts.deliverables : CORE_DELIVERABLES, opts.start, opts.end);
    return {
      name: opts.name,
      clientId: opts.clientId,
      start: opts.start,
      end: opts.end,
      locked: false,
      lockedAt: null,
      status: 'active',
      mood: 75,
      created: opts.nowISO,
      brief: { answers: {}, demands: {} },
      stages: stages,
      log: [{ t: opts.nowISO, type: 'created', stageKey: null, text: 'Project created', delta: 0, reaction: '' }],
      portfolio: { checks: {}, ready: false, readyAt: null },
    };
  }

  function setDeliverables(project, keys) {
    if (project.locked) return { error: 'The deliverables are locked together with the dates.' };
    const chosen = orderKeys(keys);
    if (!chosen.length) return { error: 'Choose at least one deliverable.' };
    const stages = buildStages(chosen, project.start, project.end);
    if (!stages) return { error: 'The delivery date has to be after the start date.' };
    return { project: Object.assign({}, project, { stages: stages }) };
  }

  // ---------- State of stages and projects ----------

  function currentIndex(project) {
    return project.stages.findIndex((s) => !s.doneAt);
  }

  function stageTasks(project, stageKey, tasks) {
    return tasks.filter((t) => t.projectId === project.id && t.stageKey === stageKey);
  }

  function taskDue(task, project) {
    if (task.due) return task.due;
    const st = project && project.stages.find((s) => s.key === task.stageKey);
    return st ? st.deadline : null;
  }

  function stageState(project, idx, tasks, today) {
    const st = project.stages[idx];
    const list = stageTasks(project, st.key, tasks);
    const done = list.filter((t) => t.done).length;
    const progress = { done: done, total: list.length };
    if (st.doneAt) {
      return { state: 'done', daysLeft: null, progress: progress, lateDays: Math.max(0, daysBetween(st.deadline, st.doneAt)) };
    }
    const daysLeft = daysBetween(today, st.deadline);
    if (!project.locked) return { state: 'planning', daysLeft: daysLeft, progress: progress, lateDays: 0 };
    if (daysLeft < 0) return { state: 'overdue', daysLeft: daysLeft, progress: progress, lateDays: -daysLeft };
    if (idx === currentIndex(project)) {
      const ratio = progress.total ? progress.done / progress.total : 0;
      if (daysLeft === 0) return { state: 'due-today', daysLeft: 0, progress: progress, lateDays: 0 };
      if (daysLeft <= 3 && ratio < 0.5) return { state: 'at-risk', daysLeft: daysLeft, progress: progress, lateDays: 0 };
      return { state: 'on-track', daysLeft: daysLeft, progress: progress, lateDays: 0 };
    }
    return { state: 'upcoming', daysLeft: daysLeft, progress: progress, lateDays: 0 };
  }

  const RANK = { overdue: 5, 'at-risk': 4, 'due-today': 3, 'on-track': 2, upcoming: 1, planning: 0, done: 0 };

  function projectSummary(project, tasks, today) {
    const states = project.stages.map((_, i) => stageState(project, i, tasks, today));
    const cur = currentIndex(project);
    const doneCount = project.stages.filter((s) => s.doneAt).length;
    let status;
    if (cur === -1) status = 'delivered';
    else if (!project.locked) status = 'planning';
    else status = states.reduce((best, s) => (RANK[s.state] > RANK[best] ? s.state : best), 'on-track');
    return {
      states: states,
      currentIdx: cur,
      doneCount: doneCount,
      status: status,
      nextDeadline: cur === -1 ? null : project.stages[cur].deadline,
    };
  }

  // ---------- Rescue plan ----------

  function rescueOptions(item, openTasks) {
    const options = [];
    if (!openTasks.length) {
      options.push({ kind: 'tasks', title: 'Make the work visible', text: 'Break this deliverable into 3 to 5 tasks, starting with the one that unblocks the rest.' });
    } else {
      options.push({ kind: 'tasks', title: 'Close one task now', text: 'Finish "' + openTasks[0].title + '" first. One closed task today changes the picture.' });
    }
    options.push({ kind: 'scope', title: 'Trim the scope', text: 'Offer fewer options or fewer rooms in this round, and tell the client what moves to the next one.' });
    options.push({ kind: 'date', title: 'Ask for a new date', text: 'If neither works, move the date. It needs a reason, it is logged, and the client will notice.' });
    return options;
  }

  // ---------- Analysis for the Today screen ----------

  function analyze(projects, tasks, clientsById, today) {
    const attention = [];
    const upcoming = [];
    projects.forEach((p) => {
      const sum = projectSummary(p, tasks, today);
      if (sum.status === 'delivered' || !p.locked) return;
      const client = clientsById[p.clientId];
      p.stages.forEach((st, i) => {
        if (st.doneAt) return;
        const s = sum.states[i];
        if (s.state === 'overdue' || s.state === 'at-risk' || s.state === 'due-today') {
          const open = stageTasks(p, st.key, tasks).filter((t) => !t.done);
          const item = {
            projectId: p.id,
            projectName: p.name,
            clientName: client ? client.name : '',
            stageKey: st.key,
            stageName: stageDef(st.key).name,
            deadline: st.deadline,
            state: s.state,
            daysLeft: s.daysLeft,
            progress: s.progress,
            canDeliver: i === sum.currentIdx,
          };
          item.rescue = s.state === 'due-today' ? [] : rescueOptions(item, open);
          attention.push(item);
        }
        if (s.daysLeft !== null && s.daysLeft >= 0 && s.daysLeft <= 14) {
          upcoming.push({ projectId: p.id, projectName: p.name, stageKey: st.key, stageName: stageDef(st.key).name, deadline: st.deadline, daysLeft: s.daysLeft, state: s.state });
        }
      });
    });
    attention.sort((a, b) => RANK[b.state] - RANK[a.state] || a.daysLeft - b.daysLeft);
    upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
    return { attention: attention, upcoming: upcoming };
  }

  // Projects that cannot start yet: the brief is thin, or the dates are not locked.
  function briefGaps(projects, clientsById) {
    const out = [];
    projects.forEach((p) => {
      if (p.locked || currentIndex(p) === -1) return;
      const bs = briefState(p);
      const c = clientsById[p.clientId];
      const base = { projectId: p.id, projectName: p.name, clientName: c ? c.name : '', essentialsDone: bs.essentialsDone, essentialsTotal: bs.essentialsTotal };
      out.push(bs.complete ? Object.assign(base, { kind: 'lock', next: null }) : Object.assign(base, { kind: 'brief', next: bs.missing[0] }));
    });
    out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'brief' ? -1 : 1));
    return out;
  }

  function greeting(hour) {
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'It is late';
  }

  function onTimeStreak(projects) {
    const events = [];
    projects.forEach((p) => (p.log || []).forEach((e) => e.type === 'delivered' && events.push(e)));
    events.sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
    let n = 0;
    for (const e of events) {
      if (e.late) break;
      n += 1;
    }
    return n;
  }

  function buildBrief(info) {
    // info: { projectCount, activeCount, attention, upcoming, gaps, hour, streak }
    const hello = greeting(info.hour);
    const top = info.attention[0] || null;
    const gap = (info.gaps || [])[0] || null;
    const out = { greeting: hello, headline: '', body: '', focus: null, gap: null };

    if (!info.projectCount) {
      out.headline = 'Set up your first project.';
      out.body = 'Add a client, create the project, then take a full brief. Once the brief is complete, you agree the dates together and lock them.';
      return out;
    }
    if (!info.activeCount) {
      out.headline = 'Everything is delivered.';
      out.body = 'Go through the portfolio checks on each finished project, then start something new.';
      return out;
    }
    if (top && top.state === 'overdue') {
      const n = info.attention.filter((a) => a.state === 'overdue').length;
      out.headline = n === 1 ? 'One date has slipped.' : n + ' dates have slipped.';
      out.body = top.stageName + ' for ' + top.projectName + ' was due ' + fmt(top.deadline) + '. Start there. A late deliverable can be recovered, and I have set out ways through below.';
      out.focus = top;
    } else if (top && top.state === 'at-risk') {
      out.headline = 'A date is getting tight.';
      out.body = top.stageName + ' for ' + top.projectName + ' is due ' + relDays(top.daysLeft) + ' and under half done. Let us protect it.';
      out.focus = top;
    } else if (top && top.state === 'due-today') {
      out.headline = 'Delivery day.';
      out.body = top.stageName + ' for ' + top.projectName + ' is due today. Run it through the checks and send it.';
      out.focus = top;
    } else if (gap && gap.kind === 'brief') {
      out.headline = 'Get the full brief first.';
      out.body = gap.projectName + ' has ' + gap.essentialsDone + ' of ' + gap.essentialsTotal + ' essential answers. Ask the client next: "' + gap.next.label + '"';
      out.gap = gap;
    } else if (gap) {
      out.headline = 'Time to lock the dates.';
      out.body = 'The brief for ' + gap.projectName + ' is complete. Agree the dates with the client and lock them, so I can hold you to every one.';
      out.gap = gap;
    } else {
      const next = info.upcoming[0];
      out.headline = 'You are on track.';
      out.body = next ? 'Next date: ' + next.stageName + ' for ' + next.projectName + ' on ' + fmt(next.deadline) + ', ' + relDays(next.daysLeft) + '.' : 'No dates fall in the next two weeks.';
    }
    if (info.streak >= 2) out.body += ' That is ' + info.streak + ' on-time deliveries in a row.';
    if (hello === 'It is late') out.body += ' Plan the next step, then rest.';
    return out;
  }

  // ---------- Client mood and reactions ----------

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function moodInfo(score) {
    if (score >= 85) return { label: 'Delighted', tone: 'good' };
    if (score >= 65) return { label: 'Happy', tone: 'good' };
    if (score >= 45) return { label: 'Uneasy', tone: 'warn' };
    return { label: 'Worried', tone: 'bad' };
  }

  function reaction(kind, ctx) {
    const n = ctx.clientName || 'The client';
    const stage = ctx.stageName ? ctx.stageName.toLowerCase() : 'work';
    switch (kind) {
      case 'locked':
        return n + ': "Thank you for agreeing the dates with us. We will plan around them."';
      case 'on-time':
        return n + ': "The ' + stage + ' came on the day we agreed. I feel looked after."';
      case 'late':
        return n + ': "We were expecting the ' + stage + ' by ' + fmt(ctx.deadline) + '.' + (ctx.worry ? ' My worry has not gone away: ' + ctx.worry + '.' : ' Please keep us posted.') + '"';
      case 'sent-back':
        return n + ': "I heard the ' + stage + ' needed another pass. I would rather it be right than rushed."';
      case 'date-change':
        return n + ': "The ' + stage + ' moved to ' + fmt(ctx.newDate) + '. I read your note: ' + ctx.reason + '. Please keep to this one."';
      default:
        return '';
    }
  }

  function applyEvent(project, ev) {
    const log = (project.log || []).concat([ev]);
    return Object.assign({}, project, {
      log: log.length > 120 ? log.slice(log.length - 120) : log,
      mood: clamp((typeof project.mood === 'number' ? project.mood : 75) + (ev.delta || 0), 0, 100),
    });
  }

  // ---------- Actions that change a project ----------

  function lockProject(project, ctx, nowISO) {
    if (project.locked) return { error: 'These dates are already locked.' };
    const bs = briefState(project);
    if (!bs.complete) return { error: 'Finish the brief first. ' + plural(bs.missing.length, 'essential question is', 'essential questions are') + ' still open.' };
    const problems = validateDates(project);
    if (problems.length) return { error: problems[0] };
    const next = applyEvent(Object.assign({}, project, { locked: true, lockedAt: nowISO }), {
      t: nowISO,
      type: 'locked',
      stageKey: null,
      text: 'Brief complete. Dates and deliverables locked with the client',
      delta: 0,
      reaction: reaction('locked', ctx),
    });
    return { project: next };
  }

  function changeDate(project, stageKey, newISO, reason, ctx, nowISO) {
    const idx = project.stages.findIndex((s) => s.key === stageKey);
    if (idx === -1) return { error: 'That deliverable does not exist.' };
    const st = project.stages[idx];
    if (st.doneAt) return { error: 'A delivered deliverable cannot move.' };
    if (!isISO(newISO)) return { error: 'Pick a valid date.' };
    if (newISO === st.deadline) return { error: 'That is already the date.' };
    const lower = idx > 0 ? project.stages[idx - 1].deadline : project.start;
    const upper = idx < project.stages.length - 1 ? project.stages[idx + 1].deadline : null;
    if (daysBetween(lower, newISO) < 0) return { error: 'Pick ' + fmt(lower) + ' or later. It cannot fall before the deliverable ahead.' };
    if (upper && daysBetween(newISO, upper) < 0) return { error: 'Pick ' + fmt(upper) + ' or earlier, or move the later deliverables first.' };
    const stages = project.stages.map((s, i) => (i === idx ? Object.assign({}, s, { deadline: newISO }) : s));
    let next = Object.assign({}, project, { stages: stages });
    if (idx === project.stages.length - 1) next.end = newISO;
    if (!project.locked) return { project: next };
    const why = (reason || '').trim();
    if (why.length < 8) return { error: 'Give a reason of a few words. It goes in the log.' };
    const later = daysBetween(st.deadline, newISO) > 0;
    const name = stageDef(stageKey).name;
    next = applyEvent(next, {
      t: nowISO,
      type: 'date-change',
      stageKey: stageKey,
      text: name + ' moved from ' + fmt(st.deadline) + ' to ' + fmt(newISO) + '. Reason: ' + why,
      delta: later ? -4 : 0,
      reaction: later ? reaction('date-change', { clientName: ctx.clientName, stageName: name, newDate: newISO, reason: why }) : '',
    });
    return { project: next };
  }

  function reviewStage(stageKey, checkedKeys, project) {
    const set = new Set(checkedKeys || []);
    const missing = checksFor(stageKey, project).filter((c) => !set.has(c.key)).map((c) => c.label);
    return { passed: missing.length === 0, missing: missing };
  }

  function deliverStage(project, stageKey, checkedKeys, ctx, today, nowISO) {
    if (!project.locked) return { error: 'Lock the dates before delivering anything.' };
    const idx = project.stages.findIndex((s) => s.key === stageKey);
    if (idx === -1) return { error: 'That deliverable does not exist.' };
    const cur = currentIndex(project);
    if (idx < cur) return { error: 'This deliverable is already delivered.' };
    if (idx > cur) return { error: 'Finish ' + stageDef(project.stages[cur].key).name + ' first.' };
    const st = project.stages[idx];
    const name = stageDef(stageKey).name;
    const review = reviewStage(stageKey, checkedKeys, project);
    if (!review.passed) {
      const stages = project.stages.map((s, i) => (i === idx ? Object.assign({}, s, { returned: review.missing, attempts: (s.attempts || 0) + 1 }) : s));
      const next = applyEvent(Object.assign({}, project, { stages: stages }), {
        t: nowISO,
        type: 'sent-back',
        stageKey: stageKey,
        text: name + ' sent back: ' + review.missing.length + ' check' + (review.missing.length === 1 ? '' : 's') + ' not met',
        delta: -2,
        reaction: reaction('sent-back', { clientName: ctx.clientName, stageName: name }),
      });
      return { project: next, passed: false, missing: review.missing };
    }
    const lateDays = Math.max(0, daysBetween(st.deadline, today));
    const late = lateDays > 0;
    const firstPass = !(st.attempts > 0);
    const stages = project.stages.map((s, i) => (i === idx ? Object.assign({}, s, { doneAt: today, returned: null }) : s));
    const isLast = idx === project.stages.length - 1;
    let next = Object.assign({}, project, { stages: stages });
    if (isLast) next = Object.assign(next, { status: 'delivered', deliveredAt: today });
    next = applyEvent(next, {
      t: nowISO,
      type: 'delivered',
      stageKey: stageKey,
      text: name + (late ? ' delivered ' + lateDays + (lateDays === 1 ? ' day late' : ' days late') : ' delivered on time') + (firstPass ? ', first pass' : ''),
      delta: late ? -(8 + 2 * Math.min(lateDays, 6)) : 5,
      late: late,
      reaction: reaction(late ? 'late' : 'on-time', { clientName: ctx.clientName, stageName: name, deadline: st.deadline, worry: ctx.worry }),
    });
    return { project: next, passed: true, late: late, lateDays: lateDays, firstPass: firstPass };
  }

  function setPortfolioCheck(project, key, value, nowISO) {
    const checks = Object.assign({}, project.portfolio && project.portfolio.checks, { [key]: !!value });
    const ready = PORTFOLIO_CHECKS.every((c) => checks[c.key]);
    const was = project.portfolio && project.portfolio.ready;
    return {
      checks: checks,
      ready: ready,
      readyAt: ready ? (was && project.portfolio.readyAt) || nowISO : null,
    };
  }

  // ---------- Simulated client interview ----------

  function interviewPrompt(client, project, history, question) {
    const c = client || {};
    const known = BRIEF_QUESTIONS.filter((q) => isAnswered(project, q.key)).map((q) => '- ' + q.label + ' ' + answerText(project, q.key));
    const asked = (project.stages || []).map((s) => {
      const d = project.brief && project.brief.demands ? String(project.brief.demands[s.key] || '').trim() : '';
      return '- ' + stageDef(s.key).name + (d ? ': ' + d : '');
    });
    const talk = history.slice(-8).map((h) => 'Designer: ' + h.q + '\nYou: ' + h.a);
    return [
      'You are role-playing a client of an interior design studio in India. You are the client, speaking to the designer. Stay in character for the whole answer.',
      '',
      'Who you are:',
      'Name: ' + (c.name || 'the client'),
      c.type ? 'Household: ' + c.type : '',
      c.budget ? 'Budget: ' + c.budget : '',
      c.taste ? 'Taste: ' + c.taste : '',
      c.need ? 'What you need, emotionally: ' + c.need : '',
      c.worry ? 'Your main worry: ' + c.worry : '',
      '',
      'Deliverables you have asked the studio for, with what you expect:',
      asked.length ? asked.join('\n') : '- none chosen yet',
      '',
      'What the designer already knows from earlier answers:',
      known.length ? known.join('\n') : '- nothing yet',
      '',
      talk.length ? 'The conversation so far:\n' + talk.join('\n') : '',
      '',
      'How to answer:',
      '- Answer only the question asked, in two to four sentences, in the first person, in natural spoken English. A Hindi or regional word is fine where it fits, but keep it easy to read.',
      '- Give real, concrete details: names and ages of family members, specific colors, rooms, routines, festivals. Add the feeling behind the detail.',
      '- Do not volunteer topics the designer has not asked about. If the question is vague, like "what do you want?", answer the way a real client would: emotionally and loosely, so the designer learns to ask a better question.',
      '- Stay consistent with who you are and with earlier answers. Never contradict the stated budget.',
      '- Never mention being an AI or a role-play. Reply with the answer only, no quotation marks and no labels.',
      '',
      'The designer asks: ' + question,
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  }

  // ---------- Team and scorecard ----------

  function memberStats(memberId, tasks, projects) {
    const byId = {};
    projects.forEach((p) => (byId[p.id] = p));
    const mine = tasks.filter((t) => t.assigneeId === memberId);
    const open = mine.filter((t) => !t.done);
    const done = mine.filter((t) => t.done);
    let onTime = 0;
    done.forEach((t) => {
      const due = taskDue(t, byId[t.projectId]);
      if (!due || !t.doneAt || daysBetween(due, t.doneAt) <= 0) onTime += 1;
    });
    return { open: open.length, done: done.length, onTimeRate: done.length ? Math.round((onTime / done.length) * 100) : null };
  }

  function scorecard(projects) {
    let delivered = 0;
    let onTime = 0;
    let firstPass = 0;
    projects.forEach((p) =>
      p.stages.forEach((s) => {
        if (!s.doneAt) return;
        delivered += 1;
        if (daysBetween(s.deadline, s.doneAt) <= 0) onTime += 1;
        if (!(s.attempts > 0)) firstPass += 1;
      })
    );
    return {
      delivered: delivered,
      onTimeRate: delivered ? Math.round((onTime / delivered) * 100) : null,
      firstPassRate: delivered ? Math.round((firstPass / delivered) * 100) : null,
      portfolioReady: projects.filter((p) => p.portfolio && p.portfolio.ready).length,
    };
  }

  return {
    DELIVERABLES, CORE_DELIVERABLES, PORTFOLIO_CHECKS, UNIVERSAL_CHECKS, STAGE_CHECKS, BRIEF_GROUPS, BRIEF_QUESTIONS,
    stageDef, checksFor, clip,
    answerText, isAnswered, briefState, nextQuestions,
    todayISO, parseISO, isISO, addDays, daysBetween, fmt, fmtDay, relDays,
    proposeDates, validateDates, newProject, setDeliverables, orderKeys,
    currentIndex, stageTasks, taskDue, stageState, projectSummary,
    rescueOptions, analyze, briefGaps, greeting, onTimeStreak, buildBrief,
    moodInfo, reaction, applyEvent,
    lockProject, changeDate, reviewStage, deliverStage, setPortfolioCheck,
    interviewPrompt, memberStats, scorecard, plural,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StudioLogic;
