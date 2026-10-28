import { backend, DEMO, isCoach, errorText } from './backend.js';
import { COACH_URL, STUDENT_URL, SITE_URL, RECOMMENDED, PAYPAL_AUTO_TRACK, firebaseConfig } from './config.js';
import { NATIVE, pushState, enablePush, onPushTap, shareFile } from './native.js';
import { webPushReady, webPushToken } from './webpush.js';
import {
  $, $$, esc, TYPES, GRADES, AUDIENCES, renderYear, legendHTML, upcoming, loadCalendar, messageHTML, wireEdits, editing, licenceHTML, MEDALS, medalHTML,
  calendarYears, isRelevant, noticeIsFor, homeworkIsFor, myAudiences, longDate, shortDate, whenText, timeAgo, todayKey, icsFor, download,
  toast, busy, registerSW, DEFAULT_FEES, FEE_GROUPS, feeLevel, money, paypalLink,
  monthKey, monthName, isMonthly, PAY_METHODS,
} from './common.js';

const VIEWS = ['home', 'calendar', 'menu', 'homework', 'syllabus', 'pay', 'licence', 'medals', 'profile'];
const state = {
  user: null, profile: null, notices: [], thread: [], chat: null, cal: null,
  group: [], journal: [], homework: [], awards: [], channel: 'notices',
  year: new Date().getFullYear(), view: 'home', stops: [], member: false, seen: new Set(),
};
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
    // Once accepted, only Sensei changes the belt (the field is locked), so leave it out.
    ...(form.elements.grade.disabled ? {} : { grade: f.get('grade') || 'none' }),
  };
}
function fillProfile(form, p) {
  for (const k of ['name', 'guardian', 'phone']) form.elements[k].value = p[k] || '';
  $$('[name=disciplines]', form).forEach(c => { c.checked = (p.disciplines || []).includes(c.value); });
  $$('[name=dojo]', form).forEach(r => { r.checked = r.value === (p.dojo || 'ilford'); });
  form.elements.grade.value = p.grade || 'none';
  const locked = form.id === 'form-profile' && p.role === 'student';
  form.elements.grade.disabled = locked;
  $('.belt-hint', form).hidden = !locked;
}
function showError(form, msg) {
  const el = $('.form-error', form);
  el.textContent = msg || '';
  el.hidden = !msg;
}

// ---- views ----
function show(id) {
  if (id === 'notices') id = 'menu'; // old links
  $('#loading').hidden = true;
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + id; });
  const signedIn = !['auth', 'message'].includes(id);
  $('#tabbar').hidden = !signedIn;
  document.body.classList.toggle('has-tabbar', signedIn);
  $$('#tabbar button').forEach(b => b.toggleAttribute('aria-current', b.dataset.go === id));
  if (signedIn) state.view = id;
  $('#top-user').toggleAttribute('aria-current', id === 'profile');
  document.body.classList.remove('in-chat');
  document.body.classList.toggle('on-home', id === 'home');
  if (id === 'menu') { drawMenu(); markRead(); scrollFeed(); } else scrollTo(0, 0);
  if (id === 'homework') drawHomework();
  if (id === 'pay') drawPay();
  if (id === 'licence') drawLicence();
  if (id === 'medals') drawMedals();
  if (id === 'calendar') drawCalendar(true);
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

// New accounts start as a join request; Sensei accepts or declines it in the coach panel.
async function createProfile(user, p) {
  state.user = user;
  state.needsProfile = null;
  const profile = { ...p, email: user.email, role: 'pending', createdAt: Date.now(), lastRead: 0 };
  await api.saveProfile(user.uid, profile);
  state.pendingProfile = null;
  state.profile = profile;
  await enter(user);
  show('menu');
}

// ---- signed-in ----
function stopAll() {
  state.stops.forEach(stop => stop && stop());
  state.stops = [];
  state.member = false;
  state.notices = []; state.thread = []; state.chat = null; state.seen = new Set();
  state.group = []; state.journal = []; state.homework = []; state.payments = [];
  state.loaded = {}; state.prevRead = null;
  (state.groupStops || []).forEach(stop => stop()); state.groupStops = []; state.groupKey = '';
}

async function onAuth(user) {
  stopAll();
  state.user = user;
  if (!user) { state.profile = null; $('#top-user').hidden = true; resetAuthForms(); show('auth'); return; }
  if (state.pendingProfile) return; // sign-up is still writing the profile
  try { state.profile = await api.getProfile(user.uid); } catch (err) { toast(errorText(err), 'bad'); }
  if (blocked(state.profile)) return;
  if (!state.profile && await isCoach(user)) {
    return message('You’re signed in as Sensei', `<b>${esc(user.email)}</b> is a Sensei account. Open the <a href="${COACH_URL}" target="_blank" rel="noopener">Sensei panel</a>, or sign out to use the student app.`);
  }
  if (!state.profile) {
    // Signed in but no profile (e.g. sign-up interrupted): ask for details again.
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

const CONTACT = 'please contact us on 07931 300470 or <a href="mailto:info@emptyhands.co.uk">info@emptyhands.co.uk</a>';
function blocked(p) {
  if (p && p.role === 'removed') { message('Your account is paused', 'The dojo has removed this account from the student list. If you think this is a mistake, ' + CONTACT + '.'); return true; }
  if (p && p.role === 'declined') { message('Your request wasn’t accepted', 'Sensei couldn’t match this account to a student at EmptyHands. If you think this is a mistake, ' + CONTACT + '.'); return true; }
  return false;
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
  state.cal = await loadCalendar(api, state.year);
  fillProfile($('#form-profile'), p);
  fillSender();
  $('#profile-email').textContent = 'Signed in as ' + user.email;
  // Live profile: notices when Sensei accepts, removes or declines this account.
  state.stops.push(api.watchProfile(user.uid, onProfile));
  state.stops.push(api.watchMyPayments(user.uid, list => { state.payments = list; if (state.view === 'pay') drawPayStatus(); }));
  state.stops.push(api.watchLicence(user.uid, l => { state.licence = l; if (state.view === 'licence') drawLicence(); }));
  state.stops.push(api.watchMyAwards(user.uid, list => onList('awards', list)));
  if (p.role === 'student') startMember();
  const start = location.hash.slice(1);
  show(VIEWS.includes(start) ? start : start === 'notices' ? 'menu' : 'home');
  drawHome();
  alertsButton();
  $('#class-reminders').checked = p.classReminders !== false;
  if (!DEMO && (NATIVE ? (await pushState()) === 'granted' : webPushReady() && Notification.permission === 'granted')) turnOnPush(true);
}

function onProfile(p) {
  if (!p || !state.profile) return;
  const was = state.profile.role;
  const oldBelt = state.profile.grade;
  state.profile = { ...state.profile, ...p };
  if (blocked(p)) { stopAll(); return; }
  if (state.member) watchGroups();
  fillProfile($('#form-profile'), state.profile);
  if (state.view === 'pay' && !!p.feesExempt !== !!state.wasExempt) drawPay();
  state.wasExempt = !!p.feesExempt;
  if (p.grade && oldBelt && p.grade !== oldBelt) {
    toast('Sensei has updated your belt to ' + (GRADES[p.grade] || p.grade) + (p.grade === 'dan' ? ' — congratulations!' : '.'));
    drawHome(); drawCalendar(); drawHomework(); drawMenu();
  }
  if (was !== 'student' && p.role === 'student') {
    startMember();
    toast('You’ve been accepted — welcome to EmptyHands!');
    drawHome(); drawMenu(); drawHomework();
  }
}

// Accepted students get Sensei's notices, the shared channels, private messages and homework.
function startMember() {
  if (state.member) return;
  state.member = true;
  const uid = state.user.uid;
  watchGroups();
  state.stops.push(api.watchThread(uid, list => onList('thread', list)));
  state.stops.push(api.watchChannel('group', list => onList('group', list)));
  state.stops.push(api.watchChannel('journal', list => onList('journal', list)));
  state.stops.push(api.watchChat(uid, c => { state.chat = c; drawBadge(); }));
}
// Notices and homework depend on the student's groups (classes, dojo, belt), so these are
// restarted whenever those change.
function watchGroups() {
  const groups = myAudiences(state.profile);
  if (state.groupKey === groups.join()) return;
  state.groupKey = groups.join();
  (state.groupStops || []).forEach(stop => stop());
  state.groupStops = [
    api.watchNotifications(list => onList('notices', list), groups),
    api.watchHomework(list => onList('homework', list), state.user.uid, groups),
  ];
}

function myNotices() { return state.notices.filter(n => noticeIsFor(n, state.profile)); }
function coachMessages() { return state.thread.filter(m => m.from === 'coach'); }
function myHomework() { return state.homework.filter(h => homeworkIsFor(h, state.user.uid, state.profile)); }
const isDone = h => !!(state.profile.homeworkDone || {})[h.id];

// Pop a toast (and a system notification if allowed) for things that arrive while the app is open.
function announce(id, title, body) {
  if (state.seen.has(id)) return;
  state.seen.add(id);
  toast(title);
  // With push on, the notification itself comes from the push (no double pop-ups).
  if (!state.pushToken && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: 'home-icon-192.png', tag: id }); } catch { /* not allowed in this context */ }
  }
}

// Everything that's announced when it arrives: notices, Sensei's private messages and new homework.
function onList(kind, list) {
  const first = !state.loaded[kind];
  state.loaded[kind] = true;
  state[kind] = list;
  const fresh = item => !first && !state.seen.has(item.id);
  if (kind === 'notices') myNotices().forEach(n => fresh(n) && n.createdAt > (state.profile.lastRead || 0) ? announce(n.id, 'New notice from Sensei: ' + n.title, n.body) : state.seen.add(n.id));
  else if (kind === 'thread') list.forEach(m => fresh(m) && m.from === 'coach' ? announce(m.id, 'Message from ' + (m.author || 'Sensei'), m.text) : state.seen.add(m.id));
  else if (kind === 'homework') myHomework().forEach(h => fresh(h) ? announce(h.id, 'New homework: ' + h.title, h.details || '') : state.seen.add(h.id));
  else if (kind === 'awards') list.forEach(a => fresh(a) ? announce(a.id, `${(MEDALS[a.medal] || MEDALS.star).icon} You’ve earned a medal: ${a.title}`, a.note || '') : state.seen.add(a.id));
  refresh();
}

function refresh() {
  drawMedals();
  if (state.view === 'menu' && !document.hidden) markRead();
  drawMenu();
  drawHome();
  drawHomework();
  drawBadge();
}

// Unread counts per channel: each channel shows a dot, and the Chats badge counts every unread
// message in all of them.
const seenAt = ch => ((state.profile.seen || {})[ch]) || 0;
function unreadIn(ch) {
  if (!state.member) return 0;
  if (ch === 'notices') return myNotices().filter(n => n.createdAt > (state.profile.lastRead || 0)).length;
  if (ch === 'sensei') return coachMessages().filter(m => m.createdAt > ((state.chat && state.chat.studentReadAt) || 0)).length;
  return state[ch].filter(m => m.uid !== state.user.uid && m.createdAt > seenAt(ch)).length;
}
function unread() { return ['notices', 'group', 'journal', 'sensei'].reduce((n, ch) => n + unreadIn(ch), 0); }
function drawBadge() {
  const n = unread();
  $('#badge').hidden = !n;
  $('#badge').textContent = n > 9 ? '9+' : n;
  $$('.channels [data-ch]').forEach(b => { $('.dot', b).hidden = b.dataset.ch === state.channel || !unreadIn(b.dataset.ch); });
  const todo = state.member ? myHomework().filter(h => !isDone(h)).length : 0;
  $('#hw-badge').hidden = !todo;
  $('#hw-badge').textContent = todo > 9 ? '9+' : todo;
  document.title = (n ? `(${n}) ` : '') + 'EmptyHands · Student app';
}
// Marks the open channel as read.
async function markRead() {
  const ch = state.channel;
  if (!state.member || !unreadIn(ch)) return;
  const uid = state.user.uid;
  state.prevRead = { ch, at: ch === 'notices' ? state.profile.lastRead || 0 : ch === 'sensei' ? (state.chat && state.chat.studentReadAt) || 0 : seenAt(ch) };
  try {
    if (ch === 'notices') {
      state.profile.lastRead = Math.max(0, ...myNotices().map(n => n.createdAt));
      drawBadge();
      await api.saveProfile(uid, { lastRead: state.profile.lastRead });
    } else if (ch === 'sensei') {
      state.chat = { ...(state.chat || {}), studentReadAt: Date.now() };
      drawBadge();
      await api.markChatRead(uid, 'student');
    } else {
      state.profile.seen = { ...(state.profile.seen || {}), [ch]: Date.now() };
      drawBadge();
      await api.saveProfile(uid, { seen: state.profile.seen });
    }
  } catch (e) { console.warn(e); }
}

// Sensei's notices, shown in bold in the menu and on the home screen.
function noticeHTML(n, isNew) {
  return `<article class="notice notice--coach${isNew ? ' is-new' : ''}">
    <header><span class="aud">Notice · ${esc(AUDIENCES[n.audience] || 'Everyone')}</span><time>${timeAgo(n.createdAt)}</time></header>
    <h3>${esc(n.title)}</h3>
    <p>${esc(n.body).replace(/\n/g, '<br>')}</p>
    ${n.from ? `<footer>— ${esc(n.from)}</footer>` : ''}
  </article>`;
}

// ---- EmptyHands chats ----
const CHANNELS = {
  notices: { intro: 'Notices from Sensei. Only Sensei can post here.' },
  group: { intro: 'Group chat for everyone at EmptyHands — students, parents and Sensei. Everyone in the group can see these messages.', placeholder: 'Message the group…' },
  journal: { intro: 'Your training journal: share what you practised, so Sensei and the group can see how you’re getting on.', placeholder: 'What did you practise today? e.g. Heian Shodan ×5, kihon 20 min' },
  sensei: { intro: 'Private messages between you and Sensei. Nobody else can see these.', placeholder: 'Message Sensei…' },
};
$('#rec-name').textContent = RECOMMENDED.name;
$('#rec-about').textContent = RECOMMENDED.about;
$('#rec-link').href = RECOMMENDED.url;

$('.channels').addEventListener('click', e => {
  const b = e.target.closest('[data-ch]');
  if (!b || b.dataset.ch === state.channel) return;
  state.channel = b.dataset.ch;
  state.prevRead = null;
  editing.id = null;
  b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  drawMenu(); markRead(); scrollFeed();
  // Fade the new channel in.
  const box = $('#chat-scroll');
  box.classList.remove('fade-in'); void box.offsetWidth; box.classList.add('fade-in');
});

function fillSender() {
  const p = state.profile;
  const sel = $('#chat-from');
  const opts = [p.name, ...(p.guardian ? [p.guardian + ' (parent)'] : [])];
  sel.innerHTML = opts.map(o => `<option>${esc(o)}</option>`).join('');
  $('#chat-from-wrap').hidden = opts.length < 2;
}

function drawMenu() {
  if (!state.profile) return;
  const pending = state.profile.role !== 'student';
  $('#menu-pending').hidden = !pending;
  $('#menu-chat').hidden = pending;
  document.body.classList.toggle('in-chat', state.view === 'menu' && !pending);
  if (pending) return;
  const ch = state.channel;
  $$('.channels [data-ch]').forEach(b => b.setAttribute('aria-selected', b.dataset.ch === ch));
  $('#ch-intro').textContent = CHANNELS[ch].intro;
  $('#form-chat').hidden = ch === 'notices';
  $('#chat-text').placeholder = CHANNELS[ch].placeholder || '';
  const since = state.prevRead && state.prevRead.ch === ch ? state.prevRead.at : null;
  const isNew = at => since !== null && at > since;
  let html;
  if (ch === 'notices') html = myNotices().slice().reverse().map(n => noticeHTML(n, isNew(n.createdAt) || n.createdAt > (state.profile.lastRead || 0)));
  else if (ch === 'sensei') html = state.thread.map(m => messageHTML(m, m.from === 'student', false, m.from === 'student'));
  else html = state[ch].map(m => { const mine = m.uid === state.user.uid; return messageHTML(m, mine, mine, mine); });
  const empty = { notices: 'No notices yet. When Sensei sends one, it will appear here.', group: 'No messages yet — say hello to everyone!', journal: 'Nothing logged yet. After you train, share what you practised.', sensei: 'No messages yet. You can message Sensei privately here.' }[ch];
  const feed = $('#menu-feed');
  // Keep following the conversation if they were already at the latest message.
  const box = $('#chat-scroll');
  const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  feed.innerHTML = html.length ? html.join('') : `<div class="empty"><span aria-hidden="true">便</span><p>${empty}</p></div>`;
  if (atEnd && ch !== 'notices' && !editing.id) box.scrollTop = box.scrollHeight;
  drawBadge();
}
function scrollFeed() {
  if (editing.id) return; // don't jump away from a message being edited
  // The chat panel scrolls by itself: new messages at the bottom, notices from the top.
  requestAnimationFrame(() => {
    const box = $('#chat-scroll');
    if (state.view === 'menu') box.scrollTop = state.channel === 'notices' ? 0 : box.scrollHeight;
  });
}
$('#menu-feed').addEventListener('click', async e => {
  const b = e.target.closest('[data-delmsg]');
  if (!b || !confirm('Delete your message?')) return;
  try { await api.deleteChannelMessage(state.channel, b.dataset.delmsg); } catch (err) { toast(errorText(err), 'bad'); }
});
wireEdits($('#menu-feed'), {
  find: id => (state.channel === 'sensei' ? state.thread : state[state.channel] || []).find(m => m.id === id),
  save: (id, text) => state.channel === 'sensei' ? api.editMessage(state.user.uid, id, text) : api.editChannelMessage(state.channel, id, text),
  redraw: () => drawMenu(),
  fail: err => toast(errorText(err), 'bad'),
});

const chatText = $('#chat-text');
chatText.addEventListener('input', () => { chatText.style.height = 'auto'; chatText.style.height = Math.min(chatText.scrollHeight, 160) + 'px'; });
chatText.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !NATIVE && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('#form-chat').requestSubmit(); } });
$('#form-chat').addEventListener('submit', async e => {
  e.preventDefault();
  const text = chatText.value.trim();
  const ch = state.channel;
  if (!text || !state.member || ch === 'notices') return;
  const m = { text, from: 'student', author: $('#chat-from').value, uid: state.user.uid };
  await busy(e.target.querySelector('[type=submit]'), async () => {
    try {
      if (ch === 'sensei') await api.sendMessage(state.user.uid, state.profile.name, m);
      else await api.postChannel(ch, m);
      chatText.value = ''; chatText.style.height = 'auto';
      scrollFeed();
    } catch (err) { toast(errorText(err), 'bad'); }
  });
});

// ---- pay fees with PayPal ----
async function drawPay() {
  const p = state.profile;
  if (!p) return;
  let settings = null;
  try { settings = await api.getPayments(); } catch (e) { console.warn(e); }
  const fees = (settings && settings.fees) || DEFAULT_FEES;
  const paypal = settings && settings.paypal;
  const track = PAYPAL_AUTO_TRACK && { uid: state.user.uid, notifyUrl: `https://europe-west2-${firebaseConfig.projectId}.cloudfunctions.net/paypalIpn` };
  drawPayStatus();
  if (p.feesExempt) {
    $('#pay-intro').innerHTML = `<b>${esc(p.name)} doesn’t need to pay fees.</b> Sensei has marked this account as exempt. If you think that’s wrong, please ask Sensei.`;
    $('#fee-list').innerHTML = '';
    return;
  }
  const level = feeLevel(p.grade);
  // Students can only pay their own monthly fee (for Karate, the one for their belt level) and
  // drop-in / pay-per-lesson fees, for the classes they attend. Other fees stay in the coach panel.
  const levelName = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }[level];
  const classes = (p.disciplines || []).filter(g => FEE_GROUPS[g]);
  $('#pay-intro').innerHTML = paypal
    ? `<b>Choose per lesson or per month.</b> PayPal opens with the amount filled in — pay with a card or your PayPal account. Paying for <b>${esc(p.name)}</b> (${esc(GRADES[p.grade] || 'No belt')}).`
    : 'Online payment isn’t set up yet — please pay Sensei at the dojo for now.';

  // One card per class, with two choices: per lesson, and per month at the student's level.
  const option = (f, label, sub) => !f ? '' : paypal
    ? `<a class="fee-option" href="${esc(paypalLink(paypal, f, p.name, track, STUDENT_URL))}" target="_blank" rel="noopener"
        aria-label="Pay ${money(f.price)} ${label.toLowerCase()} for ${esc(FEE_GROUPS[f.group])} with PayPal or card">
        <span class="fee-option-label">${label}</span><b>${money(f.price)}</b><small>${esc(sub)}</small><span class="btn btn--paypal btn--sm">Pay ${money(f.price)}</span></a>`
    : `<div class="fee-option"><span class="fee-option-label">${label}</span><b>${money(f.price)}</b><small>${esc(sub)}</small></div>`;
  $('#fee-list').innerHTML = classes.map(g => {
    const lesson = lessonFee(fees, g);
    const month = monthFee(fees, g, level);
    const monthly = level === 'application' && g === 'karate'
      ? `<div class="fee-option is-application"><span class="fee-option-label">Per month</span><b>On application</b><small>Brown belt and above — please speak to Sensei about your monthly fee.</small></div>`
      : option(month, 'Per month', month && month.level ? `${levelName} level` : 'Monthly');
    if (!lesson && !monthly) return '';
    return `<section class="card fee-class"><h2>${FEE_GROUPS[g]}</h2><div class="fee-options">${option(lesson, 'Per lesson', 'Pay as you go')}${monthly}</div></section>`;
  }).join('') || '<p class="muted">There are no fees set up for your classes yet. Please ask Sensei how to pay.</p>';
}

// The two fees a student chooses between for a class: per lesson, and per month (the one for
// their belt level when the class has levels, as Karate does).
const DROP_IN = ['class', 'lesson', 'session'];
const lessonFee = (fees, g) => fees.find(f => f.group === g && DROP_IN.includes(f.per));
const monthFee = (fees, g, level) => fees.find(f => f.group === g && f.per === 'month' && f.level === level)
  || fees.find(f => f.group === g && f.per === 'month' && !f.level);

// This month's fee status and the student's payment history.
function drawPayStatus() {
  const p = state.profile;
  const list = state.payments || [];
  const month = monthKey();
  const paid = list.find(x => x.month === month && isMonthly(x));
  const box = $('#pay-status');
  box.hidden = !!p.feesExempt || p.role !== 'student';
  box.className = 'card pay-status ' + (paid ? 'is-paid' : 'is-due');
  box.innerHTML = paid
    ? `<b>✓ ${monthName(month)} fees paid</b><small>${money(paid.amount)} · ${PAY_METHODS[paid.method] || ''} · ${new Date(paid.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>`
    : `<b>${monthName(month)} fees not paid yet</b><small>Pay your monthly fee below, or pay Sensei at the dojo.</small>`;
  $('#pay-history-wrap').hidden = !list.length;
  $('#pay-history').innerHTML = list.slice(0, 24).map(x => `<li><span><b>${esc(x.feeName || 'Payment')}</b><small>${monthName(x.month)} · ${PAY_METHODS[x.method] || ''}</small></span><b>${money(x.amount)}</b></li>`).join('');
}

// ---- homework ----
function drawHomework() {
  if (!state.profile) return;
  const pending = state.profile.role !== 'student';
  $('#hw-pending').hidden = !pending;
  if (pending) { $('#hw-list').innerHTML = ''; $('#hw-summary').textContent = ''; return; }
  const list = myHomework().sort((a, b) => isDone(a) - isDone(b) || (a.due || '9').localeCompare(b.due || '9') || b.createdAt - a.createdAt);
  const todo = list.filter(h => !isDone(h)).length;
  $('#hw-summary').textContent = list.length ? (todo ? `${todo} to do · ${list.length - todo} done` : 'All done — well done!') : '';
  const today = todayKey();
  $('#hw-list').innerHTML = list.length ? list.map(h => `
    <label class="card hw${isDone(h) ? ' is-done' : ''}${!isDone(h) && h.due && h.due < today ? ' is-late' : ''}">
      <input type="checkbox" data-hw="${esc(h.id)}"${isDone(h) ? ' checked' : ''}>
      <span class="hw-tick" aria-hidden="true"></span>
      <span class="hw-body">
        <b>${esc(h.title)}</b>
        ${h.details ? `<span class="hw-details">${esc(h.details).replace(/\n/g, '<br>')}</span>` : ''}
        <small>${h.due ? 'Due ' + shortDate(h.due) + ' · ' : ''}${h.student ? 'Just for you' : esc(AUDIENCES[h.audience] || 'Everyone')}${h.from ? ' · ' + esc(h.from) : ''}</small>
      </span>
    </label>`).join('') : '<div class="empty"><span aria-hidden="true">宿</span><p>No homework yet. When Sensei sets some, it will appear here for you to tick off.</p></div>';
}
$('#hw-list').addEventListener('change', async e => {
  const box = e.target.closest('[data-hw]');
  if (!box) return;
  const id = box.dataset.hw;
  const done = box.checked;
  state.profile.homeworkDone = { ...(state.profile.homeworkDone || {}) };
  if (done) state.profile.homeworkDone[id] = Date.now(); else delete state.profile.homeworkDone[id];
  drawHomework(); drawBadge();
  if (done) toast('Nice work! Marked as done.');
  try { await api.setHomeworkDone(state.user.uid, id, done); } catch (err) { toast(errorText(err), 'bad'); }
});

// ---- home: hero highlights, quick actions, schedule, latest and explore ----
const EXPLORE = [
  { img: 'syllabus.webp', title: 'Karate syllabus', sub: '10th kyu to Shodan', go: 'syllabus' },
  { img: 'tiger.webp', title: 'Watch: ' + RECOMMENDED.name, sub: 'Kata to practise at home', href: RECOMMENDED.url },
  { img: 'taichi.webp', title: 'Tai Chi at EmptyHands', sub: 'Balance and calm', href: SITE_URL + 'tai-chi.html' },
  { img: 'yoga.webp', title: 'Yoga', sub: 'Flexibility and wellbeing', href: SITE_URL + 'yoga.html' },
  { img: 'students.webp', title: 'Our students', sub: 'Stories from the dojo', href: SITE_URL + 'testimonials.html' },
  { img: 'dojo.webp', title: 'EmptyHands website', sub: 'Classes, fees and more', href: SITE_URL },
];
$('#explore').innerHTML = EXPLORE.map(x => {
  const inner = `<img src="assets/img/explore/${x.img}" alt="" loading="lazy"><span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></span>`;
  return x.go ? `<button type="button" class="explore-card" data-go="${x.go}">${inner}</button>`
    : `<a class="explore-card" href="${esc(x.href)}" target="_blank" rel="noopener">${inner}</a>`;
}).join('');

let heroTimer;
function heroSlides() {
  const p = state.profile;
  const hour = new Date().getHours();
  const first = esc((p.name || '').split(' ')[0]);
  const slides = [{ title: `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${first}`, text: longDate(todayKey()), art: '<img src="assets/img/logo.png" alt="">', go: 'profile' }];
  const award = (state.awards || [])[0];
  if (award && Date.now() - award.createdAt < 30 * 864e5) {
    slides.unshift({ title: 'Nice work!', text: `You’ve earned a medal: ${esc(award.title)}`, art: `<span class="hero-emoji">${(MEDALS[award.medal] || MEDALS.star).icon}</span>`, go: 'medals' });
  }
  const days = (state.cal && state.cal.days) || {};
  const nextClass = upcoming(days, p, 7).find(d => ['training', 'blackbelt', 'grading'].includes(d.type));
  if (nextClass) slides.push({ title: whenText(nextClass.key) === 'Today' ? 'Class today' : 'Next class', text: `${TYPES[nextClass.type].label}, ${shortDate(nextClass.key)}`, art: '<span class="hero-kanji">道</span>', go: 'calendar' });
  if (state.member) {
    const unreadNotice = myNotices().find(n => n.createdAt > (p.lastRead || 0));
    if (unreadNotice) slides.push({ title: 'New from Sensei', text: esc(unreadNotice.title), art: '<span class="hero-kanji">知</span>', go: 'menu' });
    const todo = myHomework().filter(h => !isDone(h)).length;
    if (todo) slides.push({ title: 'Homework', text: `You have ${todo} thing${todo === 1 ? '' : 's'} to practise`, art: '<span class="hero-kanji">宿</span>', go: 'homework' });
    const paid = (state.payments || []).some(x => x.month === monthKey() && isMonthly(x));
    if (!p.feesExempt && !paid) slides.push({ title: 'Fees', text: `${monthName(monthKey())} fees aren’t paid yet`, art: '<span class="hero-kanji">£</span>', go: 'pay' });
  }
  return slides;
}
function drawHero() {
  const slides = heroSlides();
  const box = $('#hero-slides');
  const was = Math.round(box.scrollLeft / Math.max(box.clientWidth, 1));
  box.innerHTML = slides.map(sl => `<button type="button" class="hero-slide" data-go="${sl.go}">
      <span class="hero-text"><b>${sl.title}</b><span>${sl.text} <span aria-hidden="true">›</span></span></span>
      <span class="hero-art">${sl.art}</span></button>`).join('');
  $('#hero-dots').innerHTML = slides.length > 1 ? slides.map((_, i) => `<button type="button" aria-label="Highlight ${i + 1}" data-dot="${i}"${i === Math.min(was, slides.length - 1) ? ' aria-current="true"' : ''}></button>`).join('') : '';
  box.scrollLeft = Math.min(was, slides.length - 1) * box.clientWidth;
  clearInterval(heroTimer);
  if (slides.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    heroTimer = setInterval(() => {
      if (state.view !== 'home' || document.hidden) return;
      const i = (Math.round(box.scrollLeft / box.clientWidth) + 1) % slides.length;
      box.scrollTo({ left: i * box.clientWidth, behavior: 'smooth' });
    }, 6000);
  }
}
$('#hero-slides').addEventListener('scroll', () => {
  const box = $('#hero-slides');
  const i = Math.round(box.scrollLeft / Math.max(box.clientWidth, 1));
  $$('#hero-dots button').forEach((d, j) => d.toggleAttribute('aria-current', i === j));
}, { passive: true });
$('#hero-dots').addEventListener('click', e => {
  const d = e.target.closest('[data-dot]');
  if (d) $('#hero-slides').scrollTo({ left: +d.dataset.dot * $('#hero-slides').clientWidth, behavior: 'smooth' });
});

function drawHome() {
  if (!state.profile) return;
  const p = state.profile;
  $('.quick-pay').hidden = !!p.feesExempt;
  $('#hero-dojo').innerHTML = `${esc(p.dojo === 'epping' ? 'Epping' : p.dojo === 'both' ? 'Ilford & Epping' : 'Ilford')} <span aria-hidden="true">›</span>`;
  $('#side-name').textContent = p.name || '';
  $('#side-belt').textContent = GRADES[p.grade] || '';
  drawHero();

  const days = (state.cal && state.cal.days) || {};
  const next = upcoming(days, p, 7);
  const nextClass = next.find(d => d.type === 'training' || d.type === 'blackbelt' || d.type === 'grading');
  const closedSoon = next.find(d => d.type === 'closed' && (!nextClass || d.key < nextClass.key));
  const calIcon = '<span class="sched-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M12 14h2M16 14h0M8 17h2M12 17h2"/></svg></span>';
  $('#next-card').innerHTML = nextClass
    ? `${calIcon}<span class="sched-text"><b>${whenText(nextClass.key)}: ${TYPES[nextClass.type].label}</b><small>${esc(nextClass.note || TYPES[nextClass.type].note)}${closedSoon ? ` · Closed ${shortDate(closedSoon.key)}` : ''}</small></span><span class="sched-go" aria-hidden="true">›</span>`
    : `${calIcon}<span class="sched-text"><b>No dates left this year</b><small>The ${state.year + 1} calendar will appear here once it’s published.</small></span><span class="sched-go" aria-hidden="true">›</span>`;
  $('#home-upcoming').innerHTML = next.filter(d => d !== nextClass).slice(0, 4)
    .map(d => `<li><span class="swatch t-${d.type || 'note'}"></span><div><b>${d.type ? TYPES[d.type].label : 'Note'}</b><small>${esc(d.note || '')}</small></div><time>${shortDate(d.key)}<small>${whenText(d.key)}</small></time></li>`).join('');

  if (p.role !== 'student') {
    $('#home-notices').innerHTML = '<div class="card pending-mini"><b>Waiting for Sensei to accept you.</b> Notices and messages from Sensei will show here once you’re accepted.</div>';
    return;
  }
  const since = (state.chat && state.chat.studentReadAt) || 0;
  const latest = [
    ...myNotices().map(n => ({ at: n.createdAt, html: noticeHTML(n, n.createdAt > (p.lastRead || 0)) })),
    ...coachMessages().map(m => ({ at: m.createdAt, html: messageHTML(m, false).replace('class="msg ', `class="msg${m.createdAt > since ? ' is-new' : ''} `) })),
  ].sort((a, b) => b.at - a.at).slice(0, 2);
  $('#home-notices').innerHTML = latest.length ? latest.map(i => i.html).join('') : '<p class="muted">Nothing from Sensei yet.</p>';
}

// Side menu and the round Message Sensei button.
$('#menu-open').addEventListener('click', () => $('#side-menu').showModal());
$('#menu-close').addEventListener('click', () => $('#side-menu').close());
$('#side-menu').addEventListener('click', e => { if (e.target.closest('[data-go], a, [data-signout]') || e.target === $('#side-menu')) $('#side-menu').close(); });
$('#dock-sensei').addEventListener('click', () => {
  state.channel = 'sensei';
  show('menu');
  history.replaceState(null, '', '#menu');
  setTimeout(() => $('#chat-text') && $('#chat-text').focus(), 300);
});

// ---- calendar ----
async function drawCalendar(scroll) {
  const cal = state.cal;
  $('#cal-year').textContent = state.year;
  $('#cal-legend').innerHTML = legendHTML();
  const years = await calendarYears(api);
  $('#cal-year-select').innerHTML = [...new Set([...years, state.year])].sort().map(y => `<option${y === state.year ? ' selected' : ''}>${y}</option>`).join('');
  $('#cal-empty').hidden = !!cal;
  $('#cal-grid').hidden = !cal;
  $('#cal-keydates').hidden = !cal;
  $('#cal-timings').hidden = !(cal && cal.timings && cal.timings.length);
  $('#ics').hidden = !cal;
  $('#cal-pdf').hidden = !(cal && cal.pdf);
  if (!cal) return;
  if (cal.pdf) $('#cal-pdf').href = cal.pdf;
  renderYear($('#cal-grid'), state.year, {
    days: cal.days, profile: state.profile, onlyMine: $('#only-mine').checked, onDay: openDay,
  });
  drawKeyDates(cal.days);
  $('#cal-timings').innerHTML = '<h2>Class times</h2><ul>' + cal.timings.map(t => {
    const head = /^[A-Z][A-Z ]+(\(|—|$)/.test(t);
    return `<li${head ? ' class="th"' : ''}>${esc(t)}</li>`;
  }).join('') + '</ul>';
  if (scroll && state.year === new Date().getFullYear()) {
    const m = document.getElementById('m-' + state.year + '-' + (new Date().getMonth() + 1));
    if (m) requestAnimationFrame(() => m.scrollIntoView({ block: 'start' }));
  }
}

// The year's days off and key dates as lists, below the month grid.
function drawKeyDates(days) {
  const today = todayKey();
  const groups = [
    ['closed', 'Days off — dojo closed'],
    ['grading', 'Gradings & workshops'],
    ['blackbelt', 'Black belt classes'],
  ].filter(([t]) => isRelevant(t, state.profile) || !$('#only-mine').checked);
  const notes = Object.entries(days).filter(([, v]) => v.note && v.type === 'training');
  const li = ([k, v]) => `<li class="${k < today ? 'is-past' : ''}"><time>${shortDate(k)}</time><span>${esc(v.note || '')}</span>${k >= today ? `<small>${whenText(k)}</small>` : ''}</li>`;
  const sorted = list => list.sort(([a], [b]) => a.localeCompare(b));
  $('#cal-keydates').innerHTML = groups.map(([t, title]) => {
    const list = sorted(Object.entries(days).filter(([k, v]) => v.type === t && k.startsWith(state.year + '-')));
    return `<section class="card keydates-group"><h2><span class="swatch t-${t}"></span>${title} <small>${list.length}</small></h2>
      ${list.length ? `<ul>${list.map(li).join('')}</ul>` : '<p class="muted fine">None this year.</p>'}</section>`;
  }).join('') + (notes.length ? `<section class="card keydates-group"><h2><span class="swatch t-note"></span>Notes on class days</h2><ul>${sorted(notes).map(li).join('')}</ul></section>` : '');
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
      fillSender();
      drawHome(); drawMenu(); drawBadge();
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

// ---- notifications: native push in the phone apps, web push on the website / home-screen app ----
// Sensei's notices, messages and homework, class reminders and fee reminders all arrive this way.
async function turnOnPush(quiet) {
  try {
    const save = async t => {
      if (state.user && t !== state.pushToken) await api.addPushToken(state.user.uid, t);
      state.pushToken = t;
    };
    const token = NATIVE ? await enablePush(save) : await webPushToken(!quiet).then(async t => { if (t) await save(t); return t; });
    if (!quiet) toast(token ? 'Notifications on: we’ll let you know about classes, messages from Sensei, homework and fees.' : 'Notifications are off. You can turn them on in your device’s Settings.');
  } catch (err) { console.warn(err); if (!quiet) toast('Couldn’t turn on notifications. Please try again.', 'bad'); }
  alertsButton();
}
async function alertsButton() {
  const on = !!state.pushToken;
  let can = false, status;
  if (NATIVE) { can = !DEMO && !on; status = on ? 'On for this device.' : 'Off for this device.'; }
  else if (webPushReady()) {
    can = !on && Notification.permission !== 'denied';
    status = on ? 'On for this device.' : Notification.permission === 'denied' ? 'Blocked in your browser settings. Allow notifications for this site to turn them on.' : 'Off for this device.';
  } else if (isIOS && !standalone()) status = 'On iPhone and iPad, add EmptyHands Student to your home screen first, then turn on notifications from there.';
  else status = 'Notifications aren’t available on this device yet. You’ll still see everything when you open the app.';
  $$('[data-notify-on]').forEach(b => { b.hidden = !can; });
  $('#notify-status').textContent = status;
}
onPushTap(() => { if (state.profile) show('menu'); });
document.addEventListener('click', e => { if (e.target.closest('[data-notify-on]')) turnOnPush(false); });
$('#class-reminders').addEventListener('change', async e => {
  try {
    await api.setClassReminders(state.user.uid, e.target.checked);
    toast(e.target.checked ? 'Class reminders on.' : 'Class reminders off.');
  } catch (err) { e.target.checked = !e.target.checked; toast(errorText(err), 'bad'); }
});
// Tapping a notification opens the app on the right page (e.g. #pay for a fees reminder).
addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (state.profile && VIEWS.includes(id) && id !== state.view) show(id);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.view === 'menu') markRead(); });

// ---- add to home screen ----
// Android/desktop Chrome offer an install prompt we can show from a button; iPhone and iPad
// don't, so they get the Share → Add to Home Screen steps. Arriving with ?install=1 (from
// the website's "Get the app" button) opens this straight away.
let installEvent = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installButtons() {
  $$('[data-install]').forEach(b => { b.hidden = NATIVE || standalone() || !(installEvent || isIOS); });
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; installButtons(); });
addEventListener('appinstalled', () => { installEvent = null; installButtons(); $('#install-dialog').open && $('#install-dialog').close(); toast('Installed — open EmptyHands Student from your home screen.'); });
function openInstall() {
  if (NATIVE || standalone()) return;
  $('#install-android').hidden = !installEvent;
  $('#install-ios').hidden = !(isIOS && !installEvent);
  $('#install-other').hidden = !!installEvent || isIOS;
  const ipad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('#install-ios-where').textContent = ipad ? '(top right of the screen)' : '(at the bottom of the screen)';
  $('#install-ios-safari').hidden = !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  $('#install-dialog').showModal();
}
document.addEventListener('click', e => { if (e.target.closest('[data-install]')) openInstall(); });
$('#install-now').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  $('#install-dialog').close();
  installButtons();
  if (outcome !== 'accepted') toast('No problem — you can add it later from your profile.');
});
if (new URLSearchParams(location.search).get('install')) {
  history.replaceState(null, '', location.pathname + location.hash);
  // Give Chrome a moment to offer its install prompt before choosing what to show.
  setTimeout(openInstall, installEvent ? 0 : 900);
}
installButtons();

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

// ---- My licence: details and belt record, filled in by Sensei ----
function drawLicence() {
  if (!state.profile) return;
  $('#lic-sheet').innerHTML = licenceHTML(state.licence, { ...state.profile, email: state.user.email });
  $('#lic-note').textContent = state.licence
    ? 'Sensei keeps this up to date after each grading. Your name, email and phone come from your profile.'
    : 'Sensei hasn’t filled in your licence yet. It will appear here once they have.';
}
$('#lic-print').addEventListener('click', () => print());

// ---- My medals: awarded by Sensei ----
function drawMedals() {
  const list = state.awards || [];
  $('#medal-count').hidden = !list.length;
  $('#medal-count').textContent = list.length;
  $('#my-medals').innerHTML = list.length ? list.map(a => medalHTML(a)).join('')
    : '<div class="empty"><span aria-hidden="true">🏅</span><p>No medals yet. Keep training. Sensei awards medals for things like attendance, effort and great kata!</p></div>';
}
