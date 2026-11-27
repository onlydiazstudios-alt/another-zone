# Another Zone Cover Studio

A standalone Cloudflare Worker that generates premium product-cover artwork and turns uploaded images into public HTTPS image URLs suitable for Gumroad covers.

## Free-first architecture

- Image generation: Cloudflare Workers AI, `@cf/black-forest-labs/flux-1-schnell`.
- Storage and public image delivery: Workers KV. The Worker serves the stored image from its own `workers.dev` URL, so no public R2 bucket or separate image-conversion service is needed.
- Daily cap: 7 total generated or uploaded images per UTC day (5 for the daily product pipeline plus 2 spare).
- Retention: generated and uploaded images expire after 60 days to stay within the Workers KV free storage allowance.
- Access: the generation/upload endpoints require a private service key. Public image URLs are read-only.
- No paid image API is called.

Cloudflare's published Workers Free allowance includes 10,000 Workers AI neurons/day, 100,000 Worker requests/day, and Workers KV free allowances of 1 GB storage, 100,000 reads/day and 1,000 writes/day. Model use and image size affect actual consumption; the service enforces its own 7-image daily cap. Free quotas can be exhausted, and service requests may then fail until reset.

## Deployment

The GitHub Actions workflow `.github/workflows/deploy-cover-engine.yml` deploys this Worker when files in this folder change. It reuses the existing repository secrets:

- `CLOUDFLARE_API_TOKEN` — must allow Workers Scripts edit and Workers KV Storage read/write.
- `CLOUDFLARE_ACCOUNT_ID`.

The workflow creates or reuses the KV namespace `AZ_PRODUCT_COVERS`, injects its ID into the Wrangler config at deploy time, and deploys the Worker. It does not modify the existing SRT Worker.

After deployment, the Worker URL will be `https://az-product-cover-engine.<your-workers-subdomain>.workers.dev`.

## Endpoints

- `GET /` — Cover Studio interface (enter the service key, generate or upload, preview and copy URL).
- `GET /health` — service and binding health.
- `GET /api/generate?key=...&name=...&prompt=...` — generation endpoint suitable for a scheduled GET-based agent. The response includes `image_url`.
- `POST /api/generate` — JSON body `{ "productName": "...", "prompt": "..." }`, with `Authorization: Bearer <service-key>`.
- `POST /api/upload` — raw JPEG, PNG or WebP bytes with matching Content-Type and the same bearer authorization; returns a public URL.
- `GET /image/<key>` — public image bytes for Gumroad.

The image URL is the Worker's public HTTPS route. No extra image-to-URL converter is needed: uploads are stored in KV and served directly as image files.

## Security

The Worker stores only the SHA-256 digest of the service key. The raw key belongs only in the private daily automation instructions or the Cover Studio UI; never commit it to this repository. The GET endpoint accepts the key in its query string for automation compatibility, so treat the key as a limited-use generation credential and do not share generated request URLs. The endpoint is capped at seven generated or uploaded images per day.

## Notes

FLUX.1 Schnell generates the artwork background without embedded text to avoid misspelled product titles. Gumroad displays the product title and description alongside the cover. The existing Another Zone logo has not been altered or recreated; a future logo-overlay step can be added once the original logo file is available as a hosted asset.
