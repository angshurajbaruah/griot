// Griot popup, milestone 1: show the open tabs, grouped by window. Nothing is saved.

// Get every normal browser window with its tabs, the window you are in first.
async function getWindowsWithTabs() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const current = await chrome.windows.getCurrent();
  return windows.sort((a, b) => (b.id === current.id) - (a.id === current.id));
}

// Turn a link into a short site name, like "github.com".
function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url || '';
  }
}

// Make the little icon for a tab. Only uses favicons already inside Chrome
// (data: images), so the popup never fetches anything from the internet.
function makeTabIcon(tab) {
  if (tab.favIconUrl && tab.favIconUrl.startsWith('data:')) {
    const img = document.createElement('img');
    img.className = 'tab-icon';
    img.src = tab.favIconUrl;
    img.alt = '';
    return img;
  }
  const letter = document.createElement('span');
  letter.className = 'tab-icon tab-letter';
  letter.setAttribute('aria-hidden', 'true');
  letter.textContent = (siteName(tab.url) || tab.title || '?').charAt(0);
  return letter;
}

// Make one row in the list: icon, tab title and site name.
function makeTabRow(tab) {
  const row = document.createElement('li');
  row.className = 'tab-row';

  const text = document.createElement('div');
  text.className = 'tab-text';

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = tab.title || siteName(tab.url) || 'Untitled tab';

  const site = document.createElement('span');
  site.className = 'tab-site';
  site.textContent = siteName(tab.url);

  text.append(title, site);
  row.append(makeTabIcon(tab), text);

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
  const count = tabCount === 1 ? '1 tab' : `${tabCount} tabs`;
  return `${name} · ${count}`;
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

showOpenTabs();
