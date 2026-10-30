# Tasks

- [x] Config: `FAL_VIDEO_MODEL` (env schema, Pulumi `falVideoModel`, set on next) and `creditCost.video`
- [x] DB: `product.videos`
- [x] Flow and workflow: `product-videos` on Inngest, a keyed, charged submit per aspect, then the result; failures logged
- [x] Campaign build: upload each clip to Meta and add a video ad next to the image ads; failures logged and skipped
- [x] Web: Campaign step shows the clips, playable and muted
- [x] Docs: billing and fal (en, es, fr)
- [x] Docs: creating a drop (en, es, fr) and the landing page
- [x] Tests: flow (PGlite, fake fal)
- [x] Tests: campaign build with a fake Meta, Campaign step unit and e2e
