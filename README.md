# Golden Field 3D — v13 (manual tractor controls)

React + Three.js + Vite + Capacitor Android project.

## Get the APK (GitHub Actions)

1. **Unzip first.** Upload the *contents* to a new GitHub repo so `package.json` and `.github/` sit at the repo root (don't upload the zip itself; include the hidden `.github` folder, or use GitHub Desktop / git).
2. Push to `main` (or open **Actions → Build Android APK → Run workflow**).
3. When the run is green, open the repo's **Releases** page on your phone and download `GoldenField-debug.apk` (also in the run's artifacts).
4. Install it (allow "install unknown apps").

## Run locally

```bash
npm install
npm run dev
```

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Throttle / reverse | W or Up / S or Down | DRIVE / REV |
| Steer | A, D or arrows | ◀ ▶ |
| Brake / handbrake | Space | BRAKE |
| Clutch | Hold Shift | CLUTCH |
| Shift up (1–6) | Shift + W | ▲ |
| Shift down | Left Ctrl | ▼ |
| Direction | — | D / N / R |
| Engine on/off | E (when not at the pump) | ENG |
| Attach/detach plow | H | HITCH |
| Camera | C | 📷 |
| Switch tool | P | tool button |
| Refuel at pump | E near the pump | Refuel prompt |

- The plow only works soil when attached, the engine is running, and the tractor moves forward above 5 km/h.
- Starting off in a tall gear (3+) without the clutch lugs and stalls the engine; press E to restart.
- The engine stops when fuel runs out. Fuel is also used at idle.
- Telemetry is exposed at `state.telemetry` (`speedKmh`, `engineRPM`, `currentGear`, `fuelLevel`).

This uses custom Three.js movement (not Unreal's `WheeledVehiclePawn`); gearing and torque are approximations.

## Bundled models (offline)

`public/models/`: `tractor.glb`, `tractor-cockpit.glb` (cockpit camera), `plowed-field.glb`, `vintage-farmstead.glb` (diesel pump). The game falls back to procedural geometry if any fail to load.

## Test status

Code was syntax-checked, but not built into an APK or tested on a device in the authoring environment. Check the GitHub Actions result before installing.

## Updated mobile driving HUD

The touch HUD includes a top cash/pause pill, circular farm minimap with north marker, drag-steering wheel, vertical throttle/brake track, D/N/R selector, engine and implement hitch actions, and clutch/brake/reverse-drive pedals. The layout uses CSS safe-area insets and responsive portrait/landscape sizing. Supported mobile browsers receive a short vibration on gear changes and primary control presses.

The default new-farm balance is `$25,680`. Existing browser saves keep their saved balance and progress.

### Mobile controls
- Drag the steering wheel horizontally to steer; release to return steering input to neutral.
- Drag the vertical track upward to accelerate; drag to the bottom to brake.
- Choose D, N, or R on the right-side gear stack.
- Use the ⚡ action to toggle the engine and ⚒ to attach/detach the plow.
- Clutch and Brake are hold-to-press pedals. The right pedal toggles between Reverse and Drive.

The APK is built by GitHub Actions: push to `main`/`master`, or open Actions and manually run **Build Android APK**. The APK is published on the repo's Releases page (and as the `GoldenField-debug-apk` artifact).
