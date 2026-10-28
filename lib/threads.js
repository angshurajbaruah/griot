// Helpers for turning open tabs into a thread: clean titles and a drafted note.

// Short words that say nothing about the topic, ignored when drafting a note.
const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'are', 'how', 'what', 'why', 'from',
  'this', 'that', 'into', 'about', 'new', 'tab', 'home', 'page', 'free', 'best',
  'all', 'can', 'our', 'get', 'use', 'using', 'more', 'not', 'its', 'has', 'was'
]);

// Remove notification counts from a tab title: "(176) YouTube" becomes "YouTube",
// "Inbox (176) - Gmail" becomes "Inbox - Gmail".
function cleanTitle(title) {
  return (title || '')
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(/^([A-Za-z]+) \(\d+\+?\)(?=\s[-|–—]|$)/, '$1')
    .trim();
}

// Keep only the page's own name, dropping the site name after " - " or " | ".
// "Pricing | Clay" becomes "Pricing".
function shortTitle(title) {
  return cleanTitle(title).split(/\s[-|–—]\s/)[0].trim();
}

// The words in a tab's own site address, like "youtube" for www.youtube.com
// or "mail" and "google" for mail.google.com. These name the site, not the topic.
function siteWords(url) {
  try {
    const parts = new URL(url).hostname.toLowerCase().split('.');
    return new Set(parts.slice(0, -1).filter((part) => part !== 'www'));
  } catch {
    return new Set();
  }
}

// Find words that appear in two or more different tab titles, most common first.
// Skips common words, plain numbers and each tab's own site name.
function repeatedWords(tabs) {
  const counts = new Map();
  tabs.forEach((tab) => {
    const words = cleanTitle(tab.title).match(/[\p{L}\p{N}]+/gu) || [];
    const ownSite = siteWords(tab.url);
    const seenInThisTab = new Set();
    words.forEach((word) => {
      const key = word.toLowerCase();
      if (key.length < 3 || /^\d+$/.test(key)) return;
      if (COMMON_WORDS.has(key) || ownSite.has(key) || seenInThisTab.has(key)) return;
      seenInThisTab.add(key);
      const entry = counts.get(key) || { word, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    });
  });
  return [...counts.values()]
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.word);
}

// The name of the tab you are on (or the first tab), without counts or site name.
function currentTabName(tabs, activeTab) {
  const tab = activeTab || tabs[0];
  return tab ? shortTitle(tab.title) : '';
}

// Make the first letter a capital: "pricing and clay" becomes "Pricing and clay".
function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Draft a thread title from the tabs: repeated words if there are any,
// otherwise the name of the tab you are on.
function draftTitle(tabs, activeTab) {
  const topic = repeatedWords(tabs).slice(0, 2);
  if (topic.length > 0) return capitalise(topic.join(' and '));
  return currentTabName(tabs, activeTab) || 'Untitled thread';
}

// Draft a one-line note for the park card. Always shown as "Griot's guess".
// With no clear topic across tabs, it is just the current tab's title.
function draftNote(tabs, activeTab) {
  const topic = repeatedWords(tabs).slice(0, 2);
  if (topic.length > 0) return `Looking into ${topic.join(' and ')}.`;
  return currentTabName(tabs, activeTab);
}

// Give the address of a site's icon from Chrome's own local favicon store,
// so showing it never contacts the website.
function faviconFor(pageUrl, size = 32) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl || '');
  url.searchParams.set('size', String(size));
  return url.toString();
}
