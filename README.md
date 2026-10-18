# Golden Field 3D — cockpit + dynamic plowing (Android APK ready)

Vite + Three.js + Capacitor. GLB models are in `public/models/`.

## Get the APK (GitHub Actions)
1. Unzip. Upload the *contents* to a new GitHub repo so `package.json` and the hidden `.github/` folder are at the repo root (GitHub Desktop / `git push` is easiest).
2. Push to `main`, or run **Actions → Build Android APK → Run workflow**.
3. When green, open **Releases** on your phone, download `GoldenField-debug.apk`, allow "install unknown apps".

## Gameplay
- The field starts unplowed. Lower the plow (PLOW), keep gear D, and drive inside the brown field to leave furrows.
- ▤ MISSIONS: First Furrows (plow 25 s), Fuel Up (orange marker, then REFUEL), Farm Delivery (blue marker, below 8 km/h).
- 📷 toggles third-person / cockpit view.

## Notes
Not built or device-tested in the authoring sandbox. Layout: farmstead north of the field, tractor starts between them facing the field. Tune `START_POS`, `fieldBounds` and the cockpit/eye offsets in `src/demo.js` if needed. The APK is landscape-locked.
