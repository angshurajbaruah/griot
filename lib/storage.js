// Read and write threads in chrome.storage.local. Nothing leaves this device.

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
