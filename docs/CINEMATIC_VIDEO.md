# Salary Man cinematic video handoff

MegaScenes was requested but is not connected to the Codex session. No generated video is bundled or billed. The game continues to play its original in-engine story shots.

The engine accepts local MP4 (H.264) or WebM files under `Web/art/cinematics/`. Add a verified clip to `manifest.json`, for example `"intro:0": {"src":"art/cinematics/mizuho-farewell.mp4"}`. Keys are story step and zero-based shot number. Ship only actual files. The manifest is loaded during startup; no video request is made for unmapped shots. `Game/tools/stage.js` includes the entire art directory.

Playback waits for decoded media before covering the game. Missing/unsupported media, failed autoplay or a three-second load timeout falls back to the live scene. Pause, held-key skip and story handoff continue to work. The existing captions and dialogue timeline remain authoritative; match each generated shot's duration and camera framing to that timeline. Videos run on the media clock, so variable render FPS cannot slow playback.

## MegaScenes production briefs

Use captured game frames as visual references when the plugin is connected. Preserve Seiko's face, wardrobe, Ink Games signage, geography and train/vehicle design. Hyper-realistic Japanese city, physically plausible materials and practical lighting; no game HUD, invented text, extra fingers, drifting faces or unreadable logos. Composite readable signs from the game after generation rather than relying on generated lettering.

1. **Mizuho farewell**: early dawn station platform, Seiko in his village outfit with his family, quiet eye-level dolly, warm shop lights against cool morning light. Preserve the family positions and the existing wave/bow beats. Make alternate close-up and wide takes from the same references.
2. **Train departure**: same train and platform, believable wheel/rail contact, subtle acceleration and reflections. Interior inserts show seats, overhead straps, luggage and soft dawn light. No windows morphing between shots.
3. **Tōkonto arrival**: use the actual rounded-glass atrium, restrained camera move, commuters at believable scale, original NHRail and Ink brands. Match the arrival time and weather of the playable mission.
4. **SOTI interview**: actual office layout and character references, indirect window light and believable skin/cloth shading; restrained over-the-shoulder cameras. Lip movements must match approved dialogue or avoid visible speech close-ups.

Deliver 1920×1080, 24 or 30 fps, Rec.709, progressive, no watermarks, clean start/end handles. Validate identities, signs, rail/tyre contact, temporal consistency, encoded duration, sound levels and low-end hardware decoding before adding a clip to the manifest.
