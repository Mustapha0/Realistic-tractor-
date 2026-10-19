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


## Core-systems update (October 2026)

This revision prioritizes vehicle consistency and cultivation integrity over adding content.

- The clutch now interrupts drivetrain power instead of passing a small fraction of throttle.
- Gear direction changes are interlocked while the tractor is moving; the player must slow to a near-stop before changing between forward and reverse.
- Steering now uses a wheelbase/steering-angle bicycle-model approximation instead of direct yaw rotation.
- Cultivation progress is credited from a swept implement corridor between successive plow positions. Previously credited cells are not counted again, and the old 3×3-per-update overcount has been removed.
- The First Furrows and Field Hand contracts track newly cultivated square metres instead of elapsed time. Newly cultivated area is assigned to only one active cultivation contract per update.
- Fuel use now responds to throttle and active plowing load.
- Pause and backgrounding release held pedal/steering inputs; save failures are logged and shown in the control hint.
- The GitHub Actions workflow includes JavaScript syntax checks before building.

### Verification status

JavaScript syntax checks were run locally for `src/demo.js`, `src/mission-system.js`, and `src/mobile-controls.js`. A full Vite/Android build could not be verified in this environment because dependency installation did not complete. The APK still needs to be built in GitHub Actions and tested on a physical Android device. Model alignment, actual steering-wheel animation, ground collision fidelity, and performance have not been visually/device-verified.

### Black-screen / cockpit fix notes (latest revision)

- The cockpit GLB is authored Z-up (floor at z~0, windshield z 1.95-6.05, hood toward +Y), so it keeps its -90 degree X rotation; the eye position is computed from the model so the camera sits behind the steering wheel.
- In cockpit view the tractor body is hidden so the camera is never inside its meshes; third-person shows the full tractor.
- Neutral can be selected at any speed; only forward/reverse changes are blocked while moving. Reverse can now reach its full speed.
- Still not device-tested: tune `COCKPIT_EYE` in `src/demo.js` after seeing it on a phone.
