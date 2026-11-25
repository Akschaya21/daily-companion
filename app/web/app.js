/* Daily Companion — single desktop widget.
   Data lives in ~/Library/Application Support/DailyCompanion/data.json (written by the Mac app).
   In a plain browser it falls back to localStorage so the UI can be previewed. */
(function () {
  'use strict';
  const A = window.DCAvatar;
  const native = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dc);
  if (!native) document.body.classList.add('browser');
  const post = (msg) => { if (native) window.webkit.messageHandlers.dc.postMessage(msg); };

  // ---------- data ----------
  const DEFAULTS = {
    v: 1,
    settings: { morning: '08:00', evening: '21:30', move: '07:00', reflect: '20:00', deadline: '2026-12-31', onTop: false, login: false },
    days: {}
  };
  function load() {
    let d = window.__DC_DATA__;
    if (!d && !native) { try { d = JSON.parse(localStorage.getItem('dc-data') || 'null'); } catch (e) { d = null; } }
    d = d && typeof d === 'object' ? d : {};
    return { v: 1, settings: Object.assign({}, DEFAULTS.settings, d.settings || {}), days: d.days || {} };
  }
  const data = load();
  const memoji = window.__DC_MEMOJI__ || {}; // { mood: dataURL } from the Mac app, if PNGs were provided
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (native) post({ type: 'save', data: JSON.stringify(data) });
      else { try { localStorage.setItem('dc-data', JSON.stringify(data)); } catch (e) { /* preview only */ } }
    }, 150);
  }

  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  let todayKey = keyOf(new Date());

  function ensureDay(k) {
    if (!data.days[k]) {
      const prev = Object.keys(data.days).filter(x => x < k).sort().pop();
      const carried = prev ? (data.days[prev].tasks || []).filter(t => !t.done && t.title.trim())
        .map(t => ({ id: uid(), title: t.title, done: false, carried: (t.carried || 0) + 1 })) : [];
      data.days[k] = { mood: null, tasks: carried, move: false, reflectBlock: false, morning: null, evening: null };
      save();
    }
    return data.days[k];
  }
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moodOf = (id) => A.MOODS.find(m => m.id === id);
  // Your own PNGs (from the Memoji folder) win; otherwise the bundled Memoji set.
  // Before a mood is picked, the design's default Memoji (Focused, thumbs-up) is shown.
  const HERO = { happy: 'memoji/hero/happy.png', focused: 'memoji/hero/focused.png' };
  const face = (id, size) => {
    const m = moodOf(id) || moodOf('calm');
    const src = memoji[m.id] || `memoji/${m.id}.png`;
    return `<img class="mj" src="${src}" alt="${esc(m.label)} Memoji" width="${size}" height="${size}" draggable="false">`;
  };
  const heroFace = (id) => {
    const m = moodOf(id);
    if (!m) return `<img class="hero-face wide" src="${memoji.focused || HERO.focused}" alt="Memoji" draggable="false">`;
    if (memoji[id]) return `<img class="hero-face" src="${memoji[id]}" alt="${esc(m.label)} Memoji" draggable="false">`;
    return HERO[id]
      ? `<img class="hero-face wide" src="${HERO[id]}" alt="${esc(m.label)} Memoji" draggable="false">`
      : `<img class="hero-face round" src="memoji/${id}.png" alt="${esc(m.label)} Memoji" draggable="false">`;
  };
  function fmtTime(hhmm) {
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return ((h % 12) || 12) + ':' + pad(m) + ' ' + ampm;
  }
  const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  const NOTES = {
    happy: ['Let today be light. Enjoy it.', 'Share the good mood with someone.', 'Joy counts as progress too.'],
    calm: ['Slow is smooth. Smooth is steady.', 'Nothing needs to be rushed today.', 'Stay with one thing at a time.'],
    focused: ['Small steps still move you forward.', 'Do the hard thing first.', 'Protect your best hour.'],
    grateful: ['Notice what is already good.', 'Say thank you to someone today.', 'Enough is a feast.'],
    energised: ['Use the spark on what matters most.', 'Move first, then make.', 'Start the thing you keep putting off.'],
    tired: ['Rest is part of the work.', 'Do less, but do it kindly.', 'An early night is a plan, too.'],
    anxious: ['One breath, then one small step.', 'You only need to see the next step.', 'Feelings pass. Keep your feet moving.'],
    sad: ['Be gentle with yourself today.', 'It is okay to go slowly.', 'Reach out to one person you trust.'],
    hopeful: ['Tomorrow grows from what you do today.', 'Keep the door open.', 'Something good is on its way.'],
    none: ['Small steps still move you forward.']
  };
  function noteFor(k, mood) {
    const list = NOTES[mood] || NOTES.none;
    const seed = k.split('-').reduce((a, b) => a + Number(b), 0);
    return list[seed % list.length];
  }

  // ---------- priorities: today's Google Calendar + Notion (written by Claude) + your own ----------
  let external = { claude: {} };
  if (!native && /[?&]demo/.test(location.search)) {
    external = { claude: { generatedAt: new Date().toISOString(), items: [
      { title: 'Imperial essay: outline the story arc', source: 'Calendar', time: '07:30', end: '09:00', why: 'Start with the opening scene' },
      { title: 'Builder: one Glide app step', source: 'Calendar', time: '09:00', end: '09:30' },
      { title: 'Research the cafe networking idea', source: 'Notion', why: 'High interest, high time on your task list' },
      { title: 'Evening: explore, build or upskill', source: 'Calendar', time: '20:45', end: '22:15' }
    ] } };
  }
  const SOURCE_COLOR = { calendar: '#7EA6FF', notion: '#E6E1EF' };

  function priorities(day) {
    const s = data.settings;
    const hidden = day.hidden || {}, extDone = day.extDone || {};
    const items = [];
    if (s.showClaude !== false) {
      ((external.claude || {}).items || []).forEach((c, i) => {
        const id = 'cl:' + todayKey + ':' + c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        if (hidden[id]) return;
        const timed = c.time && /^\d{2}:\d{2}$/.test(c.time);
        const src = (c.source || '').toLowerCase().includes('notion') ? 'notion' : (c.source || '').toLowerCase().includes('calendar') ? 'calendar' : 'claude';
        const when = timed ? fmtTime(c.time) + (c.end ? '–' + fmtTime(c.end) : '') : '';
        items.push({ id, kind: 'claude', src, title: c.title, done: !!extDone[id],
          meta: timed ? fmtTime(c.time) : src === 'notion' ? 'Notion' : 'Claude',
          source: (src === 'calendar' ? 'Google Calendar' : src === 'notion' ? 'Notion' : 'Claude') + (when ? ' · ' + when : '') + (c.why ? ' — ' + c.why : ''),
          sort: timed ? minutesOf(c.time) : 2000 + i });
      });
    }
    day.tasks.forEach((t, i) => items.push({ id: t.id, kind: 'manual', title: t.title, done: t.done, meta: '', source: 'Added by you', sort: 3000 + i }));
    return items.sort((a, b) => a.sort - b.sort);
  }

  // ---------- view state ----------
  const ui = { view: 'today', sheet: null, editTask: null, reflectKind: 'morning', reflectDay: null, calMonth: null, calSel: null, draft: null };
  const card = document.getElementById('card');

  const ICON = {
    gear: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    target: '<svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10" cy="10" r="8"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r="1" fill="currentColor"/></svg>',
    quote: '<svg width="30" height="22" viewBox="0 0 32 24" aria-hidden="true"><path d="M2 22V13C2 6 6 2 12 1v4c-3 1-5 3-5 7h5v10zM19 22V13c0-7 4-11 10-12v4c-3 1-5 3-5 7h5v10z" fill="#B794F6"/></svg>',
    sun: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#FFC14D" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="#FFC14D"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
    moon: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" fill="#A98BF5"/></svg>`,
    okring: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#6EE7A8" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5" stroke-linecap="round"/></svg>',
    tick: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.3l2.6 2.6L10 3.4" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
    leaf: '<svg width="17" height="17" viewBox="0 0 24 24" fill="#6EE7A8" aria-hidden="true"><path d="M12 21v-7C12 8 7 5 2 5c0 6 4 9 10 9M12 14c0-6 4-10 10-10 0 6-4 10-10 10z"/></svg>',
    run: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#B794F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="4" r="2" fill="#B794F6"/><path d="M8 21l3-5 3 2v4M6 12l3-4 4 1 2 3 3 1M11 16l2-6"/></svg>',
    book: '<svg width="23" height="23" viewBox="0 0 24 24" fill="#FF9A76" aria-hidden="true"><path d="M2 5c3-1 6-1 9 1v14c-3-2-6-2-9-1zM22 5c-3-1-6-1-9 1v14c3-2 6-2 9-1z"/></svg>',
    cal: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    back: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    sparkle: '<svg class="sparkle" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z" fill="currentColor"/></svg>',
    journal: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h11a3 3 0 013 3v15H8a3 3 0 01-3-3z"/><path d="M5 18a3 3 0 013-3h11M9 7h6M9 11h4"/></svg>',
    bell: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 9a6 6 0 1112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 004 0"/></svg>',
    spark12: '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z" fill="#C3A2F7"/></svg>',
    notion: '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9 16.5V7.5l6 9V7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    trophy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFC14D" aria-hidden="true"><path d="M7 3h10v4a5 5 0 01-10 0zM5 4H2v2a4 4 0 004 4M19 4h3v2a4 4 0 01-4 4M10 14h4v3h3v4H7v-4h3z"/></svg>'
  };

  // ---------- renderers ----------
  function renderToday() {
    const day = ensureDay(todayKey);
    const s = data.settings;
    const now = new Date();
    const mood = moodOf(day.mood);
    const items = priorities(day);
    const done = items.filter(t => t.done).length;
    const total = items.length;
    const deadline = fromKey(s.deadline);
    const daysLeft = Math.max(0, Math.ceil((deadline - fromKey(todayKey)) / 86400000));
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const blockBadge = (isDone, time, color) => {
      if (isDone) return `<span class="badge" style="color:#6EE7A8;border-color:#6EE7A8">${ICON.tick}Done</span>`;
      const upNext = [['move', s.move, day.move], ['reflect', s.reflect, day.reflectBlock]].filter(b => !b[2]).sort((a, b) => minutesOf(a[1]) - minutesOf(b[1]))[0];
      if (upNext && upNext[1] === time && minutesOf(time) + 30 >= nowMin) return `<span class="badge" style="color:${color};border-color:${color}">Up Next</span>`;
      if (minutesOf(time) + 30 < nowMin) return `<span class="badge" style="color:#B9B2C8;border-color:rgba(255,255,255,.25)">Missed</span>`;
      return `<span class="badge" style="color:#B9B2C8;border-color:rgba(255,255,255,.25)">Later</span>`;
    };
    const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const reflCount = Object.values(data.days).reduce((n, d) => n + (d.morning ? 1 : 0) + (d.evening ? 1 : 0), 0);

    return `
      <div class="streak" aria-hidden="true"></div>
      <div class="head" data-drag>
        <div data-drag><div class="title" data-drag>Today ${ICON.sparkle}</div><div class="sub" data-drag>${esc(dateLabel)}</div></div>
        <div class="head-actions">
          <button class="journalbtn" data-act="calendar" aria-label="Open reflections, ${reflCount} saved">${ICON.journal}<span>Reflections</span></button>
          <button class="iconbtn" data-act="settings" aria-label="Settings">${ICON.gear}</button>
        </div>
      </div>
      <div class="hero">
        <div class="avatar-wrap">
          <div class="avatar-glow" style="background: radial-gradient(circle at 50% 45%, ${mood ? mood.tint + '66' : 'rgba(142,134,160,.4)'}, rgba(107,63,201,.35) 55%, transparent 72%)"></div>
          <span class="spark s1">${ICON.sparkle}</span><span class="spark s2">${ICON.sparkle}</span><span class="spark s3">${ICON.sparkle}</span>
          ${heroFace(day.mood)}
          <button class="moodpill" data-act="moods" aria-label="Change today's mood">${ICON.target}${mood ? mood.label : 'How are you?'}</button>
        </div>
        <div class="note">
          ${ICON.quote}
          <div class="note-text">${esc(noteFor(todayKey, day.mood))}</div>
          <div class="note-foot">— A note for today</div>
        </div>
      </div>
      <div class="rituals">
        <button class="ritual am ${day.morning ? 'done' : ''}" data-act="reflect" data-kind="morning" aria-label="Start of the day reflection${day.morning ? ', done' : ''}">
          ${ICON.sun(26)}
          <span class="grow"><span class="k">Start of the Day</span><span class="v">${fmtTime(s.morning)}</span></span>
          ${day.morning ? ICON.okring : '<span class="dotring"></span>'}
        </button>
        <span class="vsep"></span>
        <button class="ritual pm ${day.evening ? 'done' : ''}" data-act="reflect" data-kind="evening" aria-label="End of day reflection${day.evening ? ', done' : ''}">
          ${ICON.moon(24)}
          <span class="grow"><span class="k" style="color:#C9B6FF">End of Day</span><span class="v">${fmtTime(s.evening)}</span></span>
          ${day.evening ? ICON.okring : '<span class="dotring"></span>'}
        </button>
      </div>
      <div>
        <div class="capline"><span class="cap">Today’s priorities</span>${items.length >= 3 ? `<button class="capadd" data-act="add" aria-label="Add a priority">${ICON.plus}Add</button>` : ''}</div>
        <div class="tasks ${items.length > 3 ? 'scrolly' : ''}">
          ${items.map(t => `
            <div class="task ${t.done ? 'done' : ''}">
              <button class="ring ${t.done ? 'on' : ''}" data-act="toggle" data-id="${esc(t.id)}" data-kind="${t.kind}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${t.done ? ICON.tick : ''}</button>
              ${t.kind === 'manual' && ui.editTask === t.id
                ? `<input class="t" data-edit="${t.id}" value="${esc(t.title)}" aria-label="Task title" maxlength="80">`
                : t.kind === 'manual'
                  ? `<span class="t" data-act="edit" data-id="${t.id}" title="Click to edit">${esc(t.title)}</span>`
                  : `<span class="t" title="${esc(t.source)}">${esc(t.title)}</span>`}
              ${t.meta ? `<span class="src">${t.src === 'calendar' ? `<i style="background:${SOURCE_COLOR.calendar}"></i>` : t.src === 'notion' ? ICON.notion : t.kind === 'claude' ? ICON.spark12 : ''}${esc(t.meta)}</span>` : ''}
              <button class="del" data-act="${t.kind === 'manual' ? 'del' : 'hide'}" data-id="${esc(t.id)}" aria-label="${t.kind === 'manual' ? 'Delete' : 'Hide from today'}: ${esc(t.title)}">${ICON.x}</button>
            </div>`).join('')}
          ${items.length < 3
            ? Array.from({ length: 3 - items.length }, (_, i) => `
              <button class="task slot" data-act="add" style="width:100%;text-align:left;color:inherit" aria-label="Add a priority">
                <span class="ring" aria-hidden="true"></span>
                <span class="t">${i === 0 ? 'Add a priority' : 'Add another'}</span>
              </button>`).join('')
            : ''}
        </div>
      </div>
      <div class="bm">
        <div class="bm-h">${ICON.leaf}BODY &amp; MIND</div>
        <div class="bm-grid">
          <button class="block move" data-act="block" data-b="move" aria-label="Move, ${day.move ? 'done' : 'not done'}">
            <span class="ic">${ICON.run}</span>
            <span class="grow"><span class="n">Move</span><span class="m">30 min · ${fmtTime(s.move)}</span></span>
            <span class="badgepos">${blockBadge(day.move, s.move, '#6EE7A8')}</span>
          </button>
          <button class="block refl" data-act="block" data-b="reflectBlock" aria-label="Reflect, ${day.reflectBlock ? 'done' : 'not done'}">
            <span class="ic">${ICON.book}</span>
            <span class="grow"><span class="n">Reflect</span><span class="m">30 min · ${fmtTime(s.reflect)}</span></span>
            <span class="badgepos">${blockBadge(day.reflectBlock, s.reflect, '#FF8FB8')}</span>
          </button>
        </div>
      </div>
      <div class="foot">
        ${ICON.trophy}
        <span>${done} of ${total} tasks</span>
        <span class="bar"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></span>
        <span class="vsep" style="height:24px"></span>
        <button class="linkbtn" data-act="calendar" aria-label="Open reflections calendar">${ICON.cal}${daysLeft} days to go · ${fromKey(s.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</button>
      </div>
      ${ui.sheet === 'moods' ? renderMoodSheet(day.mood) : ''}`;
  }

  function renderMoodSheet(current) {
    return `<div class="scrim" data-act="closesheet">
      <div class="sheet" role="dialog" aria-label="Your mood today">
        <div class="cap">Your mood today</div>
        <div class="moodgrid">
          ${A.MOODS.map(m => `<button class="tile ${m.id === current ? 'on' : ''}" data-act="pickmood" data-mood="${m.id}" aria-pressed="${m.id === current}">${face(m.id, 62)}<span>${m.label}</span></button>`).join('')}
        </div>
      </div>
    </div>`;
  }

  const PROMPTS = {
    morning: [
      ['intention', 'Today I want to…', 'input'],
      ['mind', 'What’s on my mind', 'area'],
      ['grateful', 'One thing I’m grateful for', 'input']
    ],
    evening: [
      ['wentWell', 'What went well today?', 'area'],
      ['hard', 'What was hard, or what did I learn?', 'area'],
      ['goodThing', 'One good thing', 'input'],
      ['tomorrow', 'A note for tomorrow', 'input']
    ]
  };

  function renderReflect() {
    const k = ui.reflectDay || todayKey;
    const day = ensureDay(k);
    const kind = ui.reflectKind;
    if (!ui.draft) {
      const existing = day[kind];
      ui.draft = existing ? Object.assign({}, existing) : { mood: day.mood || null };
    }
    const d = ui.draft;
    const isAM = kind === 'morning';
    const dateLabel = fromKey(k).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    return `<div class="view">
      <div class="vhead" data-drag>
        <button class="iconbtn" data-act="back" aria-label="Back">${ICON.back}</button>
        ${isAM ? ICON.sun(28) : ICON.moon(26)}
        <div style="flex:1" data-drag><div class="title" data-drag>${isAM ? 'Start of the day' : 'End of day'}</div><div class="sub" data-drag>${esc(dateLabel)}</div></div>
      </div>
      <div class="scroll">
        <div class="field">
          <label>${isAM ? 'How do I feel this morning?' : 'How do I feel now?'}</label>
          <div class="moodrow" role="group" aria-label="Mood">
            ${A.MOODS.map(m => `<button class="mchip ${d.mood === m.id ? 'on' : ''}" data-act="draftmood" data-mood="${m.id}" aria-pressed="${d.mood === m.id}">${face(m.id, 40)}${m.label}</button>`).join('')}
          </div>
        </div>
        ${PROMPTS[kind].map(([key, label, type]) => `
          <div class="field">
            <label for="f-${key}">${label}</label>
            ${type === 'area'
              ? `<textarea id="f-${key}" data-draft="${key}" rows="3">${esc(d[key] || '')}</textarea>`
              : `<input type="text" id="f-${key}" data-draft="${key}" value="${esc(d[key] || '')}">`}
          </div>`).join('')}
      </div>
      <div class="actions">
        ${day[kind] ? `<button class="btn danger" data-act="delreflect" style="flex:0 0 90px">Delete</button>` : ''}
        <button class="btn" data-act="back">Cancel</button>
        <button class="btn primary" data-act="savereflect">Save</button>
      </div>
    </div>`;
  }

  function entryHTML(e, kind) {
    if (!e) return '';
    const m = moodOf(e.mood);
    const parts = PROMPTS[kind].filter(([key]) => e[key] && String(e[key]).trim())
      .map(([key, label]) => `<div class="q">${label}</div><p>${esc(e[key])}</p>`).join('');
    const at = e.at ? new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    return `<div class="entry">
      ${kind === 'morning' ? ICON.sun(20) : ICON.moon(19)}
      <div class="body"><p><b>${m ? m.label + '.' : ''}</b> <span style="color:var(--faint)">${at}</span></p>${parts || '<p class="empty">No notes written.</p>'}</div>
    </div>`;
  }

  function renderCalendar() {
    const today = fromKey(todayKey);
    if (!ui.calMonth) ui.calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (!ui.calSel) ui.calSel = todayKey;
    const y = ui.calMonth.getFullYear(), mo = ui.calMonth.getMonth();
    const first = new Date(y, mo, 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const count = new Date(y, mo + 1, 0).getDate();
    let am = 0, pm = 0;
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="day blank"></span>');
    for (let d = 1; d <= count; d++) {
      const k = y + '-' + pad(mo + 1) + '-' + pad(d);
      const day = data.days[k];
      const mood = day && ((day.evening && day.evening.mood) || (day.morning && day.morning.mood) || day.mood);
      const hasAM = !!(day && day.morning), hasPM = !!(day && day.evening);
      if (hasAM) am++; if (hasPM) pm++;
      const cls = ['day', mood ? 'has' : '', k === todayKey ? 'today' : '', k === ui.calSel ? 'sel' : '', k > todayKey ? 'future' : ''].join(' ');
      cells.push(`<button class="${cls}" data-act="selday" data-k="${k}" aria-label="${fromKey(k).toDateString()}${hasAM ? ', morning reflection' : ''}${hasPM ? ', evening reflection' : ''}">
        <span>${d}</span>${mood ? face(mood, 24) : '<span style="height:24px"></span>'}
        <span class="dots"><i style="background:${hasAM ? '#FFC14D' : 'transparent'}"></i><i style="background:${hasPM ? '#A98BF5' : 'transparent'}"></i></span>
      </button>`);
    }
    const sel = data.days[ui.calSel];
    const selLabel = fromKey(ui.calSel).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const canWrite = ui.calSel <= todayKey;
    return `<div class="view">
      <div class="vhead" data-drag>
        <button class="iconbtn" data-act="back" aria-label="Back to today">${ICON.back}</button>
        <div style="flex:1" data-drag><div class="title" data-drag>Reflections</div><div class="sub" data-drag>${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div></div>
        <button class="iconbtn" data-act="month" data-dir="-1" aria-label="Previous month" style="width:36px;height:36px">${ICON.back}</button>
        <button class="iconbtn" data-act="month" data-dir="1" aria-label="Next month" style="width:36px;height:36px">${ICON.next}</button>
      </div>
      <div class="dow"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
      <div class="grid7">${cells.join('')}</div>
      <div class="legend"><span><i style="background:#FFC14D"></i>Start of day · ${am}</span><span><i style="background:#A98BF5"></i>End of day · ${pm}</span></div>
      <div class="scroll">
        <div class="detail">
          <h3>${esc(selLabel)}</h3>
          ${sel && (sel.morning || sel.evening)
            ? entryHTML(sel.morning, 'morning') + entryHTML(sel.evening, 'evening')
            : `<div class="empty">${canWrite ? 'No reflections for this day yet.' : 'This day hasn’t happened yet.'}</div>`}
          ${canWrite ? `<div style="display:flex;gap:8px">
            <button class="minibtn" data-act="reflect" data-kind="morning" data-k="${ui.calSel}">${sel && sel.morning ? 'Edit' : 'Add'} morning</button>
            <button class="minibtn" data-act="reflect" data-kind="evening" data-k="${ui.calSel}">${sel && sel.evening ? 'Edit' : 'Add'} evening</button>
          </div>` : ''}
        </div>
      </div>
    </div>`;
  }

  function renderSettings() {
    const s = data.settings;
    const timeRow = (key, label) => `<div class="setrow"><label for="t-${key}">${label}</label><input type="time" id="t-${key}" data-setting="${key}" value="${s[key]}"></div>`;
    return `<div class="view">
      <div class="vhead" data-drag>
        <button class="iconbtn" data-act="back" aria-label="Back">${ICON.back}</button>
        <div style="flex:1" data-drag><div class="title" data-drag>Settings</div><div class="sub" data-drag>Stored only on this Mac</div></div>
      </div>
      <div class="scroll">
        ${timeRow('morning', 'Start of the day')}
        ${timeRow('evening', 'End of day')}
        ${timeRow('move', 'Move (30 min)')}
        ${timeRow('reflect', 'Reflect (30 min)')}
        <div class="setrow"><label for="t-deadline">Goal date</label><input type="text" id="t-deadline" data-setting="deadline" value="${s.deadline}" style="width:112px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.22);color:var(--text);padding:6px 8px;font:inherit"></div>
        <div class="cap" style="margin:14px 4px 8px">Today’s priorities</div>
        <div class="setrow"><span>From Google Calendar &amp; Notion (via Claude)</span><button class="switch ${s.showClaude !== false ? 'on' : ''}" data-act="srcclaude" role="switch" aria-checked="${s.showClaude !== false}" aria-label="Show today’s Google Calendar and Notion items"></button></div>
        <p class="hint">${(external.claude || {}).generatedAt ? 'Updated by Claude at ' + new Date(external.claude.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '. ' : ''}Claude reads your Google Calendar and Notion each morning. Birthdays and holidays are left out. Tap “Add” on the widget to add your own.</p>
        <div class="setrow"><span>Keep above other windows</span><button class="switch ${s.onTop ? 'on' : ''}" data-act="ontop" role="switch" aria-checked="${s.onTop}" aria-label="Keep above other windows"></button></div>
        <div class="setrow"><span>Open at login</span><button class="switch ${s.login ? 'on' : ''}" data-act="login" role="switch" aria-checked="${s.login}" aria-label="Open at login"></button></div>
        <p class="hint">Drag the widget by its title to move it. Your own Memoji: save one PNG per mood (happy.png, calm.png…) in the Memoji folder, then reopen the widget.</p>
        <div class="actions" style="margin-bottom:8px">
          <button class="btn" data-act="folder">Open data folder</button>
          <button class="btn" data-act="export">Export reflections</button>
        </div>
        <div class="actions"><button class="btn danger" data-act="quit">Quit widget</button></div>
      </div>
    </div>`;
  }

  function render() {
    const html = ui.view === 'today' ? renderToday()
      : ui.view === 'reflect' ? renderReflect()
      : ui.view === 'calendar' ? renderCalendar()
      : renderSettings();
    card.innerHTML = html;
    card.scrollTop = 0; card.scrollLeft = 0;
    const edit = card.querySelector('[data-edit]');
    if (edit) {
      edit.focus({ preventScroll: true }); edit.select();
      const list = edit.closest('.tasks');
      if (list) list.scrollTop = list.scrollHeight;  // show the new row inside the priorities list
    }
  }
  // the card never scrolls as a whole (only its inner lists do)
  card.addEventListener('scroll', () => { card.scrollTop = 0; card.scrollLeft = 0; });

  // ---------- events ----------
  function commitEdit(input) {
    const day = ensureDay(todayKey);
    const t = day.tasks.find(x => x.id === input.dataset.edit);
    const v = input.value.trim();
    ui.editTask = null;
    if (t) { if (v) t.title = v; else day.tasks = day.tasks.filter(x => x !== t); }
    save(); render();
  }

  card.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const day = ensureDay(todayKey);
    switch (act) {
      case 'settings': ui.view = 'settings'; break;
      case 'moods': ui.sheet = 'moods'; break;
      case 'closesheet': if (e.target !== el) return; ui.sheet = null; break;
      case 'pickmood': day.mood = el.dataset.mood; ui.sheet = null; save(); break;
      case 'toggle': {
        const id = el.dataset.id, kind = el.dataset.kind;
        if (kind === 'claude') { day.extDone = day.extDone || {}; day.extDone[id] = !day.extDone[id]; }
        else { const t = day.tasks.find(x => x.id === id); if (t) t.done = !t.done; }
        save(); break;
      }
      case 'hide': day.hidden = day.hidden || {}; day.hidden[el.dataset.id] = true; save(); break;
      case 'srcclaude': data.settings.showClaude = data.settings.showClaude === false; save(); break;
      case 'edit': ui.editTask = el.dataset.id; break;
      case 'del': day.tasks = day.tasks.filter(x => x.id !== el.dataset.id); save(); break;
      case 'add': { const t = { id: uid(), title: '', done: false }; day.tasks.push(t); ui.editTask = t.id; break; }
      case 'block': day[el.dataset.b] = !day[el.dataset.b]; save(); break;
      case 'calendar': ui.view = 'calendar'; ui.calSel = todayKey; ui.calMonth = null; break;
      case 'reflect': ui.view = 'reflect'; ui.reflectKind = el.dataset.kind; ui.reflectDay = el.dataset.k || todayKey; ui.draft = null; ui.from = el.dataset.k ? 'calendar' : 'today'; break;
      case 'draftmood': ui.draft.mood = el.dataset.mood; break;
      case 'savereflect': {
        const k = ui.reflectDay || todayKey;
        const target = ensureDay(k);
        const prev = target[ui.reflectKind];
        target[ui.reflectKind] = Object.assign({}, ui.draft, { at: (prev && prev.at) || new Date().toISOString(), edited: prev ? new Date().toISOString() : undefined });
        if (ui.draft.mood && (ui.reflectKind === 'morning' || !target.mood)) target.mood = ui.draft.mood;
        ui.draft = null; ui.view = ui.from || 'today'; save(); break;
      }
      case 'delreflect': {
        const target = ensureDay(ui.reflectDay || todayKey);
        target[ui.reflectKind] = null; ui.draft = null; ui.view = ui.from || 'today'; save(); break;
      }
      case 'back': ui.view = ui.view === 'reflect' ? (ui.from || 'today') : 'today'; ui.draft = null; break;
      case 'month': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + Number(el.dataset.dir), 1); break;
      case 'selday': ui.calSel = el.dataset.k; break;
      case 'ontop': data.settings.onTop = !data.settings.onTop; post({ type: 'level', onTop: data.settings.onTop }); save(); break;
      case 'login': data.settings.login = !data.settings.login; post({ type: 'login', on: data.settings.login }); save(); break;
      case 'folder': post({ type: 'folder' }); return;
      case 'export': post({ type: 'export', data: JSON.stringify(data, null, 2) }); return;
      case 'quit': post({ type: 'quit' }); return;
      default: return;
    }
    render();
  });

  card.addEventListener('input', (e) => {
    const k = e.target.dataset.draft;
    if (k && ui.draft) ui.draft[k] = e.target.value;
  });
  card.addEventListener('change', (e) => {
    const k = e.target.dataset.setting;
    if (!k) return;
    if (k === 'deadline' && !/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { e.target.value = data.settings.deadline; return; }
    if (e.target.value) { data.settings[k] = e.target.value; save(); post({ type: 'schedule', settings: data.settings }); }
  });
  card.addEventListener('keydown', (e) => {
    if (e.target.dataset.edit) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.target); }
      if (e.key === 'Escape') { ui.editTask = null; ensureDay(todayKey).tasks = ensureDay(todayKey).tasks.filter(t => t.title.trim()); render(); }
    } else if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); }
  });
  card.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.edit) commitEdit(e.target); });
  card.addEventListener('mousedown', (e) => {
    if (e.button === 0 && e.target.closest('[data-drag]') && !e.target.closest('button,input,textarea')) post({ type: 'drag' });
  });

  // Called by the Mac app (e.g. a notification click opens a reflection).
  window.DC = {
    openReflection(kind) { ui.view = 'reflect'; ui.reflectKind = kind; ui.reflectDay = todayKey; ui.draft = null; ui.from = 'today'; ui.sheet = null; render(); },
    refresh() { render(); },
    setOnTop(v) { data.settings.onTop = !!v; save(); if (ui.view === 'settings') render(); },
    setExternal(p) {
      external = { claude: p.claude || {} };
      if ((ui.view === 'today' && !ui.editTask && !ui.sheet) || ui.view === 'settings') render();
    }
  };

  // New day at midnight; keep "Up next" badges current.
  setInterval(() => {
    const k = keyOf(new Date());
    if (k !== todayKey) { todayKey = k; ensureDay(k); }
    if (ui.view === 'today' && !ui.editTask && !ui.sheet) render();
  }, 60000);

  render();
  post({ type: 'ready', settings: data.settings });
})();
