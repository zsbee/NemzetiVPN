# Feasibility research

Research date: 2026-10-25. Hardware supplied by the owner: LG OLED C5. Installed firmware and webOS version have not yet been read from the television.

## Directly observed in Chrome

Using the owner's existing authenticated Chrome session:

- The NVT portal exposes pages for M1, M2, M4 Sport, M5, Duna, and Duna World.
- The supplied address loads the M4 Sport live page through the NVT proxy:
  `https://nvpn.nvt.gov.hu/prx/000/https/m4sport.hu/elo/mtv4live`.
- Starting its player caused Chrome to report audio playing. This confirms desktop playback starts; sustained playback, codec, DRM, and TV playback remain unverified.
- The live page lists additional event streams alongside its channels. These are dynamic offerings, not a fixed set of permanent stream addresses.
- Opening `https://nvpn.nvt.gov.hu/` while authenticated redirects to a welcome page under `/prx/000/http/localhost/welcome/index.html`. The page identifies itself as Array AG and offers Logout and Browse to URL.

The localhost path above is part of the gateway's own rewritten address. It is not a proposed local server endpoint for this app. Array branding suggests an access gateway, but its product version and exact authentication protocol are unverified.

No credentials, cookie values, raw network captures, or signed media URLs were saved. Temporary inspection tabs were closed after the playback check. A separate signed-out in-app browser was unavailable; the existing Chrome login was preserved. Therefore the login form, redirects, and any challenge steps have **not** been inspected.

## Platform evidence

| Finding | Implication | Primary source |
| --- | --- | --- |
| LG lists the C5 with webOS 25. | Use that as the provisional target; check the installed version because updates may change it. | [LG C5 catalogue](https://www.lg.com/content/dam/lge/in/migration/catalogue-2025/LG-OLEDevo-AI_Digital-Catalagoue-2025.pdf) |
| LG documents Chromium 120 for webOS 25 and cookies only for HTTP/HTTPS hosted apps, not file-based packaged apps. | A packaged app cannot assume browser-style NVT cookie login. A hosted app also cannot assume cross-origin cookie access. | [Web API and web engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine) |
| webOS supports HLS and specific DRM combinations. | Validate the actual stream against the hardware; HLS support alone is insufficient. | [Streaming protocols and DRM](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm) |
| A bundled JS service can use networking and filesystem APIs; its Node runtime depends on the TV generation. | Investigate a service-owned session, while testing its lifecycle and media handoff separately. | [JS service basics](https://webostv.developer.lge.com/develop/guides/js-service-basics), [JS service usage](https://webostv.developer.lge.com/develop/guides/js-service-usage) |
| Developer Mode enables TV installation and debugging and has an expiring session. | Test through sideloading first and document the displayed renewal timer. | [Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) |

NVT documents individual eligible accounts, prohibits transferring login details, and permits one device at a time. It lists supported browser/mobile environments, without promising webOS compatibility. Build for each user's independent session and handle replacement or expiry gracefully. See the [official NVT FAQ](https://nvt.gov.hu/en/pages/faq).

## Questions the feasibility spike must answer

1. What is the real signed-out entry point and login protocol? Inspect form action, redirect chain, CSRF protection, cookie scope and expiry, and any MFA or CAPTCHA without recording secret values.
2. Does login need interactive browser execution, or can a client reproduce the normal protocol? Is there a documented integration API?
3. How does the player resolve its media resource? Determine manifest type, codecs, DRM, segment/key/license hosts, tokens, and required headers. Retain redacted structural notes only.
4. Does the media stay inside the NVT proxy? Verify manifests, nested playlists, segments, keys, licenses, and refresh requests rather than guessing from page URL shape.
5. Can the native C5 player authenticate every required request? A successful service HTTP request does not prove the video engine shares its session.
6. Can a supported browser-mediated login return control to our UI? Do not assume system-browser cookies are shared with apps or that a cross-origin iframe is permitted.
7. What happens after standby, cold launch, expiry, connection loss, and another device signing in?
8. What distribution conditions apply to a third-party client? Review the relevant provider terms and LG submission requirements before public distribution; store approval is not established.
9. What protected credential storage can a third-party C5 app actually access? Persistent email/password storage is required by the owner for automatic reauthentication. Verify an OS secret store or document an app-private encryption/key-protection design; no accessible OS secret-store API has yet been established. Test storage through cold restart, sign-out, and app updates. Do not infer third-party API access from LG platform security marketing or webOS OSE documentation.

## Decision rule

Record a tested login-to-native-playback route on the real C5 before committing to a framework or promising standalone installation. If every viable route needs an additional device, report that requirement explicitly and revise the product plan.

## Implementation follow-up — 2026-10-25

An isolated, unauthenticated HTTP session successfully inspected the public login page by retaining its normal cookie-test cookies through redirects. The page exposes a standard POST form with `uname`, `pwd`, `pwd1`, `pwd2`, and a method supplied by `an_login.js`. The current method is a single LDAP method, without enabled hardware-ID or client-security requirements in the inspected configuration. No refresh-token endpoint was observed. The owner subsequently signed into the custom local preview successfully.

Chrome's authenticated network response showed an ordinary HLS source in the `player.php` playlist. Master/variant playlists and video segments are proxied through NVT to Connectmedia CDN nodes; AES-128 key references also occur. No copied stream URL, cookie, key value, or captured provider media is stored in this repository. A later request probe using the preview's own session fetched the master playlist, a variant, a video segment, and its key successfully through the app's loopback relay.

Public live-page bootstraps were checked for M1, M2, M4 Sport +, M5, Duna, and Duna World in addition to M4. The stream catalogue has a `streams` array containing `code`, `type`, and programme metadata; only currently live recognized event feeds are added. This is discovery evidence, not verified playback of every channel.

The current packaged-app candidate uses an app-owned JS service for gateway cookies and a loopback-only media relay. Saved credentials use an encrypted Web Crypto/IndexedDB vault in the app origin, with explicit limitations documented in [implementation status](IMPLEMENTATION.md). All relevant hardware and service-lifecycle checks remain pending on the owner's C5.
