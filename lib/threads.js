// Helpers for turning open tabs into a thread: clean titles and a drafted note.

// Short words that say nothing about the topic, ignored when drafting a note.
const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'are', 'how', 'what', 'why', 'from',
  'this', 'that', 'into', 'about', 'new', 'tab', 'home', 'page', 'free', 'best',
  'all', 'can', 'our', 'get', 'use', 'using', 'more', 'not', 'its', 'has', 'was',
  'looking', 'reading'
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

// The meaningful words in a title, in lower case: no common words or plain numbers.
function titleWords(title) {
  const words = cleanTitle(title).match(/[\p{L}\p{N}]+/gu) || [];
  return words
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !COMMON_WORDS.has(word));
}

// Find the topic words: words found in at least a third of the tab titles
// (and always in at least two), most common first. A tab's own site name does not count.
function repeatedWords(tabs) {
  const counts = new Map();
  tabs.forEach((tab) => {
    const ownSite = siteWords(tab.url);
    const original = cleanTitle(tab.title).match(/[\p{L}\p{N}]+/gu) || [];
    new Set(titleWords(tab.title)).forEach((key) => {
      if (ownSite.has(key)) return;
      const word = original.find((w) => w.toLowerCase() === key) || key;
      const entry = counts.get(key) || { word, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    });
  });
  const needed = Math.max(2, Math.ceil(tabs.length / 3));
  return [...counts.values()]
    .filter((entry) => entry.count >= needed)
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.word);
}

// True if a tab's title shares a meaningful word with the note.
function sharesWordWithNote(tab, note) {
  const noteWords = new Set(titleWords(note));
  return titleWords(tab.title).some((word) => noteWords.has(word));
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
