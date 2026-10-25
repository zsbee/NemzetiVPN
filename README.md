# NemzetiVPN for LG webOS

A planned, independent LG TV app for watching live media available through Nemzeti Virtuális Tér (NVT), using each viewer's own eligible NVT account.

**Status:** an installable feasibility build and a working local browser preview. The owner has successfully signed into the preview with NVT. Authenticated M4 playlists, a video segment, and an HLS key have been fetched through the app's relay. Testing on the physical C5 is still required; this is not a validated TV release.

Initial hardware target: **LG OLED C5**. Start with webOS 25 compatibility and confirm the TV's installed version before implementation. Older televisions are outside the first release target.

## Intended experience

1. Open the app and enter your own NVT email and password using the TV's built-in virtual keyboard.
   Stay signed in saves your login details on this TV so the app can restore access automatically; protected storage must be verified during development.
2. Choose an available live channel using the remote.
3. Watch fullscreen with the TV's video player.
4. Return to the channel list or sign out and remove saved login details and the local session.

The channel list includes M1, M2 / Petőfi TV, M4 Sport, M4 Sport +, M5, Duna, and Duna World. Active M4 event feeds are discovered from the provider's current catalogue. Channels may be off air or require additional playback support; their presence is not a claim that every broadcast has been tested. On-demand browsing is a later possibility. QR/phone pairing is outside the MVP; login is designed to work on the TV without an additional server.

## Try the preview

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open [the local preview](http://127.0.0.1:4390). Sign in with your own NVT email and password in the app. The development server listens only on this computer and forwards authentication to NVT over HTTPS; it does not save credentials or log request bodies. With Stay signed in selected, the **browser profile on this computer** saves an encrypted login. Sign out to remove it. On the TV, that storage belongs to the installed app instead.

The preview and installed app use the same authentication and playback code. The browser uses HLS.js when native HLS is unavailable; the TV prefers its native video engine. Provider content and session cookies are handled by the app-owned service and a temporary loopback media relay.

## Build and install on the C5

```sh
npm run package:tv
```

The package is written to `dist/packages/hu.nemzetivpn.tv_0.1.0_all.ipk`. Follow the [TV setup guide](docs/TV_SETUP.md) to enable Developer Mode, connect the TV, and install it. No TV address or private device key is committed.

## Checks

```sh
npm run typecheck
npm test
npm run test:ui
npm run probe:login
```

Browser tests require Google Chrome and use isolated test profiles with synthetic credentials and generated test media. They never log into a real account. The public login probe inspects only the signed-out form. See [implementation status and limits](docs/IMPLEMENTATION.md) for the exact evidence and remaining TV checks.

## Project documents

- [Project plan](docs/PROJECT_PLAN.md): scope, architecture choices, milestones, and acceptance criteria.
- [Research notes](docs/RESEARCH.md): observed behavior, platform constraints, sources, and unanswered questions.
- [Authentication design](docs/AUTHENTICATION.md): per-user login, session lifecycle, and privacy requirements.
- [Implementation status](docs/IMPLEMENTATION.md): current architecture, storage protections, verification, and remaining work.
- [TV setup](docs/TV_SETUP.md): Developer Mode, installation, and device checks.

## Development and publication

The implementation uses TypeScript, a small DOM-based interface, and a bundled webOS JS service compiled for Node.js 16. Do not treat desktop playback as proof of TV compatibility. Credential storage uses AES-GCM and a non-exportable Web Crypto key in IndexedDB; it is not claimed to be a hardware-backed keystore, and C5 persistence must be tested.

Local Git uses the `main` branch. No remote or public repository has been configured. Open-source publication is planned; choose a license before public release. The project is not affiliated with NVT, MTVA, or LG. The app will require an existing eligible account; registration remains with NVT.

Never commit credentials, cookies, signed playback URLs, or unredacted browser captures. Keep private investigation files in the ignored `research-private/` directory. Ignore rules are a convenience, not a substitute for reviewing staged files.
