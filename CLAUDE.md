# Griot

Griot is a Chrome extension that remembers the context behind your tabs. When you step away from a task, it asks one question ("Where were you headed?") and saves your answer with the task's tabs. When you come back, a resume card gives you your note, your next step, the trail of pages you visited, and one click to reopen everything.

Tagline: **Your context lives on.**

This is an open-source portfolio project. The goal is a small, polished, working product that shows good product judgment. It is not a startup, so there's no accounts, payments, analytics service or backend.

## Who you are working with

The owner, Anshuraj, is a product and growth person, **not a software engineer**. Work like this:

- Do one milestone at a time. Before writing code, explain the plan in a few plain sentences and list the files you will create or change.
- After each change, say in plain language what you built, then give exact steps to test it in Chrome.
- Keep the code simple enough for a non-developer to read. Prefer clear names and short functions with a one-line comment on what each does. No clever tricks.
- If something is ambiguous, ask one short question rather than guessing.
- Never add a feature that the current milestone does not ask for. Suggest it at the end instead.
- Keep `DECISIONS.md` updated: one dated line per product or technical decision, with the reason.

## Product rules (do not break these)

- **Vocabulary:** a task is a **thread** (never "session" or "workspace"). You **park** a thread and **pick it up** later. The pages visited are the **trail** (never "history"). The planned step is **Next**.
- **The user's words come first.** A note the user wrote always shows above anything Griot inferred. Anything Griot drafts or guesses is labelled "Griot's guess" until the user edits or accepts it.
- **Privacy:** everything stays on the device. Store data only with `chrome.storage.local`. No network requests, no remote fonts, no analytics, no external APIs.
- **Permissions:** only `tabs`, `tabGroups`, `storage`, `idle` and `favicon` (site icons from Chrome's local cache). No `host_permissions`, no content scripts, no reading page content. Ask before adding any other permission.
- **Not in scope:** search, accounts, sync, AI or LLM calls, page summaries, mobile, other browsers.

## Tech

- Chrome Manifest V3. Plain HTML, CSS and JavaScript. **No build step, no frameworks, no npm packages.** The folder must load directly with Chrome's "Load unpacked".
- Structure:

```
manifest.json
background.js        service worker: watches tabs, windows and idle state, saves trail events
popup/
  popup.html         the popup (380px wide, max 600px tall)
  popup.css          uses the design tokens below as CSS variables
  popup.js           renders screens: home, park card, thread detail, settings
lib/
  storage.js         read and write threads and trail events in chrome.storage.local
  threads.js         grouping tabs into threads, drafting a note from tab titles
fonts/               bundled font files (never load fonts from the internet)
assets/icons/        icon16.png, icon32.png, icon48.png, icon128.png
assets/brand/        logo, wordmark and border pattern SVGs
DECISIONS.md
README.md
```

- Data shape (keep it this simple until a milestone needs more):

```js
// one thread
{ id, title, note, noteIsGuess, next, tabs: [{ url, title, favIconUrl }],
  trail: [{ url, title, time }], parkedAt, status: "parked" | "done" }
```

## Design

**Match the screen designs in `design/`.** They are the source of truth for layout, spacing and copy:

| Screen | Image | HTML with exact styles | Milestone |
| --- | --- | --- | --- |
| First run | `design/screens/1-first-run.png` | `design/html/1-first-run.html` | 1 |
| Park card | `design/screens/2-park-card.png` | `design/html/2-park-card.html` | 2 |
| Home | `design/screens/3-home.png` | `design/html/3-home.html` | 3 |
| Thread detail and trail | `design/screens/4-thread-detail.png` | `design/html/4-thread-detail.html` | 4 |
| Privacy and settings | `design/screens/5-privacy-settings.png` | `design/html/5-privacy-settings.html` | 6 |
| Welcome back | `design/screens/6-welcome-back.png` | `design/html/6-welcome-back.html` | 5 |

Open the HTML file to copy exact colours, sizes and spacing; the sample text in it (Apollo, Clay, Product X) is placeholder data, so render real threads instead. The images were exported with fallback fonts, so the headings will look different once BackOut is bundled. The designs live on the owner's Griot popup UI canvas and brand book (https://claude.ai/artifact/4Nfaax6762ro7ZZ2LQWZKz and https://claude.ai/artifact/TGZpskDccYW93gADREAkES); the files in `design/` are copies of them.

```css
:root {
  --paper: #F4EBDD;          /* popup background */
  --surface-raised: #FBF6EE; /* cards, inputs */
  --sand-stone: #E8D7B7;     /* wells, trail panel */
  --ink: #3E2A1C;            /* main text */
  --ink-muted: #6B5442;      /* timestamps, helper text, guesses */
  --hairline: #D9C7A7;       /* dividers, card outlines */
  --line-strong: #8C765A;    /* input and secondary button borders */
  --action: #3E2A1C;         /* primary buttons, links, focus ring (earth brown) */
  --on-action: #FBF6EE;      /* text on primary buttons */
  --ochre: #C89B3C;          /* the dot that marks where you left off */
  --ochre-ink: #7A5A12;      /* the "Next:" label */
  --ochre-soft: #F1E0B8;     /* background of the Next line */
  --terracotta: #A64F2E;     /* small accents, link hover */
  --forest: #2F4A3A;         /* done / saved states, always with a word */
  --danger: #8E2F1C;         /* delete actions, always with a word */
}
```

- **No blue anywhere.** Primary buttons are earth brown (`--action`) with `--on-action` text. One primary button per screen.
- **Fonts:** BackOut (Velvetyne, open licence) for screen titles and small uppercase eyebrow labels. Source Serif 4 for the user's notes (italic) and reading text. Instrument Sans for buttons, labels and captions. Bundle the font files in `fonts/` with `@font-face`. Until a font file is added, fall back to `Georgia, serif` and `system-ui, sans-serif`.
- **Sizes:** spacing in 4px steps (card padding 16px), corner radius 12px for cards, 8px for buttons and inputs, 4px for chips. Buttons at least 36px tall.
- **Header:** a 14px strip of `assets/brand/border-triangles.svg` repeated along the top edge, then the wordmark at 18px tall and a settings button.
- **Accessibility:** real `<button>`, `<a>`, `<input>` and `<label>` elements, a visible 2px `--action` focus ring, `aria-label` on icon-only buttons, text contrast of at least 4.5:1.
- Copy is short and plain, sentence case, no exclamation marks, no emoji. Reuse these lines: "Pick up where you left off", "Where were you headed?", "Park thread", "Not now", "Everything stays on this device."

## Milestones

Build these in order. Each one should end with something that works in Chrome.

1. **Hello Griot.** `manifest.json` with the icons, a popup with the header, and a list of the open tabs grouped by window. No saving yet.
2. **Park a thread.** A "Park the thread I'm on" button opens the park card for the current window: favicons, a note box pre-filled with a simple draft from the tab titles (marked "Griot's guess"), an optional Next field, "Park thread" and "Not now". Parking saves the thread to `chrome.storage.local`.
3. **Home and pick up.** The home screen lists parked threads, newest first, as cards with the note, the Next line and "3 tabs · yesterday, 6:42 pm". "Pick up" reopens that thread's tabs in a new window.
4. **Trail.** The background script records the pages visited in each window (title, link, time; never page content). The thread detail screen shows the trail newest at the bottom, with the last page marked "You stopped here". Add "Mark done" and "Delete". Test it with the journey in "Test scenario" below: Griot must be able to rebuild that story from titles and links alone.
5. **Welcome back and prompts.**
   - **Welcome back card (most important).** Most breaks start without warning, so nobody is there to answer a park prompt. When Chrome goes from idle back to active after 10 minutes or more, show a resume card for the window the user was in, even if nothing was parked: "Welcome back. You were away for 25 minutes." Then a guessed note built from the trail (labelled "Griot's guess"), the last page as "You stopped here", a guessed Next step, and three actions: go to the last relevant page, "Reopen all", and "That's not it" (lets the user correct the guess in one tap). Deliver it as a Chrome notification that opens the popup on the welcome back screen, and also show it the next time the popup opens.
   - **Park shortcut.** Alt+Shift+P opens the park card, for planned breaks.
   - **Leave prompts.** Offer to park when a window with 3 or more tabs is closed. Never ask more than once per window per hour.
   - **Simple guessing rules, no AI.** Topic = words repeated across page titles. A page title with "vs" or "comparison" plus two product sites = "Comparing X and Y". A tutorial or "how to" page for one product watched after a comparison = Next guess "Sign up for X?". Last page before going idle = "You stopped here". Always label these as guesses.
6. **Privacy and settings.** Pause Griot, turn each prompt on or off, list sites never to record (banking and health on by default), and "Delete all threads and trails".

After milestone 6: a README with screenshots, a privacy page, and a short demo video for the Chrome Web Store.

## Test scenario

Use this real journey to test milestones 4 and 5. In one window the user:

1. Reads an article, follows a link to a second article.
2. Opens a "Product X vs Product Y" comparison page.
3. Opens Product X's site and Product Y's site in separate tabs.
4. Pastes both links into ChatGPT and asks for a summary.
5. Watches a YouTube tutorial: "How to get started with Product X".
6. Goes on a break without parking anything, and comes back 25 minutes later to the ChatGPT tab, having forgotten what they were doing. They had planned to sign up for Product X next.

Griot passes if the welcome back card shows something close to: "Griot's guess: comparing Product X and Product Y", "You stopped here: How to get started with Product X", "Next (guess): sign up for Product X?", with a button that goes straight to Product X's site. Griot cannot know what ChatGPT said or why the user preferred X; only the user's own note can capture that, and that is expected.

## How the owner tests a change

1. Download the latest code from GitHub (Code → Download ZIP) and unzip it, or pull the branch.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the folder. After later changes, click the reload arrow on the Griot card.
3. Click the Griot icon in the toolbar (pin it from the puzzle-piece menu).
4. If something breaks, right-click the popup → **Inspect** → copy the red error text from the Console, and paste it here.
