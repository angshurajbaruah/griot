// Griot popup: home (parked threads), the park card, a thread's detail and trail,
// and the welcome back card after a break.
// Uses cleanTitle, shortTitle, draftNote, draftTitle, sharesWordWithNote, faviconFor, awayText (lib/threads.js)
// and the thread, trail, welcome and popup-request helpers in lib/storage.js.

// Pages that are not part of a thread, like an empty new tab.
const SKIPPED_URLS = ['chrome://newtab/', 'about:blank'];

// How many trail pages the detail screen shows; older ones are counted as hidden.
const TRAIL_PAGES_SHOWN = 6;

// The draft note Griot wrote, so we can tell later whether the user changed it.
let draftedNote = '';

// The tabs listed on the park card, in the same order as their checkboxes.
let parkCardTabs = [];

// The thread open on the detail screen.
let openThread = null;

// The welcome back card on screen, and the closed window being parked (if any).
let shownWelcome = null;
let parkingClosedWindow = false;

// ---------- Small helpers ----------

// Get the tabs of the window you are in, leaving out empty new tabs.
async function getCurrentWindowTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.filter((tab) => !SKIPPED_URLS.includes(tab.url));
}

// Make a site icon image from Chrome's local favicon store.
function makeFavicon(pageUrl) {
  const img = document.createElement('img');
  img.className = 'site-icon';
  img.src = faviconFor(pageUrl);
  img.alt = '';
  return img;
}

// Make a small piece of text.
function makeText(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// "1 tab" or "4 tabs".
function tabCountText(count) {
  return count === 1 ? '1 tab' : `${count} tabs`;
}

// A clock time like "6:42 pm".
function clockText(time) {
  return new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

// Say when a thread was parked. Long: "yesterday, 6:42 pm". Short: "Mon".
function parkedTimeText(time, short) {
  const parked = new Date(time);
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const daysAgo = Math.floor((startOfToday - new Date(time).setHours(0, 0, 0, 0)) / 86400000);

  let day;
  if (daysAgo <= 0) day = 'today';
  else if (daysAgo === 1) day = 'yesterday';
  else if (daysAgo < 7) day = parked.toLocaleDateString('en-GB', { weekday: 'short' });
  else day = parked.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  if (short) return daysAgo <= 1 ? day.charAt(0).toUpperCase() + day.slice(1) : day;
  return `${day}, ${clockText(time)}`;
}

// Show one screen ("home", "park", "detail", "welcome" or "here") and hide the others.
function showScreen(name) {
  document.getElementById('home-screen').hidden = name !== 'home';
  document.getElementById('park-screen').hidden = name !== 'park';
  document.getElementById('detail-screen').hidden = name !== 'detail';
  document.getElementById('welcome-screen').hidden = name !== 'welcome';
  document.getElementById('here-screen').hidden = name !== 'here';
}

// Go back home and show a short green message, like "Thread parked."
async function goHome(message) {
  await showHome();
  showScreen('home');
  document.getElementById('parked-message').hidden = !message;
  document.getElementById('parked-message-text').textContent = message || '';
}

// ---------- Home ----------

// Make the ochre "Next:" line for a thread.
function makeNextLine(next) {
  const line = document.createElement('div');
  line.className = 'next-line';
  const dot = makeText('span', 'next-dot', '');
  dot.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.append(makeText('strong', '', 'Next:'), ` ${next}`);
  line.append(dot, text);
  return line;
}

// Make the note: the user's words in italic, or Griot's draft in plain muted text.
function makeNote(thread) {
  const note = makeText('span', 'thread-note', thread.note);
  if (thread.noteIsGuess) note.classList.add('is-guess');
  return note;
}

// The small grey line under a card, like "3 tabs · yesterday, 6:42 pm · Griot's guess".
function metaText(thread, short) {
  const parts = [tabCountText(thread.tabs.length), parkedTimeText(thread.parkedAt, short)];
  if (thread.noteIsGuess) parts.push("Griot's guess");
  return parts.join(' · ');
}

// Make a "Pick up" button for a thread. Brown for the newest, outlined for the rest.
function makePickUpButton(thread, isPrimary) {
  const button = makeText('button', 'button pick-up-button', 'Pick up');
  button.type = 'button';
  button.classList.add(isPrimary ? 'button-primary' : 'button-secondary');
  button.setAttribute('aria-label', `Pick up ${thread.title}`);
  button.addEventListener('click', () => pickUpThread(thread));
  return button;
}

// Wrap part of a card in a button that opens the thread's detail screen.
// Its click area stretches over the whole card (see .card-open in popup.css).
function makeOpenButton(thread, content) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card-open';
  button.setAttribute('aria-label', `Open ${thread.title}`);
  button.append(content);
  button.addEventListener('click', () => openDetail(thread));
  return button;
}

// The big card for the newest thread: "Continue thread".
function makeMainCard(thread) {
  const card = document.createElement('article');
  card.className = 'thread-card thread-card-main';
  card.append(makeText('span', 'eyebrow', 'Continue thread'));
  const summary = thread.note ? makeNote(thread) : makeText('span', 'thread-title', thread.title);
  card.append(makeOpenButton(thread, summary));
  if (thread.next) card.append(makeNextLine(thread.next));

  const footer = document.createElement('div');
  footer.className = 'thread-footer';
  footer.append(makeText('span', 'thread-meta', metaText(thread, false)), makePickUpButton(thread, true));
  card.append(footer);
  return card;
}

// A small card for an older thread, shown two to a row.
function makeSmallCard(thread) {
  const card = document.createElement('article');
  card.className = 'thread-card thread-card-small';
  const heading = document.createElement('h3');
  heading.className = 'thread-title';
  heading.append(makeOpenButton(thread, thread.title));
  card.append(heading);
  if (thread.note) card.append(makeNote(thread));
  if (thread.next) card.append(makeNextLine(thread.next));
  card.append(makeText('span', 'thread-meta', metaText(thread, true)));

  const footer = document.createElement('div');
  footer.className = 'thread-footer';
  footer.append(makePickUpButton(thread, false));
  card.append(footer);
  return card;
}

// Draw the parked threads on the home screen, newest first. Done threads are left out.
async function showHome() {
  const container = document.getElementById('thread-list');
  container.replaceChildren();
  const threads = (await getThreads())
    .filter((thread) => thread.status === 'parked')
    .sort((a, b) => b.parkedAt - a.parkedAt);

  if (threads.length === 0) {
    container.append(makeText('p', 'empty-note', 'Nothing parked yet. When you park a thread, it waits here.'));
    return;
  }

  container.append(makeMainCard(threads[0]));
  if (threads.length > 1) {
    container.append(makeText('h2', 'eyebrow recent-label', 'Recent threads'));
    const grid = document.createElement('div');
    grid.className = 'recent-grid';
    threads.slice(1).forEach((thread) => grid.append(makeSmallCard(thread)));
    container.append(grid);
  }
}

// ---------- Pick up ----------

// Ask Griot's background script to bring back the thread's tabs, then close the popup.
// The background does the work so it still finishes after Chrome switches windows,
// and it shows the "You were here" notification once the tab is in front.
function pickUpThread(thread) {
  chrome.runtime.sendMessage({ type: 'pick-up', threadId: thread.id });
  window.close();
}

// ---------- Park card ----------

// Make one row on the park card: checkbox, site icon and title.
function makeParkTabRow(tab, index, ticked) {
  const row = document.createElement('li');
  row.className = 'park-tab-row';
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = ticked;
  checkbox.dataset.index = String(index);
  checkbox.addEventListener('change', updateTickedCount);
  const title = makeText('span', 'park-tab-title', cleanTitle(tab.title) || tab.url);
  label.append(checkbox, makeFavicon(tab.url), title);
  row.append(label);
  return row;
}

// The tabs whose boxes are ticked on the park card.
function tickedTabs() {
  const boxes = document.querySelectorAll('#park-tab-list input[type="checkbox"]');
  return [...boxes].filter((box) => box.checked).map((box) => parkCardTabs[Number(box.dataset.index)]);
}

// Show "3 of 7" next to the tab list, and turn off Park thread when nothing is ticked.
function updateTickedCount() {
  const count = tickedTabs().length;
  document.getElementById('park-tab-count').textContent = `(${count} of ${parkCardTabs.length})`;
  document.getElementById('park-submit').disabled = count === 0;
}

// Fill the park card and show it. By default it lists the tabs of the window you are in.
// Options: tabs (a list to use instead), eyebrow (the small label on top),
// emptyNote (start with an empty note box, for "That's not it").
// The tab you are on, and tabs that share a word with Griot's draft, start ticked.
async function openParkCard(options = {}) {
  parkCardTabs = options.tabs || await getCurrentWindowTabs();
  const activeTab = parkCardTabs.find((tab) => tab.active);

  draftedNote = options.emptyNote ? '' : draftNote(parkCardTabs, activeTab);
  const tickingNote = draftNote(parkCardTabs, activeTab);
  document.getElementById('park-eyebrow').textContent = options.eyebrow || 'This window';
  document.getElementById('park-note').value = draftedNote;
  document.getElementById('park-guess-hint').hidden = draftedNote === '';
  document.getElementById('park-next').value = '';

  const rows = parkCardTabs.map((tab, index) =>
    makeParkTabRow(tab, index, tab.active || sharesWordWithNote(tab, tickingNote)));
  document.getElementById('park-tab-list').replaceChildren(...rows);
  updateTickedCount();

  document.getElementById('parked-message').hidden = true;
  showScreen('park');
  document.getElementById('park-note').focus();
}

// Once the user types in the note, it is their words, not Griot's guess.
function onNoteEdited() {
  const note = document.getElementById('park-note').value;
  document.getElementById('park-guess-hint').hidden = note === '' || note !== draftedNote;
}

// Drop a page from the trail when it repeats the page just before it.
// This happens when an unticked tab sat between two visits to the same page.
function withoutRepeats(trail) {
  return trail.filter((visit, index) =>
    index === 0 || pageAddress(visit.url) !== pageAddress(trail[index - 1].url));
}

// Save the ticked tabs as a parked thread, with the window's trail, then go back home.
async function parkThread(event) {
  event.preventDefault();
  const tabs = tickedTabs();
  if (tabs.length === 0) return;

  // The tab you were on is the one Pick up selects. If it was unticked, use the first tab.
  const activeTab = tabs.find((tab) => tab.active) || tabs[0];
  const untickedUrls = new Set(parkCardTabs.filter((tab) => !tabs.includes(tab)).map((tab) => pageAddress(tab.url)));
  const windowTrail = await getTrail(tabs[0].windowId);
  const note = document.getElementById('park-note').value.trim();

  await saveThread({
    id: crypto.randomUUID(),
    title: draftTitle(tabs, activeTab),
    note,
    noteIsGuess: note !== '' && note === draftedNote.trim(),
    next: document.getElementById('park-next').value.trim(),
    tabs: tabs.map((tab) => ({
      url: tab.url,
      title: cleanTitle(tab.title),
      favIconUrl: tab.favIconUrl || '',
      active: tab === activeTab
    })),
    trail: withoutRepeats(windowTrail.filter((visit) => !untickedUrls.has(pageAddress(visit.url)))),
    parkedAt: Date.now(),
    status: 'parked'
  });

  if (parkingClosedWindow) await setClosedWindow(null);
  parkingClosedWindow = false;
  await goHome('Thread parked.');
}

// ---------- Thread detail ----------

// Make one page in the trail. The last one is marked "You stopped here".
function makeTrailItem(visit, isLast) {
  const item = document.createElement('li');
  item.className = isLast ? 'trail-item is-last' : 'trail-item';
  const dot = makeText('span', 'trail-dot', '');
  dot.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'trail-text';
  const page = makeText('span', 'trail-page', shortTitle(visit.title) || visit.url);
  page.append(makeText('span', 'trail-time', ` · ${clockText(visit.time)}`));
  text.append(page);
  if (isLast) text.append(makeText('span', 'stopped-here', 'You stopped here'));

  item.append(dot, text);
  return item;
}

// Draw the trail panel: the latest pages, oldest at the top and the newest at the bottom.
function showTrail(trail) {
  const list = document.getElementById('trail-list');
  const hiddenCount = Math.max(0, trail.length - TRAIL_PAGES_SHOWN);
  const pageWord = trail.length === 1 ? 'page' : 'pages';
  document.getElementById('trail-heading').textContent = `Trail · ${trail.length} ${pageWord}`;
  document.getElementById('trail-hidden-count').textContent =
    hiddenCount > 0 ? `${hiddenCount} earlier ${hiddenCount === 1 ? 'page' : 'pages'} hidden` : '';

  if (trail.length === 0) {
    list.hidden = true;
    document.getElementById('trail-hidden-count').textContent =
      'No trail for this thread. Threads you park from now on keep the pages you visited.';
    return;
  }
  list.hidden = false;
  const shown = trail.slice(-TRAIL_PAGES_SHOWN);
  list.replaceChildren(...shown.map((visit, index) => makeTrailItem(visit, index === shown.length - 1)));
}

// Open the detail screen for one thread.
function openDetail(thread) {
  openThread = thread;
  document.getElementById('detail-parked-time').textContent = `Parked ${parkedTimeText(thread.parkedAt, false)}`;

  const note = document.getElementById('detail-note');
  note.textContent = thread.noteIsGuess ? `Griot's guess: ${thread.note}` : thread.note || thread.title;
  note.classList.toggle('is-guess', Boolean(thread.noteIsGuess));

  document.getElementById('detail-next').replaceChildren(...(thread.next ? [makeNextLine(thread.next)] : []));
  showTrail(thread.trail || []);

  document.getElementById('detail-reopen').textContent = `Reopen ${tabCountText(thread.tabs.length)}`;
  showDeleteConfirm(false);
  document.getElementById('parked-message').hidden = true;
  showScreen('detail');
  document.getElementById('detail-back').focus();
}

// Swap the action buttons for the "Delete this thread?" question, or back.
function showDeleteConfirm(show) {
  document.getElementById('detail-actions').hidden = show;
  document.getElementById('delete-confirm').hidden = !show;
  if (show) document.getElementById('delete-cancel').focus();
}

// Mark the open thread done, which takes it off home.
async function markOpenThreadDone() {
  await updateThread(openThread.id, { status: 'done' });
  await goHome('Marked done.');
}

// Delete the open thread for good (only after the user confirmed).
async function deleteOpenThread() {
  await deleteThread(openThread.id);
  await goHome('Thread deleted.');
}

// ---------- Welcome back ----------

// Griot's guess as a sentence, with the product names in bold.
function makeGuessText(welcome) {
  const text = document.getElementById('welcome-guess-text');
  if (welcome.compared) {
    const [first, second] = welcome.compared;
    text.replaceChildren('Looks like you were comparing ', makeText('strong', '', first), ' and ',
      makeText('strong', '', second), '.');
  } else if (welcome.topic) {
    text.replaceChildren('Looks like you were looking into ', makeText('strong', '', welcome.topic), '.');
  }
}

// The site a page is on, like "youtube.com", for the line under "You stopped here".
function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Fill the welcome back screen from the saved card and show it.
async function showWelcome(welcome) {
  shownWelcome = welcome;
  await setWelcome({ ...welcome, shown: true });

  document.getElementById('welcome-away').textContent = `Away for ${awayText(welcome.awayMinutes)}`;
  document.getElementById('welcome-guess').hidden = !welcome.compared && !welcome.topic;
  makeGuessText(welcome);

  const stopped = welcome.stoppedAt;
  document.getElementById('welcome-stopped-title').textContent = shortTitle(stopped.title) || stopped.url;
  document.getElementById('welcome-stopped-meta').textContent = `${siteName(stopped.url)} · ${clockText(stopped.time)}`;

  document.getElementById('welcome-next').hidden = !welcome.next;
  document.getElementById('welcome-next-text').textContent = welcome.next ? lowerFirst(welcome.next) : '';

  const pages = welcome.pages;
  const first = pages.reduce((earliest, visit) => Math.min(earliest, visit.time), Infinity);
  document.getElementById('welcome-pages').textContent =
    `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · ${clockText(first)} to ${clockText(stopped.time)}`;

  document.getElementById('welcome-go-text').textContent = welcome.goTo
    ? `Go to ${welcome.goTo.name}` : 'Go to where you stopped';
  document.getElementById('welcome-reopen').textContent = `Reopen all ${pages.length}`;

  showScreen('welcome');
  document.getElementById('welcome-go').focus();
}

// "Sign up for Product X?" becomes "sign up for Product X?" after "Next (guess):".
function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// Done with the welcome back card: forget it so it does not show again.
async function forgetWelcome() {
  await setWelcome(null);
}

// Go to the page Griot thinks matters most: the product's site, or where you stopped.
async function welcomeGoTo() {
  const visit = shownWelcome.goTo ? shownWelcome.goTo.visit : shownWelcome.stoppedAt;
  await forgetWelcome();
  chrome.runtime.sendMessage({ type: 'go-to', url: visit.url, windowId: shownWelcome.windowId });
  window.close();
}

// Bring back every page from before the break, selecting where you stopped.
async function welcomeReopenAll() {
  const activeUrl = pageAddress(shownWelcome.stoppedAt.url);
  const tabs = shownWelcome.pages.map((visit) => ({ url: visit.url, active: pageAddress(visit.url) === activeUrl }));
  await forgetWelcome();
  chrome.runtime.sendMessage({ type: 'reopen-tabs', tabs });
  window.close();
}

// "That's not it": open the park card for that window with an empty note,
// so you can say in your own words what you were doing.
async function welcomeNotIt() {
  await forgetWelcome();
  const tabs = await chrome.tabs.query({ windowId: shownWelcome.windowId }).catch(() => []);
  const windowTabs = tabs.filter((tab) => !SKIPPED_URLS.includes(tab.url));
  await openParkCard({ tabs: windowTabs.length > 0 ? windowTabs : undefined, emptyNote: true });
}

// ---------- You were here ----------

// Show the "You were here" card for a thread you just picked up:
// your note (or Griot's guess), the last page you were on, and your next step.
async function showHere(threadId) {
  const thread = (await getThreads()).find((saved) => saved.id === threadId);
  if (!thread) return goHome();

  const note = document.getElementById('here-note');
  note.textContent = thread.noteIsGuess ? `Griot's guess: ${thread.note}` : thread.note || thread.title;
  note.classList.toggle('is-guess', Boolean(thread.noteIsGuess));

  const trail = thread.trail || [];
  const stopped = trail[trail.length - 1] || thread.tabs.find((tab) => tab.active);
  document.getElementById('here-stopped').hidden = !stopped;
  if (stopped) {
    document.getElementById('here-stopped-title').textContent = shortTitle(stopped.title) || stopped.url;
    document.getElementById('here-stopped-meta').textContent =
      stopped.time ? `${siteName(stopped.url)} · ${clockText(stopped.time)}` : siteName(stopped.url);
  }

  document.getElementById('here-next').replaceChildren(...(thread.next ? [makeNextLine(thread.next)] : []));
  showScreen('here');
  document.getElementById('here-ok').focus();
}

// ---------- Opening on the right screen ----------

// Choose the first screen: the one a shortcut or notification asked for,
// a welcome back card you have not seen yet, or home.
async function start() {
  const saved = await getPopupRequest();
  if (saved) await setPopupRequest(null);
  // A request is a screen name, or { screen, threadId } for "You were here".
  const request = typeof saved === 'string' ? saved : saved && saved.screen;

  if (request === 'here') return showHere(saved.threadId);
  if (request === 'park') return openParkCard();

  if (request === 'park-closed') {
    const closed = await getClosedWindow();
    if (closed) {
      parkingClosedWindow = true;
      return openParkCard({ tabs: closed.tabs, eyebrow: 'Window you closed' });
    }
  }

  const welcome = await getWelcome();
  if (welcome && (request === 'welcome' || !welcome.shown)) return showWelcome(welcome);

  return goHome();
}

// ---------- Buttons ----------

document.getElementById('open-park-card').addEventListener('click', () => openParkCard());
document.getElementById('park-note').addEventListener('input', onNoteEdited);
document.getElementById('park-not-now').addEventListener('click', () => {
  parkingClosedWindow = false;
  goHome();
});
document.getElementById('park-screen').addEventListener('submit', parkThread);

document.getElementById('detail-back').addEventListener('click', () => goHome());
document.getElementById('detail-reopen').addEventListener('click', () => pickUpThread(openThread));
document.getElementById('detail-done').addEventListener('click', markOpenThreadDone);
document.getElementById('detail-delete').addEventListener('click', () => showDeleteConfirm(true));
document.getElementById('delete-cancel').addEventListener('click', () => showDeleteConfirm(false));
document.getElementById('delete-yes').addEventListener('click', deleteOpenThread);

document.getElementById('welcome-go').addEventListener('click', welcomeGoTo);
document.getElementById('welcome-reopen').addEventListener('click', welcomeReopenAll);
document.getElementById('welcome-not-it').addEventListener('click', welcomeNotIt);
document.getElementById('here-ok').addEventListener('click', () => window.close());

start();
