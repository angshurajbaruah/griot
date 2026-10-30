# Griot

**Your context lives on.**

Griot notices when you come back to a window and shows you where you left off.

You know the moment. You step away for a call or lunch, come back to a wall of tabs, and have no idea what you were in the middle of. Other tools can save your tabs, but only if you remembered to save them before you left. Griot works when you didn't. It keeps a quiet trail of the pages you visit in each window, and when you return after a break it tells you where you stopped and takes you back in one click.

No saving, no account, no AI. Griot reads tab titles and links, never what's on the page, and nothing leaves your computer.

<p align="center">
  <img src="docs/griot-demo.gif" width="380" alt="Griot opening a thread, showing its trail of pages, then picking it up and showing You were here">
</p>

## What it does

**It notices you came back.** Leave a window for 10 minutes or more, for a meeting, a call, another app, and come back. Griot plays a soft chime, shows how long you were away on its icon (like "25m"), and puts a small orange "You were here" label on the tab you left if you came back somewhere else. You didn't have to do anything before you left.

**It shows where you stopped.** Griot opens a small window with the welcome back card (you can also click its icon any time). If you parked a thread before you left, the card shows that thread first: your note, your next step and a Pick up button. If you didn't, it shows the page you were on, the trail of pages that got you there, and Griot's guess at what you were doing ("comparing Product X and Product Y") and what comes next ("sign up for Product X?"). One button takes you straight there. If the guess is wrong, "That's not it" lets you say it in your own words.

**Want it to remember why? Park the thread.** For planned breaks, press "Park the thread I'm on" (or Option+Shift+P on a Mac, Alt+Shift+P on Windows) and add one line about where you were headed. Griot drafts that line from your tab titles, labelled as its guess, so keeping it is one tap. Tick the tabs that belong to the task and leave out the rest. Later, Pick up shows "You were here" with your note and next step while your tabs come back in the same window.

**Close a window by accident?** If it had three or more tabs, Griot offers to park it so nothing is lost.

## Screenshots

| Welcome back | Thread and trail | Home |
| :---: | :---: | :---: |
| <img src="docs/screenshots/4-welcome-back.png" width="250" alt="Welcome back card after 25 minutes away"> | <img src="docs/screenshots/3-thread-and-trail.png" width="250" alt="A thread with its trail of pages"> | <img src="docs/screenshots/1-home.png" width="250" alt="Home screen with a parked thread"> |
| **Park a thread** | **You were here** | **Privacy and settings** |
| <img src="docs/screenshots/2-park-card.png" width="250" alt="Park card with a note and tab checkboxes"> | <img src="docs/screenshots/5-you-were-here.png" width="250" alt="You were here card after picking up a thread"> | <img src="docs/screenshots/6-privacy-and-settings.png" width="250" alt="Privacy and settings screen"> |

The sites in these screenshots are made up for the demo.

## Install

Griot isn't in a store yet, so you load it yourself. It takes about two minutes. It's built for Chrome and should also load in other Chromium browsers like Edge and Brave.

1. Download `griot-0.7.0.zip` from the [latest release](../../releases/latest) and unzip it. You'll get a folder called `griot`.
2. Open `chrome://extensions` (or `edge://extensions` in Edge).
3. Turn on **Developer mode** in the top corner.
4. Click **Load unpacked** and choose the `griot` folder.
5. Pin Griot from the puzzle-piece menu so its icon is always in your toolbar.

To update later, replace the files in the same folder and click the reload arrow on Griot's card. Use the same folder each time: loading it from a new folder gives Griot a new identity and your saved threads won't show up.

## Privacy

Griot was designed so there is nothing to leak.

- **Stored on your device only**, in Chrome's local extension storage. No account, no server, no analytics, no network requests of any kind.
- **What it saves:** tab titles, web addresses, the times you visited them, and the notes you write.
- **What it never touches:** what's on a page, anything you type into a website, passwords, cookies or screenshots. It has no permission to read web pages at all.
- **Never tracked:** banking and health sites are skipped by default, and you can add your own sites in settings. Adding a site also removes its pages from your trails.
- **You're in control:** pause Griot for the day, switch each reminder on or off, or delete every thread and trail in one go.
- **Trails are short-lived:** they're cleared every time Chrome restarts.

## Permissions

| Permission | Why Griot needs it |
| --- | --- |
| `tabs` | To read the titles and addresses of your open tabs, and to reopen them when you pick up a thread. |
| `storage` | To save your threads, trails and settings on your computer. |
| `favicon` | To show each site's icon from Chrome's own saved copy, without contacting the site. |
| `idle` | To notice when you've stepped away from your computer while a window was in front. |
| `tabGroups` | To put the small "You were here" label on the tab you left. |
| `offscreen` | To play the welcome back chime. A hidden page opens for a second, plays the sound and closes. It can't see your tabs. |

There are no host permissions and no content scripts, so Griot can't run on or read any website.

## How the guesses work

There's no AI and nothing leaves your computer. Griot uses a few plain rules on page titles:

- A word or name that repeats across your tabs is probably the topic ("Looking into Product X").
- A "this vs that" page followed by both products' own sites means you were comparing them.
- A tutorial or "how to" page for one of them after that suggests signing up for it next.

Anything Griot guesses is labelled "Griot's guess", and your own words always come first. If a guess is wrong, "That's not it" lets you write the note yourself.

## Built with

Plain HTML, CSS and JavaScript on Chrome's Manifest V3. No frameworks, no build step and no npm packages, so the folder you download is the extension. Sounds are made by the browser's audio engine, so there are no audio files either.

```
manifest.json        the extension's settings and permissions
background.js        records the trail, notices when you leave and come back
popup/               the screens you see when you click the icon
lib/                 storage, the guessing rules and the sounds
offscreen/           the hidden page that plays the chime
docs/                screenshots for this page
```

Product decisions and the reasons behind them are logged in [DECISIONS.md](DECISIONS.md).

## About

Griot is an open-source portfolio project by Anshuraj Baruah. I built it to explore one question: what's the smallest thing a browser could remember that would let you pick up a task in under a minute? I designed it and made the product calls, and built it with Claude Code.

A griot is a West African storyteller and keeper of history. This one keeps the story of your tabs.

## License

[MIT](LICENSE)
