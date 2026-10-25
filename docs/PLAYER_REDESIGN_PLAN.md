# Live TV interface and programme guide plan

Status: approved and implemented on `codex/live-tv-redesign`; physical TV validation remains open.
Prepared: 25 October 2026.

## Proposed result

Keep live video fullscreen with no floating windows during ordinary viewing. While the interface is hidden, Left/Right switch channels, Up opens the programme guide, and Down opens the floating toolbar. OK and pointer movement also reveal the toolbar. Put a modern back-arrow button on the left, followed by the programme guide and quality buttons. Use an Apple Liquid Glass-inspired visual language across the player, channel cards, and sign-in panel, adapted for television readability and the older CX build.

The main additions are a floating now/next display, a programme guide covering upcoming hours and available future days, and a stream-aware quality selector. Remove the built-in video timeline and redundant fullscreen button.

## 1. Player layout

Move the current top-right “back to menu” action into the leftmost position of a compact floating toolbar near the bottom-left. Use a rounded back-arrow button rather than a large text button. Keep the toolbar inside a generous TV-safe margin, approximately 4% from the edges.

Suggested arrangement, with illustrative labels:

```text
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                         LIVE VIDEO                                   │
│                                                                      │
│                                                                      │
│    M4 Sport  ·  ● ÉLŐ                                                │
│    Current programme title                                           │
│    21:00–23:02  ·  Következik: Next programme                         │
│                                                                      │
│    [ ← ]  [ ▦ Műsorújság ]  [ ⚙ Minőség · Auto ]                      │
└──────────────────────────────────────────────────────────────────────┘
```

The symbols above describe placement; implementation will use consistent vector icons. The guide and quality buttons retain visible Hungarian labels. The back button has an accessible “Vissza a csatornákhoz” label and reveals a short label on focus/hover, without shifting the toolbar.

- The back arrow returns to the channel list and stops playback, matching the existing action.
- The programme guide opens over the playing video.
- Quality opens a small anchored menu.
- The programme text and toolbar form one visual group with a dark translucent backing sufficient for bright footage.
- Long titles wrap to at most two lines; the panel must not grow indefinitely or overlap controls.
- Loading, retry, and playback errors remain clearly visible independently of the toolbar's auto-hide state.

### Controls to remove

Remove the browser-provided video controls and replace their useful actions with app-owned controls. This removes the seek/progress bar, elapsed playback counter, built-in fullscreen/expand button, and browser overflow menu. No on-screen pause, rewind, or fast-forward controls are proposed for this live-only interface. TV volume and mute remain system controls.

Preserve video aspect ratio; this plan does not introduce zoom or crop modes. If the desktop preview needs fullscreen, expose a separate desktop-only fullscreen action with actual working behaviour. It is unnecessary in the installed fullscreen TV app.

## 2. Remote shortcuts, focus, and auto-hide

### Watching with no floating windows

| Button | Action |
| --- | --- |
| Left | Switch to the previous available channel |
| Right | Switch to the next available channel |
| Up | Open Műsorújság directly for the channel being watched |
| Down | Reveal the floating toolbar and focus its back arrow |
| OK | Reveal the same toolbar and focus its back arrow |
| Back | Stop playback and return to the channel list |

Channel switching follows the channel-list order, including currently available event channels, and wraps at either end. With only one channel, Left/Right do nothing. Keep the interface hidden after a switch; loading and error feedback may still appear. Do not flash the toolbar or open a guide automatically.

Consume shortcut presses before general focus navigation sees them. Switching channels cancels pending resolution/startup work so rapid presses cannot let an older request replace the latest selection. Ignore repeat events from a held button initially, allowing one switch per distinct press and avoiding a burst of stream requests. Keep only one stream active.

### When an interface is open

Arrow keys navigate the open toolbar, guide, details, or quality menu. They do not switch channels or trigger the viewing shortcuts in this state. In the toolbar, Left/Right move between actions; Up opens the guide as a deliberate shortcut. Within the guide and quality menu, Up/Down navigate their items. Returning to unobstructed playback restores the viewing shortcuts.

| State | OK | Remote Back |
| --- | --- | --- |
| Watching, interface hidden | Reveal the toolbar and focus the back arrow; consume this press so it does not activate the button | Stop playback and return to the channel list, preserving existing behaviour |
| Toolbar visible | Activate the focused control | Dismiss the toolbar and return to unobstructed playback |
| Programme guide open | Open programme details or activate the selected action | Close details first, then the guide; if opened with Up from unobstructed playback, return there; otherwise restore focus to its launcher |
| Quality menu open | Apply the focused quality choice | Close the menu without changing quality; restore focus to its launcher |

- Opening Down/OK only reveals the toolbar; that press cannot also activate its focused back arrow. Up opens the guide with focus on the current programme, or the first upcoming item if no current programme is available.
- Pointer movement reveals the interface; hover and clicks work alongside directional navigation.
- Increase the current three-second auto-hide delay to approximately five seconds for the extra information and controls.
- Reset the delay on interaction. Keep the toolbar visible during pointer hover and keep guide/quality panels open until explicitly dismissed.
- When the toolbar hides, move focus to the video and make hidden controls unfocusable, as the current implementation does.
- Opening one panel closes the other. Focus stays within the open panel; underlying controls cannot activate accidentally.
- Guide scrolling uses its own scroll area, including the Magic Remote wheel. The current player-wide wheel suppression must be narrowed accordingly.
- Closing a panel opened from the toolbar restores the toolbar and restarts its hide timer. Closing the guide opened directly with Up restores hidden controls and video focus. Opening or browsing the guide must not restart the stream.

## 3. Floating programme guide

### Default view

Up during unobstructed playback, or the “Műsorújság” toolbar button, opens a floating panel on the right, approximately 40% of the screen width. Playback remains fullscreen behind it; opening the guide does not resize or reload the video. Use a readable dark glass surface that obscures only the panel area.

Start on the channel being watched and today's date, with the current programme visible and upcoming programmes below it. Show start/end times, title, and a current-programme badge. There is no programme progress bar.

The panel includes:

- Channel selector covering the seven regular channels.
- Date selector: today, tomorrow, and later dates with available data.
- Scrollable programme list, initially showing the next few hours.
- Programme details with description and episode information when supplied.
- A labelled close button, usable with the pointer and remote.

Selecting a row opens details; it does not silently change channels. Details for a current programme on another channel offer “Csatorna nézése”. Future programmes show their scheduled time and details. Catch-up playback, recording, and scheduled automatic switching are outside this change.

### Programme sources and coverage

Use the first-party data behind [MédiaKlikk's programme guide](https://mediaklikk.hu/musorujsag/). Read-only research on 25 October successfully retrieved schedules for 26 October, 28 October, and 1 November. This establishes several days of available data; it is not a guaranteed permanent seven-day service contract.

Observed channel mapping:

| App channel | Guide ID | Guide short code |
| --- | --- | --- |
| M1 | 1 | m1 |
| M2 / Petőfi TV | 2 | m2 |
| Duna | 3 | dn |
| Duna World | 4 | dw |
| M4 Sport | 30 | m4 |
| M5 | 33 | m5 |
| M4 Sport + | 34 | m4p |

The website loads daily HTML through its `programGuideInterface.php` endpoint. This is an observed website interface, not a documented public API. Isolate the parser so provider changes are easy to repair. Normalize programmes into channel, title, optional description, start, and end; never insert remote HTML into the app UI.

- Fetch guide metadata through the app service using a narrowly scoped source, outside the authenticated media relay. No new central backend is required.
- Cache normalized daily schedules; fetch today first and load other dates on demand. Prefetch tomorrow after the initial view is ready.
- Refresh today's data roughly every five minutes while relevant, and update the current/next selection locally at programme boundaries.
- Preserve explicit time offsets, including daylight-saving transitions. Store instants consistently and display times in Europe/Budapest. Zurich and Budapest currently share the same clock, but do not rely on the viewer's device timezone.
- Display a loading state, empty-day state, and “Műsoradatok nem érhetők el” fallback. Keep usable cached data with a last-updated indication during outages.
- Keep playback and channel selection usable when guide data fails.
- Temporary M4 event feeds retain their existing catalogue titles. Show a guide-unavailable state unless a reliable schedule mapping is established; do not borrow the main M4 schedule.
- Live sport times can change. Treat schedule times as planned times, not an exact synchronization with the video.

### Channel list integration

Use the same normalized guide cache to show “Most” and “Következik” on channel cards. Preserve channel logos, stable ordering, focus, and scroll position during refreshes. If no guide data is available, use the existing catalogue title or channel description.

## 4. Quality selector

Use “Minőség · Auto” in the toolbar. The menu lists Auto plus only the actual options discovered in the current channel's HLS master playlist. Example resolutions such as 1080p or 720p are illustrative and must never be hardcoded as available.

- Auto remains the default and retains adaptive playback.
- A manual choice selects a specific available rendition. Mark the selected item clearly.
- Deduplicate resolution labels where appropriate; distinguish frame rates or bitrate if otherwise ambiguous.
- For native HLS, serve an appropriately filtered master playlist through the existing relay, preserving required audio groups, encryption references, and relative URL resolution. Do not discard separate audio by blindly selecting a video-only playlist.
- For the existing hls.js fallback, use its supported quality-level controls with equivalent user-facing behaviour.
- A quality change may briefly restart native playback. Return to the live edge, keep the channel selected, and show a short loading state.
- If the chosen quality fails, make one bounded recovery attempt with Auto and explain the fallback.
- Retain the preference during the current app session. Revalidate it on channel changes; use Auto if the next channel does not offer it. Cross-relaunch persistence is deferred.
- With a single rendition, show the available quality as information rather than an empty or misleading selector.
- Auto describes the selection mode; show the active resolution only when it can be measured reliably.

Reference: [LG guidance on native quality selection](https://forum.webostv.developer.lge.com/t/show-video-quality-options-and-enforce-a-quality-level-to-native-player/27930).

## 5. Apple-inspired glass design

Aim for the visual qualities of Liquid Glass: layered translucent surfaces, rounded floating controls, fine highlights, soft shadows, and restrained motion. Adapt the look to a television viewed from a sofa, with strong text contrast and obvious remote focus.

| Component | Proposed treatment |
| --- | --- |
| Player toolbar | Rounded floating glass group, circular back action, labelled pill actions |
| Programme panel and quality menu | Shared dark translucent material, subtle border highlights, clear selected rows |
| Channel cards | Softer rounded corners, layered dark surfaces, preserved logos, clear current/next hierarchy |
| Sign-in panel | Matching glass surface, cleaner field spacing, consistent rounded buttons |
| Focus and selection | Bright accent outline with a modest lift/scale; selected state also has a checkmark or label |
| Background and branding | Keep the crown, Hungarian identity, and lime accent; soften the existing tricolour treatment where needed for contrast |

Use short, approximately 150–220 ms transitions. Honour reduced-motion preferences. Avoid continuous animated reflections, excessive shine, pointer-following effects, or full-screen blur.

Use system-available typography and original/simple vector icons. Apple's proprietary fonts, icons, and exact optical rendering are not dependencies.

### webOS 25 and CX behaviour

webOS 25 uses Chromium 120; CX's webOS 5.x uses Chromium 68. The features themselves remain shared. [LG engine specifications](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)

- On C5, try bounded CSS backdrop blur on the small toolbar and panel surfaces, subject to actual hardware checks.
- Video may be composed separately by the TV, so blur over video cannot be assumed to work. The base translucent material must look complete without blur.
- On CX, use a more opaque dark material and simpler shadows/transitions if blur is unavailable or expensive.
- Maintain the same controls, labels, focus order, and features in both builds.
- Keep text legible over white sports pitches, bright adverts, and dark films. Readability and uninterrupted playback take priority over the glass effect.

## 6. Implementation sequence

1. Build the shared visual styles and replace native video controls with the new app toolbar. Establish Left/Right channel switching, Up/Down shortcuts, back-arrow placement, focus, auto-hide, and desktop fullscreen behaviour.
2. Add the service-side programme source, normalization, bounded cache, and graceful failure handling.
3. Add the now/next display, right-side guide, channel/date browsing, details, and channel-card metadata.
4. Discover stream renditions and implement the quality menu for native HLS and the fallback player.
5. Apply the approved glass treatment to channel cards and sign-in, then tune the CX fallback.
6. Run the appropriate automated checks and inspect both builds visually. Package TV builds for device testing; installation is a separate action after review.

Likely implementation areas: `apps/tv/index.html`, `apps/tv/app.css`, `src/tv/main.ts`, `src/tv/controls.ts`, `src/tv/focus.ts`, `src/tv/player.ts`, Hungarian strings, backend/service contracts, programme-provider code, the media relay, and CX compatibility styles.

## 7. Acceptance checks

- First OK reveals controls without triggering Back. The arrow is the leftmost action, with Műsorújság next to it.
- With no floating windows, Left/Right switch channels in catalogue order and wrap correctly; Up opens the guide, and Down opens the toolbar without activating an action.
- Channel switches leave floating windows hidden. Rapid presses cannot revive an outdated stream request; held keys do not flood the service.
- Arrow navigation inside any open menu or panel cannot accidentally switch the playing channel. Back dismisses the toolbar before a subsequent Back returns to the channel list; a guide opened directly with Up closes back to unobstructed video.
- Remote arrows, OK, Back, pointer, and wheel work consistently; hidden controls never retain focus.
- Opening and browsing the guide leaves the current stream playing. Explicit “Csatorna nézése” switches it once.
- Today's current/next programmes and at least the next available days appear for all seven regular channels.
- Test midnight, offset changes, missing dates/descriptions, changed provider HTML, and stale cached data.
- No seek bar, elapsed playback counter, or redundant TV expand button remains.
- Quality choices match the manifest. Manual selection preserves audio and encrypted playback; Auto and bounded fallback work.
- Programme and menu text remain readable over bright moving video. Long titles, large focus outlines, and a full list fit without clipping.
- Test CX without backdrop blur and with its existing API fallbacks. The guide remains usable with remote-only navigation.
- Existing login, remembered account, session recovery, sign-out, suspension, and retry behaviour continue to work.
- Automated checks cover meaningful guide parsing/time cases, rendition filtering, and panel/focus interaction regressions. Real C5/CX checks cover glass rendering, native quality switching, and sustained playback; desktop results alone do not establish these.

## Review decisions

The proposed defaults to approve or adjust are:

1. Bottom-left floating toolbar with back arrow, Műsorújság, and Minőség, plus current/next information immediately above.
2. Right-side guide over uninterrupted fullscreen video, with channel and day browsing.
3. Dark Apple-inspired glass across the player, channel cards, and sign-in, retaining the existing brand and lime accent.
4. Live-only controls with no timeline or on-screen pause/seek buttons.
5. Auto quality by default, with manual choices based on actual stream variants.
6. Shared features on C5 and CX, with simpler visual effects on older hardware.
7. Unobstructed playback shortcuts: Left/Right change channel, Up opens the guide, Down opens controls. Back first dismisses an open interface; with none open, it returns to the channel list.

Reminders, favourites, previous-channel shortcuts, catch-up, recording, and integration with LG's system-wide guide are later ideas outside this implementation plan.

## Implementation record

The implementation includes the shared glass styles, hidden-interface channel shortcuts, toolbar, now/next information, channel/date guide with details, current/next channel-card text, and stream-discovered quality choices. Native and hls.js paths both receive a filtered master through the relay for manual selection; this keeps their audio/key handling consistent. Desktop fullscreen is separate from the installed TV controls.

Checks cover programme parsing, daylight-saving offsets, midnight boundaries, cache outages, variant filtering with separate audio/keys, stale channel-resolution cancellation, remote focus and panel navigation, guide browsing without stream restarts, quality fallback, and the CX compatibility build. Browser UI fixtures use synthetic accounts and media; they do not establish native-TV quality switching or blur performance. Read-only checks against the public guide returned schedules for today and tomorrow, including an empty M4 Sport + schedule tomorrow.

The TV packages must still be checked on physical C5/CX hardware for sustained playback, manual quality switching with audio, remote feel, and glass rendering over video. No installation or deployment is part of this implementation step.
