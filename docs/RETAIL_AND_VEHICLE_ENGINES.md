# Interior and vehicle integration

`Engine/src/interior/Interiors.js` exports the shared `InteriorEngine`, `retailProfile`, temperature model and fan control. Rooms carry W/D/H; layouts, wall art, doors, walking bounds and collisions use these dimensions. Tōkonto Central has a 64×44 m, 14 m high glass concourse; Mizuho uses timber, SOTI a business-station hall, and smaller stations neighbourhood/coastal profiles. Stations have their own route boards and cached identities. Only the central terminus has multiple retail floors.

Finishes use the licensed maps in Web/art/realism and Web/art/interior. Open gondola racks expose stock instead of hiding it behind solid panels. Architectural signs have physical housings and two readable faces. Fans respond to game weather with temperature hysteresis; Low uses two local point lights and other tiers four. Claude's ShopAAA material/probe system supplies indoor reflections, exposure and scanned decor. The interior engine supplies architecture, layouts, roof services, ventilation and seating.

`Engine/src/physics/VehicleDynamics.js` supplies 120 Hz planar car dynamics: axle loads, tyre slip, combined grip limits, weight transfer, yaw inertia, wet grip, drag and body motion. The game retains road/deck selection and collision handling. This is not a full rigid-body crash or suspension solver. Claude's Motorcycle, RagdollSystem, Skydiver, Boat and Ocean engines are retained with their game hooks. The fallback bike integrator remains substepped when the motorcycle engine is explicitly disabled.

Integration used a16ff144fe643d16d96ed5617ea6a15e18810be6, the last intact physics snapshot. ae494af's camera drift was applied separately: that commit also deleted essential assets and build files, so its deletions were excluded. Later after-hours work was not pulled into this snapshot.

Cinematic video playback remains optional. No paid generation is required; the empty video manifest keeps the live story. See CINEMATIC_VIDEO.md for the optional media workflow.

Run Engine/tests/*.test.mjs, the Game/tools presentation/commute/street regression checks, interior-engine-test.cjs and cinematic-video-test.cjs, plus the mandatory Tools/qa/aaa_gate.py. Browser checks require Playwright and Chromium. Rebuild Web/engine/shigoto.js with node Engine/build.mjs after engine changes.

The indoor PMREM probe applies only to Standard/Physical materials: r128 Lambert/Phong cannot consume CubeUV probes and otherwise fail shader compilation. Existing maps are restored on exit. The legacy room point light stays off in refurbished rooms, preserving the two/four-light budgets. The loading compositor uses four alternating pan/dolly/rise paths, independent of progress and JS generation tasks, with reduced-motion support.

Validation for 0.6.4: engine and presentation/commute/street suites pass; focused browser tests cover Low/High PBR shaders, map loading, fan control, indoor-probe entry/exit, optional-video decode/fallback and compositor motion during blocked JS. Combined-world browser checks cover all road vehicle cheat entries, the eight reported keyboard codes, rigged occupants, finite-state recovery, glass shop doors, map-photo state restoration, 30 registered stations, distinct station geometry with an unobstructed central glass roof, eight accessible retail layouts and zero shader compilation failures after the probe fix.
