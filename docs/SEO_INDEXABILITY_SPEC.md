# SEO and Production Indexability Specification

Status: canonical project specification

Accepted production baseline: `c79eaae5031cbc3c244ba11e6c90d76b090aacaa`

Accepted at: 2026-08-23

Canonical host: `https://www.islegal.info`

This specification owns the public country-page, metadata, sitemap, runtime-data
trace, release and production-crawlability contract. Other documentation may
summarize it but must not weaken or silently redefine it.

## 1. Objective

Google and other search crawlers must be able to fetch every URL advertised by
the canonical sitemap and receive the same real country experience that a user
receives: HTTP 200, truthful content, a nonempty title, the exact canonical URL,
`index, follow` metadata and the normal country popup/map runtime.

The repair must remain narrow. It must not publish local audit products, Social,
Store Truth, experimental Truth Map state, alternate legal conclusions or a
second map runtime.

## 2. Historical cause and accepted repair

The confirmed regression boundary is commit `35d57e94` from 2026-08-12. Its
cached `fs.statSync` / bounded-index optimization changed runtime file discovery
so Vercel server traces for dynamic country and split-sitemap handlers retained
zero `data/countries/*.json` files and omitted the country index/graph. The
statically emitted sitemap continued advertising country URLs while those
serverless routes returned 404.

The May rollback and the later Next.js upgrade were investigated and are not
the causal boundary. Documentation must not attribute this incident to them.

The accepted repair is commit `c79eaae5`. It restores the monorepo tracing root
and adds explicit route-scoped trace inputs in `apps/web/next.config.ts` without
a global wildcard.

## 3. Public route contract

The following surfaces are public product/indexability routes:

| Surface | Production requirement |
| --- | --- |
| `/` and `/new-map` | Existing public MapLibre product; no Social/Store audit layer |
| `/c/[code]` | HTTP 200 for every canonical country/state code in the sitemap |
| `/[lang]/c/[code]` | HTTP 200 for every localized URL in the sitemap |
| `/sitemap.xml` | Canonical full sitemap |
| `/sitemap-main.xml` | Full dynamic sitemap projection |
| `/sitemap-countries.xml` | Country partition |
| `/sitemap-states.xml` | U.S. state partition |
| `/sitemap-i18n.xml` | Localized partition |
| `/sitemap-index.xml` | Index containing the four split sitemap URLs |
| `/api/sitemap` | Existing XML compatibility endpoint |
| `/robots.txt` | Allows Googlebot and publishes canonical sitemap locations |

Local audit routes have a different contract:

- `/truth-map` is local-only and must return production 404;
- `/wiki-truth` and `/trust-view` are localhost audit surfaces and must return
  production 404 through the host guard;
- none of those routes may appear in any sitemap, canonical alternate link or
  production navigation added by SEO work;
- Social and validated Store layers remain `/truth-map`-only.

## 4. Runtime-data trace contract

Country pages and sitemap handlers read monorepo data at request time. Vercel
must package only the required data for the routes that use it.

Required trace root:

```text
outputFileTracingRoot = repository root
```

Required trace inputs:

```text
data/index.json
data/countries/**/*.json
data/graph/country-graph.json
```

Allowed route keys for those inputs:

```text
/c/*
/api/nearby
/api/new-map/country-page
/api/sitemap
/sitemap-main.xml
/sitemap-countries.xml
/sitemap-states.xml
/sitemap-i18n.xml
```

Hard prohibitions:

- no `/*` or equivalent global `outputFileTracingIncludes` key;
- no trace include for `/truth-map`, `/wiki-truth`, Social, DM or Store APIs;
- no copying the whole repository/data tree into every server function;
- no fallback that turns missing country data into a successful empty sitemap;
- no build-time sitemap generated from a broader universe than the runtime can
  actually serve.

## 5. Sitemap baseline and non-shrinking rule

The accepted 2026-08-23 production baseline is:

```text
sitemap.xml              311 unique URLs
sitemap-main.xml         311 URLs
sitemap-countries.xml    238 URLs
sitemap-states.xml        50 URLs
sitemap-i18n.xml          22 URLs
sitemap-index.xml          4 sitemap entries
```

The full 311-URL set is one root URL plus 238 country URLs, 50 U.S. state URLs
and 22 localized URLs. A sitemap URL is valid only when the production URL it
advertises is fetchable and indexable.

The root URL is exact, not merely normalization-equivalent:

```text
sitemap:   https://www.islegal.info/
canonical: https://www.islegal.info/
```

The trailing slash is part of this strict equality contract. A rendered home
canonical of `https://www.islegal.info` is release FAIL even though browsers and
search engines normally treat it as equivalent.

These counts are a protected baseline, not an eternal business limit. An
intentional registry expansion may increase them. A shrink, reclassification or
partition-count change requires an explicit specification update, tests, a
fresh complete production crawl and user-authorized release. Silent shrink is
FAIL.

Every sitemap must contain:

- only `https://www.islegal.info` canonical URLs;
- no duplicate `<loc>` values;
- zero `/truth-map`, `/wiki-truth`, `/trust-view`, Social, DM or Store-audit URLs;
- no URL that returns 404, redirects to an unrelated page, or emits `noindex`.

## 6. Country SEO and popup contract

Every advertised HTML URL must return:

- HTTP 200;
- a nonempty, GEO-correct `<title>`;
- one exact canonical URL on `www.islegal.info`;
- `robots` equal to `index, follow`;
- no conflicting `noindex` directive;
- the canonical GEO-specific country/state content;
- the normal product map and country popup for that GEO;
- the existing editable AI dock when that runtime normally exposes it.

The SEO repair must not change Legal Truth, display colour, source ownership,
Store eligibility, Social visibility, SSOT or popup conclusions. Popup/SEO data
alignment continues to follow `docs/GEO_SYNC_AUDIT.md` and `docs/CONTRACT.md`.

## 7. Local acceptance

Before release, localhost must prove at minimum:

- `/c/swz`, `/c/nld`, `/c/us-ca` and `/es/c/nld` return 200;
- their title, canonical and robots metadata match the requested GEO/locale;
- sitemap counts match the protected baseline;
- `/truth-map` and `/wiki-truth` remain available only on localhost;
- a fresh `/truth-map` visual audit passes all 307 canonical GEO popups when
  preserved Truth Map work makes its manifest stale;
- Store leaves, Social Chat and the editable AI dock remain present and
  independent on `/truth-map`.

Local development must follow the singleton rule. A second Next.js server,
alternate port, live-lock deletion or user-process termination is forbidden.

## 8. CI and release gate

`bash tools/pass_cycle.sh` is the mandatory integrated gate. A release requires:

```text
CI_STATUS=PASS
CI_QUALITY=OK
SMOKE_STATUS=PASS
TRUTH_MAP_VISUAL_AUDIT_GUARD=PASS
POST_CHECKS_OK=1
HUB_STAGE_REPORT_OK=1
PROCESS_SLOT_RUNTIME_GUARD=PASS
PASS_CYCLE_EXIT rc=0 status=PASS
```

The trace regression tests must prove:

- the country data/index/graph inputs exist in the relevant server traces;
- the include keys stay route-scoped;
- `/truth-map` is absent from trace includes and sitemap output;
- the sitemap partitions retain their protected counts.

Production release must use `Tools/commit_if_green.sh`. When the canonical
worktree contains parallel uncommitted work, release from an isolated clean
clone/worktree whose diff is exactly the authorized candidate. Never stage or
push the full dirty worktree merely to ship this trace fix.

## 9. Production acceptance

A push or Vercel deployment is not acceptance. After Vercel promotion, verify:

1. `origin/main` identifies the authorized commit.
2. All 311 canonical sitemap URLs return HTTP 200.
3. Every advertised HTML page has title, canonical and `index, follow`.
4. Split sitemap counts are `238/50/22`; the sitemap index contains 4 entries.
5. `robots.txt` allows Googlebot and publishes sitemap locations.
6. `/truth-map` and `/wiki-truth` return 404 on the public host.
7. Every sitemap contains zero audit/Social/Store route leaks.
8. A real production browser renders a representative country popup and normal
   product controls without Truth Map, Social or Store audit controls.
9. A post-release canonical-root `pass_cycle` remains green.

If any condition fails, production acceptance is FAIL even when Vercel reports
the deployment as ready.

## 10. Google indexing terminology

Use these states precisely:

- `CRAWLABILITY_PASS`: production returns the required 200/indexable content and
  valid sitemaps/robots response.
- `SITEMAP_DISCOVERABLE`: Googlebot is allowed and canonical sitemap URLs are
  published/submitted.
- `GOOGLE_RECRAWL_UNCONFIRMED`: the repaired site is available but Search
  Console has not yet shown a new crawl.
- `GOOGLE_INDEX_CONFIRMED`: Search Console or an equivalent current Google
  surface confirms the URL is indexed.

Never report `GOOGLE_INDEX_CONFIRMED` from local tests, `curl`, Vercel readiness,
a sitemap 200, or a successful push. Google recrawl/index convergence is an
external asynchronous state.

## 11. Change control

Any change to country data lookup, Next.js tracing, sitemap generation,
canonical metadata, robots policy, production route exposure or audit-route
isolation must update this specification in the same accepted documentation
change. Historical failure text stays evidence; active rules live here,
`AGENTS.md`, `docs/CONTRACT.md` and `docs/OPS.md`.
