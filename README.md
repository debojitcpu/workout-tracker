# DEBO'S FIT TRACKER — PWA

A light-theme, local-first workout and body-weight tracker. This is a first usable version, not a native Android widget.

## Included
- Body weight log and goal progress (default 47 kg → 52 kg)
- Flexible editable weekly workout plan
- Session start/end times and duration
- Exercises and set-by-set load/reps, including bodyweight exercise flag
- Session ratings, recovery, sleep, notes, and pain log
- Basic personal records based on logged sets
- Weight trend chart
- Progress photo gallery stored in browser IndexedDB
- Full JSON backup/restore and workout/weight CSV exports
- PWA manifest and service worker for offline use when served over HTTPS or localhost

## Quick launch on Windows 11

### Easiest way to test locally
1. Install Python 3 from https://www.python.org/downloads/windows/ if it is not already installed. During setup, enable “Add python.exe to PATH”.
2. Extract the ZIP to a folder.
3. Open that folder in File Explorer.
4. Click the address bar, type `cmd`, and press Enter.
5. Run:
   ```bat
   py -m http.server 8000
   ```
6. On the laptop open `http://localhost:8000`.
7. To test on your phone over the same Wi-Fi, find your laptop's local IPv4 address with `ipconfig`, then open `http://YOUR-LAPTOP-IP:8000` on the phone. Windows Firewall may need a private-network allow rule.

Note: localhost supports service workers/PWA features in the laptop browser. A phone accessing an ordinary `http://192.168...` address is not a secure context, so install/offline PWA features may not work there.

### Install as a home-screen PWA
Host the folder on a static HTTPS host you trust (for example, a static-site host). Open the HTTPS URL in Chrome on the Samsung phone, then use Chrome's menu → “Install app” or “Add to Home screen” if offered. Exact wording varies by browser/version.

## Storage and privacy
- Structured records are stored in IndexedDB, and photos are stored as blobs in IndexedDB.
- Data is not synced to a server by this app.
- Browser/site data clearing can delete records. Export JSON backups regularly.
- JSON backup may be large if you include many photos. Keep a separate copy of important photos too.
- CSV exports contain workout sets or weight logs; photos are not in CSV.
- Restore replaces the current local tracker data after confirmation.

## Honest limitations
- A PWA home-screen icon is not a live Android home-screen widget.
- This app has no user account, cloud sync, automatic reminders, or background health integrations.
- Browser storage limits depend on the device/browser. Backups are essential.
- This version is a starter tracker; progressive-overload suggestions are simple comparisons, not medical or coaching advice.
