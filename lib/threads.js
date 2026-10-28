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

// Find words that appear in two or more different tab titles, most common first.
function repeatedWords(tabs) {
  const counts = new Map();
  tabs.forEach((tab) => {
    const words = cleanTitle(tab.title).match(/[\p{L}\p{N}]+/gu) || [];
    const seenInThisTab = new Set();
    words.forEach((word) => {
      const key = word.toLowerCase();
      if (key.length < 3 || COMMON_WORDS.has(key) || seenInThisTab.has(key)) return;
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

// Draft a thread title from the tabs: repeated words if there are any,
// otherwise the name of the tab you are on.
function draftTitle(tabs, activeTab) {
  const topic = repeatedWords(tabs).slice(0, 2);
  if (topic.length === 2) return `${topic[0]} and ${topic[1]}`;
  if (topic.length === 1) return topic[0];
  return shortTitle(activeTab ? activeTab.title : tabs[0] && tabs[0].title) || 'Untitled thread';
}

// Draft a one-line note for the park card. Always shown as "Griot's guess".
function draftNote(tabs, activeTab) {
  const topic = repeatedWords(tabs).slice(0, 2);
  if (topic.length > 0) return `Looking into ${topic.join(' and ')}.`;
  const name = shortTitle(activeTab ? activeTab.title : '');
  return name ? `Reading ${name}.` : '';
}

// Give the address of a site's icon from Chrome's own local favicon store,
// so showing it never contacts the website.
function faviconFor(pageUrl, size = 32) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl || '');
  url.searchParams.set('size', String(size));
  return url.toString();
}
