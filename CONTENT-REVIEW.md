# Content review hold

The user requested that the website stop connecting to all sources while content safety is reviewed (2026-10-12).

- `src/main.tsx` imports only React and the local `src/review/` page. It does not import the dashboard, routes, API transport, global dashboard CSS or translation catalogs.
- The prior entry is retained unchanged in `src/main-dashboard.tsx` for a later, explicitly approved restoration. The original application remains in the repository.
- `index.html` has no manifest, external font, external script or preload reference. Its content security policy prohibits connections, frames, workers and fonts. The review page uses system fonts and local language preferences only.
- `vite.config.ts` disables `publicDir` copying during the hold. The output omits the original manifests, map styles, workers, models and dashboard public assets. Their source files remain unchanged.
- `prepare-pages.mjs` preserves the existing `CNAME` domain file and copies the same review document to `/docs/`, `/privacy/` and `404.html`. No pathname selects a dashboard route.
- Repository inspection found no service-worker registration or Workbox implementation. The old manifests contain PWA metadata, but are neither referenced nor shipped by this build.

## Checks

Run `npm run typecheck` and `npm run build`, then start `npx vite preview --host 127.0.0.1 --port 5197 --strictPort`.

From this workspace, which has Playwright installed, run `node scripts/check-content-review.mjs`. Set `REVIEW_BROWSER_EXECUTABLE` if the installed browser is not Playwright's default; `REVIEW_BASE_URL` can select a different local preview port. The check exercises desktop/mobile language switching, keyboard activation, persisted language and deep links. It records all browser requests, fails on API/external requests, and verifies that no service worker or embedded frame is active. Evidence and screenshots are written under `/tmp`.

This verifies the client build. Backend collection and deployment state require separate coordinator verification. Existing browser tabs running an older release are not controlled by the new build; stopping backend services is a separate operation.

The checker saves requests, responses and failures even when acceptance fails, and completes both viewport cases before returning a nonzero exit code. CSP can block a request before Playwright route interception; these attempts still count against the strict zero-external-attempt condition. On 2026-10-12 the formal site passed both functional cases but this stronger check failed: CDN-injected Cloudflare analytics attempted to load once per document, was blocked by CSP, and produced no external responses. Both viewports made zero API or news/data-source attempts. Do not suppress those failed attempts or describe this as a fully passed network check; removing the injection requires a separate CDN setting change.

Restoration requires reviewing the content policy first, then restoring the prior entry, HTML metadata/CSP and `publicDir` configuration together, followed by a complete build and network acceptance check. Changing the entry alone would leave the dashboard blocked by the review CSP and without its public assets.
