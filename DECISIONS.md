# Decisions

- 2026-10-27: Named the product Griot (was TabBack). A griot keeps a community's story and tells it back.
- 2026-10-27: Core feature is a one-tap park note when leaving a task, plus an automatic trail. Competitors only guess context after the fact.
- 2026-10-27: Chrome extension, plain HTML, CSS and JavaScript with no build step, so a non-developer can read and run it.
- 2026-10-27: Local-first. Data stays in chrome.storage.local, no network calls, no page content read.
- 2026-10-27: Brand: earth palette with no blue, BackOut for titles, hand-painted swirl mark.
- 2026-10-27: Milestone 1 asks only for the `tabs` permission, the one needed to read tab titles and links. The other approved ones (tabGroups, storage, idle) get added in the milestone that first uses them, so the install prompt stays as short as possible.
- 2026-10-27: The popup shows a favicon only when Chrome already holds it as an image (data:). Otherwise it shows the site's first letter, because loading a favicon link from the site would be a network request.
- 2026-10-27: Moved the icons to assets/icons/ and the brand SVGs to assets/brand/ to match the structure in CLAUDE.md.
- 2026-10-28: Added a welcome back card on return from idle. Most breaks start without warning, so a park prompt at leave time often has nobody to answer it.
