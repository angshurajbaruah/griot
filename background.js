// Griot's background script: records the trail of pages visited in each window,
// and brings back a thread's tabs when you press Pick up.
// A visit is only the page's title, link and time. Griot never reads page content.

importScripts('lib/storage.js', 'lib/threads.js');

// Saves happen one after another, so two quick visits never overwrite each other.
let saveQueue = Promise.resolve();

// Run a save after the ones already waiting.
function queueSave(save) {
  saveQueue = saveQueue.then(save).catch((error) => console.error('Griot could not save a visit', error));
}

// Only ordinary web pages go in the trail, not new tabs or Chrome's own pages.
function isWebPage(url) {
  return /^https?:\/\//.test(url || '');
}

// Record the page a tab is showing as a visit in its window's trail.
function recordVisit(tab) {
  if (!isWebPage(tab.url)) return;
  const visit = { url: tab.url, title: cleanTitle(tab.title), time: Date.now() };
  queueSave(() => addVisit(tab.windowId, visit));
}

// A page in the tab you are looking at loaded, changed address or changed title.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active) return;
  if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') recordVisit(tab);
});

// You switched to another tab.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(recordVisit).catch(() => {});
});

// Window numbers start again when Chrome restarts, so old trails would get mixed up.
chrome.runtime.onStartup.addListener(() => {
  queueSave(clearTrails);
});

// ---------- Pick up ----------

// Find an open window that already has at least half of the thread's tabs.
async function findWindowWithThread(thread) {
  const wanted = new Set(thread.tabs.map((tab) => pageAddress(tab.url)));
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  let best = null;
  let bestCount = 0;
  windows.forEach((win) => {
    const count = new Set(win.tabs.map((tab) => pageAddress(tab.url)).filter((url) => wanted.has(url))).size;
    if (count > bestCount) {
      best = win;
      bestCount = count;
    }
  });
  return bestCount * 2 >= wanted.size ? best : null;
}

// Bring back a thread's tabs and select the tab you were on when you parked.
// If they are already open, switch to that window and add only the missing tabs.
async function pickUpThread(thread) {
  const activeUrl = pageAddress((thread.tabs.find((tab) => tab.active) || thread.tabs[0]).url);
  const existing = await findWindowWithThread(thread);

  if (existing) {
    const openUrls = new Set(existing.tabs.map((tab) => pageAddress(tab.url)));
    const missing = thread.tabs.filter((tab) => !openUrls.has(pageAddress(tab.url)));
    for (const tab of missing) {
      await chrome.tabs.create({ windowId: existing.id, url: tab.url, active: false });
    }
    const tabs = await chrome.tabs.query({ windowId: existing.id });
    const target = tabs.find((tab) => pageAddress(tab.url) === activeUrl);
    if (target) await chrome.tabs.update(target.id, { active: true });
    await chrome.windows.update(existing.id, { focused: true });
    return;
  }

  const newWindow = await chrome.windows.create({ url: thread.tabs.map((tab) => tab.url), focused: true });
  const activeIndex = Math.max(0, thread.tabs.findIndex((tab) => tab.active));
  const target = newWindow.tabs[activeIndex];
  if (target) await chrome.tabs.update(target.id, { active: true });
}

// Show a small "You were here" card with your note and next step.
// It is made on this device by Chrome; nothing is sent anywhere.
function showYouWereHere(thread) {
  // A drafted note is still Griot's guess, so it is labelled as one.
  const note = thread.note && thread.noteIsGuess ? `Griot's guess: ${thread.note}` : thread.note;
  const lines = [note || thread.title];
  if (thread.next) lines.push(`Next: ${thread.next}`);
  chrome.notifications.create(`griot-${thread.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
    title: 'You were here',
    message: lines.join('\n'),
    priority: 0
  });
}

// The popup asked to pick up a thread: bring its tabs back, then show the reminder.
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'pick-up') return;
  getThreads()
    .then((threads) => threads.find((thread) => thread.id === message.threadId))
    .then(async (thread) => {
      if (!thread) return;
      await pickUpThread(thread);
      showYouWereHere(thread);
    })
    .catch((error) => console.error('Griot could not pick up the thread', error));
});

// Clicking the reminder just closes it.
chrome.notifications.onClicked.addListener((id) => chrome.notifications.clear(id));
