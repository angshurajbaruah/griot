// Helpers for turning open tabs into a thread: clean titles and a drafted note.

// Short words that say nothing about the topic, ignored when drafting a note.
const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'are', 'how', 'what', 'why', 'from',
  'this', 'that', 'into', 'about', 'new', 'tab', 'home', 'page', 'free', 'best',
  'all', 'can', 'our', 'get', 'use', 'using', 'more', 'not', 'its', 'has', 'was',
  'looking', 'reading', 'search', 'results', 'images', 'live', 'watch', 'video', 'videos',
  'online', 'official', 'latest', 'today', 'login', 'sign', 'account', 'dashboard', 'settings', 'inbox'
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

// A link without its #section part, so the same page always matches.
function pageAddress(url) {
  return (url || '').split('#')[0];
}

// If a topic word is usually followed by the same word, keep both:
// "Product" becomes "Product X" when "Product X" shows up in enough tabs.
// The second word can be short (like "X"), but not a common word or the tab's site name.
function topicPhrase(word, tabs) {
  const key = word.toLowerCase();
  const needed = Math.max(2, Math.ceil(tabs.length / 3));
  const counts = new Map();
  tabs.forEach((tab) => {
    const ownSite = siteWords(tab.url);
    const words = cleanTitle(tab.title).match(/[\p{L}\p{N}]+/gu) || [];
    const followers = new Set();
    words.forEach((current, index) => {
      const next = words[index + 1];
      if (current.toLowerCase() !== key || !next) return;
      const nextKey = next.toLowerCase();
      if (COMMON_WORDS.has(nextKey) || ownSite.has(nextKey) || /^\d+$/.test(next)) return;
      followers.add(next);
    });
    followers.forEach((next) => counts.set(next, (counts.get(next) || 0) + 1));
  });
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= needed ? `${word} ${best[0]}` : word;
}

// The topic for a note or title. If the top word grows into a phrase ("Product X"),
// the phrase is the topic. Otherwise it is up to two repeated words ("Clay and pricing").
function draftTopic(tabs) {
  const words = repeatedWords(tabs);
  if (words.length === 0) return '';
  const phrase = topicPhrase(words[0], tabs);
  if (phrase !== words[0]) return phrase;
  return words.slice(0, 2).join(' and ');
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
  const topic = draftTopic(tabs);
  if (topic) return capitalise(topic);
  return currentTabName(tabs, activeTab) || 'Untitled thread';
}

// Draft a one-line note for the park card. Always shown as "Griot's guess".
// With no clear topic across tabs, it is just the current tab's title.
function draftNote(tabs, activeTab) {
  const topic = draftTopic(tabs);
  if (topic) return `Looking into ${topic}.`;
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

// ---------- Welcome back guesses (simple rules, no AI) ----------

// How long a break was, in words: "25 minutes", "1 hour", "2 hours 5 minutes".
function awayText(minutes) {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourText = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return rest === 0 ? hourText : `${hourText} ${rest} ${rest === 1 ? 'minute' : 'minutes'}`;
}

// Words that make a page look like a tutorial or a getting-started guide.
const TUTORIAL_PATTERN = /\b(how to|tutorial|get(?:ting)? started|guide|walkthrough|demo|beginners?)\b/i;

// Tidy a product name taken from a title: stop at punctuation, keep at most four words.
// "Product Y: which is better?" becomes "Product Y".
function productName(text) {
  const name = (text || '').split(/[:?!|,(–—]|\s-\s/)[0].trim();
  return name.split(/\s+/).slice(0, 4).join(' ');
}

// Find the two products in a comparison title, or null.
// Works for "X vs Y", "X versus Y", "Compare X and Y" and "X and Y comparison".
function comparedProducts(title) {
  const text = shortTitle(title);
  const patterns = [
    /^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i,
    /^compar\w*\s+(.+?)\s+(?:and|with|to)\s+(.+)$/i,
    /^(.+?)\s+(?:and|&)\s+(.+?)\s+comparison\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const first = productName(match[1]);
      const second = productName(match[2]);
      if (first && second && first.toLowerCase() !== second.toLowerCase()) return [first, second];
    }
  }
  return null;
}

// True if a page title mentions a product name as whole words.
function mentions(title, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(cleanTitle(title));
}

// The product's own site in the trail: a page whose title starts with the product name,
// or whose address contains it ("productx.com" for "Product X").
function productSiteVisit(pages, name, skip) {
  const squashed = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return pages.find((visit) => {
    if (skip.includes(visit)) return false;
    const host = (() => { try { return new URL(visit.url).hostname.toLowerCase(); } catch { return ''; } })();
    return shortTitle(visit.title).toLowerCase().startsWith(name.toLowerCase()) || host.includes(squashed);
  });
}

// Each page once, keeping its latest visit, oldest first.
function uniquePages(visits) {
  const latest = new Map();
  visits.forEach((visit) => {
    latest.delete(pageAddress(visit.url));
    latest.set(pageAddress(visit.url), visit);
  });
  return [...latest.values()];
}

// Build Griot's guesses for the welcome back card from a window's trail.
// Everything here comes from page titles and links, and is shown as a guess.
// Returns { compared, topic, stoppedAt, next, goTo, pages }.
function guessFromTrail(visits) {
  const pages = uniquePages(visits);
  const stoppedAt = visits[visits.length - 1] || null;
  const guess = { compared: null, topic: '', stoppedAt, next: '', goTo: null, pages };
  if (!stoppedAt) return guess;

  // A comparison page plus both products' own sites means "Comparing X and Y".
  const comparisonIndex = visits.findIndex((visit) => comparedProducts(visit.title));
  if (comparisonIndex !== -1) {
    const comparison = visits[comparisonIndex];
    const [first, second] = comparedProducts(comparison.title);
    const firstSite = productSiteVisit(pages, first, [comparison]);
    const secondSite = productSiteVisit(pages, second, [comparison, firstSite]);
    if (firstSite && secondSite) {
      guess.compared = [first, second];

      // A tutorial for one of them after the comparison suggests signing up for it next.
      const later = visits.slice(comparisonIndex + 1).reverse();
      const tutorial = later.find((visit) => TUTORIAL_PATTERN.test(visit.title) &&
        (mentions(visit.title, first) || mentions(visit.title, second)));
      if (tutorial) {
        const chosen = mentions(tutorial.title, first) ? first : second;
        guess.next = `Sign up for ${chosen}?`;
        guess.goTo = { name: chosen, visit: chosen === first ? firstSite : secondSite };
      }
    }
  }

  // Otherwise the topic is the words repeated across page titles.
  if (!guess.compared) guess.topic = confidentTopic(pages);
  return guess;
}

// The topic for the welcome back card, only when Griot is fairly sure. A two-word name
// shared across pages ("Product X", "Martin Ødegaard") wins. A single word counts only if
// it is in at least half the pages (and at least 3). Otherwise no guess is shown, because
// a wrong guess ("Looking into Live") is worse than none.
function confidentTopic(pages) {
  const words = repeatedWords(pages);
  const phrase = words.map((word) => topicPhrase(word, pages)).find((topic) => topic.includes(' '));
  if (phrase) return phrase;
  const word = words.find((candidate) => {
    const key = candidate.toLowerCase();
    const share = pages.filter((visit) => titleWords(visit.title).includes(key)).length;
    return pages.length >= 3 && share * 2 >= pages.length;
  });
  return word ? bestCasing(word, pages) : '';
}

// Use the way a word is written in a proper page title rather than in a search box:
// "mba" typed into Google becomes "MBA" if any page writes it that way.
function bestCasing(word, pages) {
  const key = word.toLowerCase();
  const spellings = pages.flatMap((visit) => cleanTitle(visit.title).match(/[\p{L}\p{N}]+/gu) || [])
    .filter((candidate) => candidate.toLowerCase() === key);
  return spellings.find((candidate) => candidate !== key) || word;
}

// ---------- Privacy ----------

// Banking and health sites are never tracked. A site counts if its address has one
// of these words in it, or is one of these well-known sites.
const SENSITIVE_WORDS = ['bank', 'banking', 'paypal', 'health', 'hospital', 'clinic', 'pharma', 'pharmacy',
  'medical', 'doctor', 'patient', 'insurance'];
const SENSITIVE_SITES = ['pay.google.com', 'paytm.com', 'phonepe.com', 'chase.com', 'wellsfargo.com', 'citi.com',
  'americanexpress.com', 'hdfc.com', 'icici.com', 'onlinesbi.sbi', 'sbi.co.in', 'kotak.com', 'practo.com',
  '1mg.com', 'netmeds.com', 'pharmeasy.in', 'webmd.com', 'mayoclinic.org', 'nhs.uk', 'mychart.com'];

// The site part of a link, like "web.whatsapp.com".
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// True if a site is the same as, or part of, another: "mail.google.com" is part of "google.com".
function sameSite(host, site) {
  return host === site || host.endsWith(`.${site}`);
}

// Tidy what someone typed as a site: "https://Web.WhatsApp.com/x" becomes "web.whatsapp.com".
function cleanSite(text) {
  const trimmed = (text || '').trim().toLowerCase();
  if (!trimmed) return '';
  return hostOf(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
}

// True if Griot must never track this page: a banking or health site, or one you added.
function isBlockedSite(url, settings) {
  const host = hostOf(url);
  if (!host) return false;
  if (SENSITIVE_SITES.some((site) => sameSite(host, site))) return true;
  if (SENSITIVE_WORDS.some((word) => host.includes(word))) return true;
  return (settings.blockedSites || []).some((site) => sameSite(host, site));
}

// True while Griot is paused.
function isPaused(settings) {
  return Date.now() < (settings.pausedUntil || 0);
}

// The time Griot wakes up after "Pause Griot for today": midnight tonight.
function endOfToday() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}
