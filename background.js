// Griot's background script: records the trail of pages visited in each window,
// brings back a thread's tabs when you press Pick up, notices when you step away
// from a window and come back (welcome back card), and keeps a window you close
// so you can park it. It never opens anything itself: everything waits inside
// Griot's popup. When you come back to a window it can play a soft chime, show how
// long you were away on the icon, and label the tab you left as "You were here".
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
// Nothing is recorded while Griot is paused, or for sites you never want tracked.
function recordVisit(tab) {
  if (!isWebPage(tab.url)) return;
  queueSave(async () => {
    const settings = await getSettings();
    if (isPaused(settings) || isBlockedSite(tab.url, settings)) return;
    const visit = { url: tab.url, title: cleanTitle(tab.title), time: Date.now() };
    await addVisit(tab.windowId, visit);
  });
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

// Bring back a thread's tabs, quietly, without switching to them yet.
// If a window already has most of them, the missing ones are added there.
// Otherwise they open in the window you are in (never a new window).
// Returns where they are, so "Take me there" can jump to the tab you were on.
async function bringBackTabs(thread) {
  const activeUrl = (thread.tabs.find((tab) => tab.active) || thread.tabs[0]).url;
  const target = await findWindowWithThread(thread) ||
    await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] }).catch(() => null);

  if (!target) {
    const created = await chrome.windows.create({ url: thread.tabs.map((tab) => tab.url), focused: true });
    return { windowId: created.id, url: activeUrl };
  }

  const openUrls = new Set(target.tabs.map((tab) => pageAddress(tab.url)));
  for (const tab of thread.tabs) {
    if (openUrls.has(pageAddress(tab.url))) continue;
    await chrome.tabs.create({ windowId: target.id, url: tab.url, active: false });
    openUrls.add(pageAddress(tab.url));
  }
  return { windowId: target.id, url: activeUrl };
}

// Go to one page: switch to it if it is open in any window, otherwise open it
// in the given window (or a new window if that one is gone).
async function goToPage(url, windowId) {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const sameWindowFirst = [...windows].sort((a, b) => (b.id === windowId) - (a.id === windowId));
  for (const win of sameWindowFirst) {
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

// Bring back a list of tabs and go straight to the one you were on ("Reopen all").
async function reopenAndGo(tabs) {
  const place = await bringBackTabs({ tabs });
  await goToPage(place.url, place.windowId);
}

// Messages from the popup. The background does this work because the popup
// closes as soon as Chrome switches tabs or windows.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const fail = (error) => console.error('Griot could not bring the tabs back', error);
  if (message.type === 'pick-up') {
    getThreads()
      .then((threads) => threads.find((thread) => thread.id === message.threadId))
      .then(async (thread) => {
        if (!thread) return null;
        const place = await bringBackTabs(thread);
        // You're back on this thread, so it leaves the home screen. Park again when you leave.
        await updateThread(thread.id, { status: 'picked-up', pickedUpAt: Date.now() });
        return place;
      })
      .then(reply)
      .catch((error) => { fail(error); reply(null); });
    return true; // the reply comes later
  }
  if (message.type === 'reopen-tabs') reopenAndGo(message.tabs).catch(fail);
  if (message.type === 'go-to') goToPage(message.url, message.windowId).catch(fail);
  if (message.type === 'clear-label') queueSave(clearTabLabel);
  return false;
});

// The Alt+Shift+P shortcut opens Griot on the park card. If Chrome won't open the
// popup from a shortcut, the park card is waiting the next time you click the icon.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'park-thread') return;
  await setPopupRequest('park');
  chrome.action.openPopup().catch(() => {});
});

// ---------- Welcome back ----------

// How long without using the computer before Chrome calls you idle, in seconds.
const IDLE_AFTER_SECONDS = 60;
// Being away from a window this long or longer gets a welcome back card.
const WELCOME_AFTER_MINUTES = 10;
// Only pages from this long before the break count towards the guess.
const GUESS_WINDOW_MS = 3 * 60 * 60 * 1000;

chrome.idle.setDetectionInterval(IDLE_AFTER_SECONDS);

// Griot keeps, for each Chrome window, the time you left it: { windowId: time }.
// You leave a window when you switch to another window or another app,
// or when the computer goes idle while that window is in front.
async function getLeftWindows() {
  const { leftWindows } = await chrome.storage.local.get({ leftWindows: {} });
  return leftWindows;
}

// Remember that you left a window at a time (keeping the earlier time if already gone).
async function rememberLeft(windowId, time) {
  const leftWindows = await getLeftWindows();
  leftWindows[windowId] = Math.min(leftWindows[windowId] || Infinity, time);
  await chrome.storage.local.set({ leftWindows });
}

// You are back in a window. If you were away from it long enough, build the
// welcome back card from its trail. It waits in Griot's popup (the icon gets a dot).
async function cameBackTo(windowId) {
  const leftWindows = await getLeftWindows();
  const leftAt = leftWindows[windowId];
  if (leftAt === undefined) return;
  delete leftWindows[windowId];
  await chrome.storage.local.set({ leftWindows });

  const awayMinutes = Math.round((Date.now() - leftAt) / 60000);
  if (awayMinutes < WELCOME_AFTER_MINUTES) return;

  const settings = await getSettings();
  if (isPaused(settings) || !settings.welcomeBack) return;

  // If you parked a thread, welcome back is about that thread: your own note comes first.
  const parked = (await getThreads())
    .filter((thread) => thread.status === 'parked' && thread.parkedAt <= Date.now())
    .sort((a, b) => b.parkedAt - a.parkedAt)[0];

  // Otherwise it is built from the pages you visited before you left.
  const visits = (await getTrail(windowId))
    .filter((visit) => visit.time <= leftAt && visit.time >= leftAt - GUESS_WINDOW_MS);
  if (visits.length === 0 && !parked) return;

  const guess = guessFromTrail(visits);
  await setWelcome({ ...guess, threadId: parked ? parked.id : null, windowId, awayMinutes, returnedAt: Date.now(), shown: false });
  const leftUrl = parked
    ? (parked.tabs.find((tab) => tab.active) || parked.tabs[0]).url
    : guess.stoppedAt.url;
  if (settings.labelTab) await labelLeftTab(windowId, leftUrl);
  if (settings.welcomeChime) playChime(); // not awaited, so recording visits never waits for the sound
}

// ---------- Chime and tab label ----------

// Play the welcome back chime. A background script can't play sound, so Griot opens
// a hidden page (offscreen/offscreen.html) just long enough to play it.
async function playChime() {
  try {
    const open = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (open.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play a short chime when you come back to a window.'
      });
    }
    await chrome.runtime.sendMessage({ type: 'play-chime' });
    await chrome.offscreen.closeDocument();
  } catch (error) {
    console.warn('Griot could not play the chime', error);
  }
}

// Put the tab you left into a small ochre tab group called "You were here",
// so you can spot it in the tab bar. Only if it isn't the tab you're on and isn't
// already in one of your own groups. The label goes away when you open that tab.
async function labelLeftTab(windowId, url) {
  await clearTabLabel();
  const tabs = await chrome.tabs.query({ windowId }).catch(() => []);
  const tab = tabs.find((open) => pageAddress(open.url) === pageAddress(url));
  if (!tab || tab.active || tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) return;
  try {
    const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(groupId, { title: 'You were here', color: 'orange', collapsed: false });
    await chrome.storage.local.set({ labelledTab: tab.id });
  } catch (error) {
    console.warn('Griot could not label the tab', error);
  }
}

// Take the "You were here" label off again.
async function clearTabLabel() {
  const { labelledTab } = await chrome.storage.local.get({ labelledTab: null });
  if (labelledTab === null) return;
  await chrome.storage.local.set({ labelledTab: null });
  await chrome.tabs.ungroup(labelledTab).catch(() => {});
}

// Opening the labelled tab removes its label.
chrome.tabs.onActivated.addListener(({ tabId }) => queueSave(async () => {
  const { labelledTab } = await chrome.storage.local.get({ labelledTab: null });
  if (labelledTab === tabId) await clearTabLabel();
}));

// You moved between windows, or between Chrome and another app.
// The window you left gets a "left at" time; the window you came to is checked.
async function focusChanged(newWindowId) {
  const { focusedWindow } = await chrome.storage.local.get({ focusedWindow: null });
  const now = Date.now();
  if (focusedWindow !== null && focusedWindow !== newWindowId) await rememberLeft(focusedWindow, now);

  const inChrome = newWindowId !== chrome.windows.WINDOW_ID_NONE;
  await chrome.storage.local.set({ focusedWindow: inChrome ? newWindowId : null });
  if (inChrome) await cameBackTo(newWindowId);
}

// The computer went idle or locked, or you came back to it.
async function idleChanged(state) {
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  if (!win || !win.focused) return; // Chrome was not in front, so focus changes cover it
  if (state === 'active') return cameBackTo(win.id);
  // Chrome says "idle" a minute after your last move, so the break started a minute earlier.
  const time = Date.now() - (state === 'idle' ? IDLE_AFTER_SECONDS * 1000 : 0);
  return rememberLeft(win.id, time);
}

chrome.windows.onFocusChanged.addListener((windowId) => {
  queueSave(() => focusChanged(windowId));
}, { windowTypes: ['normal'] });

chrome.idle.onStateChanged.addListener((state) => {
  queueSave(() => idleChanged(state));
});

// A closed window can't be come back to, so forget when you left it.
chrome.windows.onRemoved.addListener((windowId) => queueSave(async () => {
  const leftWindows = await getLeftWindows();
  delete leftWindows[windowId];
  await chrome.storage.local.set({ leftWindows });
}));

// ---------- Offer to park a window you close ----------

// A window needs this many web pages for Griot to offer to park it after it closes.
const LEAVE_PROMPT_MIN_TABS = 3;
// Never ask about the same window more than once in this time.
const LEAVE_PROMPT_GAP_MS = 60 * 60 * 1000;

// Keep a copy of a window's tabs, because once a window is closed its tabs are gone.
// The copy lives in session storage, which Chrome empties when it quits.
async function rememberWindowTabs(windowId) {
  if (windowId === undefined || windowId === chrome.windows.WINDOW_ID_NONE) return;
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({ windowId }).catch(() => []);
  const webTabs = tabs.filter((tab) => isWebPage(tab.url) && !isBlockedSite(tab.url, settings)).map((tab) => ({
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

// A window closed: if it had enough pages, keep it so Griot's home can offer to park it.
async function offerToParkClosedWindow(windowId) {
  const { windowTabs = {}, promptedAt = {} } = await chrome.storage.session.get(['windowTabs', 'promptedAt']);
  const tabs = windowTabs[windowId] || [];
  delete windowTabs[windowId];
  await chrome.storage.session.set({ windowTabs });

  const settings = await getSettings();
  if (isPaused(settings) || !settings.closedWindowPrompt) return;
  if (tabs.length < LEAVE_PROMPT_MIN_TABS) return;
  if (Date.now() - (promptedAt[windowId] || 0) < LEAVE_PROMPT_GAP_MS) return;
  if (await alreadyParked(tabs)) return;

  promptedAt[windowId] = Date.now();
  await chrome.storage.session.set({ promptedAt });
  await setClosedWindow({ windowId, tabs, closedAt: Date.now() });
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

// Show the dot on Griot's icon again after Chrome starts, if something is waiting.
chrome.runtime.onStartup.addListener(() => updateBadge());
chrome.runtime.onInstalled.addListener(() => updateBadge());
