# Authentication and session design

This is a proposed design, pending inspection of NVT's signed-out flow. No authentication endpoint, OAuth grant, device-code API, or refresh-token API has been established.

## User experience

Each installation authenticates its own eligible viewer. There is no project-wide account, shared session, or maintainer-hosted credential service.

The agreed first-version experience is email-and-password entry on the television using the built-in webOS virtual keyboard. NVT does not support QR login, as confirmed by the owner. No phone pairing or additional hosting is required for the login UX. The underlying NVT authentication requests and media-session handoff still need to be proved.

Show a single sign-in screen with Email, Password, Show password, and Sign in. Use normal HTML input controls so selecting a field opens the system keyboard. Keep the form above the keyboard area, reserving the bottom third of the screen. Use an email-appropriate input configuration, disable autocapitalization and spellcheck, and test its keyboard layout on the C5. Mask the password by default; the viewer can explicitly reveal it, and leaving the screen masks it again. See [LG's virtual keyboard guide](https://webostv.developer.lge.com/develop/guides/virtual-keyboard).

Directional keys and OK must reach every control; the Magic Remote pointer should work too. Keyboard completion advances from Email to Password, then to the explicit Sign in button where supported. Back dismisses the keyboard before leaving the sign-in screen; verify the system event behavior on the TV. Avoid opening the keyboard on every screen visit by initially focusing a non-editable control.

Submit once, show a signing-in state, and prevent duplicate requests. On invalid credentials, retain the email for correction, clear the password, and focus Password without automatically reopening the keyboard. On a network error, offer an explicit retry without submitting repeatedly. Hand any provider challenges to the viewer. Account creation and password reset stay on the official site.

The owner requires persistent email and password storage on the TV for automatic authentication recovery. Provide a clearly labeled Stay signed in option, enabled by default, with helper text explaining that it saves login details on this TV. Save the credentials only after a successful login. Viewers who disable it get a session-only login, and disabling it later deletes previously stored credentials. Sign-out removes credentials and session material. Never ask users to paste browser cookies into the app.

On later launches, reuse a valid session first. Renew it through the provider's refresh mechanism if one exists. If the session has expired and cannot be refreshed, use the saved email and password to complete the normal login automatically, then retry the interrupted operation once. Password-based sign-in is automatic reauthentication; it must not be implemented against an assumed refresh-token endpoint. A password change, rejected credentials, or interactive challenge returns control to the viewer.

When saved credentials are rejected, remove the stored password, retain the email only for the correction screen, and require explicit resubmission. Prevent repeated background attempts until the viewer updates their login details. Do not sign in periodically while the app is closed or the TV is in standby: recover authentication on launch, resume, or an active operation that requires it.

## Session ownership

Prefer the provider's browser-managed session when a supported in-app flow can retain it and feed playback. If a packaged app needs an app-owned cookie jar, place protocol handling in a bundled service after proving that it can authenticate the media player as well.

- Store the opted-in email/password and session secrets in an app-scoped credential store on the TV. Prefer a supported OS-backed secret store if accessible to third-party apps. Verify its actual availability and permissions on the C5; no such API has yet been established for this project.
- If OS-backed storage is unavailable, evaluate encrypted app-private storage with an explicit key-protection design and documented limitations. A hardcoded key or an encryption key stored next to the ciphertext does not provide meaningful protection against extraction. Do not describe ordinary app files, localStorage, or app isolation alone as secure encrypted storage.
- Prefer a service-owned credential store when the selected architecture permits it. Expose authenticate/restore/delete operations to the UI rather than a method that returns saved passwords. Clear input fields after successful login and keep plaintext copies only as long as required to authenticate. Never put secrets in logs, diagnostics, telemetry, source, or build output.
- Memory-only storage is acceptable for early disposable protocol probes, but does not fulfill the MVP requirement. Prove persistence, key handling, and automatic reauthentication across a cold restart before declaring login complete. If the platform cannot meet the required protection, record the concrete limitation and revisit the storage design with the owner.
- Scope cookies by origin, path, expiry, and secure attributes. Validate redirects and do not forward credentials or cookies to unrelated hosts.
- Use HTTPS with normal certificate validation. Follow only inspected, required provider routes and explicitly approved media destinations.
- Resolve playback resources when requested. Treat signed URLs as secrets with limited lifetimes, not channel identifiers.
- Stop retrying on authentication failure. Return the viewer to sign-in rather than repeatedly submitting the password or locking their account.

## State and behavior

```text
 github
 |               |              |              |
                    +-- failure -> correction / explicit retry
                                    expiry -> refreshing session
                                           -> automatic reauthentication
                                           -> signed in / retry once
                                           -> sign-in required on rejection or challenge

signed in / playing -> signing out -> signed out
```

Model network errors, unavailable content, and unsupported media separately from invalid credentials. A request returning HTML instead of media may indicate a login redirect; check response type and final destination. Do not infer a valid session merely because a welcome page is cached.

On sign-out, stop playback, cancel requests, prevent in-flight authentication from restoring a session, invoke the observed provider logout flow where available, and erase saved credentials and all local session material. Clear local state even if remote logout fails, and explain that remote termination could not be confirmed. On app suspension, stop playback and revalidate on resume; do not assume uninterrupted background service execution. Serialize concurrent authentication recovery so multiple failed requests trigger one login attempt. Never automatically reclaim a session from another active device in a retry loop.

## Open-source boundary

Commit only source code, public route templates, synthetic fixtures, and redacted protocol notes. Exclude credentials, email addresses used for research, cookies, authorization headers, signed URLs, and raw HAR files from source and issue reports. Diagnostics should expose error categories and status codes without secret request bodies or URLs.

Design the provider adapter so a second eligible viewer can authenticate without source changes. Test account replacement by signing out and signing in as another viewer; do not carry cookies or cached user data across accounts. Keep playback to one active stream and avoid background channel previews.
