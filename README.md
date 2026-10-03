# Lede

An RSS reader for Android and iOS. Add feed URLs, read the articles in one place,
bookmark what matters. No account, no server, no sync — everything lives on the phone.

Built with Expo SDK 57, React Native 0.86, TypeScript and SQLite.
3,579 lines across 37 files in `src/`.

---

## Table of contents

1. [Running it](#running-it)
2. [The one decision that shapes everything](#the-one-decision-that-shapes-everything)
3. [Architecture](#architecture)
4. [Code walkthrough](#code-walkthrough)
5. [The data model](#the-data-model)
6. [Things that will bite you](#things-that-will-bite-you)
7. [What is not built](#what-is-not-built)

---

## Running it

### Development

```bash
npm install
npx expo run:android      # builds the native app and installs it
npx expo start            # Metro, for everything after that
```

You need a **development build**, not Expo Go. SQLite, WebView and the document
picker are native modules that Expo Go does not bundle.

After the first `run:android`, you only need `expo start`. Edit a file, save, the
app reloads.

### Release APK

```bash
KS_PASS=$(node -e "console.log(require('./credentials.json').android.keystore.keystorePassword)")
cd android && ./gradlew assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.injected.signing.store.file="$PWD/../credentials/release.keystore" \
  -Pandroid.injected.signing.store.password="$KS_PASS" \
  -Pandroid.injected.signing.key.alias=lede-upload \
  -Pandroid.injected.signing.key.password="$KS_PASS"
```

Output lands at `android/app/build/outputs/apk/release/app-release.apk`, around 45 MB.
It is standalone: the JS is compiled in, so no Metro and no laptop.

`-PreactNativeArchitectures=arm64-v8a` matters. Without it you get a universal APK
carrying four CPU architectures and the file is 108 MB, of which 47 MB is x86 code
for emulators you will never ship to.

Signing is passed on the command line rather than written into
`android/app/build.gradle`, because `android/` is regenerated (see
[Things that will bite you](#things-that-will-bite-you)).

**Back up `credentials/release.keystore`.** It is gitignored, so it exists in one
place only. Android refuses to install an update signed by a different key, so
losing it means uninstalling the app — which deletes every feed, bookmark and
read marker. Export a backup from the Feeds tab first if that ever happens.

### Using the app

- **Feeds tab** — paste a feed URL, or import an OPML file. Create categories and
  tap any feed to assign one. Back up and restore everything as JSON. Switch
  between system, light and dark themes.
- **Latest tab** — every article, newest first. Search, filter by category,
  toggle unread-only, mark all read. Pull down to refresh.
- **Saved tab** — bookmarks and favourites.
- **Reader** — opens when you tap an article. If the feed only sent a summary, the
  full article is fetched automatically.

Paste a site URL rather than a feed URL and it still works: the app reads the
page's `<link rel="alternate">` tags and falls back to trying `/feed`, `/rss.xml`,
`/atom.xml` and similar.

---

## The one decision that shapes everything

**There is no server.** The phone fetches feeds, parses them, and stores them.

That buys simplicity and privacy, and costs three things you should know about
before you reach for them:

**Background refresh is unreliable.** With no server there is nothing to wake the
app. iOS `BGTaskScheduler` is opportunistic — Apple decides when it runs, and it
may be once a day or not at all. Android has a 15-minute floor and gets throttled
by Doze. So the app refreshes when you open it and when you pull down, and that
is the whole story. There are no new-article push notifications and there cannot
be without a server.

**There is no cross-device sync.** Read state lives on one phone. The JSON backup
in the Feeds tab is the manual answer.

**Reinstalling wipes everything.** Same reason. Again: export a backup first.

The upside is that the hard parts are all in one place and you can read them.

---

## Architecture

Four layers. Each one knows nothing about the layer above it.

```
src/app/          screens and routing       (expo-router)
src/components/   dumb UI
src/hooks/        the only place React meets data
src/sync/         orchestration: what to fetch, how fast
src/feeds/        fetch, parse, sanitize    — no React, no SQL
src/db/           SQL only                  — no React, no network
```

The rule, stated plainly:

- **`db/` never imports React and never makes a network request.** It takes a
  database handle and runs queries.
- **`feeds/` never imports React and never touches SQL.** It takes a URL or a
  string of XML and returns plain objects.
- **`components/` never imports SQL.** It takes props and renders.
- **`hooks/` is the seam.** It is the only place that calls into `db/` and holds
  React state.

This is why `feeds/parse.ts` can be run under plain Node with no React Native in
sight — which is exactly how the feed verification was done.

### Why no state library

There is no Redux, no Zustand, no TanStack Query. SQLite is the cache and the
source of truth. Adding a second cache on top means two things can disagree,
and debugging that disagreement is miserable.

React state holds only what is on screen right now.

---

## Code walkthrough

### `src/db/` — storage

**`schema.ts`** — the tables, and a migration runner keyed on SQLite's
`PRAGMA user_version`. Version 1 creates everything; version 2 adds
`full_content` and `full_fetched_at` to `articles`. If the version on disk does
not match `LATEST_VERSION` after running every step, it throws rather than
limping on with a half-migrated database.

WAL mode is switched on at open. It lets reads happen while a write is in
progress, which matters when a sync is inserting a few thousand rows and you are
scrolling.

**`articles.ts`** — the largest file, and the one with the important detail:

```
LIST_COLUMNS  — id, title, summary, image, dates, flags
getArticle()  — the same, plus author and content and full_content
```

The list query **never selects `content`**. Pulling 2,000 rows of article HTML
into JavaScript to render a list of titles is how these apps die. Body text is
loaded only when you open one article.

Pagination is keyset, not `OFFSET`: each page asks for rows with
`published_at < <the last row you saw>`. That stays fast as the table grows,
where `OFFSET 4000` does not.

`insertArticles()` uses a prepared statement inside one transaction and
`INSERT OR IGNORE`. The `articles_dedup` unique index does the de-duplication —
there is no "does this exist?" query, the database just refuses the duplicate.

`pruneArticles()` is worth reading carefully. It keeps the newest 200 per feed
and deletes anything older than 45 days, except anything bookmarked or
favourited. The window function ranks **all** articles in a feed, and saved rows
are excluded only from the `DELETE`. An earlier version ranked only the unsaved
rows, which meant a feed with 200 bookmarks plus 200 unsaved kept 400 — the
limit silently did not mean what it said.

**`backup.ts`** — export and restore as JSON. The interesting choice is the key:
state is stored against **feed URL plus article stable ID**, never the row `id`,
because row ids do not survive a reinstall. Restore merges with `MAX()` so it can
never un-read something you have read. Articles you have not downloaded yet are
counted and reported rather than silently dropped.

**`feeds.ts`, `categories.ts`, `settings.ts`** — ordinary repositories. The one
piece of logic lives in `feedsDueForRefresh()`:

```sql
? - last_fetched_at >= poll_interval_ms * (1 << MIN(failure_count, 5))
```

That is exponential backoff in SQL. A feed that has failed three times waits
eight times its normal interval; the `MIN(…, 5)` caps the wait at 32×.

### `src/feeds/` — the network and parsing layer

**`fetch.ts`** — one job: turn a URL into a string, politely.

The single most valuable thing here is **conditional GET**. The `ETag` and
`Last-Modified` from the last response are sent back as `If-None-Match` and
`If-Modified-Since`. An unchanged feed replies `304 Not Modified` with no body.

Worked example with 55 feeds checked every 30 minutes:

- 55 × 48 = **2,640 requests a day**
- Engineering blogs rarely publish, so ~90% come back `304` at roughly 250 bytes
- The rest return real XML at ~40 KB

That is about **11 MB a day**. Without conditional GET the same schedule pulls
over 100 MB and makes you look like a scraper. Same information, a tenth of the
traffic, and nobody notices you exist.

It also handles character encoding. React Native's `fetch().text()` assumes UTF-8;
a feed served as `windows-1252` comes back as mangled punctuation. So the body is
read as an `ArrayBuffer`, the charset is taken from `Content-Type` or the XML
declaration, and `windows-1252` and `ISO-8859-1` are decoded by hand because
React Native's `TextDecoder` does not cover them.

Other guards: a 15-second timeout via `AbortController`, a 12 MB body cap, and
`Retry-After` honoured on `429` and `503`. The 12 MB cap is not arbitrary — Dan
Luu's feed is 6.3 MB decompressed and the original 5 MB limit rejected it.

**`parse.ts`** — four formats that people all call "RSS": RSS 2.0, Atom,
RSS 1.0/RDF, and JSON Feed. Roughly 40% of the effort in this project lives here
and in `sanitize.ts`.

The part that matters most is `stableId.ts`:

```
guid, if present and not just a number   →  g:<guid>
else the link                            →  l:<link>
else a hash of title + published date    →  h:<hash>
```

Get this wrong and articles you already read reappear as unread, and you stop
trusting your own app within a week. Across 3,755 real articles from 27 feeds,
this rule produced zero duplicates and zero unstable ids on a repeat parse.

Dates are the other swamp. RSS uses RFC 822, Atom uses ISO 8601, and plenty of
feeds use neither. Unparseable dates become `0` rather than `Date.now()`, so the
stable id stays stable across refreshes.

**`sanitize.ts`** — feed content is **untrusted HTML written by a stranger**. It
strips `<script>`, `<style>`, `<iframe>`, every `on*` attribute, and
`javascript:` URLs. This is defence in depth: the reader's WebView also runs with
`javaScriptEnabled={false}` when it renders feed HTML.

**`extract.ts`** — on-device full-text extraction. Many feeds send two sentences
and a "Read more" link. This fetches the article page, strips navigation, headers,
footers and sidebars, then collects the content blocks (`<p>`, `<h2>`, `<pre>`,
`<blockquote>`, lists, tables, figures) in document order. Relative image and link
URLs are rewritten to absolute, or images would not load.

It runs **on the device, on demand**. That is deliberate. Doing it in bulk on a
server would mean holding full copies of other people's articles on your
infrastructure, which is a materially different legal posture from a reader
fetching one page a user asked for.

Measured against real articles:

```
feed=   433  extracted= 16840   martinfowler.com    ← the case this exists for
feed= 15909  extracted= 19885   blog.cloudflare.com
feed= 17515  extracted= 17515   danluu.com          ← already full text
feed= 11566  FAILED (403)       netflixtechblog.com ← Medium blocks bots
```

Never worse, dramatically better on stubs. When it fails the reader falls back to
loading the real page, so you always see something.

**`discover.ts`** — paste `https://jvns.ca` instead of the feed URL and this reads
the page's `<link rel="alternate">` tags, then tries common paths. Without it,
pasting a site URL is a dead end with no explanation.

**`opml.ts`** — import and export subscriptions. Nested `<outline>` elements become
categories. Export is the migration path out of this app, which is the first thing
any serious RSS user looks for.

### `src/sync/` — orchestration

**`syncFeeds.ts`** is about politeness, not speed. Feeds are grouped by host; four
hosts are fetched in parallel, but feeds on the **same** host run one at a time
with a 400 ms gap. Ten feeds from one domain are a sequence, not a stampede.

Failures bump `failure_count`, which feeds the exponential backoff in the SQL
above. A feed that 404s for a week quietly stops being polled.

`probeFeed()` is the add-a-feed path: fetch, try to parse, and if that fails run
discovery over the response as if it were a page. It returns the URL that
actually worked, which is what gets stored — not necessarily what you typed.

**`limit.ts`** — a 20-line concurrency pool. No dependency needed.

### `src/hooks/` — where React meets data

**`use-articles.ts`** holds one `Page` object containing the filter key, the rows,
and whether the list is exhausted. `loading` is **derived** (`page.key !== key`)
rather than stored. That is not style: React's lint rules flag `setState` called
synchronously inside an effect because it causes cascading renders, and deriving
the value removes the problem instead of silencing it.

**`use-feed-actions.ts`** owns import, export, backup and restore so the Feeds
screen stays presentational. Every action runs through `withBusy`, which sets a
label, runs the work, and refreshes afterwards — so the screen has one loading
indicator instead of five booleans.

**`use-sync.ts`, `use-feeds.ts`** — thin.

### `src/theme/` — colours and typography

`tokens.ts` holds the palette, spacing, radii and type scale. `theme-context.tsx`
resolves system / light / dark and persists the choice in the `settings` table —
which is why there is no AsyncStorage dependency.

The design is deliberately flat: warm paper `#FAF9F7` and near-black `#0D0D0F`,
hairline rules instead of heavy cards, one restrained blue accent, and solid black
chips for the active state.

An earlier version used glassmorphism and neumorphism together. Both were removed.
They have opposite requirements — neumorphism needs a flat opaque background to
cast its two shadows, glass needs something colourful behind it to blur — and
React Native only gives you one shadow per view on iOS. The glass version also
required `BlurTargetView`, which rendered the entire app blank on Android.

### `src/components/` and `src/app/`

`Surface` and `Chip` are the whole design system. `ArticleRow` is a fixed-shape
list row. `article-list.tsx` is shared by the Latest and Saved tabs.

One detail in `article-list.tsx` worth copying elsewhere: the header sits
**outside** the `FlashList` rather than in `ListHeaderComponent`. Inside a list,
every keystroke remounts the header and the search box loses focus mid-word.

`src/app/article/[id].tsx` is the reader. On open it measures the feed content,
and if it is under 1,800 characters it extracts the full article automatically.
If extraction fails it switches to loading the live page in the WebView and says
so in the toolbar. The globe and reader icons toggle between the two.

Note the asymmetry: feed HTML is rendered with **JavaScript disabled**, because it
is untrusted content injected into a document we construct. The live-page fallback
runs with JavaScript enabled, because that is ordinary browsing of a real site.

---

## The data model

Five tables in `reader.db`, currently at `user_version = 2`.

```
categories    id, name
feeds         id, url, title, site_url, category_id,
              etag, last_modified, last_fetched_at,
              poll_interval_ms, failure_count, last_error
articles      id, feed_id, stable_id, title, url, author,
              summary, content, full_content, image_url,
              published_at, fetched_at
article_state article_id, is_read, is_bookmarked, is_favorite
settings      key, value
```

The index that does the most work:

```sql
CREATE UNIQUE INDEX articles_dedup ON articles (feed_id, stable_id);
```

That index **is** the de-duplication. Combined with `INSERT OR IGNORE`, re-parsing
a feed you already have is a no-op the database handles for you.

`article_state` rows are created lazily — only when you read, bookmark or
favourite something. Every query uses `LEFT JOIN … COALESCE(s.is_read, 0)`, so an
absent row simply means unread. Thousands of articles cost zero state rows until
you touch them.

---

## Things that will bite you

**`android/` is generated.** Expo regenerates it from `app.json`. Edit
`build.gradle` or `AndroidManifest.xml` by hand and the next `prebuild` silently
erases your change. Worse: once `android/` exists, `expo run:android` compiles
what is there and **ignores** `app.json`. If you change the app name, icon,
splash, package or a plugin, you must run:

```bash
npx expo prebuild --clean --platform android
```

A changed icon that refuses to appear is almost always this.

**Expo APIs move between SDK versions.** `ThemeProvider` comes from `expo-router`,
not React Navigation. `expo-blur`'s prop is `blurMethod`, it defaults to `'none'`
meaning no blur at all, and on Android it needs an explicit `BlurTargetView`.
`expo-glass-effect` is iOS 26 only and silently renders a plain `View` elsewhere.
Check the versioned docs rather than trusting memory.

**`npx expo install`, not `npm install`.** Native modules are compiled against the
SDK's React Native version. Installing the npm-latest version of a native package
gives you a build that fails at link time.

**"Unable to load script" usually means Metro is dead**, not that the build is
broken. Check it is running before suspecting anything else.

**Many feeds are simply dead.** Of 36 feeds in the original subscription list, 8
returned 404 — Uber, LinkedIn, Stripe's old URL and others killed their feeds
without telling anyone. The Feeds tab shows `last_error` per feed for this reason.
Some sites (DoorDash, SparkToro, Search Engine Land) sit behind Cloudflare bot
protection and return 403 to any non-browser client; those cannot be fixed from
this side.

**Big feeds are big.** Shopify's feed returns 432 items and Dan Luu's is 6.3 MB.
Parsing that one pushed heap usage to about 106 MB in a Node test. Conditional
GET means you only pay it when the feed actually changes.

---

## What is not built

- **iOS** — the code is cross-platform but has never been built or run there.
  Needs Xcode, and a paid Apple account to run on a real device beyond 7 days.
- **Background refresh** — deliberately dropped. It saves battery and it would not
  have worked reliably on iOS anyway.
- **Full-text search inside article bodies** — search covers titles and summaries.
- **Folder-level unread counts** on the Latest tab.
- **Automated tests.** The feed pipeline was verified by running it against 102
  real feed URLs, and every SQL statement was validated against SQLite directly,
  but none of that is committed as a test suite. If you add tests, start with
  `stableId` — parse a feed twice and assert zero new articles the second time.
