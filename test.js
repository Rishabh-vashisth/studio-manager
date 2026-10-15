const assert = require('assert');
const L = require('./src/logic.js');

let n = 0;
function t(name, fn) {
  try {
    fn();
    n += 1;
    console.log('ok   ' + name);
  } catch (e) {
    console.log('FAIL ' + name + '\n     ' + e.message);
    process.exitCode = 1;
  }
}

const NOW = '2026-10-15T01:00:00.000Z';
const ctx = { clientName: 'The Mehta family', worry: 'the rooms will feel crowded' };

const FULL = {
  household: 'Six of us: parents, two kids aged 8 and 12, and my mother-in-law.',
  feel: 'Warm and welcoming, like arriving at my grandmother\'s house.',
  worry: 'That the living room will feel crowded when guests come.',
  rooms: 'Living, dining, kitchen, three bedrooms and a pooja corner.',
  colors: 'Love marigold, plum and teal. No grey, no cold white.',
  budget: '25 to 30 lakh including furniture and fabric.',
  occasion: 'Housewarming on 12 December.',
  deciders: 'Both of us, and my father-in-law has the final word.',
};

function mk(start, end, opts) {
  opts = opts || {};
  const p = L.newProject({ name: 'Mehta 3BHK', clientId: 'c1', start, end, nowISO: NOW, deliverables: opts.deliverables });
  return Object.assign({ id: 'p1' }, p, opts.brief === false ? {} : { brief: { answers: Object.assign({}, FULL), demands: {} } });
}
function locked(start, end, opts) {
  return L.lockProject(mk(start, end, opts), ctx, NOW).project;
}
function allChecked(stageKey, p) {
  return L.checksFor(stageKey, p).map((c) => c.key);
}

t('catalog: 8 deliverables from the studio table, unique keys, every one has checks and an example', () => {
  assert.strictEqual(L.DELIVERABLES.length, 8);
  assert.strictEqual(new Set(L.DELIVERABLES.map((d) => d.key)).size, 8);
  L.DELIVERABLES.forEach((d) => {
    assert.ok(d.purpose && d.example, d.key);
    const c = L.checksFor(d.key);
    assert.ok(c.length >= 5, d.key);
    assert.strictEqual(new Set(c.map((x) => x.key)).size, c.length, d.key + ' keys unique');
  });
});

t('dates: addDays and daysBetween across month; isISO rejects impossible dates', () => {
  assert.strictEqual(L.addDays('2026-10-30', 3), '2026-11-02');
  assert.strictEqual(L.daysBetween('2026-10-15', '2026-12-04'), 50);
  assert.strictEqual(L.isISO('2026-02-31'), false);
  assert.strictEqual(L.isISO('2026-02-28'), true);
});

t('proposeDates: follows only the chosen deliverables, ordered, ends on the delivery date', () => {
  const keys = ['concept', 'lighting', 'cinematic'];
  const d = L.proposeDates('2026-10-12', '2026-12-04', keys);
  assert.strictEqual(d.length, 3);
  assert.strictEqual(d[2], '2026-12-04');
  for (let i = 1; i < d.length; i++) assert.ok(L.daysBetween(d[i - 1], d[i]) >= 0);
  const one = L.proposeDates('2026-10-12', '2026-12-04', ['renders']);
  assert.deepStrictEqual(one, ['2026-12-04']);
});

t('proposeDates: heavier deliverables get longer windows', () => {
  const d = L.proposeDates('2026-10-01', '2026-12-31', ['lighting', 'renders']);
  const first = L.daysBetween('2026-10-01', d[0]);
  const second = L.daysBetween(d[0], d[1]);
  assert.ok(second > first * 2, first + ' vs ' + second);
});

t('proposeDates: short window stays ordered; zero or negative window refused', () => {
  const d = L.proposeDates('2026-10-12', '2026-10-14', L.DELIVERABLES.map((x) => x.key));
  for (let i = 1; i < d.length; i++) assert.ok(L.daysBetween(d[i - 1], d[i]) >= 0);
  assert.strictEqual(L.proposeDates('2026-10-12', '2026-10-12', ['concept']), null);
  assert.strictEqual(L.proposeDates('2026-10-12', '2026-10-01', ['concept']), null);
});

t('new project: defaults to the core three deliverables, empty brief, dates not locked', () => {
  const p = mk('2026-10-12', '2026-12-04', { brief: false });
  assert.deepStrictEqual(p.stages.map((s) => s.key), L.CORE_DELIVERABLES);
  assert.deepStrictEqual(p.brief, { answers: {}, demands: {} });
  assert.strictEqual(p.locked, false);
});

t('set deliverables: reorders into catalog order, re-proposes dates, needs at least one, blocked after lock', () => {
  const p = mk('2026-10-12', '2026-12-04');
  const r = L.setDeliverables(p, ['cinematic', 'concept', 'walkthrough']);
  assert.deepStrictEqual(r.project.stages.map((s) => s.key), ['concept', 'walkthrough', 'cinematic']);
  assert.strictEqual(r.project.stages[2].deadline, '2026-12-04');
  assert.ok(L.setDeliverables(p, []).error);
  assert.ok(L.setDeliverables(p, ['nonsense']).error);
  assert.ok(L.setDeliverables(locked('2026-10-12', '2026-12-04'), ['concept']).error);
});

t('brief: counts essentials, needs 6+ characters, lists what is missing, suggests essentials first', () => {
  const empty = mk('2026-10-12', '2026-12-04', { brief: false });
  let bs = L.briefState(empty);
  assert.strictEqual(bs.essentialsTotal, 8);
  assert.strictEqual(bs.essentialsDone, 0);
  assert.strictEqual(bs.complete, false);
  assert.strictEqual(L.nextQuestions(empty, 3)[0].key, 'household');
  const thin = Object.assign({}, empty, { brief: { answers: { household: 'six' }, demands: {} } });
  assert.strictEqual(L.briefState(thin).essentialsDone, 0);
  const some = Object.assign({}, empty, { brief: { answers: { household: 'Six of us at home', routine: 'Busy mornings, quiet evenings' }, demands: {} } });
  bs = L.briefState(some);
  assert.strictEqual(bs.essentialsDone, 1);
  assert.strictEqual(bs.answered, 2);
  const next = L.nextQuestions(some, 20);
  assert.ok(next.slice(0, 7).every((q) => q.essential), 'essentials come before optional questions');
  assert.ok(!next.some((q) => q.key === 'routine'));
  assert.strictEqual(L.briefState(mk('2026-10-12', '2026-12-04')).complete, true);
});

t('lock: refuses until the brief is complete, then logs it', () => {
  const thin = mk('2026-10-12', '2026-12-04', { brief: false });
  const r0 = L.lockProject(thin, ctx, NOW);
  assert.ok(/8 essential questions are still open/.test(r0.error), r0.error);
  const almost = Object.assign({}, mk('2026-10-12', '2026-12-04'), { brief: { answers: Object.assign({}, FULL, { budget: '' }), demands: {} } });
  assert.ok(/1 essential question is still open/.test(L.lockProject(almost, ctx, NOW).error));
  const ok = L.lockProject(mk('2026-10-12', '2026-12-04'), ctx, NOW);
  assert.ok(ok.project.locked);
  assert.strictEqual(ok.project.log.slice(-1)[0].type, 'locked');
  assert.ok(L.lockProject(ok.project, ctx, NOW).error);
});

t('lock: refuses out-of-order dates', () => {
  const p = mk('2026-10-12', '2026-12-04');
  const bad = Object.assign({}, p, { stages: p.stages.map((s, i) => (i === 1 ? Object.assign({}, s, { deadline: '2026-10-13' }) : s)) });
  assert.ok(L.lockProject(bad, ctx, NOW).error);
});

t('stage state: planning until locked, then on-track, at-risk, due-today, overdue', () => {
  let p = mk('2026-10-12', '2026-12-04');
  assert.strictEqual(L.stageState(p, 0, [], '2026-10-15').state, 'planning');
  p = Object.assign({}, p, { locked: true });
  const d0 = p.stages[0].deadline;
  assert.strictEqual(L.stageState(p, 0, [], L.addDays(d0, -10)).state, 'on-track');
  assert.strictEqual(L.stageState(p, 0, [], L.addDays(d0, -3)).state, 'at-risk');
  assert.strictEqual(L.stageState(p, 0, [], d0).state, 'due-today');
  assert.strictEqual(L.stageState(p, 0, [], L.addDays(d0, 2)).state, 'overdue');
  assert.strictEqual(L.stageState(p, 1, [], L.addDays(d0, -10)).state, 'upcoming');
});

t('stage state: half the tasks done keeps a close date on-track', () => {
  const p = locked('2026-10-12', '2026-12-04');
  const key = p.stages[0].key;
  const d0 = p.stages[0].deadline;
  const tasks = [
    { id: 'a', projectId: 'p1', stageKey: key, done: true },
    { id: 'b', projectId: 'p1', stageKey: key, done: false },
  ];
  assert.strictEqual(L.stageState(p, 0, tasks, L.addDays(d0, -2)).state, 'on-track');
  assert.strictEqual(L.stageState(p, 0, tasks.map((x) => Object.assign({}, x, { done: false })), L.addDays(d0, -2)).state, 'at-risk');
});

t('change date: free before lock, needs a reason after, costs mood only when moved later', () => {
  let p = mk('2026-10-12', '2026-12-04');
  const free = L.changeDate(p, 'concept', L.addDays(p.stages[0].deadline, 1), '', ctx, NOW);
  assert.ok(free.project && free.project.mood === 75);
  p = locked('2026-10-12', '2026-12-04');
  const key = p.stages[1].key;
  const d = p.stages[1].deadline;
  assert.ok(L.changeDate(p, key, L.addDays(d, 1), '', ctx, NOW).error);
  assert.ok(L.changeDate(p, key, L.addDays(d, 1), 'short', ctx, NOW).error);
  const later = L.changeDate(p, key, L.addDays(d, 1), 'Client travelling, needs one more day', ctx, NOW);
  assert.strictEqual(later.project.mood, 71);
  assert.strictEqual(later.project.log.slice(-1)[0].type, 'date-change');
  assert.strictEqual(L.changeDate(p, key, L.addDays(d, -1), 'Ahead of plan, bringing it forward', ctx, NOW).project.mood, 75);
});

t('change date: cannot cross neighbours, cannot move a delivered deliverable, last one moves the end date', () => {
  const p = locked('2026-10-12', '2026-12-04');
  const nextDate = p.stages[1].deadline;
  assert.ok(L.changeDate(p, p.stages[0].key, L.addDays(nextDate, 1), 'A proper reason here', ctx, NOW).error);
  assert.ok(L.changeDate(p, p.stages[1].key, '2026-10-01', 'A proper reason here', ctx, NOW).error);
  const delivered = L.deliverStage(p, p.stages[0].key, allChecked(p.stages[0].key, p), ctx, '2026-10-15', NOW).project;
  assert.ok(L.changeDate(delivered, p.stages[0].key, '2026-10-16', 'A proper reason here', ctx, NOW).error);
  const last = p.stages[p.stages.length - 1].key;
  assert.strictEqual(L.changeDate(p, last, '2026-12-08', 'Festival week, client away', ctx, NOW).project.end, '2026-12-08');
});

t('demand check: a client demand from the brief becomes a check at the quality gate', () => {
  let p = locked('2026-10-12', '2026-12-04');
  p = Object.assign({}, p, { brief: { answers: p.brief.answers, demands: { concept: 'Keep the pooja corner apart from the TV area' } } });
  const checks = L.checksFor('concept', p);
  const demand = checks.find((c) => c.key === 'demand');
  assert.ok(demand && /pooja corner/.test(demand.label));
  assert.ok(!L.checksFor('concept').some((c) => c.key === 'demand'));
  assert.ok(!L.checksFor('materials', p).some((c) => c.key === 'demand'));
  const all = allChecked('concept', p).filter((k) => k !== 'demand');
  const r = L.deliverStage(p, 'concept', all, ctx, '2026-10-15', NOW);
  assert.strictEqual(r.passed, false);
  assert.ok(r.missing.some((m) => /pooja corner/.test(m)));
  const long = L.checksFor('concept', Object.assign({}, p, { brief: { answers: {}, demands: { concept: 'x'.repeat(300) } } })).find((c) => c.key === 'demand');
  assert.ok(long.label.length < 140);
});

t('deliver: must be locked, in order, and checked; a sent-back deliverable can pass later', () => {
  const fresh = mk('2026-10-12', '2026-12-04');
  assert.ok(L.deliverStage(fresh, 'concept', allChecked('concept'), ctx, '2026-10-15', NOW).error);
  const p = L.lockProject(fresh, ctx, NOW).project;
  assert.ok(L.deliverStage(p, 'renders', allChecked('renders'), ctx, '2026-10-15', NOW).error);
  const back = L.deliverStage(p, 'concept', ['need'], ctx, '2026-10-15', NOW);
  assert.strictEqual(back.passed, false);
  assert.ok(back.missing.length >= 5);
  assert.strictEqual(back.project.stages[0].attempts, 1);
  assert.strictEqual(back.project.mood, 73);
  const ok = L.deliverStage(back.project, 'concept', allChecked('concept'), ctx, '2026-10-15', NOW);
  assert.strictEqual(ok.passed, true);
  assert.strictEqual(ok.firstPass, false);
  assert.strictEqual(ok.project.stages[0].returned, null);
});

t('deliver: on time lifts mood, late lowers it, mood stays within 0 to 100', () => {
  const p = locked('2026-10-12', '2026-12-04');
  const k = p.stages[0].key;
  const d0 = p.stages[0].deadline;
  const early = L.deliverStage(p, k, allChecked(k), ctx, L.addDays(d0, -1), NOW);
  assert.strictEqual(early.late, false);
  assert.strictEqual(early.project.mood, 80);
  const late = L.deliverStage(p, k, allChecked(k), ctx, L.addDays(d0, 3), NOW);
  assert.strictEqual(late.lateDays, 3);
  assert.strictEqual(late.project.mood, 75 - 14);
  assert.strictEqual(L.deliverStage(Object.assign({}, p, { mood: 3 }), k, allChecked(k), ctx, L.addDays(d0, 30), NOW).project.mood, 0);
  assert.strictEqual(L.deliverStage(Object.assign({}, p, { mood: 98 }), k, allChecked(k), ctx, d0, NOW).project.mood, 100);
});

t('deliver every deliverable of a full eight-item project: delivered, then portfolio gate', () => {
  let p = locked('2026-10-12', '2026-12-30', { deliverables: L.DELIVERABLES.map((d) => d.key) });
  assert.strictEqual(p.stages.length, 8);
  p.stages.forEach((s, i) => {
    const r = L.deliverStage(p, s.key, allChecked(s.key, p), ctx, p.stages[i].deadline, NOW);
    assert.ok(r.passed, s.key);
    p = r.project;
  });
  assert.strictEqual(p.status, 'delivered');
  assert.strictEqual(L.projectSummary(p, [], '2027-01-02').status, 'delivered');
  let pf = null;
  L.PORTFOLIO_CHECKS.forEach((c, i) => {
    pf = L.setPortfolioCheck(Object.assign({}, p, { portfolio: pf || p.portfolio }), c.key, true, NOW);
    assert.strictEqual(pf.ready, i === L.PORTFOLIO_CHECKS.length - 1);
  });
  const un = L.setPortfolioCheck(Object.assign({}, p, { portfolio: pf }), 'hero', false, NOW);
  assert.strictEqual(un.ready, false);
  assert.strictEqual(un.readyAt, null);
});

t('legacy projects with the old stage names still work', () => {
  const old = {
    id: 'old', name: 'Old', clientId: 'c1', start: '2026-10-01', end: '2026-12-01', locked: true, mood: 75, log: [],
    stages: [
      { key: 'brief', deadline: '2026-10-07', doneAt: null, returned: null, attempts: 0 },
      { key: 'layout', deadline: '2026-10-20', doneAt: null, returned: null, attempts: 0 },
      { key: 'final', deadline: '2026-12-01', doneAt: null, returned: null, attempts: 0 },
    ],
  };
  assert.strictEqual(L.stageDef('layout').name, 'Spatial layout options');
  assert.ok(L.checksFor('brief', old).length >= 4);
  const r = L.deliverStage(old, 'brief', allChecked('brief', old), ctx, '2026-10-06', NOW);
  assert.ok(r.passed);
  assert.strictEqual(L.stageDef('unknown-key').name, 'unknown-key');
});

t('analyze: attention sorted overdue first; upcoming within 14 days; planning projects ignored', () => {
  const a = Object.assign({ id: 'p1' }, locked('2026-10-01', '2026-12-04'));
  const b = Object.assign({}, locked('2026-10-12', '2026-12-30'), { id: 'p2', name: 'Second' });
  const planning = Object.assign({}, mk('2026-10-12', '2026-12-30'), { id: 'p3' });
  const today = L.addDays(a.stages[0].deadline, 1);
  const res = L.analyze([a, b, planning], [], { c1: { name: 'Mehta' } }, today);
  assert.strictEqual(res.attention[0].state, 'overdue');
  assert.strictEqual(res.attention[0].projectId, 'p1');
  assert.ok(res.attention.every((x) => x.projectId !== 'p3'));
  assert.strictEqual(res.attention[0].rescue.length, 3);
  res.upcoming.forEach((u) => assert.ok(u.daysLeft >= 0 && u.daysLeft <= 14));
});

t('brief gaps: unlocked projects only, thin brief first, then ready-to-lock', () => {
  const thin = Object.assign({}, mk('2026-10-12', '2026-12-04', { brief: false }), { id: 'a', name: 'Thin' });
  const ready = Object.assign({}, mk('2026-10-12', '2026-12-04'), { id: 'b', name: 'Ready' });
  const lockedP = Object.assign({}, locked('2026-10-12', '2026-12-04'), { id: 'c', name: 'Locked' });
  const gaps = L.briefGaps([ready, lockedP, thin], { c1: { name: 'Mehta' } });
  assert.deepStrictEqual(gaps.map((g) => g.projectId + ':' + g.kind), ['a:brief', 'b:lock']);
  assert.strictEqual(gaps[0].essentialsDone, 0);
  assert.strictEqual(gaps[0].next.key, 'household');
  assert.strictEqual(gaps[1].next, null);
});

t('manager brief: wording for empty, overdue, gap, ready to lock, on-track, delivered, late night', () => {
  const none = L.buildBrief({ projectCount: 0, activeCount: 0, attention: [], upcoming: [], gaps: [], hour: 10, streak: 0 });
  assert.ok(/first project/i.test(none.headline));
  const over = L.buildBrief({
    projectCount: 1, activeCount: 1, hour: 10, streak: 0, upcoming: [], gaps: [],
    attention: [{ state: 'overdue', stageName: '3D renders', projectName: 'Mehta 3BHK', deadline: '2026-10-10', daysLeft: -5 }],
  });
  assert.ok(/slipped/.test(over.headline) && over.focus);
  const q = L.BRIEF_QUESTIONS.find((x) => x.key === 'household');
  const gap = L.buildBrief({ projectCount: 1, activeCount: 1, hour: 10, streak: 0, attention: [], upcoming: [], gaps: [{ kind: 'brief', projectName: 'Mehta 3BHK', essentialsDone: 3, essentialsTotal: 8, next: q }] });
  assert.ok(/full brief/i.test(gap.headline));
  assert.ok(/3 of 8/.test(gap.body) && gap.body.indexOf(q.label) !== -1);
  assert.ok(gap.gap);
  const lock = L.buildBrief({ projectCount: 1, activeCount: 1, hour: 10, streak: 0, attention: [], upcoming: [], gaps: [{ kind: 'lock', projectName: 'Mehta 3BHK', next: null }] });
  assert.ok(/lock the dates/i.test(lock.headline));
  const overWithGap = L.buildBrief({
    projectCount: 2, activeCount: 2, hour: 10, streak: 0, upcoming: [],
    gaps: [{ kind: 'brief', projectName: 'B', essentialsDone: 0, essentialsTotal: 8, next: q }],
    attention: [{ state: 'at-risk', stageName: 'Design variations', projectName: 'A', deadline: '2026-10-16', daysLeft: 1 }],
  });
  assert.ok(/tight/.test(overWithGap.headline), 'a date at risk outranks an unfinished brief');
  const ok = L.buildBrief({
    projectCount: 1, activeCount: 1, hour: 23, streak: 3, attention: [], gaps: [],
    upcoming: [{ stageName: 'Walkthroughs', projectName: 'Mehta 3BHK', deadline: '2026-11-02', daysLeft: 18 }],
  });
  assert.ok(/on track/i.test(ok.headline) && /3 on-time/.test(ok.body) && /rest/.test(ok.body));
  const done = L.buildBrief({ projectCount: 2, activeCount: 0, attention: [], upcoming: [], gaps: [], hour: 14, streak: 0 });
  assert.ok(/delivered/i.test(done.headline));
});

t('streak counts consecutive on-time deliveries and stops at the first late one', () => {
  const ev = (t, late) => ({ t, type: 'delivered', late });
  assert.strictEqual(L.onTimeStreak([{ log: [ev('1', false), ev('2', false), ev('3', true), ev('4', false), ev('5', false)] }]), 2);
  assert.strictEqual(L.onTimeStreak([{ log: [] }]), 0);
});

t('interview prompt: carries persona, brief, demands and history; stays in character; ends on the question', () => {
  let p = locked('2026-10-12', '2026-12-04');
  p = Object.assign({}, p, { brief: { answers: p.brief.answers, demands: { lighting: 'x' } } });
  const client = { name: 'The Mehta family', type: 'Joint family', budget: '25 to 30 lakh', taste: 'Bold color', need: 'A warm home.', worry: 'crowded rooms' };
  const prompt = L.interviewPrompt(client, p, [{ q: 'Who lives here?', a: 'Six of us.' }], 'What colors do you love?');
  assert.ok(/The Mehta family/.test(prompt) && /25 to 30 lakh/.test(prompt) && /crowded rooms/.test(prompt));
  assert.ok(/Housewarming on 12 December/.test(prompt));
  assert.ok(/Photorealistic renders/.test(prompt) && /Interior concept/.test(prompt));
  assert.ok(/Designer: Who lives here\?\nYou: Six of us\./.test(prompt));
  assert.ok(/Never mention being an AI/.test(prompt));
  assert.ok(prompt.trim().endsWith('The designer asks: What colors do you love?'));
  assert.ok(!/\n\n\n/.test(prompt));
  const bare = L.interviewPrompt(null, mk('2026-10-12', '2026-12-04', { brief: false }), [], 'Hello?');
  assert.ok(/nothing yet/.test(bare) && bare.trim().endsWith('Hello?'));
  const many = Array.from({ length: 20 }, (_, i) => ({ q: 'Q' + i, a: 'A' + i }));
  const trimmed = L.interviewPrompt(client, p, many, 'Next?');
  assert.ok(/Q19/.test(trimmed) && !/Q0\b/.test(trimmed) && !/Q11\b/.test(trimmed));
});

t('scorecard and member stats', () => {
  let p = Object.assign({ id: 'p1' }, locked('2026-10-12', '2026-12-04'));
  const k0 = p.stages[0].key;
  const k1 = p.stages[1].key;
  const r1 = L.deliverStage(p, k0, ['need'], ctx, p.stages[0].deadline, NOW).project;
  const r2 = L.deliverStage(r1, k0, allChecked(k0, p), ctx, L.addDays(p.stages[0].deadline, 2), NOW).project;
  const r3 = L.deliverStage(r2, k1, allChecked(k1, p), ctx, p.stages[1].deadline, NOW).project;
  const sc = L.scorecard([r3]);
  assert.strictEqual(sc.delivered, 2);
  assert.strictEqual(sc.onTimeRate, 50);
  assert.strictEqual(sc.firstPassRate, 50);
  const tasks = [
    { id: 't1', projectId: 'p1', stageKey: k0, assigneeId: 'm1', done: true, doneAt: r3.stages[0].deadline },
    { id: 't2', projectId: 'p1', stageKey: k0, assigneeId: 'm1', done: true, doneAt: L.addDays(r3.stages[0].deadline, 1) },
    { id: 't3', projectId: 'p1', stageKey: k1, assigneeId: 'm1', done: false },
  ];
  assert.deepStrictEqual(L.memberStats('m1', tasks, [r3]), { open: 1, done: 2, onTimeRate: 50 });
  assert.strictEqual(L.memberStats('nobody', tasks, [r3]).onTimeRate, null);
});

console.log('\n' + n + ' passed' + (process.exitCode ? ', with failures' : ''));
