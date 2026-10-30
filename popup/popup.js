// Griot popup: home (parked threads), the park card, a thread's detail and trail,
// and the welcome back card after a break.
// Uses cleanTitle, shortTitle, draftNote, draftTitle, sharesWordWithNote, faviconFor, awayText (lib/threads.js),
// the thread, trail, welcome and settings helpers in lib/storage.js, and playSound (lib/sound.js).

// Pages that are not part of a thread, like an empty new tab.
const SKIPPED_URLS = ['chrome://newtab/', 'about:blank'];

// How many trail pages the detail screen shows; older ones are counted as hidden.
const TRAIL_PAGES_SHOWN = 6;

// When Griot opens in its own small window (welcome back or the shortcut), the address
// says which browser window it belongs to, like popup.html?window=123.
const OWN_WINDOW_FOR = Number(new URLSearchParams(location.search).get('window')) || null;

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

// Close Griot: the toolbar popup, its own small window, or its tab (in full screen).
function closeGriot() {
  chrome.tabs.getCurrent().then((tab) => {
    if (tab && OWN_WINDOW_FOR && tab.windowId === OWN_WINDOW_FOR) chrome.tabs.remove(tab.id);
    else window.close();
  }).catch(() => window.close());
}

// Get the tabs of the window you are in, leaving out empty new tabs.
// Sites you never want tracked (and banking and health sites) are left out.
async function getCurrentWindowTabs() {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query(OWN_WINDOW_FOR ? { windowId: OWN_WINDOW_FOR } : { currentWindow: true });
  return tabs.filter((tab) => /^https?:/.test(tab.url || '') && !SKIPPED_URLS.includes(tab.url) && !isBlockedSite(tab.url, settings));
}

// Make a site icon image from Chrome's local favicon store.
// Once it loads, its backing tile picks a colour it stands out against (see fitIconBacking).
function makeFavicon(pageUrl, className = 'site-icon') {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.addEventListener('load', () => fitIconBacking(img), { once: true });
  img.src = faviconFor(pageUrl);
  return img;
}

// How bright a colour looks, from 0 (black) to 1 (white).
function brightness(red, green, blue) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

// How far apart two brightnesses are, as a contrast ratio (1 = the same, 21 = black on white).
function contrast(a, b) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Pick the tile behind a site icon so the icon never blends into Griot's colours.
// Looks at the icon's own visible pixels: light icons (like a white logo) get a dark
// brown tile, everything else gets a light tile. Icons with their own solid square
// background keep the light tile.
const LIGHT_TILE = { color: '#FBF6EE', brightness: brightness(251, 246, 238) };
const DARK_TILE = { color: '#3E2A1C', brightness: brightness(62, 42, 28) };
function fitIconBacking(img) {
  try {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(img, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;

    let red = 0, green = 0, blue = 0, weight = 0, seeThrough = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3] / 255;
      if (alpha < 0.95) seeThrough += 1;
      red += pixels[i] * alpha;
      green += pixels[i + 1] * alpha;
      blue += pixels[i + 2] * alpha;
      weight += alpha;
    }
    if (weight === 0 || seeThrough === 0) return; // empty, or a solid square icon: keep the light tile

    const iconBrightness = brightness(red / weight, green / weight, blue / weight);
    const tile = contrast(iconBrightness, DARK_TILE.brightness) > contrast(iconBrightness, LIGHT_TILE.brightness) * 1.4
      ? DARK_TILE : LIGHT_TILE;
    img.style.backgroundColor = tile.color;
    img.style.borderColor = tile === DARK_TILE ? tile.color : '';
  } catch (error) {
    // The icon could not be read: keep the default tile.
  }
}

// A row of up to five site icons for a thread's tabs, like on the home cards.
function makeIconRow(tabs) {
  const row = document.createElement('span');
  row.className = 'icon-row';
  row.setAttribute('aria-hidden', 'true');
  tabs.slice(0, 5).forEach((tab) => row.append(makeFavicon(tab.url, 'site-icon small-icon')));
  if (tabs.length > 5) row.append(makeText('span', 'icon-more', `+${tabs.length - 5}`));
  return row;
}

// ---------- Motion and sound ----------

// Play a sound if "Sounds when I park, pick up or finish" is on.
async function sound(name) {
  if ((await getSettings()).soundEffects) playSound(name);
}

// Wait a moment, so an animation can finish before the screen changes.
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Give items their place in a staggered entrance (each one arrives a little after the last).
function stagger(elements, from = 0) {
  elements.forEach((element, index) => {
    element.classList.add('m-in');
    element.style.setProperty('--i', String(from + index));
  });
}

// "Away for 25 minutes": count the minutes up quickly from 0.
function countUp(element, minutes) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || minutes >= 60) {
    element.textContent = `Away for ${awayText(minutes)}`;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, Math.max(0, (now - start - 150) / 550));
    const shown = Math.round(minutes * (1 - (1 - progress) ** 3));
    element.textContent = `Away for ${awayText(shown)}`;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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

// Show one screen ("home", "park", "detail", "welcome", "here" or "settings") and hide the others.
// The screen's parts rise in one after another. Going deeper slides in from the right,
// going back slides in from the left (direction "forward" or "back").
const SCREENS = ['home', 'park', 'detail', 'welcome', 'here', 'settings'];
function showScreen(name, direction) {
  SCREENS.forEach((screen) => { document.getElementById(`${screen}-screen`).hidden = screen !== name; });
  const shown = document.getElementById(`${name}-screen`);
  shown.classList.remove('play', 'parking', 'done', 'deleting', 'slide-in-right', 'slide-in-left');
  void shown.offsetWidth; // restart the animations
  shown.classList.add('play');
  if (direction === 'forward') shown.classList.add('slide-in-right');
  if (direction === 'back') shown.classList.add('slide-in-left');
}

// Go back home and show a short green message, like "Thread parked."
async function goHome(message, direction = 'back') {
  await showHome();
  showScreen('home', direction);
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
  const meta = document.createElement('span');
  meta.className = 'thread-meta-group';
  meta.append(makeIconRow(thread.tabs), makeText('span', 'thread-meta', metaText(thread, false)));
  footer.append(meta, makePickUpButton(thread, true));
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
  // Skip the note when it only repeats the title (a guess built from one tab's title).
  if (thread.note && thread.note.replace(/[.\s]+$/, '') !== thread.title) card.append(makeNote(thread));
  if (thread.next) card.append(makeNextLine(thread.next));
  card.append(makeIconRow(thread.tabs), makeText('span', 'thread-meta', metaText(thread, true)));

  const footer = document.createElement('div');
  footer.className = 'thread-footer';
  footer.append(makePickUpButton(thread, false));
  card.append(footer);
  return card;
}

// Draw the parked threads on the home screen, newest first. Done threads are left out.
async function showHome() {
  await showHomeNotices();
  const container = document.getElementById('thread-list');
  container.replaceChildren();
  const threads = (await getThreads())
    .filter((thread) => thread.status === 'parked')
    .sort((a, b) => b.parkedAt - a.parkedAt);

  if (threads.length === 0) {
    container.append(makeText('p', 'empty-note', 'Nothing parked right now. When you park a thread, it waits here.'));
    return;
  }

  const mainCard = makeMainCard(threads[0]);
  container.append(mainCard);
  stagger([mainCard], 3);
  if (threads.length > 1) {
    container.append(makeText('h2', 'eyebrow recent-label', 'Recent threads'));
    const grid = document.createElement('div');
    grid.className = 'recent-grid';
    const cards = threads.slice(1).map(makeSmallCard);
    grid.append(...cards);
    container.append(grid);
    stagger(cards, 4);
  }
}

// The lines above the threads: "Griot is paused" and the offer to park a window you closed.
async function showHomeNotices() {
  const settings = await getSettings();
  document.getElementById('paused-line').hidden = !isPaused(settings);

  const closed = await getClosedWindow();
  document.getElementById('closed-window').hidden = !closed;
  if (closed) {
    document.getElementById('closed-window-text').textContent =
      `You closed a window with ${tabCountText(closed.tabs.length)}. Park it so you can pick it up later?`;
  }
}

// Open the park card for the window you closed.
function parkClosedWindow() {
  getClosedWindow().then((closed) => {
    if (!closed) return goHome();
    parkingClosedWindow = true;
    return openParkCard({ tabs: closed.tabs, eyebrow: 'Window you closed' });
  });
}

// "Not now" on the closed-window offer: forget that window.
async function dismissClosedWindow() {
  await setClosedWindow(null);
  await goHome();
}

// ---------- Pick up ----------

// Where "Take me there" goes: { windowId, url } of the tab you were on.
let takeMeThere = null;

// How many tabs the thread being picked up has, for "5 tabs ready".
let pickedUpTabCount = 0;

// Pick up a thread: show "You were here" right away, while Griot's background script
// quietly brings the tabs back into this window (or the window that already has them).
// Chrome closes this popup when it switches tabs, so the switch waits for "Take me there".
async function pickUpThread(thread) {
  takeMeThere = null;
  sound('pickup');
  await showHere(thread);
  const place = await chrome.runtime.sendMessage({ type: 'pick-up', threadId: thread.id });
  takeMeThere = place;
  const button = document.getElementById('here-ok');
  await wait(450); // let the shimmer show that the tabs are coming back
  button.disabled = !place;
  button.classList.remove('is-loading');
  document.getElementById('here-ready').textContent = place ? `${tabCountText(pickedUpTabCount)} ready` : '';
}

// Jump to the tab you were on when you parked the thread.
function goToPickedUpTab() {
  if (!takeMeThere) return;
  chrome.runtime.sendMessage({ type: 'go-to', url: takeMeThere.url, windowId: takeMeThere.windowId });
  closeGriot();
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
  stagger(rows.slice(0, 8), 5);
  updateTickedCount();

  document.getElementById('parked-message').hidden = true;
  showScreen('park', 'forward');
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

// If a parked thread already has exactly these tabs, remove it, so parking the same
// tabs again updates the thread instead of making a second copy on home.
async function replaceSameThread(tabs) {
  const key = (list) => [...new Set(list.map((tab) => pageAddress(tab.url)))].sort().join(' ');
  const newKey = key(tabs);
  const same = (await getThreads()).filter((thread) => thread.status === 'parked' && key(thread.tabs) === newKey);
  for (const thread of same) await deleteThread(thread.id);
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
  await replaceSameThread(tabs);

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
  sound('park');
  document.getElementById('park-screen').classList.add('parking'); // the card tucks away
  await wait(280);
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
  const page = document.createElement('span');
  page.className = 'trail-page';
  page.append(makeFavicon(visit.url, 'site-icon trail-icon'), shortTitle(visit.title) || visit.url);
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
  const items = shown.map((visit, index) => makeTrailItem(visit, index === shown.length - 1));
  items.forEach((item, index) => item.style.setProperty('--i', String(index)));
  list.replaceChildren(...items);
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
  showScreen('detail', 'forward');
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
  sound('done');
  document.getElementById('detail-screen').classList.add('done'); // the thread fades out
  await wait(240);
  await goHome('Marked done.');
}

// Delete the open thread for good (only after the user confirmed).
async function deleteOpenThread() {
  await deleteThread(openThread.id);
  sound('delete');
  document.getElementById('detail-screen').classList.add('deleting'); // the thread folds away
  await wait(260);
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

// The parked thread shown on the welcome back screen, if there is one.
let welcomeThread = null;

// Fill the welcome back screen from the saved card and show it.
// If you parked a thread, the screen shows that thread (your own note) and Pick up.
// If nothing is parked, it shows where you stopped, from the trail.
// showTrail: true skips the parked thread ("See where I stopped instead").
async function showWelcome(welcome, showTrail = false) {
  shownWelcome = welcome;
  // Seen in the toolbar popup: don't show it again by itself. When Griot opened its own
  // window, keep it waiting, so if that window closed before you read it, the icon still has it.
  if (!OWN_WINDOW_FOR) await setWelcome({ ...welcome, shown: true });

  const thread = !showTrail && welcome.threadId
    ? (await getThreads()).find((saved) => saved.id === welcome.threadId && saved.status === 'parked')
    : null;
  welcomeThread = thread || null;
  if (!thread && !welcome.stoppedAt) {
    await forgetWelcome();
    return goHome();
  }

  countUp(document.getElementById('welcome-away'), welcome.awayMinutes);
  ['welcome-guess', 'welcome-trail-stopped', 'welcome-next', 'welcome-pages']
    .forEach((id) => { document.getElementById(id).hidden = Boolean(thread); });
  document.getElementById('welcome-thread').hidden = !thread;
  document.getElementById('welcome-reopen').hidden = Boolean(thread);
  const notIt = document.getElementById('welcome-not-it');
  notIt.textContent = thread ? 'See where I stopped instead' : "That's not it";
  notIt.hidden = Boolean(thread) && !welcome.stoppedAt;

  if (thread) {
    showWelcomeThread(thread);
    showScreen('welcome');
    document.getElementById('welcome-go').focus();
    return;
  }

  document.getElementById('welcome-guess').hidden = !welcome.compared && !welcome.topic;
  makeGuessText(welcome);

  const stopped = welcome.stoppedAt;
  document.getElementById('welcome-stopped-title').replaceChildren(
    makeFavicon(stopped.url, 'site-icon trail-icon'), shortTitle(stopped.title) || stopped.url);
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

// Show the parked thread on the welcome back screen: your note, where you stopped, Next.
function showWelcomeThread(thread) {
  const note = document.getElementById('welcome-thread-note');
  note.textContent = thread.noteIsGuess ? `Griot's guess: ${thread.note}` : thread.note || thread.title;
  note.classList.toggle('is-guess', Boolean(thread.noteIsGuess));

  const trail = thread.trail || [];
  const stopped = trail[trail.length - 1] || thread.tabs.find((tab) => tab.active) || thread.tabs[0];
  document.getElementById('welcome-thread-stopped-title').replaceChildren(
    makeFavicon(stopped.url, 'site-icon trail-icon'), shortTitle(stopped.title) || stopped.url);
  document.getElementById('welcome-thread-stopped-meta').textContent =
    stopped.time ? `${siteName(stopped.url)} · ${clockText(stopped.time)}` : siteName(stopped.url);

  document.getElementById('welcome-thread-next').replaceChildren(...(thread.next ? [makeNextLine(thread.next)] : []));
  document.getElementById('welcome-thread-meta').textContent =
    `${tabCountText(thread.tabs.length)} · parked ${parkedTimeText(thread.parkedAt, false)}`;
  document.getElementById('welcome-go-text').textContent = 'Pick up this thread';
}

// Pick up the parked thread from the welcome back screen and go straight to its tab.
async function welcomePickUp() {
  const thread = welcomeThread;
  await forgetWelcome();
  sound('pickup');
  const place = await chrome.runtime.sendMessage({ type: 'pick-up', threadId: thread.id });
  if (place) chrome.runtime.sendMessage({ type: 'go-to', url: place.url, windowId: place.windowId });
  closeGriot();
}

// "Sign up for Product X?" becomes "sign up for Product X?" after "Next (guess):".
function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// Done with the welcome back card: forget it so it does not show again,
// and take the "You were here" label off the tab.
async function forgetWelcome() {
  await setWelcome(null);
  chrome.runtime.sendMessage({ type: 'clear-label' }).catch(() => {});
}

// Go to the page Griot thinks matters most: the product's site, or where you stopped.
async function welcomeGoTo() {
  const visit = shownWelcome.goTo ? shownWelcome.goTo.visit : shownWelcome.stoppedAt;
  await forgetWelcome();
  chrome.runtime.sendMessage({ type: 'go-to', url: visit.url, windowId: shownWelcome.windowId });
  closeGriot();
}

// Bring back every page from before the break, selecting where you stopped.
async function welcomeReopenAll() {
  const activeUrl = pageAddress(shownWelcome.stoppedAt.url);
  const tabs = shownWelcome.pages.map((visit) => ({ url: visit.url, active: pageAddress(visit.url) === activeUrl }));
  await forgetWelcome();
  chrome.runtime.sendMessage({ type: 'reopen-tabs', tabs });
  closeGriot();
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

// Show the "You were here" card for a thread you are picking up:
// your note (or Griot's guess), the last page you were on, and your next step.
async function showHere(thread) {
  pickedUpTabCount = thread.tabs.length;
  document.getElementById('here-ready').textContent = `Bringing back ${tabCountText(thread.tabs.length)}…`;
  const button = document.getElementById('here-ok');
  button.disabled = true;
  button.classList.add('is-loading'); // shimmers until the tabs are back

  const note = document.getElementById('here-note');
  note.textContent = thread.noteIsGuess ? `Griot's guess: ${thread.note}` : thread.note || thread.title;
  note.classList.toggle('is-guess', Boolean(thread.noteIsGuess));

  const trail = thread.trail || [];
  const stopped = trail[trail.length - 1] || thread.tabs.find((tab) => tab.active);
  document.getElementById('here-stopped').hidden = !stopped;
  if (stopped) {
    document.getElementById('here-stopped-title').replaceChildren(
      makeFavicon(stopped.url, 'site-icon trail-icon'), shortTitle(stopped.title) || stopped.url);
    document.getElementById('here-stopped-meta').textContent =
      stopped.time ? `${siteName(stopped.url)} · ${clockText(stopped.time)}` : siteName(stopped.url);
  }

  document.getElementById('here-next').replaceChildren(...(thread.next ? [makeNextLine(thread.next)] : []));
  showScreen('here', 'forward');
  document.getElementById('here-ok').focus();
}

// ---------- Privacy and settings ----------

// Fill the settings screen from the saved settings and show it.
async function showSettings() {
  const settings = await getSettings();
  document.getElementById('setting-welcome').checked = settings.welcomeBack;
  document.getElementById('setting-closed').checked = settings.closedWindowPrompt;
  document.getElementById('setting-pause').checked = isPaused(settings);
  document.getElementById('setting-chime').checked = settings.welcomeChime;
  document.getElementById('setting-label').checked = settings.labelTab;
  document.getElementById('setting-sounds').checked = settings.soundEffects;
  document.getElementById('setting-open').checked = settings.openOnReturn;
  showBlockedSites(settings);
  document.getElementById('add-site-form').hidden = true;
  document.getElementById('add-site-button').hidden = false;
  showDeleteAllConfirm(false);
  document.getElementById('settings-version').textContent = `Griot ${chrome.runtime.getManifest().version} · open source`;
  showScreen('settings', 'forward');
  document.getElementById('settings-back').focus();
}

// Save a switch as soon as it changes.
async function onSettingChanged(event) {
  const id = event.target.id;
  if (id === 'setting-welcome') await updateSettings({ welcomeBack: event.target.checked });
  if (id === 'setting-closed') await updateSettings({ closedWindowPrompt: event.target.checked });
  if (id === 'setting-pause') await updateSettings({ pausedUntil: event.target.checked ? endOfToday() : 0 });
  if (id === 'setting-label') await updateSettings({ labelTab: event.target.checked });
  if (id === 'setting-open') await updateSettings({ openOnReturn: event.target.checked });
  if (id === 'setting-chime') {
    await updateSettings({ welcomeChime: event.target.checked });
    if (event.target.checked) playSound('welcome'); // let you hear the chime you turned on
  }
  if (id === 'setting-sounds') {
    await updateSettings({ soundEffects: event.target.checked });
    if (event.target.checked) playSound('tick');
  }
}

// Show the "never track" chips: banking and health (always), then the sites you added.
// A newly added site's chip pops in.
function showBlockedSites(settings, newSite) {
  const chips = [makeText('span', 'site-chip', 'Banking and health sites ')];
  chips[0].append(makeText('span', 'optional', '(default)'));
  settings.blockedSites.forEach((site) => {
    const chip = makeText('span', 'site-chip', site);
    const remove = makeText('button', 'chip-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${site}`);
    remove.addEventListener('click', () => {
      chip.classList.add('chip-out'); // shrinks away, then the list redraws
      setTimeout(() => removeBlockedSite(site), 160);
    });
    chip.append(remove);
    if (site === newSite) chip.classList.add('chip-in');
    chips.push(chip);
  });
  document.getElementById('blocked-sites').replaceChildren(...chips);
}

// Show the box for typing a site.
function openAddSite() {
  document.getElementById('add-site-button').hidden = true;
  document.getElementById('add-site-form').hidden = false;
  document.getElementById('add-site-input').value = '';
  document.getElementById('add-site-input').focus();
}

// Add a site to the "never track" list and remove its pages from every trail.
async function addBlockedSite(event) {
  event.preventDefault();
  const site = cleanSite(document.getElementById('add-site-input').value);
  if (!site) return;
  const settings = await getSettings();
  const blockedSites = settings.blockedSites.includes(site) ? settings.blockedSites : [...settings.blockedSites, site];
  const saved = await updateSettings({ blockedSites });
  await removeSiteFromTrails(saved);
  showBlockedSites(saved, site);
  document.getElementById('add-site-form').hidden = true;
  document.getElementById('add-site-button').hidden = false;
}

// Take a site off the "never track" list.
async function removeBlockedSite(site) {
  const settings = await getSettings();
  showBlockedSites(await updateSettings({ blockedSites: settings.blockedSites.filter((saved) => saved !== site) }));
}

// Swap "Delete all threads and trails" for the "Are you sure?" question, or back.
function showDeleteAllConfirm(show) {
  document.getElementById('delete-all-row').hidden = show;
  document.getElementById('delete-all-confirm').hidden = !show;
  if (show) document.getElementById('delete-all-cancel').focus();
}

// Delete everything Griot has saved (only after you confirmed).
async function deleteAll() {
  await deleteEverything();
  await goHome('Everything deleted.');
}

// ---------- Opening on the right screen ----------

// Choose the first screen: the park card if you pressed the shortcut,
// a welcome back card you have not seen yet, or home.
async function start() {
  const request = await getPopupRequest();
  if (request) await setPopupRequest(null);

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

document.getElementById('welcome-go').addEventListener('click', () => (welcomeThread ? welcomePickUp() : welcomeGoTo()));
document.getElementById('closed-window-park').addEventListener('click', parkClosedWindow);
document.getElementById('closed-window-dismiss').addEventListener('click', dismissClosedWindow);

document.querySelectorAll('.settings-button').forEach((button) => button.addEventListener('click', showSettings));
document.getElementById('settings-back').addEventListener('click', () => goHome());
['setting-welcome', 'setting-closed', 'setting-pause', 'setting-chime', 'setting-label', 'setting-sounds', 'setting-open'].forEach((id) =>
  document.getElementById(id).addEventListener('change', onSettingChanged));
document.getElementById('add-site-button').addEventListener('click', openAddSite);
document.getElementById('add-site-form').addEventListener('submit', addBlockedSite);
document.getElementById('add-site-cancel').addEventListener('click', () => {
  document.getElementById('add-site-form').hidden = true;
  document.getElementById('add-site-button').hidden = false;
});
document.getElementById('delete-all').addEventListener('click', () => showDeleteAllConfirm(true));
document.getElementById('delete-all-cancel').addEventListener('click', () => showDeleteAllConfirm(false));
document.getElementById('delete-all-yes').addEventListener('click', deleteAll);
document.getElementById('welcome-reopen').addEventListener('click', welcomeReopenAll);
document.getElementById('welcome-not-it').addEventListener('click', () =>
  (welcomeThread ? showWelcome(shownWelcome, true) : welcomeNotIt()));
document.getElementById('here-ok').addEventListener('click', goToPickedUpTab);
document.getElementById('here-back').addEventListener('click', () => goHome());

document.body.classList.add('opening'); // the woven strip slides in once, when the popup opens

// In Griot's own small window, behave like the popup: close when you click elsewhere.
if (OWN_WINDOW_FOR) {
  document.documentElement.classList.add('own-window');
  document.body.classList.add('own-window');
  window.addEventListener('blur', () => closeGriot());
}
start();
