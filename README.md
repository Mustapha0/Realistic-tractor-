# Golden Field 3D — complete project (Android APK ready)

Vite + Three.js + Capacitor. GLB models are in `public/models/`.

## Get the APK (GitHub Actions)
1. Unzip. Upload the *contents* to a new GitHub repo so `package.json` and the hidden `.github/` folder are at the repo root (GitHub Desktop / `git push` is easiest).
2. Push to `main`, or run **Actions → Build Android APK → Run workflow**.
3. When green, open **Releases** on your phone, download `GoldenField-debug.apk`, allow "install unknown apps". (Also in the run's artifacts as `GoldenField-debug-apk`.)

The APK runs landscape and fully immersive.

## Gameplay
- Lower the plow (PLOW), keep gear D, drive inside the field to leave furrows. An empty tank stops the engine; refuel at the orange pump marker via the Fuel Up mission.
- ▤ MISSIONS: orange marker = fuel pump, blue marker = barn delivery.
- 📷 toggles third-person / cockpit view.
- Cash, fuel, mission progress and plowed ground are saved on the device and restored on launch.

## Notes
- Not built or device-tested in the authoring sandbox. Check the GitHub Actions run before installing.
- `plowed_farm_field_replica.glb` is kept in `public/models/` but not loaded at runtime.
- To reset progress, clear the app's storage in Android settings.
