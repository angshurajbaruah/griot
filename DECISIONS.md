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
- 2026-10-28: Added the `favicon` permission (owner approved) so site icons come from Chrome's local favicon store. Showing them makes no network request, which keeps the privacy rule; it replaces the first-letter chips.
- 2026-10-28: Tab titles drop notification counts like "(176)" before they are shown, drafted from or saved. The counts are noise, change every minute and would make two copies of one page look different.
- 2026-10-28: Milestone 2 adds the `storage` permission, the first time Griot saves anything.
- 2026-10-28: Left the "Close these tabs after parking" checkbox off the park card for now. Closing tabs before "Pick up" exists (milestone 3) could lose them; revisit once threads can be reopened.
- 2026-10-28: The park card's eyebrow says "This window" when you park by hand. "Away for 10 minutes" from the design only fits an idle prompt (milestone 5).
- 2026-10-28: The draft note uses words repeated across tab titles ("Looking into Clay and Apollo."), or the current tab's name if nothing repeats. Simple, explainable, and always labelled as Griot's guess.
