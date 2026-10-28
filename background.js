// Griot's background script: records the trail of pages visited in each window,
// brings back a thread's tabs when you press Pick up, notices when you step away
// and come back (welcome back card), and offers to park a window you close.
// A visit is only the page's title, link and time. Griot never reads page content.

importScripts('lib/storage.js', 'lib/threads.js');

// Saves happen one after another, so two quick visits never overwrite each other.
let saveQueue = Promise.resolve();

// Run a save after the ones already waiting.
function queueSave(save) {
  saveQueue = saveQueue.then(save).catch((error) => console.error('Griot could not save', error));
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

// Pick up a parked thread: bring its tabs back, then show the reminder.
async function pickUpSavedThread(threadId) {
  const thread = (await getThreads()).find((saved) => saved.id === threadId);
  if (!thread) return;
  await pickUpThread(thread);
  showYouWereHere(thread);
}

// Go to one page: switch to it if it is open in any window, otherwise open it
// in the given window (or a new window if that one is gone).
async function goToPage(url, windowId) {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  for (const win of windows) {
    const tab = win.tabs.find((open) => pageAddress(open.url) === pageAddress(url));
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(win.id, { focused: true });
      return;
    }
  }
  if (windows.some((win) => win.id === windowId)) {
    await chrome.tabs.create({ windowId, url, active: true });
    await chrome.windows.update(windowId, { focused: true });
  } else {
    await chrome.windows.create({ url, focused: true });
  }
}

// Messages from the popup. The background does this work because the popup
// closes as soon as Chrome switches windows.
chrome.runtime.onMessage.addListener((message) => {
  let work = null;
  if (message.type === 'pick-up') work = pickUpSavedThread(message.threadId);
  if (message.type === 'reopen-tabs') work = pickUpThread({ tabs: message.tabs });
  if (message.type === 'go-to') work = goToPage(message.url, message.windowId);
  if (work) work.catch((error) => console.error('Griot could not bring the tabs back', error));
});

// ---------- Opening the popup on a chosen screen ----------

// Ask the popup to open on a screen ('park', 'park-closed' or 'welcome'), then open it.
// Chrome can only open the popup while one of its windows is in front.
async function openPopupOn(screen) {
  await setPopupRequest(screen);
  try {
    await chrome.action.openPopup();
  } catch (error) {
    console.warn('Griot could not open its popup; it will open on this screen next time', error);
  }
}

// The Alt+Shift+P shortcut opens the park card.
chrome.commands.onCommand.addListener((command) => {
  if (command === 'park-thread') openPopupOn('park');
});

// Clicking a notification: welcome back opens that screen, a closed window opens
// the park card for it, and the "You were here" reminder just closes.
chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  if (id === WELCOME_NOTIFICATION) openPopupOn('welcome');
  if (id === CLOSED_WINDOW_NOTIFICATION) openPopupOn('park-closed');
});

// ---------- Welcome back ----------

const WELCOME_NOTIFICATION = 'griot-welcome-back';
const CLOSED_WINDOW_NOTIFICATION = 'griot-closed-window';

// How long without using the computer before Chrome calls you idle, in seconds.
const IDLE_AFTER_SECONDS = 60;
// A break this long or longer gets a welcome back card.
const WELCOME_AFTER_MINUTES = 10;
// Only pages from this long before the break count towards the guess.
const GUESS_WINDOW_MS = 3 * 60 * 60 * 1000;

chrome.idle.setDetectionInterval(IDLE_AFTER_SECONDS);

// One sentence for Griot's guess: "comparing Product X and Product Y".
function guessSentence(guess) {
  if (guess.compared) return `comparing ${guess.compared[0]} and ${guess.compared[1]}`;
  if (guess.topic) return `looking into ${guess.topic}`;
  return '';
}

// You stepped away: remember when, and which window you were in.
async function rememberAway(state) {
  const { awayFrom } = await chrome.storage.local.get({ awayFrom: null });
  if (awayFrom) return; // already away (for example idle, then the screen locked)
  // Chrome says "idle" a minute after your last move, so the break started a minute earlier.
  const time = Date.now() - (state === 'idle' ? IDLE_AFTER_SECONDS * 1000 : 0);
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  await chrome.storage.local.set({ awayFrom: { time, windowId: win ? win.id : null } });
}

// You came back: after a long enough break, build the welcome back card for the
// window you were in, save it for the popup and show a notification.
async function welcomeBack() {
  const { awayFrom } = await chrome.storage.local.get({ awayFrom: null });
  if (!awayFrom) return;
  await chrome.storage.local.set({ awayFrom: null });

  const awayMinutes = Math.round((Date.now() - awayFrom.time) / 60000);
  if (awayMinutes < WELCOME_AFTER_MINUTES || awayFrom.windowId === null) return;

  const visits = (await getTrail(awayFrom.windowId))
    .filter((visit) => visit.time <= awayFrom.time && visit.time >= awayFrom.time - GUESS_WINDOW_MS);
  if (visits.length === 0) return;

  const guess = guessFromTrail(visits);
  await setWelcome({ ...guess, windowId: awayFrom.windowId, awayMinutes, returnedAt: Date.now(), shown: false });

  const sentence = guessSentence(guess);
  const lines = [`You were away for ${awayText(awayMinutes)}.`];
  lines.push(sentence ? `Griot's guess: ${sentence}.` : `You stopped on ${shortTitle(guess.stoppedAt.title)}.`);
  chrome.notifications.create(WELCOME_NOTIFICATION, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
    title: 'Welcome back',
    message: lines.join('\n'),
    priority: 1
  });
}

// Chrome tells us when you go idle, lock the screen, or come back.
chrome.idle.onStateChanged.addListener((state) => {
  const work = state === 'active' ? welcomeBack() : rememberAway(state);
  work.catch((error) => console.error('Griot could not handle the break', error));
});

// ---------- Offer to park a window you close ----------

// A window needs this many web pages for Griot to offer to park it when it closes.
const LEAVE_PROMPT_MIN_TABS = 3;
// Never ask about the same window more than once in this time.
const LEAVE_PROMPT_GAP_MS = 60 * 60 * 1000;

// Keep a copy of a window's tabs, because once a window is closed its tabs are gone.
// The copy lives in session storage, which Chrome empties when it quits.
async function rememberWindowTabs(windowId) {
  if (windowId === undefined || windowId === chrome.windows.WINDOW_ID_NONE) return;
  const tabs = await chrome.tabs.query({ windowId }).catch(() => []);
  const webTabs = tabs.filter((tab) => isWebPage(tab.url)).map((tab) => ({
    url: tab.url, title: cleanTitle(tab.title), favIconUrl: tab.favIconUrl || '', active: tab.active, windowId
  }));
  const { windowTabs = {} } = await chrome.storage.session.get('windowTabs');
  windowTabs[windowId] = webTabs;
  await chrome.storage.session.set({ windowTabs });
}

// True if every page in the list is already part of a parked thread
// (for example a window opened by Pick up), so there is nothing new to park.
async function alreadyParked(tabs) {
  const parkedUrls = new Set((await getThreads())
    .filter((thread) => thread.status === 'parked')
    .flatMap((thread) => thread.tabs.map((tab) => pageAddress(tab.url))));
  return tabs.every((tab) => parkedUrls.has(pageAddress(tab.url)));
}

// A window closed: if it had enough pages, offer to park it.
async function offerToParkClosedWindow(windowId) {
  const { windowTabs = {}, promptedAt = {} } = await chrome.storage.session.get(['windowTabs', 'promptedAt']);
  const tabs = windowTabs[windowId] || [];
  delete windowTabs[windowId];
  await chrome.storage.session.set({ windowTabs });

  if (tabs.length < LEAVE_PROMPT_MIN_TABS) return;
  if (Date.now() - (promptedAt[windowId] || 0) < LEAVE_PROMPT_GAP_MS) return;
  if (await alreadyParked(tabs)) return;

  promptedAt[windowId] = Date.now();
  await chrome.storage.session.set({ promptedAt });
  await setClosedWindow({ windowId, tabs, closedAt: Date.now() });
  chrome.notifications.create(CLOSED_WINDOW_NOTIFICATION, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
    title: 'Park this thread?',
    message: `You closed a window with ${tabs.length} tabs. Click to park it so you can pick it up later.`,
    priority: 0
  });
}

// Keep the copies of each window's tabs up to date.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') queueSave(() => rememberWindowTabs(tab.windowId));
});
chrome.tabs.onActivated.addListener(({ windowId }) => queueSave(() => rememberWindowTabs(windowId)));
chrome.tabs.onAttached.addListener((tabId, { newWindowId }) => queueSave(() => rememberWindowTabs(newWindowId)));
chrome.tabs.onDetached.addListener((tabId, { oldWindowId }) => queueSave(() => rememberWindowTabs(oldWindowId)));
chrome.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => {
  // When the whole window is closing, keep the last copy so it can be parked.
  if (!isWindowClosing) queueSave(() => rememberWindowTabs(windowId));
});
chrome.windows.onRemoved.addListener((windowId) => queueSave(() => offerToParkClosedWindow(windowId)));
