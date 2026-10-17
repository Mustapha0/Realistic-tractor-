Golden Field 3D model assets

This project now has a dedicated full-screen home menu and tries to load optional GLB models.

For offline APK builds, add these CC0 assets:
- tractor.glb: https://cdn.3dassets.dev/assets/20024/v1/model.glb (CC0 Farm tractor, detailed cab and wheels)
- farm-scene.glb: https://cdn.3dassets.dev/assets/29167/v1/model.glb (CC0 Harvest Day Farm environment)

Model pages:
https://3dassets.dev/assets/air-land-sea-vehicles-farm-tractor-0254fd80
https://3dassets.dev/assets/pixel-modern-farm-harvest-day-farm-fcdfbe7d-starter-scene

The game attempts to load local files first, then tries the CDN online. If neither works, procedural geometry remains as a fallback. Network access in the build environment prevented bundling the binary GLB files here, so download these files manually for offline use.
\nVintage farmstead GLB added for the diesel refuelling point. The game extracts the vintage pump and concrete pad and places them beside the starting yard.\n