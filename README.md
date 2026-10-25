# NemzetiVPN for LG webOS

A planned, independent LG TV app for watching live media available through Nemzeti Virtuális Tér (NVT), using each viewer's own eligible NVT account.

**Status:** project planning and feasibility research. There is no runnable TV app yet.

Initial hardware target: **LG OLED C5**. Start with webOS 25 compatibility and confirm the TV's installed version before implementation. Older televisions are outside the first release target.

## Intended experience

1. Open the app and enter your own NVT email and password using the TV's built-in virtual keyboard.
2. Choose an available live channel using the remote.
3. Watch fullscreen with the TV's video player.
4. Return to the channel list or sign out and remove the local session.

Start with M4 Sport. Add other available channels after authentication and playback work reliably on the C5. On-demand browsing is a later possibility. QR/phone pairing is outside the MVP; login is designed to work on the TV without an additional server.

## Project documents

- [Project plan](docs/PROJECT_PLAN.md): scope, architecture choices, milestones, and acceptance criteria.
- [Research notes](docs/RESEARCH.md): observed behavior, platform constraints, sources, and unanswered questions.
- [Authentication design](docs/AUTHENTICATION.md): per-user login, session lifecycle, and privacy requirements.

## Development and publication

The repository starts with documentation only. Select the runtime and dependencies after the login/playback feasibility milestone; do not treat a desktop browser demo as proof of TV compatibility.

Local Git uses the `main` branch. No remote or public repository has been configured. Open-source publication is planned; choose a license before public release. The project is not affiliated with NVT, MTVA, or LG. The app will require an existing eligible account; registration remains with NVT.

Never commit credentials, cookies, signed playback URLs, or unredacted browser captures. Keep private investigation files in the ignored `research-private/` directory. Ignore rules are a convenience, not a substitute for reviewing staged files.
