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
}

// What the popup should open on next time: 'park', 'park-closed' or 'welcome'.
// Set by the keyboard shortcut and by clicking a notification.
async function getPopupRequest() {
  const { popupRequest } = await chrome.storage.local.get({ popupRequest: null });
  return popupRequest;
}

// Set (or clear, with null) what the popup should open on next time.
async function setPopupRequest(popupRequest) {
  await chrome.storage.local.set({ popupRequest });
}

// The window you just closed, kept so you can park it: { windowId, tabs, closedAt }.
async function getClosedWindow() {
  const { closedWindow } = await chrome.storage.local.get({ closedWindow: null });
  return closedWindow;
}

// Save (or clear, with null) the window you just closed.
async function setClosedWindow(closedWindow) {
  await chrome.storage.local.set({ closedWindow });
}
