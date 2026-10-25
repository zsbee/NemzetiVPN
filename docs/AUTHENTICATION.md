# Authentication and session design

This is a proposed design, pending inspection of NVT's signed-out flow. No authentication endpoint, OAuth grant, device-code API, or refresh-token API has been established.

## User experience

Each installation authenticates its own eligible viewer. There is no project-wide account, shared session, or maintainer-hosted credential service.

The agreed first-version experience is email-and-password entry on the television using the built-in webOS virtual keyboard. NVT does not support QR login, as confirmed by the owner. No phone pairing or additional hosting is required for the login UX. The underlying NVT authentication requests and media-session handoff still need to be proved.

Show a single sign-in screen with Email, Password, Show password, and Sign in. Use normal HTML input controls so selecting a field opens the system keyboard. Keep the form above the keyboard area, reserving the bottom third of the screen. Use an email-appropriate input configuration, disable autocapitalization and spellcheck, and test its keyboard layout on the C5. Mask the password by default; the viewer can explicitly reveal it, and leaving the screen masks it again. See [LG's virtual keyboard guide](https://webostv.developer.lge.com/develop/guides/virtual-keyboard).

Directional keys and OK must reach every control; the Magic Remote pointer should work too. Keyboard completion advances from Email to Password, then to the explicit Sign in button where supported. Back dismisses the keyboard before leaving the sign-in screen; verify the system event behavior on the TV. Avoid opening the keyboard on every screen visit by initially focusing a non-editable control.

Submit once, show a signing-in state, and prevent duplicate requests. On invalid credentials, retain the email for correction, clear the password, and focus Password without automatically reopening the keyboard. On a network error, offer an explicit retry without submitting repeatedly. Hand any provider challenges to the viewer. Account creation and password reset stay on the official site.

Offer an unchecked Remember email option for convenience; it stores only the email locally and is independent of session retention. Sign-out removes the session and saved email. Try to retain a valid session across launches only when protected persistence is verified, subject to NVT expiry. Otherwise explain that sign-in will be required again. Never ask users to paste browser cookies into the app.

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
