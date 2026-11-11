# Salary Man — full opening reference pack for OpenArt

This pack contains **34 actual-game reference keyframes** (start/end for every shot), the complete 17-shot opening through the station interview message, motion prompts, original dialogue as SRT, a timing CSV and a production JSON manifest. It does not contain generated videos or AI-enhanced stills. The source poses/materials retain limitations visible in the game; the prompts call out natural seating and contact corrections.

## Generate the clips

1. Open OpenArt's image-to-video workflow and choose a realistic video model available on your account. Model capabilities, available durations and credit prices must be checked in OpenArt; this pack does not assume a paid plan or authorize extra purchases.
2. Work in numbered shot order. Upload that shot's `start` image. If the selected model supports an end-frame reference, also upload its matching `end` image; otherwise use the end image as a framing/motion reference.
3. Paste the common prompt and the shot's motion prompt from OPENART-PROMPTS.md. Preserve the game's actual cast, clothes and locations. Keep a continuous shot per clip. Check the generation price shown before submitting.
4. Generate at a supported duration sufficient for the shot, then trim or retime to the exact duration in shot-order.csv. Do not claim frame-perfect source timing from an unsupported duration setting.
5. Assemble at **1920×1080, 30 fps**. The full scene is **64.3 seconds / 1,929 frames** at this rate. At 24 fps the source durations require frame rounding. The references are 34 keyframes, not a 1,929-image frame-by-frame render.
6. Add approved dialogue/sound separately. dialogue.srt preserves the script's original line timings and speaker labels. No voice recordings or verified lip-sync are included. Keep faces restrained in generated close-ups until speech is added.
7. Add the chapter title over shot 02. Fade shot 13 to white in the editor, then transition into shot 14. Add the supplied Peek message as an overlay during shot 16; do not ask the video model to invent its lettering.

## Continuity

Seiko's brown village workwear, green work gloves and yellow boots remain unchanged throughout. He does not wear an office suit until the later suit-purchase objective. Use the actual reference faces for his family. Keep the three-car silver/green local, blue longitudinal bench seats, hanging straps, Mizuho geography and SOTI silhouette consistent.

The exact Peek text is: **Interview request — SOTI Corporation would like to meet you. Today, 09:00. SOTI Tower, Tōkonto. Dress sharp. Be on time.** The chapter title is **SALARY MAN / サラリーマン / Chapter 1 · The Interview**. Source UI artwork is provided under overlays/ where captured; composite readable text separately.

## Game integration after generation

No game assets or video manifest have been replaced. Verify every clip before integrating. The current opening and wake sequence both use the `intro` story step with local shot indices; give them explicit distinct video keys before mapping clips so their first four shots do not collide. shots.json is our production manifest, not an official OpenArt batch-import document.

## Access and generation status

OpenArt was tagged, but no OpenArt generation tools were exposed in this chat. No OpenArt video jobs were submitted and no credits were spent. Unrestricted workspace/network access does not grant an app's tools or account connection. The repository is private: sign into GitHub, open the ZIP file page and choose Download raw file.
