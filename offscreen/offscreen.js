// Plays the welcome back chime when Griot's background script asks for it.
// The background script cannot play sound itself, so it opens this hidden page for a moment.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type !== 'play-chime') return false;
  playSound('welcome');
  setTimeout(() => reply(true), 1800); // wait until the chime has finished
  return true;
});
