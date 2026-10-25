# Implementation status — 2026-10-25

## Evidence and remaining checks

| Area | Current evidence | Still required |
| --- | --- | --- |
| NVT login | Owner signed into the app; subsequent C5 app updates automatically restored login from the encrypted vault. | Full TV restart, rejected passwords, and account-specific challenges. |
| Authenticated media | C5 native M4 playback observed with an advancing clock, readyState 4, and 1920×1080 video. The owner confirmed it works. | 30-minute stability and coverage of every channel/broadcast. |
| Channels | Seven main TV channels configured; M4 and M1 native playback verified at 1920×1080. Current catalogue supplies programme titles and active M4 event feeds. | Remaining channels and broadcast-specific restrictions. |
| Saved credentials | Browser tests verify encrypted storage, non-exportability, tamper rejection, reload, deletion, and automatic reauthentication. C5 restored saved login after app updates. | Full TV restart and broader storage failure testing. |
| Remote UX | Desktop tests cover focus, password masking, field progression, Back, and space for the keyboard. The C5 overlay hides after inactivity and reappears on a pointer event; browser tests also cover remote OK. | Broader physical remote and keyboard testing. |
| Packaging | LG CLI created the app/service IPK, installed it on the owner's C5, and confirmed the app launched and is running (firmware 33.31.68, SDK 10.3.1). | Service caller identity, permissions, and loopback reachability on the television. |

Desktop UI tests use only synthetic accounts. A three-second locally generated HLS fixture exercises real browser playback. Fetching authorized M4 media establishes the request path; it does not substitute for watching it on the television.

## Current architecture

`apps/tv` holds HTML, CSS, and webOS metadata. `src/tv` implements the interface, focus handling, account recovery, and encrypted vault. `src/provider` implements the Array gateway protocol, channel catalogue, player resolution, and media relay. `src/service` exposes a small app-restricted Luna API. `src/dev` exposes the same backend to a loopback-only desktop preview.

The public NVT form at `/prx/000/http/localhost/login/index.html` posts to `/prx/000/http/localhost/login`. Its fields are `uname`, `pwd`, `pwd1`, `pwd2`, and a dynamically discovered authentication method. The adapter carries the normal gateway cookies, retains hidden fields, and verifies the welcome page after login. It does not invent a refresh-token API. The owner's successful preview login confirms this form submission works for their account.

M4's page supplies `loadPlayer` setup data. The adapter reads its literal JSON, requests the observed `player.php` route, and extracts the returned HLS source. No provider JavaScript is executed inside our interface. The gateway rewrites provider pages and media URLs, so host validation includes both the outer HTTPS gateway and the approved inner destinations.

The media relay listens on **127.0.0.1 only**, on a temporary port, with a random capability in the path and a bounded map of registered resources. It rewrites nested playlists, audio/video resources, initialization maps, and AES-128 key references. Requests use the service's cookie jar. It cannot accept arbitrary user-supplied URLs, does not listen on the home network, and does not transcode or save media to disk. It limits concurrent requests to four and each buffered resource to 16 MiB. Starting another channel or signing out closes the previous relay. DRM formats requiring a license integration are explicitly unsupported in this first build.

The TV UI holds a service subscription while in use, releasing it when hidden. LG documents service idle termination and discourages lengthy service lifetimes; sustained relay behavior is an explicit hardware validation item. If the platform cannot sustain it, the architecture will need revision. Playback prefers native HLS, with a bounded MediaSource/HLS.js fallback when available. Each startup attempt has a 15-second limit so an unresponsive player cannot leave the loading screen indefinitely.

### Fixes verified on the C5 (0.1.3)

The initial relay removed filename extensions, while the native player was given a bare `video.src`. LG documents extension-based HLS detection and explicit transport selection through `mediaOption`. Relay resources now preserve media extensions, native playback uses a typed source with `mediaTransportType: HLS`, and the relay supports HEAD, content lengths, and byte ranges. The owner confirmed playback; developer diagnostics observed advancing native M4 and M1 video at 1920×1080. See [LG mediaOption reference](https://webostv.developer.lge.com/develop/guides/mediaoption-parameter).

M1's page redirected through the gateway to `hirado.hu`, which the initial destination allowlist omitted. The fix allows that specific provider hostname and passes the final page URL to the player bootstrap. M1 then reached native playback on the C5 without an authentication error. The allowlist remains closed to unrelated destinations.

Playback chrome fades out after three seconds of inactivity and returns on pointer movement or remote OK. Hidden controls are inert and removed from accessibility navigation; remote Back continues to return to the selected channel. Safe service diagnostics expose only request counts, failure categories, resolution stage, channel ID, and a sanitized provider hostname—never credentials or signed URLs.

## Credential storage and trust boundary

The implementation saves the opted-in email/password only after a successful provider login. It encrypts the record with AES-256-GCM, a fresh random IV, and authenticated version/context data. A randomly generated, **non-exportable Web Crypto key** is structured-cloned into the app origin's IndexedDB alongside the encrypted record. There is no hardcoded key or plaintext fallback. The code verifies a write/read/decrypt round trip before claiming success.

This is browser-managed key storage, **not a verified hardware-backed LG secret store**. Non-exportability prevents ordinary JavaScript key export; application code can still use the key to decrypt the record. It does not protect against compromised app code, a privileged attacker, or a fully extracted browser profile. Do not claim that encrypting the record alone prevents those attacks. Persistence across C5 app updates has passed; full restart and TV-origin isolation checks remain open. No supported third-party hardware keystore API was established during this investigation.

This concretely selects the UI-owned Web Crypto option instead of the earlier preference for a service-owned vault. Credentials are decrypted only to perform sign-in and sent over the local app/service boundary; provider cookies stay in service memory. Cold starts may therefore perform a new normal login using saved credentials. Session refresh is used only if a real supported mechanism is identified later.

An unavailable or incompatible storage API prevents saved-login operation and produces an error; it never silently writes plaintext. Sign-out removes the encrypted record and its key, cancels authentication recovery, and clears the service cookie jar. Rejected saved credentials are erased. Retries share one authentication attempt and stop after one repeated failure.

## Known limitations

- NVT's JavaScript logout link has not yet been traced to a verified server logout operation. The app clears all its local credentials/session state and tells the viewer that remote termination could not be confirmed. Server-side logout remains required before release.
- All seven base channels are listed during a programme-catalogue outage; their current availability is determined when selected. Radio and on-demand browsing are not included yet.
- Media keys are fetched as part of normal authorized HLS playback. No keys, session cookies, signed media URLs, or provider content are committed or logged.
- The LG CLI pins a dependency tree in its own shrinkwrap; `npm audit` reports advisories within that development tool. The CLI and that dependency tree are not included in the TV package or the custom preview server. Update the tool when upstream fixes are available; do not expose its development servers publicly. App runtime dependencies are bundled separately with third-party license notices.
- The source license and public distribution remain undecided. This is a local development build.

Sources: [LG service lifecycle FAQ](https://webostv.developer.lge.com/develop/guides/js-service-faq), [LG service usage](https://webostv.developer.lge.com/develop/guides/js-service-usage), [LG platform engines](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine).
