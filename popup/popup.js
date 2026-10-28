// Griot popup: the open tabs list, and the park card that saves a thread.
// Uses cleanTitle, draftNote, faviconFor (lib/threads.js) and saveThread (lib/storage.js).

// Pages that are not part of a thread, like an empty new tab.
const SKIPPED_URLS = ['chrome://newtab/', 'about:blank'];

// The draft note Griot wrote, so we can tell later whether the user changed it.
let draftedNote = '';

// Get every normal browser window with its tabs, the window you are in first.
async function getWindowsWithTabs() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const current = await chrome.windows.getCurrent();
  return windows.sort((a, b) => (b.id === current.id) - (a.id === current.id));
}

// Get the tabs of the window you are in, leaving out empty new tabs.
async function getCurrentWindowTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.filter((tab) => !SKIPPED_URLS.includes(tab.url));
}

// Turn a link into a short site name, like "github.com".
function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url || '';
  }
}

// Make a site icon image from Chrome's local favicon store.
function makeFavicon(pageUrl, className) {
  const img = document.createElement('img');
  img.className = className;
  img.src = faviconFor(pageUrl);
  img.alt = '';
  return img;
}

// Make one row in the list: icon, tab title and site name.
function makeTabRow(tab) {
  const row = document.createElement('li');
  row.className = 'tab-row';

  const text = document.createElement('div');
  text.className = 'tab-text';

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = cleanTitle(tab.title) || siteName(tab.url) || 'Untitled tab';

  const site = document.createElement('span');
  site.className = 'tab-site';
  site.textContent = siteName(tab.url);

  text.append(title, site);
  row.append(makeFavicon(tab.url, 'tab-icon'), text);

  if (tab.active) {
    const dot = document.createElement('span');
    dot.className = 'tab-active-dot';
    dot.title = 'Open now';
    row.append(dot);
  }
  return row;
}

// Make the label above a window's card, like "This window · 4 tabs".
function windowLabel(index, tabCount) {
  const name = index === 0 ? 'This window' : `Window ${index + 1}`;
  return `${name} · ${tabCountText(tabCount)}`;
}

// "1 tab" or "4 tabs".
function tabCountText(count) {
  return count === 1 ? '1 tab' : `${count} tabs`;
}

// Make one section for a window: its label and a card listing its tabs.
function makeWindowSection(win, index) {
  const section = document.createElement('section');
  const headingId = `window-${win.id}`;

  const heading = document.createElement('h2');
  heading.className = 'eyebrow';
  heading.id = headingId;
  heading.textContent = windowLabel(index, win.tabs.length);

  const list = document.createElement('ul');
  list.className = 'tab-card';
  list.setAttribute('aria-labelledby', headingId);
  win.tabs.forEach((tab) => list.append(makeTabRow(tab)));

  section.append(heading, list);
  return section;
}

// Draw the whole list of windows into the popup.
async function showOpenTabs() {
  const container = document.getElementById('window-list');
  container.replaceChildren();
  const windows = await getWindowsWithTabs();

  if (windows.length === 0) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = 'No open tabs to show.';
    container.append(note);
    return;
  }
  windows.forEach((win, index) => container.append(makeWindowSection(win, index)));
}

// Show one screen ("tabs" or "park") and hide the other.
function showScreen(name) {
  document.getElementById('tabs-screen').hidden = name !== 'tabs';
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

// Save the current window as a parked thread, then go back to the tabs list.
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

  showScreen('tabs');
  document.getElementById('parked-message').hidden = false;
}

// Leave the park card without saving.
function closeParkCard() {
  showScreen('tabs');
}

document.getElementById('open-park-card').addEventListener('click', openParkCard);
document.getElementById('park-note').addEventListener('input', onNoteEdited);
document.getElementById('park-not-now').addEventListener('click', closeParkCard);
document.getElementById('park-screen').addEventListener('submit', parkThread);

showOpenTabs();
