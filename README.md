# Golden Field 3D — fullscreen mobile (Android APK ready)

Vite + Three.js + Capacitor. GLB models are in `public/models/`.

## Get the APK (GitHub Actions)
1. Unzip. Upload the *contents* to a new GitHub repo so `package.json` and the hidden `.github/` folder are at the repo root (GitHub Desktop / `git push` is easiest).
2. Push to `main`, or run **Actions → Build Android APK → Run workflow**.
3. When green, open **Releases** on your phone, download `GoldenField-debug.apk`, allow "install unknown apps".

The APK runs landscape and fully immersive (status and navigation bars hidden; swipe from an edge to peek at them).

## Gameplay
- The field starts unplowed. Lower the plow (PLOW), keep gear D, and drive inside the field to leave furrows.
- ▤ MISSIONS has 8 jobs. Orange marker = fuel pump (then tap REFUEL in the mission card); blue marker = barn delivery.
- 📷 toggles third-person / cockpit view.

## Notes
- Not built or device-tested in the authoring sandbox. Layout comes from the GLB bounds: farmstead west of the field, tractor starts between them facing the field.
- `plowed_farm_field_replica.glb` is kept in `public/models/` but not loaded at runtime.
- Tune `START_POS`, the cockpit offsets and mission radii in `src/demo.js`.
