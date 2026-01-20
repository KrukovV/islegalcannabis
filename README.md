isLegalCannabis is a Next.js App Router project that provides educational, jurisdiction-based cannabis law summaries.

## Getting Started

First, run the development server:

```bash
npm run web:dev
# or
yarn web:dev
# or
pnpm web:dev
# or
bun web:dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Validate law data

```bash
npm run validate:laws
```

## SEO pages

SEO pages under `/is-cannabis-legal-in-[slug]` are statically generated from a fixed registry.

## Local CI

```bash
bash tools/ci-local.sh
```

## Leaflet map assets (offline)

Pinned refs:
- `vendor/leaflet` @ `v1.9.4` (`d15112c9e8ac339f0f74f563959d0423d291308d`)
- `vendor/leaflet-markercluster` @ `v1.5.3` (`e5124b27a8374d7037c31bf81235f9ba007a715e`)

Build local assets (no CDN):

```bash
bash tools/build_leaflet.sh
```

This copies Leaflet + MarkerCluster assets into `apps/web/public/vendor/leaflet/`.
Do not link Leaflet from CDN; the app uses local `/vendor/leaflet/...` assets only.

GeoJSON boundaries (Natural Earth 1:50m):
- `data/geojson/ne_50m_admin_0_countries.geojson`
- `data/geojson/ne_50m_admin_1_states_provinces.geojson`

## Adding a new jurisdiction

1. Add a JSON file under `data/laws/**` (follow existing files for schema).
2. Ensure required fields are present: `id`, `country`, `medical`, `recreational`,
   `public_use`, `cross_border`, `updated_at`, `sources`.
3. Run `npm run validate:laws`.

## Adding a new SEO slug

1. Add a slug mapping in `packages/shared/src/slugMap.ts`.
2. Ensure the referenced jurisdiction exists in `data/laws/**`.
3. Confirm `generateStaticParams()` includes the slug.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
