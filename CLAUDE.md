# FlowNarrate

Static site served by GitHub Pages at **https://www.flownarrate.com** (see `CNAME`). Plain hand-written HTML, no build step.

## Site rules

- Every absolute URL (canonical, `og:url`, `og:image`, JSON-LD, sitemap, `llms.txt`) uses `https://www.flownarrate.com`, never the bare domain.
- British spelling ("colour").
- Colours come from the CSS variables at the top of each page (the "Run status" palette: `--paper`, `--ink`, `--succeeded` for the plum accent, `--ok`, `--warning`). Use the variables, not hex values, so light and dark mode both work. Check text contrast is at least 4.5:1 in both modes.
- The reasons behind the look (motif, type, labels, diagrams, callouts, layout) are in `DESIGN.md`. Read it before changing how the site looks, and update it when a decision changes.
- Every page's `<head>` links the RSS feed (`feed.xml`) and every footer has an RSS link; keep both on new pages.
- Icons: every post and tool has a line icon, kept as a file in `assets/icons/<slug>.svg` (24×24, stroke `currentColor`, width 1.6, round caps, no fill). Pages inline the SVG with `aria-hidden="true" focusable="false"` and class `card-icon` (cards) or `tool-hero-icon` (tool page heading). A new post or tool gets a new icon in the same style, added to its cards everywhere they appear.
- Tool pages live in `tools/` and share `assets/tools.css` and `assets/tools.js`. The JS only initialises tools present on the page, through `onPage(id, init)` at the end of each tool's block.

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
