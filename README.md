# Golden Field 3D — playable GLB tractor demo (Android APK ready)

Vite + Three.js + Capacitor. Drives the supplied tractor GLB, with field, farmstead and cockpit GLBs in `public/models/`.

## Get the APK (GitHub Actions)

1. Unzip. Upload the *contents* to a new GitHub repo so `package.json` and the hidden `.github/` folder sit at the repo root (GitHub Desktop or `git push` is easiest; the web uploader often skips hidden folders).
2. Push to `main`, or open **Actions → Build Android APK → Run workflow**.
3. When the run is green, open **Releases** on your phone and download `GoldenField-debug.apk` (also in the run's artifacts). Allow "install unknown apps".

## Run locally

    npm install
    npm run dev

## Controls
Drag the wheel to steer; hold THROTTLE / BRAKE; ▲▼ or the gear button cycles D/N/R; CLUTCH, REV, PLOW toggles; 📷 switches third-person / cockpit view; Ⅱ pauses.

## Notes
- Not built or device-tested in the authoring sandbox (no network). Model placement (field, farmstead, cockpit eye position) is estimated from GLB bounds and may need tweaking in `src/demo.js`.
- The APK is locked to landscape.
