# Authentication and session design

This is a proposed design, pending inspection of NVT's signed-out flow. No authentication endpoint, OAuth grant, device-code API, or refresh-token API has been established.

## User experience

Each installation authenticates its own eligible viewer. There is no project-wide account, shared session, or maintainer-hosted credential service.

For the first version, support login on the television through the normal provider flow if it works within webOS. If a native form is technically compatible, request only the fields actually required by NVT. Support remote navigation, the TV keyboard, masked password input, cancellation, and clear errors. Hand interactive challenges to the viewer. Account creation and password reset stay on the official site.

Phone or laptop assistance is optional future work. A QR code alone cannot transfer an authenticated session. Add it only after proving a provider-supported return flow or designing an explicit, secure pairing mechanism with a clear trust model. Never ask users to paste browser cookies into the app.

## Session ownership

Prefer the provider's browser-managed session when a supported in-app flow can retain it and feed playback. If a packaged app needs an app-owned cookie jar, place protocol handling in a bundled service after proving that it can authenticate the media player as well.

- Keep credentials transient and discard them immediately after the login attempt; never store the password for automatic retries.
- Keep sessions in memory for the initial spike. "Remember me" is disabled until a suitable protected persistence mechanism has been verified on the target TV. Do not describe ordinary app files or localStorage as secure credential storage.
- Scope cookies by origin, path, expiry, and secure attributes. Validate redirects and do not forward credentials or cookies to unrelated hosts.
- Use HTTPS with normal certificate validation. Follow only inspected, required provider routes and explicitly approved media destinations.
- Resolve playback resources when requested. Treat signed URLs as secrets with limited lifetimes, not channel identifiers.
- Stop retrying on authentication failure. Return the viewer to sign-in rather than repeatedly submitting the password or locking their account.

## State and behavior

```text
signed out -> authenticating -> signed in -> resolving media -> playing
                    |               |              |              |
                    +-- failure ----+-- expiry ----+-- expiry ----+
                                    -> sign-in required

signed in / playing -> signing out -> signed out
```

Model network errors, unavailable content, and unsupported media separately from invalid credentials. A request returning HTML instead of media may indicate a login redirect; check response type and final destination. Do not infer a valid session merely because a welcome page is cached.

On sign-out, stop playback, cancel requests, invoke the observed provider logout flow where available, and erase all local session material. Clear local state even if remote logout fails, and explain that remote termination could not be confirmed. On app suspension, stop playback and revalidate on resume; do not assume uninterrupted background service execution.

## Open-source boundary

Commit only source code, public route templates, synthetic fixtures, and redacted protocol notes. Exclude credentials, email addresses used for research, cookies, authorization headers, signed URLs, and raw HAR files from source and issue reports. Diagnostics should expose error categories and status codes without secret request bodies or URLs.

Design the provider adapter so a second eligible viewer can authenticate without source changes. Test account replacement by signing out and signing in as another viewer; do not carry cookies or cached user data across accounts. Keep playback to one active stream and avoid background channel previews.
