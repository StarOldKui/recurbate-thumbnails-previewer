# Codemap

## Maintenance Rule

- This codemap is the latest architecture snapshot for this project.
- Update it when system boundaries, runtime state, permissions, build outputs, or background capabilities change.
- Keep migration history, changelogs, and design debates out of this file.
- Prefer verified facts from source code, package metadata, generated manifests, and official platform docs.

## Product Boundary

- Product name: Video Thumbnails Previewer.
- Repository root is the Plasmo MV3 browser extension root.
- The project boundary is content-script UI, popup settings, local extension state, thumbnail image processing, and background extension capabilities.
- Supported page hosts are `recu.me`, `recu.club`, `missav.ws`, and `missav.com`.
- The extension fetches timeline stripe images from Recurbate resource hosts such as `mediafront.club`.
- Hosted services, account-based product flows, and support for other websites are outside the current extension boundary.

## Runtime Sources Of Truth

- Extension metadata and manifest inputs: `package.json`.
- Content script entry: `content.tsx`.
- Popup entry: `popup.tsx`.
- Provider registry: `providers/registry.ts`.
- MissAV URL detection: `missav/url.ts`.
- MissAV preview loading and seek behavior: `missav/index.ts`.
- MissAV main-world actions: `missav/background.ts`.
- Recurbate URL detection: `recurbate/url.ts`.
- Recurbate preview loading and seek behavior: `recurbate/index.ts`.
- Recurbate performer-page buttons: `recurbate/features.ts`.
- Recurbate main-world actions: `recurbate/background.ts`.
- Local state contract: `runtime/storage.ts`.
- Content-to-background client wrappers: `runtime/background-client.ts`.
- Shared preview data types: `runtime/types.ts`.
- Shared thumbnail processing: `runtime/processing.ts`.
- Background message handlers: `background/messages/*.ts`.
- Preview rendering: `components/PreviewPanel.tsx` and `style.css`.
- Unit tests: `tests/unit/*.test.ts`.
- Vitest config: `vitest.config.mts`.

## Provider Model

- `providers/registry.ts` owns runtime provider selection.
- `findProvider(url)` selects the active preview provider by host match plus non-null page key.
- `findHostProvider(url)` and `findHostProviders(url)` support popup host detection and host-level provider features.
- `providers/match-pattern.ts` mirrors the Chrome match patterns used by manifest inputs for runtime-side provider checks.
- Each provider owns its URL detection, preview loading, mount selectors, seek behavior, and optional features.
- `content.tsx config.matches` remains a literal array because Plasmo statically analyzes it during build.
- Adding a website requires updating the provider registry, content-script matches, manifest host permissions, and focused unit tests.

## Recurbate Model

- `RECURBATE_MATCHES` in `recurbate/url.ts` mirrors the same host patterns for tests and runtime-adjacent checks.
- `isRecurbateUrl(url)` gates Recurbate-specific feature behavior to `recu.me` and `recu.club`.
- `getRecurbatePageKey(url)` extracts the numeric `/video/{id}` page key.
- Settings are stored per provider under `vtp:{providerId}:settings`.
- Default settings are `displayMode: "embedded"` and `autoOpen: true`.
- Preview visibility is tab-local React state in `content.tsx`; it is not persisted in extension storage.

## MissAV Model

- `MISSAV_MATCHES` in `missav/url.ts` matches `missav.ws` and `missav.com`.
- `getMissAvPageKey(url)` treats video slugs with numeric ids as previewable pages.
- `missav/background.ts` runs in the main world to read `window.player.config.thumbnail`, including `pic_num` for the real sprite frame count.
- `missav/index.ts` renders the thumbnail sprite grid from the player thumbnail config and uses the real frame count for click timestamps.
- MissAV thumbnail clicks start the player when needed, then apply delayed seeks so the first user seek survives player startup.

## Content Runtime Flow

- Plasmo injects the single content UI from `content.tsx` into `document.body`.
- The Plasmo shadow host id is `rtp-root` for deterministic runtime inspection.
- `config.matches` statically limits injection to Recurbate and MissAV hosts.
- `useCurrentUrl()` tracks URL changes through history events, `popstate`, and a polling fallback.
- `useSettings()` loads provider settings from `chrome.storage.local`.
- Auto open runs on provider video pages when settings enable it.
- Content script startup removes stale page-level RTP mounts left by a previous extension reload before new portal mounts are created.
- Popup-triggered preview opens are delivered to the active content script with `chrome.tabs.sendMessage`.
- Popup-triggered preview messages include `providerId` and `pageKey`; content ignores messages that do not match the current active provider page.
- Preview loading calls the active provider's `loadPreview(context)` and stores the latest loaded token to avoid redundant reloads for the same page and open event.
- Popup mode renders `PreviewPanel` as a fixed overlay through a `document.body` portal.
- Embedded mode renders `PreviewPanel` at the active provider's embedded mount.
- The page button renders at the active provider's button mount.
- Host-level provider features mount on matching hosts even when the current URL is not a previewable video page.
- Preview button clicks are handled by a page-level capture listener so provider controls remain responsive if the page clones or replaces player control DOM.
- Portal mounts own and reuse their DOM host, move it when the anchor is replaced, remove duplicate same-variant mounts after the current host is mounted, and clean up on unmount.

## Popup Runtime Flow

- `popup.tsx` detects the active tab's supported host with `findHostProvider(url)`.
- Provider settings can be viewed and saved on supported hosts, including non-video pages.
- The Generate Preview action is enabled only when the active provider returns a page key for the current tab URL.
- Unsupported hosts render the inactive state.

## Recurbate Preview Flow

- `loadRecurbatePreview()` waits for `#timeline`.
- If the timeline is not ready, it clicks `#play_button` once as a best-effort player initializer.
- The stripe URL is read from `data-background-image` or the timeline background image style.
- `runtime/background-client.ts` requests image bytes through `background/messages/fetch-images.ts`.
- `runtime/processing.ts` slices the `1 x 128` stripe grid into preview thumbnails.
- Thumbnail timestamps are derived from video duration when available, otherwise from timeline `data-duration` plus optional `data-preroll-duration`.
- Clicking a thumbnail calls the Recurbate `seek` action first, then falls back to setting `video.currentTime` if the background action fails.
- Embedded thumbnail clicks scroll back to the video. Popup thumbnail clicks close the overlay after seeking.

## Performer-Page Features

- `recurbate/features.ts` mounts Open All, Save Range, and Save All buttons on performer pages.
- Open All opens same-host video links from the current performer page.
- Save Range and Save All collect performer page video links, find stripe resources in same-host background tabs, fetch stripe images, and download a ZIP with failures recorded in `errors.txt`.
- Batch work uses limited concurrency and same-host guards.

## Background Capabilities

- `background/messages/fetch-images.ts` fetches image URLs, accepts image or binary-octet image responses, retries failures, and returns image data URLs.
- `background/messages/provider-action.ts` dispatches provider background actions after sender URL validation.
- `background/messages/cancel-request.ts` aborts in-flight background requests by request id.
- `background/messages/open-tabs.ts` opens same-host batches of tabs sequentially and responds after all requested tabs are created.
- `background/messages/find-tab-resource.ts` opens a same-host background tab, waits with separate tab-ready and resource-scan budgets, scans resource timing entries for a resource pattern, and closes the tab.
- `background/request-registry.ts` owns shared abort controllers for cancelable background requests.
- Content code reaches these handlers only through `runtime/background-client.ts`.

## Permissions And Host Scope

- Manifest permissions are `activeTab`, `scripting`, and `storage`.
- Content-script matches are limited to Recurbate and MissAV hosts.
- Host permissions are limited to Recurbate, MissAV, and `https://*.mediafront.club/*`.
- The generated manifest contains no `cookies`, `<all_urls>`, `http://*/*`, or `https://*/*` broad injection rule.

## Build And Artifacts

- Package manager: `pnpm@9.15.4`.
- Plasmo version: `plasmo@0.90.5`.
- Main scripts: `pnpm dev`, `pnpm test`, `pnpm build`, `pnpm package`, and `pnpm verify`.
- Unit test runner: Vitest with Node environment and a Plasmo `~` alias in `vitest.config.mts`.
- Current unit coverage focuses on provider URL detection, storage defaults, request cancellation, background client messages, provider action isolation, same-host tab/resource guards, find-tab-resource timeout caps, and manifest policy.
- Build output directory: `build/`.
- Generated Chrome MV3 manifest can be inspected at `build/chrome-mv3-prod/manifest.json` after `pnpm build`.
- Packaged Chrome MV3 zip: `build/chrome-mv3-prod.zip`.
- Generated Plasmo cache directory: `.plasmo/`.
- Generated artifacts and dependency folders are ignored by `.gitignore`.

## Environment Contract

- Source code does not require environment variables.
- Source code has no server-only secrets or remote persistence contracts.

## Child Codemaps

- No child codemaps exist.

## Read-First Files

- `package.json`
- `content.tsx`
- `popup.tsx`
- `providers/registry.ts`
- `missav/url.ts`
- `missav/index.ts`
- `missav/background.ts`
- `recurbate/url.ts`
- `recurbate/index.ts`
- `recurbate/features.ts`
- `recurbate/background.ts`
- `runtime/storage.ts`
- `runtime/background-client.ts`
- `background/messages/provider-action.ts`
- `background/request-registry.ts`
- `components/PreviewPanel.tsx`
- `vitest.config.mts`
- `tests/unit/`
