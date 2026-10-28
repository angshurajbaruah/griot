// Griot popup: the home screen of parked threads, and the park card that saves a thread.
// Uses cleanTitle, draftNote, draftTitle, faviconFor (lib/threads.js)
// and getThreads, saveThread (lib/storage.js).

// Pages that are not part of a thread, like an empty new tab.
const SKIPPED_URLS = ['chrome://newtab/', 'about:blank'];

// The draft note Griot wrote, so we can tell later whether the user changed it.
let draftedNote = '';

// Get the tabs of the window you are in, leaving out empty new tabs.
async function getCurrentWindowTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.filter((tab) => !SKIPPED_URLS.includes(tab.url));
}

// Make a site icon image from Chrome's local favicon store.
function makeFavicon(pageUrl, className) {
  const img = document.createElement('img');
  img.className = className;
  img.src = faviconFor(pageUrl);
  img.alt = '';
  return img;
}

// "1 tab" or "4 tabs".
function tabCountText(count) {
  return count === 1 ? '1 tab' : `${count} tabs`;
}

// Say when a thread was parked. Long: "yesterday, 6:42 pm". Short: "Mon".
function parkedTimeText(time, short) {
  const parked = new Date(time);
  const clock = parked.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const daysAgo = Math.floor((startOfToday - new Date(time).setHours(0, 0, 0, 0)) / 86400000);

  let day;
  if (daysAgo <= 0) day = 'today';
  else if (daysAgo === 1) day = 'yesterday';
  else if (daysAgo < 7) day = parked.toLocaleDateString('en-GB', { weekday: 'short' });
  else day = parked.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  if (short) return daysAgo <= 1 ? day.charAt(0).toUpperCase() + day.slice(1) : day;
  return `${day}, ${clock}`;
}

// Make a small piece of text inside a card.
function makeText(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

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
  const note = makeText('p', 'thread-note', thread.note);
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

// The big card for the newest thread: "Continue thread".
function makeMainCard(thread) {
  const card = document.createElement('article');
  card.className = 'thread-card thread-card-main';
  card.append(makeText('span', 'eyebrow', 'Continue thread'));
  if (thread.note) card.append(makeNote(thread));
  else card.append(makeText('p', 'thread-title', thread.title));
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
  card.append(makeText('h3', 'thread-title', thread.title));
  if (thread.note) card.append(makeNote(thread));
  if (thread.next) card.append(makeNextLine(thread.next));
  card.append(makeText('span', 'thread-meta', metaText(thread, true)));

  const footer = document.createElement('div');
  footer.className = 'thread-footer';
  footer.append(makePickUpButton(thread, false));
  card.append(footer);
  return card;
}

// Draw the parked threads on the home screen, newest first.
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

// Reopen a thread's tabs together in a new window.
async function pickUpThread(thread) {
  const urls = thread.tabs.map((tab) => tab.url);
  await chrome.windows.create({ url: urls, focused: true });
}

// Show one screen ("home" or "park") and hide the other.
function showScreen(name) {
  document.getElementById('home-screen').hidden = name !== 'home';
  document.getElementById('park-screen').hidden = name !== 'park';
}

// Fill the park card for the current window and show it.
async function openParkCard() {
  const tabs = await getCurrentWindowTabs();
  const activeTab = tabs.find((tab) => tab.active);

  const favicons = document.getElementById('park-favicons');
  favicons.replaceChildren(...tabs.slice(0, 4).map((tab) => makeFavicon(tab.url, 'park-favicon')));
  document.getElementById('park-tab-count').textContent = `${tabCountText(tabs.length)} in this thread`;

  draftedNote = draftNote(tabs, activeTab);
  document.getElementById('park-note').value = draftedNote;
  document.getElementById('park-guess-hint').hidden = draftedNote === '';
  document.getElementById('park-next').value = '';

  document.getElementById('parked-message').hidden = true;
  showScreen('park');
  document.getElementById('park-note').focus();
}

// Once the user types in the note, it is their words, not Griot's guess.
function onNoteEdited() {
  const note = document.getElementById('park-note').value;
  document.getElementById('park-guess-hint').hidden = note === '' || note !== draftedNote;
}

// Save the current window as a parked thread, then go back home.
async function parkThread(event) {
  event.preventDefault();
  const tabs = await getCurrentWindowTabs();
  const activeTab = tabs.find((tab) => tab.active);
  const note = document.getElementById('park-note').value.trim();

  await saveThread({
    id: crypto.randomUUID(),
    title: draftTitle(tabs, activeTab),
    note,
    noteIsGuess: note !== '' && note === draftedNote.trim(),
    next: document.getElementById('park-next').value.trim(),
    tabs: tabs.map((tab) => ({ url: tab.url, title: cleanTitle(tab.title), favIconUrl: tab.favIconUrl || '' })),
    trail: [],
    parkedAt: Date.now(),
    status: 'parked'
  });

  await showHome();
  showScreen('home');
  document.getElementById('parked-message').hidden = false;
}

// Leave the park card without saving.
function closeParkCard() {
  showScreen('home');
}

document.getElementById('open-park-card').addEventListener('click', openParkCard);
document.getElementById('park-note').addEventListener('input', onNoteEdited);
document.getElementById('park-not-now').addEventListener('click', closeParkCard);
document.getElementById('park-screen').addEventListener('submit', parkThread);

showHome();
