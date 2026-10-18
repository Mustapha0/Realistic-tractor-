# Golden Field 3D — missions demo (Android APK ready)

Vite + Three.js + Capacitor. GLB models live in `public/models/`.

## Get the APK (GitHub Actions)
1. Unzip. Upload the *contents* to a new GitHub repo so `package.json` and the hidden `.github/` folder are at the repo root (GitHub Desktop / `git push` is easiest).
2. Push to `main`, or run **Actions → Build Android APK → Run workflow**.
3. When green, open **Releases** on your phone, download `GoldenField-debug.apk`, allow "install unknown apps".

## Missions
Tap ▤ MISSIONS → accept a job.
- **First Furrows:** plow down (PLOW button), gear D, 2–28 km/h, inside the plowed field, for 25 s.
- **Fuel Up:** drive to the orange marker at the pump, open Missions and tap REFUEL.
- **Farm Delivery:** drive to the blue marker by the barn below 8 km/h.

## Notes
Not built or device-tested in the authoring sandbox. Zone positions are derived from the GLB bounds; tune `START_POS` and the markers in `src/demo.js` if anything looks off. APK is landscape-locked.
