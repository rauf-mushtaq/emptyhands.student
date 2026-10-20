import { backend, DEMO, isCoach, errorText } from './backend.js';
import { COACH_URL } from './config.js';
import { NATIVE, pushState, enablePush, onPushTap, shareFile } from './native.js';
import {
  $, $$, esc, TYPES, GRADES, AUDIENCES, renderYear, legendHTML, upcoming, loadCalendar,
  calendarYears, isRelevant, noticeIsFor, longDate, shortDate, whenText, timeAgo, todayKey, icsFor, download,
  toast, busy, registerSW,
} from './common.js';

const state = { user: null, profile: null, notices: [], cal: null, year: new Date().getFullYear(), view: 'home', stopNotices: null, seen: null };
let api;

// ---- profile form fields (shared by sign-up and profile) ----
$$('.profile-slot').forEach(slot => {
  slot.replaceWith($('#tpl-profile').content.cloneNode(true));
});
$$('select[name=grade]').forEach(s => { s.innerHTML = Object.entries(GRADES).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); });

function readProfile(form) {
  const f = new FormData(form);
  return {
    name: (f.get('name') || '').trim(),
    guardian: (f.get('guardian') || '').trim(),
    phone: (f.get('phone') || '').trim(),
    disciplines: f.getAll('disciplines'),
    dojo: f.get('dojo') || 'ilford',
    grade: f.get('grade') || 'none',
  };
}
function fillProfile(form, p) {
  for (const k of ['name', 'guardian', 'phone']) form.elements[k].value = p[k] || '';
  $$('[name=disciplines]', form).forEach(c => { c.checked = (p.disciplines || []).includes(c.value); });
  $$('[name=dojo]', form).forEach(r => { r.checked = r.value === (p.dojo || 'ilford'); });
  form.elements.grade.value = p.grade || 'none';
}
function showError(form, msg) {
  const el = $('.form-error', form);
  el.textContent = msg || '';
  el.hidden = !msg;
}

// ---- views ----
function show(id) {
  $('#loading').hidden = true;
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + id; });
  const signedIn = !['auth', 'message'].includes(id);
  $('#tabbar').hidden = !signedIn;
  document.body.classList.toggle('has-tabbar', signedIn);
  $$('#tabbar button').forEach(b => b.toggleAttribute('aria-current', b.dataset.go === id));
  if (signedIn) state.view = id;
  if (id === 'notices') markRead();
  if (id === 'calendar') drawCalendar(true);
  scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { show(go.dataset.go); history.replaceState(null, '', '#' + go.dataset.go); }
});

// ---- auth ----
$$('[data-auth]').forEach(btn => btn.addEventListener('click', () => {
  $$('[data-auth]').forEach(b => b.setAttribute('aria-selected', b === btn));
  $('#form-signin').hidden = btn.dataset.auth !== 'signin';
  $('#form-signup').hidden = btn.dataset.auth !== 'signup';
}));

$('#form-signin').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  showError(form);
  await busy(form.querySelector('[type=submit]'), async () => {
    try { await api.signIn(form.email.value, form.password.value); } catch (err) { showError(form, errorText(err)); }
  });
});

$('#forgot').addEventListener('click', async () => {
  const form = $('#form-signin');
  const email = form.email.value.trim();
  if (!email) { showError(form, 'Enter your email above, then tap “Forgotten your password?” again.'); return; }
  try { await api.resetPassword(email); toast('Password reset email sent to ' + email); } catch (err) { showError(form, errorText(err)); }
});

$('#form-signup').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  showError(form);
  const p = readProfile(form);
  if (!p.name) return showError(form, 'Please enter the student’s name.');
  if (!p.disciplines.length) return showError(form, 'Please choose at least one class.');
  await busy(form.querySelector('[type=submit]'), async () => {
    try {
      if (state.needsProfile) return await createProfile(state.needsProfile, p);
      // Tells onAuth to wait while the new profile is written.
      state.pendingProfile = p;
      const user = await api.signUp(form.email.value, form.password.value);
      await createProfile(user, p);
    } catch (err) { state.pendingProfile = null; showError(form, errorText(err)); }
  });
});

async function createProfile(user, p) {
  state.user = user;
  state.needsProfile = null;
  const profile = { ...p, email: user.email, role: 'student', createdAt: Date.now(), lastRead: 0 };
  await api.saveProfile(user.uid, profile);
  state.pendingProfile = null;
  state.profile = profile;
  await enter(user);
}

// ---- signed-in ----
async function onAuth(user) {
  if (state.stopNotices) { state.stopNotices(); state.stopNotices = null; }
  state.user = user;
  if (!user) { state.profile = null; $('#top-user').hidden = true; resetAuthForms(); show('auth'); return; }
  if (state.pendingProfile) return; // sign-up is still writing the profile
  try { state.profile = await api.getProfile(user.uid); } catch (err) { toast(errorText(err), 'bad'); }
  if (state.profile && state.profile.role === 'removed') {
    return message('Your account is paused', 'The dojo has removed this account from the student list. If you think this is a mistake, please contact us on 07931 300470 or <a href="mailto:info@emptyhands.co.uk">info@emptyhands.co.uk</a>.');
  }
  if (!state.profile && await isCoach(user)) {
    return message('You’re signed in as a coach', `<b>${esc(user.email)}</b> is a coach account. Open the <a href="${COACH_URL}" target="_blank" rel="noopener">coach panel</a>, or sign out to use the student app.`);
  }
  if (!state.profile) {
    // Signed in but no profile (e.g. removed by a coach, or sign-up interrupted): ask for details again.
    show('auth');
    $('[data-auth=signup]').click();
    const form = $('#form-signup');
    form.email.value = user.email; form.email.disabled = true;
    form.password.closest('label').hidden = true;
    state.needsProfile = user;
    toast('Please finish setting up your profile.');
    return;
  }
  await enter(user);
}

function message(title, html) {
  $('#msg-title').textContent = title;
  $('#msg-body').innerHTML = html;
  show('message');
}

function resetAuthForms() {
  state.needsProfile = null;
  const form = $('#form-signup');
  form.reset();
  form.email.disabled = false;
  form.password.closest('label').hidden = false;
  $('#form-signin').reset();
  $$('.form-error').forEach(el => { el.hidden = true; });
  $('[data-auth=signin]').click();
}

async function enter(user) {
  const p = state.profile;
  $('#top-user').hidden = false;
  $('#top-user').textContent = p.name.split(' ')[0];
  state.seen = new Set();
  state.cal = await loadCalendar(api, state.year);
  state.stopNotices = api.watchNotifications(list => onNotices(list));
  fillProfile($('#form-profile'), p);
  $('#profile-email').textContent = 'Signed in as ' + user.email;
  const start = location.hash.slice(1);
  show(['home', 'calendar', 'notices', 'profile'].includes(start) ? start : 'home');
  drawHome();
  alertsButton();
  if (NATIVE && !DEMO && (await pushState()) === 'granted') turnOnPush(true);
}

function myNotices() { return state.notices.filter(n => noticeIsFor(n, state.profile)); }

function onNotices(list) {
  const first = state.seen.size === 0 && state.notices.length === 0;
  state.notices = list;
  const mine = myNotices();
  // Pop a system notification for anything new that arrived while the app is open.
  if (!first) {
    mine.filter(n => !state.seen.has(n.id) && n.createdAt > (state.profile.lastRead || 0)).forEach(n => {
      toast('New notice: ' + n.title);
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(n.title, { body: n.body, icon: 'icon-192.png', tag: n.id }); } catch { /* not allowed in this context */ }
      }
    });
  }
  mine.forEach(n => state.seen.add(n.id));
  if (state.view === 'notices' && !document.hidden) markRead();
  drawNotices();
  drawHome();
  drawBadge();
}

function unread() { return myNotices().filter(n => n.createdAt > (state.profile.lastRead || 0)).length; }
function drawBadge() {
  const n = unread();
  $('#badge').hidden = !n;
  $('#badge').textContent = n > 9 ? '9+' : n;
  document.title = (n ? `(${n}) ` : '') + 'EmptyHands · Student app';
}
async function markRead() {
  if (!state.profile || !unread()) return;
  const newest = Math.max(...myNotices().map(n => n.createdAt));
  state.prevRead = state.profile.lastRead || 0;
  state.profile.lastRead = newest;
  drawBadge();
  try { await api.saveProfile(state.user.uid, { lastRead: newest }); } catch (e) { console.warn(e); }
}

function noticeHTML(n, isNew) {
  return `<article class="notice${isNew ? ' is-new' : ''}">
    <header><span class="aud">${esc(AUDIENCES[n.audience] || 'Everyone')}</span><time>${timeAgo(n.createdAt)}</time></header>
    <h3>${esc(n.title)}</h3>
    <p>${esc(n.body).replace(/\n/g, '<br>')}</p>
    ${n.from ? `<footer>— ${esc(n.from)}</footer>` : ''}
  </article>`;
}
function drawNotices() {
  const mine = myNotices();
  const since = state.view === 'notices' ? state.prevRead ?? state.profile.lastRead : state.profile.lastRead;
  $('#notice-list').innerHTML = mine.length
    ? mine.map(n => noticeHTML(n, n.createdAt > (since || 0))).join('')
    : '<div class="empty"><span aria-hidden="true">便</span><p>No notices yet. When your coaches send one, it will appear here.</p></div>';
}

function drawHome() {
  if (!state.profile) return;
  const p = state.profile;
  const hour = new Date().getHours();
  $('#home-date').textContent = longDate(todayKey());
  $('#home-greeting').textContent = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' + p.name.split(' ')[0] + '.';

  const days = (state.cal && state.cal.days) || {};
  const next = upcoming(days, p, 7);
  const nextClass = next.find(d => d.type === 'training' || d.type === 'blackbelt' || d.type === 'grading');
  const closedSoon = next.find(d => d.type === 'closed' && (!nextClass || d.key < nextClass.key));
  $('#next-card').innerHTML = nextClass
    ? `<div class="next-when"><strong>${whenText(nextClass.key)}</strong><span>${longDate(nextClass.key)}</span></div>
       <div class="next-what"><span class="swatch t-${nextClass.type}"></span><div><b>${TYPES[nextClass.type].label}</b><small>${esc(nextClass.note || TYPES[nextClass.type].note)}</small></div></div>
       ${closedSoon ? `<p class="next-warn">Heads up: the dojo is closed on ${shortDate(closedSoon.key)}.</p>` : ''}`
    : `<div class="next-when"><strong>No dates left this year</strong><span>The ${state.year + 1} calendar will appear here once it’s published.</span></div>`;

  $('#home-upcoming').innerHTML = next.length
    ? next.map(d => `<li><span class="swatch t-${d.type || 'note'}"></span><div><b>${d.type ? TYPES[d.type].label : 'Note'}</b><small>${esc(d.note || '')}</small></div><time>${shortDate(d.key)}<small>${whenText(d.key)}</small></time></li>`).join('')
    : '<li class="muted">Nothing coming up.</li>';

  const mine = myNotices().slice(0, 2);
  $('#home-notices').innerHTML = mine.length
    ? mine.map(n => noticeHTML(n, n.createdAt > (p.lastRead || 0))).join('')
    : '<p class="muted">No notices yet.</p>';
}

// ---- calendar ----
async function drawCalendar(scroll) {
  const cal = state.cal;
  $('#cal-year').textContent = state.year;
  $('#cal-legend').innerHTML = legendHTML();
  const years = await calendarYears(api);
  $('#cal-year-select').innerHTML = [...new Set([...years, state.year])].sort().map(y => `<option${y === state.year ? ' selected' : ''}>${y}</option>`).join('');
  $('#cal-empty').hidden = !!cal;
  $('#cal-grid').hidden = !cal;
  $('#cal-timings').hidden = !(cal && cal.timings && cal.timings.length);
  $('#ics').hidden = !cal;
  $('#cal-pdf').hidden = !(cal && cal.pdf);
  if (!cal) return;
  if (cal.pdf) $('#cal-pdf').href = cal.pdf;
  renderYear($('#cal-grid'), state.year, {
    days: cal.days, profile: state.profile, onlyMine: $('#only-mine').checked, onDay: openDay,
  });
  $('#cal-timings').innerHTML = '<h2>Class times</h2><ul>' + cal.timings.map(t => {
    const head = /^[A-Z][A-Z ]+(\(|—|$)/.test(t);
    return `<li${head ? ' class="th"' : ''}>${esc(t)}</li>`;
  }).join('') + '</ul>';
  if (scroll && state.year === new Date().getFullYear()) {
    const m = document.getElementById('m-' + state.year + '-' + (new Date().getMonth() + 1));
    if (m) requestAnimationFrame(() => m.scrollIntoView({ block: 'start' }));
  }
}
$('#only-mine').addEventListener('change', () => drawCalendar());
$('#cal-year-select').addEventListener('change', async e => {
  state.year = +e.target.value;
  state.cal = await loadCalendar(api, state.year);
  drawCalendar();
});
$('#ics').addEventListener('click', async () => {
  const name = `emptyhands-${state.year}.ics`;
  const ics = icsFor(state.year, state.cal.days, state.profile);
  if (NATIVE) { try { await shareFile(name, ics); } catch (e) { console.warn(e); } return; }
  download(name, ics, 'text/calendar');
});

function openDay(key) {
  const entry = state.cal.days[key] || {};
  $('#day-when').textContent = whenText(key);
  $('#day-title').textContent = longDate(key);
  const t = entry.type && TYPES[entry.type];
  $('#day-type').innerHTML = t
    ? `<span class="swatch t-${entry.type}"></span> <b>${t.label}</b> — ${esc(t.note)}${!isRelevant(entry.type, state.profile) ? ' <em class="muted">(not one of your classes)</em>' : ''}`
    : '';
  $('#day-note').textContent = entry.note || '';
  $('#day-note').hidden = !entry.note;
  $('#day-dialog').showModal();
}

// ---- profile ----
$('#form-profile').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  showError(form);
  const p = readProfile(form);
  if (!p.name) return showError(form, 'Please enter the student’s name.');
  if (!p.disciplines.length) return showError(form, 'Please choose at least one class.');
  await busy(form.querySelector('[type=submit]'), async () => {
    try {
      await api.saveProfile(state.user.uid, p);
      Object.assign(state.profile, p);
      $('#top-user').textContent = p.name.split(' ')[0];
      drawHome(); drawNotices(); drawBadge();
      toast('Profile saved');
    } catch (err) { showError(form, errorText(err)); }
  });
});
async function signOut() {
  // Stop this phone getting pushes for the account that's signing out.
  if (state.pushToken) { try { await api.removePushToken(state.user.uid, state.pushToken); } catch (e) { console.warn(e); } state.pushToken = null; }
  await api.signOut();
}
$$('[data-signout]').forEach(b => b.addEventListener('click', signOut));

$('#delete-account').addEventListener('click', () => {
  $('#form-delete').reset();
  showError($('#form-delete'));
  $('#delete-dialog').showModal();
});
$('#form-delete').addEventListener('submit', async e => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  e.preventDefault();
  const form = e.target;
  await busy(form.querySelector('[value=delete]'), async () => {
    try {
      await api.reauthenticate(form.password.value);
      await api.deleteProfile(state.user.uid);
      await api.deleteAccount();
      $('#delete-dialog').close();
      toast('Your account has been deleted');
    } catch (err) { showError(form, errorText(err)); }
  });
});

// ---- alerts: push notifications in the phone app, browser notifications on the web ----
async function turnOnPush(quiet) {
  try {
    const token = await enablePush(async t => {
      if (state.user) await api.addPushToken(state.user.uid, t);
      state.pushToken = t;
    });
    if (!quiet) toast(token ? 'Notifications on — we’ll let you know when your coaches send a notice.' : 'Notifications are off. You can turn them on in your phone’s Settings.');
  } catch (err) { console.warn(err); if (!quiet) toast('Couldn’t turn on notifications. Please try again.', 'bad'); }
  alertsButton();
}
async function alertsButton() {
  const btn = $('#enable-alerts');
  if (NATIVE) { btn.hidden = DEMO || (await pushState()) === 'granted'; return; }
  btn.hidden = !('Notification' in window) || Notification.permission !== 'default';
}
onPushTap(() => { if (state.profile) show('notices'); });
$('#enable-alerts').addEventListener('click', async () => {
  if (NATIVE) return turnOnPush(false);
  const r = await Notification.requestPermission();
  toast(r === 'granted' ? 'Alerts on — you’ll get a pop-up for new notices while the app is open.' : 'Alerts are off. You can change this in your browser settings.');
  alertsButton();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.view === 'notices') markRead(); });

// ---- start ----
(async () => {
  $('#demo-banner').hidden = !DEMO;
  registerSW();
  try {
    api = await backend();
  } catch (err) {
    $('#loading').innerHTML = '<p class="muted">Couldn’t connect. Check your internet connection and reload.</p>';
    console.error(err);
    return;
  }
  api.onAuth(onAuth);
})();
