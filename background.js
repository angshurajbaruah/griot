// Griot's background script: records the trail of pages visited in each window.
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
