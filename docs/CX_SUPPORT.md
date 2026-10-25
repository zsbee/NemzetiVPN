# Experimental webOS 5.x / LG OLED CX build

Work lives on `support/cx`. The original webOS 25 build remains the default:
`npm run build`, `npm run package:tv`, and the existing TV/provider/service sources
are unchanged. CX compatibility uses separate entry points and files in `src/cx`.

## Build and install

```sh
npm run package:cx
```

The experimental package is `dist/cx/packages/hu.nemzetivpn.tv_0.1.4_all.ipk`.
The normal C5 package remains in `dist/packages/`.

Enable LG Developer Mode and configure the CX as a separate device using the
[TV setup guide](TV_SETUP.md), substituting its device name/address for the C5.
Then install:

```sh
npx ares-install --device cx dist/cx/packages/hu.nemzetivpn.tv_0.1.4_all.ipk
npx ares-launch --device cx hu.nemzetivpn.tv
```

Both builds use the same app ID, allowing the same account storage format on a
TV. Installing one replaces the other on that TV; they are not separate apps.
Do not treat changing builds as a backup of saved credentials.

`npm run dev:cx` runs the CX browser bundle in the desktop preview. Its desktop
server still requires Node 22; the packaged TV service targets Node 8.12.

## Compatibility changes

LG documents Chromium 68 and Node 8.12 for webOS 5.x (and Node 8.12 for webOS 6).
The CX build compiles the shared app/service to those targets. Only this build
loads the following adapters:

- Missing browser APIs: `globalThis`, `replaceChildren`, `Promise.allSettled`,
  preview request timeouts, and the playback overlay's inert controls.
- CSS fallbacks for focus outlines, font sizing, background positioning/gradient,
  and flex spacing. The C5 stylesheet is copied and extended only in `dist/cx`.
- Explicit `file:` permission for scripts, stylesheets and images in the CX
  content security policy, so webOS 5 can load packaged assets from a file address.
  Network access and the other security directives retain the shared restrictions.
- Service URL globals, cancellation, and the string methods used by the provider.
- Build-time mapping of `node:` imports to Node 8 module names. Small HTTP/HTTPS
  adapters preserve response chaining and request cancellation on the older API.
- Bounded streaming gzip/deflate decoding, since Node 8 lacks `maxOutputLength`.
- If Web Crypto is unavailable on the TV origin, sign-in can still use a temporary
  session. Saved login reports a storage warning and never falls back to plaintext.
  Previous saved credentials are erased before switching accounts.

Native HLS remains the preferred playback path. The provider host allowlist,
loopback relay, encryption format and authentication protocol are shared with C5.
No transcoding or new DRM support is added.

## Verification

```sh
npm run check
npm run test:cx
npm run test:ui:cx
```

`test:ui:cx` runs the existing browser regression suite against the CX bundle,
plus a packaged `file:` page load and tests with newer browser APIs removed. These are modern Chrome tests with
missing APIs, not a full Chromium 68 or webOS emulator.

To execute the backend checks on an actual Node 8.12 binary, set its path:

```sh
NVT_NODE8=/path/to/node-v8.12.0/bin/node npm run test:cx
```

The legacy-runtime checks use synthetic login responses and media. They exercise
provider parsing/login, local playback playlists/ranges and rejected origins,
request cancellation, and decoded-size limits. They do not contact NVT.

## Required CX hardware checks

This is compatibility work ready for device testing, not verified CX support.
On a CX (including firmware 04.64.00), verify:

1. Installation, service startup, caller identity and access to the loopback relay.
2. NVT sign-in, wrong-password handling, and account switching.
3. Saved login after app relaunch, update, and a full TV restart. If the TV origin
   lacks supported Web Crypto/IndexedDB key storage, verify temporary login and
   the storage warning instead.
4. Native playback of M4/M1 and other channels; watch for at least 30 minutes.
5. Remote focus, virtual keyboard, wheel, overlay hiding/OK, Back and sign-out.
6. Network interruption, channel changes, suspension, and session recovery.

C1 may also benefit from these fallbacks, but it has not been device-tested.

Sources: [LG web engines](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine),
[LG service runtimes](https://webostv.developer.lge.com/develop/guides/js-service-basics).
