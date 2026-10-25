# FlowNarrate

Static site served by GitHub Pages at **https://www.flownarrate.com** (see `CNAME`). Plain hand-written HTML, no build step.

## Site rules

- Every absolute URL (canonical, `og:url`, `og:image`, JSON-LD, sitemap, `llms.txt`) uses `https://www.flownarrate.com`, never the bare domain.
- British spelling ("colour").
- Colours come from the CSS variables at the top of each page (the "Run status" palette: `--paper`, `--ink`, `--succeeded` for the plum accent, `--ok`, `--warning`). Use the variables, not hex values, so light and dark mode both work. Check text contrast is at least 4.5:1 in both modes.
- The reasons behind the look (motif, type, labels, diagrams, callouts, layout) are in `DESIGN.md`. Read it before changing how the site looks, and update it when a decision changes.
- Fonts are self-hosted in `assets/fonts/` (no Google Fonts), trimmed to the 400 to 600 weights the site uses. Every page's `<head>` has the same two font `preload` links and `@font-face` block, using root paths (`/assets/fonts/...`); copy them from an existing page. Font stacks include the metric-matched fallback, e.g. `'JetBrains Mono','JetBrains Mono Fallback',monospace`.
- Link to the homepage as `/` (its canonical URL), never `index.html`.
- Every page's `<head>` links the RSS feed (`feed.xml`) and every footer has an RSS link; keep both on new pages.
- Icons: every post and tool has a line icon, kept as a file in `assets/icons/<slug>.svg` (24×24, stroke `currentColor`, width 1.6, round caps, no fill). Pages inline the SVG with `aria-hidden="true" focusable="false"` and class `card-icon` (cards) or `tool-hero-icon` (tool page heading). A new post or tool gets a new icon in the same style, added to its cards everywhere they appear.
- Tool pages live in `tools/` and share `assets/tools.css` and `assets/tools.js` (loaded with `defer`, so it never blocks the first paint). The JS only initialises tools present on the page, through `onPage(id, init)` at the end of each tool's block.

## Publishing a new post: checklist

Do all of these in the same commit as the post itself.

1. **The post page** (`<slug>.html` at the root): copy the `<head>` of an existing post and update `<title>`, description, canonical, `og:*` and `twitter:*` tags, the `<time datetime>` and the `BlogPosting` JSON-LD (`headline`, `description`, `url`, `mainEntityOfPage`, `datePublished`).
2. **`blog.html`**: add a card to the top of `#posts-grid` with the right `data-format` and the post's icon (see Site rules). Also add the post to the `blogPost` list in the JSON-LD.
3. **`index.html`**: the "Latest narrations" list (`#post-list`) shows the three latest posts. Add the new one first as an `<li>` with its icon, format, title and date, and a `data-topics` value from: `automation`, `ai-agents`, `business-systems`, `certification` (space-separated if more than one, empty if none). Remove the oldest.
4. **`sitemap.xml`**: add a `<url>` entry with `<lastmod>` set to the publish date. Update `<lastmod>` for `blog.html` and `/` (the homepage) too.
5. **`llms.txt`**: add the post to the top of the `## Posts` list as `- [Title](https://www.flownarrate.com/<slug>.html): one-sentence summary`.
6. **`feed.xml`**: add an `<item>` at the top (title, link, `guid`, `pubDate` in RFC 822 format such as `Fri, 02 Oct 2026 09:00:00 +0000`, category, description) and set `<lastBuildDate>` to the same date. Copy the `<link rel="alternate" type="application/rss+xml" …>` line into the new page's `<head>`.

## Adding or changing a tool: checklist

1. Create `tools/<slug>.html` from an existing tool page. Update the title, description, canonical, `og:*`, `twitter:*`, the `WebApplication` and `BreadcrumbList` JSON-LD, the intro and the "How to use it" steps.
2. Put the tool's JS in `assets/tools.js` and initialise it with `onPage('<an element id from the tool>', ...)`.
3. Add a card to `tools.html`, add it to the `ItemList` JSON-LD there, update the tool count in the intro text, and add it to the "More free tools" grid on every other tool page.
4. **`sitemap.xml`**: add a `<url>` entry, and update `<lastmod>` for `tools.html`.
5. **`llms.txt`**: add it to the `## Tools` list.

## Keeping the XML files current

`sitemap.xml` and `feed.xml` (the RSS feed) must always match the site. Check both whenever you add, rename, edit or remove a page.

- **Sitemap:** every public page has a `<url>` entry (not `404.html`). When an existing page changes in a way readers would notice, update its `<lastmod>`.
- **RSS feed:** every post has an `<item>`, newest first. When a post's title or description changes, update its `<item>` to match. When a post is removed, remove its `<item>`. Keep the `guid` unchanged for an existing post, or feed readers will show it again as new.
- Both files must stay valid XML. After editing, check them with `python3 -c "import xml.dom.minidom as m; m.parse('sitemap.xml'); m.parse('feed.xml')"`.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read `.claude/skills/antislop/SKILL.md` (core) and then the skill for the task:
- UI / visual: `.claude/skills/antislop-ui/SKILL.md`
- Copy & text: `.claude/skills/antislop-copywriting/SKILL.md`
- People: `.claude/skills/antislop-human/SKILL.md`
- Mobile / responsive: `.claude/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `.claude/skills/antislop-code/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: download `antislop.md` again, or run `npx antislop-ai --update` if it was installed as skill folders.
The skills live in the hidden `.claude/skills/` folder so GitHub Pages never publishes them (Jekyll skips dot-folders).
<!-- antislop:end -->
