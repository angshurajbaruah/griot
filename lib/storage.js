// Read and write threads and trails in chrome.storage.local. Nothing leaves this device.

// How many visits to keep for each window.
const MAX_TRAIL_LENGTH = 200;

// Get every saved thread (an empty list if there are none yet).
async function getThreads() {
  const saved = await chrome.storage.local.get({ threads: [] });
  return saved.threads;
}

// Add one thread to the saved list.
async function saveThread(thread) {
  const threads = await getThreads();
  threads.push(thread);
  await chrome.storage.local.set({ threads });
}

// Change some fields of one saved thread, like { status: 'done' }.
async function updateThread(id, changes) {
  const threads = await getThreads();
  const updated = threads.map((thread) => (thread.id === id ? { ...thread, ...changes } : thread));
  await chrome.storage.local.set({ threads: updated });
}

// Remove one thread for good.
async function deleteThread(id) {
  const threads = await getThreads();
  await chrome.storage.local.set({ threads: threads.filter((thread) => thread.id !== id) });
}

// Get the trails of every window, as { windowId: [visits] }.
async function getAllTrails() {
  const saved = await chrome.storage.local.get({ trails: {} });
  return saved.trails;
}

// Get the trail of one window: a list of { url, title, time }, oldest first.
async function getTrail(windowId) {
  const trails = await getAllTrails();
  return trails[windowId] || [];
}

// Record a visit in a window's trail. If it is the same page as the last visit,
// only its title is updated (pages often set their title after loading).
async function addVisit(windowId, visit) {
  const trails = await getAllTrails();
  const trail = trails[windowId] || [];
  const last = trail[trail.length - 1];

  if (last && last.url === visit.url) {
    last.title = visit.title || last.title;
  } else {
    trail.push(visit);
  }
  trails[windowId] = trail.slice(-MAX_TRAIL_LENGTH);
  await chrome.storage.local.set({ trails });
}

// Forget every window's trail.
async function clearTrails() {
  await chrome.storage.local.set({ trails: {} });
}

// ---------- Welcome back and prompts ----------

// The waiting welcome back card, or null. It is built by the background script
// when you come back after a break, and forgotten after 12 hours.
async function getWelcome() {
  const { welcome } = await chrome.storage.local.get({ welcome: null });
  if (welcome && Date.now() - welcome.returnedAt > 12 * 60 * 60 * 1000) return null;
  return welcome;
}

// Save the welcome back card (or null to forget it).
async function setWelcome(welcome) {
  await chrome.storage.local.set({ welcome });
  await updateBadge();
}

// What the popup should open on next time: 'park', 'park-closed', 'welcome',
// or { screen: 'here', threadId } after Pick up.
// Set by the background script just before it opens the popup.
async function getPopupRequest() {
  const { popupRequest } = await chrome.storage.local.get({ popupRequest: null });
  return popupRequest;
}

// Set (or clear, with null) what the popup should open on next time.
async function setPopupRequest(popupRequest) {
  await chrome.storage.local.set({ popupRequest });
}

// How long Griot offers to park a window you closed.
const CLOSED_WINDOW_OFFER_MS = 60 * 60 * 1000;

// The window you just closed, kept so you can park it: { windowId, tabs, closedAt },
// or null. The offer lasts an hour.
async function getClosedWindow() {
  const { closedWindow } = await chrome.storage.local.get({ closedWindow: null });
  if (closedWindow && Date.now() - closedWindow.closedAt > CLOSED_WINDOW_OFFER_MS) return null;
  return closedWindow;
}

// Save (or clear, with null) the window you just closed.
async function setClosedWindow(closedWindow) {
  await chrome.storage.local.set({ closedWindow });
  await updateBadge();
}

// Show on Griot's icon that something is waiting inside: how long you were away
// ("25m", "2h") for a welcome back card you have not seen, or a dot for a closed window.
async function updateBadge() {
  const welcome = await getWelcome();
  let text = '';
  if (welcome && !welcome.shown) {
    text = welcome.awayMinutes < 60 ? `${welcome.awayMinutes}m` : `${Math.floor(welcome.awayMinutes / 60)}h`;
  } else if (await getClosedWindow()) {
    text = '•';
  }
  await chrome.action.setBadgeBackgroundColor({ color: '#C89B3C' });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#3E2A1C' });
  await chrome.action.setBadgeText({ text });
}

// ---------- Settings ----------

// Griot's settings, with these values until you change them.
const DEFAULT_SETTINGS = {
  welcomeBack: true,        // show welcome back after 10 minutes away from a window
  closedWindowPrompt: true, // offer to park a window you close
  pausedUntil: 0,           // while now is before this time, Griot records and offers nothing
  welcomeChime: true,       // play a soft chime when you come back to a window
  labelTab: true,           // label the tab you left as "You were here" in the tab bar
  soundEffects: true,       // small sounds when you park, pick up, finish or delete
  blockedSites: []          // your own "never track" sites, like "web.whatsapp.com"
};

// Read the settings.
async function getSettings() {
  const { settings } = await chrome.storage.local.get({ settings: {} });
  return { ...DEFAULT_SETTINGS, ...settings };
}

// Change some settings, like { welcomeBack: false }.
async function updateSettings(changes) {
  const settings = { ...(await getSettings()), ...changes };
  await chrome.storage.local.set({ settings });
  return settings;
}

// Remove every visit to a site from all trails (used when you block a site).
async function removeSiteFromTrails(settings) {
  const trails = await getAllTrails();
  Object.keys(trails).forEach((windowId) => {
    trails[windowId] = trails[windowId].filter((visit) => !isBlockedSite(visit.url, settings));
  });
  await chrome.storage.local.set({ trails });
}

// Delete every thread, trail and waiting card. Settings are kept.
async function deleteEverything() {
  await chrome.storage.local.set({
    threads: [], trails: {}, welcome: null, closedWindow: null, popupRequest: null, leftWindows: {}
  });
  chrome.runtime.sendMessage({ type: 'clear-label' }).catch(() => {});
  await chrome.storage.session.clear();
  await updateBadge();
}
