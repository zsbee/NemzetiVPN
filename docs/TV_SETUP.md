# Install the feasibility build on the LG OLED C5

This first hardware test checks the system keyboard, credential persistence, app-service permissions, and native playback.

First installation completed on 2026-10-25. LG's tools confirmed model `OLED65C59LB.DVSQLJP`, SDK `10.3.1`, and firmware `33.31.68`. After correcting native HLS initialization, the TV played M4 at 1920×1080 with an advancing playback clock, and the owner confirmed playback works. Saved login survived app updates. Full restart and stability checks below remain open.

## Prepare the television

1. Connect the C5 and development computer to the same home network.
2. Install LG's **Developer Mode** app from LG Apps on the TV.
3. Open it and sign in with an LG developer account. This is separate from the NVT viewing account.
4. Enable **Dev Mode Status** and allow the TV to restart.
5. Reopen Developer Mode and enable **Key Server**. Note the TV's displayed IP address and the temporary passphrase.

Enter the device passphrase only when the LG tools request it. Do not put it in the repository or an issue report.

## Connect and install

From the repository on the computer:

```sh
npm ci
npx ares-setup-device
```

Add a device named `c5` with the TV's actual IP address, port `9922`, and user `prisoner`, following LG's Developer Mode instructions. Then:

```sh
npx ares-novacom --device c5 --getkey
npx ares-device --system-info --device c5
npm run package:tv
npx ares-install --device c5 dist/packages/hu.nemzetivpn.tv_0.1.3_all.ipk
npx ares-launch --device c5 hu.nemzetivpn.tv
```

The `getkey` command asks for the passphrase shown on the TV. Record the installed webOS/SDK version and firmware from system info. This build targets webOS 25; check the actual version before diagnosing incompatibilities.

The installed app runs on the television. The computer preview server is not needed for the TV app.

## Validate on the real device

- Select Email and Password using the remote. Verify that the system keyboard opens, does not cover the fields, and Back dismisses the keyboard before exiting the screen. Check password reveal and masking.
- Sign in with Stay signed in enabled. Verify the app reports the login was saved; a storage warning means persistence has not passed.
- Fully close and reopen the app, then restart the TV and reopen it. Both should restore access without retyping the password when NVT permits unattended login.
- Start M4, test another main channel, and test an active event feed when available. Confirm audio, fullscreen video, at least 30 minutes of stability, and one active stream.
- Use Back from playback and verify focus returns to the selected channel. Check directional navigation and the Magic Remote pointer through the full channel grid.
- Test standby/resume and a temporary network interruption. A rejected password or interactive provider challenge should prompt the viewer instead of repeatedly submitting saved credentials.
- Sign out, fully relaunch, and confirm that no saved login is restored. Test the separate saved-login deletion action too.

## Developer Mode renewal

Use the remaining-session timer and **EXTEND** control shown by LG's Developer Mode app. LG documents that expiring Developer Mode removes developer-installed apps; do not treat their data as a permanent backup. Normal app updates and data persistence still need to be checked on this C5.

Primary source: [LG Developer Mode setup](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app).
