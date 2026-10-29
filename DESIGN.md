# FlowNarrate design notes

> Drafted by Claude from the live site during antislop audit 001 (Oct 2026). Each reason below is read from what the site already does, not a new direction. Simone: confirm, edit or delete any line that doesn't match your intent.

Dial: ENERGY 1 / RHYTHM 2 / MOTION 1

Reading: a practitioner's blog and free-tool site for Power Platform builders and the people who inherit their flows. Calm and readable, with one recurring motif borrowed from the tool its readers live in.

## Identity motif: the Power Automate run screen

The site speaks the language of a flow's run history: "Run summary", "Succeeded", "Waiting on you", status dots, step labels. Readers recognise it immediately, and it says what the site is for: explaining what a flow did and why.

## Colour

- **Palette:** the "Run status" variables at the top of each page (`--paper`, `--ink`, `--ink-soft`, `--rule`, `--succeeded`, `--ok`, `--warning`, `--failed`). Use the variables, never raw hex, so light and dark mode both work.
- **One accent:** `--succeeded` (plum in light, pink in dark) marks links, labels and the one emphasised word in a heading. `--ok`, `--warning` and `--failed` only appear where they carry a status meaning.
- **Code blocks** stay dark in both themes (`--code-bg`, `--code-ink`, `--code-ok`), like a code editor. Highlights inside them use `--code-ok`, not `--ok`.

## Typography

- **Source Serif 4** for reading text: posts are long-form explanations, and a serif keeps long paragraphs comfortable.
- **JetBrains Mono** for interface labels, metadata and code: it echoes the flow designer and expressions, and separates "what the system shows" from "what the narrator says".
- **Uppercase, lightly spaced mono labels** (nav, kickers, post formats, run-summary headers, diagram titles) copy the small-caps status labels in Power Automate's run history. Tracking stays between 0.05em and 0.08em, and labels stay short.

## Diagrams

- **Graph-paper background** (`.flowchart`) is the diagram canvas only, never a page background. It echoes the flow designer's canvas and helps the eye line up boxes and connectors.
- Diagram strokes and text use theme variables (`.fc-node`, `.fc-arrow`, `.fc-ok`, `.fc-warn`) so they stay visible in dark mode.

## Callouts

- The **left stripe** on `.callout` marks a narrator's aside: a note outside the main step-by-step. Plum by default, `--warning` when it asks the reader to stop and think first.
- On `.recreation` blocks the stripe colour is a status (red failed, green ok), never decoration.

## Layout

- Lists and rules rather than card grids on the homepage: posts read like a run log, newest first.
- Each homepage section uses a different composition (run summary, post list, format grid, tool list, about with credentials).
- No arrows on links or buttons. An arrow only appears where it shows a real path, such as a menu path or connector to action ("Office 365 Users → Get manager").
- The one exception is the "← Back to FlowNarrate" link at the end of posts and pages: the arrow says "back", which is its job.
- The "More free tools" grid and `tools.html` use identical cards on purpose: the tools are peers, and none of them outranks another.
- Tool pages open with one plain line ("Free · runs entirely in your browser") and no status dot. A dot only appears where it marks a real state, as in the homepage run summary.

## Motion and controls

- Motion: hover colour changes and a short theme fade only, switched off under `prefers-reduced-motion`.
- Every control is at least 44px tall, and keyboard focus is a visible plum outline.
- On phones the menu button shows the word "Menu" next to the icon, and sections use 48px of vertical padding instead of 72px.

## Video page

- `video.html` uses the browser's own player with no autoplay or loop, the captions burned into the picture (no separate captions file, so nobody sees them twice), and the transcript (audio description marked in text) open by default under the player.
- It uses the page palette only. No motion beyond the player's own controls.

## Temporary: Halloween 2026

- The home page swaps the plum accent for orange from `halloween.css`, and shows a small ghost with "Haunted by unexplained flows" under the hero text. Contrast was checked: `#A83F00` on the light backgrounds (5.3 to 6.2:1) and `#FF9A3C` on the dark ones (8.1 to 8.7:1).
- The override is on the home page only. The two hex values are an intentional exception to "use the variables", because they exist only for this event.
- It is static (no motion) and switches itself off from 2 November 2026. Removal steps are in the Halloween comment in `index.html`.
