# Making Salary Man's cutscenes cinematic (free, in the browser)

The cutscenes are real-time: `cutPlay(shots)` in `Web/konto.html` moves a camera between two points per shot, shows subtitles and poses
the actors. That's a good base. What makes them feel flat today: a dead-still camera, every shot the same lens, no faces moving, no
voices, no music under them, and shots written as raw coordinates nobody can see while typing them.

## Already done in the game (Web/game/cinema-hook.js)

Every existing cutscene gets these with no edits:

- **A camera that breathes.** A slow layered drift on position and aim, so no shot is a frozen frame. `handheld: 0..1` per shot asks for
  more (a party, a drunk walk); `steady: true` turns it off.
- **Push-ins on held shots.** A shot with only `from` creeps 4% closer over its length, which reads as tension. `push: 0` turns it off.
- **Lens moves.** `fov` + `fovTo` zooms through a shot; combined with a push-in it's the dolly-zoom.
- **Dips to black.** `dip: 0.4` fades a shot in from black (time passing, new place).
- **Speakers move.** `speaker: actor` makes them shift and turn while their line is up.
- **Film look.** Grain, a soft vignette and fading subtitles while a cutscene plays. Pure CSS, so it costs nothing.

The after-hours scenes (`afterhours.js`) also use shot/reverse-shot: an establishing wide, an over-the-shoulder two-shot at the table, and
a close-up (fov 42) pushing in on whoever is talking.

## The next steps, best value first

1. **Voices.** This makes the biggest difference. Free options:
   - **Piper TTS** (open source, runs offline, natural Japanese and English voices). Generate one `.ogg` per line, named by scene and line,
     and play it from the shot's `lines` timing.
   - Duncan, friends, or ChatGPT's voice mode recorded on a phone. Raw takes plus a free Audacity noise-reduction pass sound better
     than any robot.
   - Have the subtitle timing come from the audio length, so lines never get cut off.
2. **Score and sound under every scene.** You already make songs in Suno, so make short cues there: "tense office", "night out",
   "melancholy train", plus 3–5 second stings for scene ends. Add room tone (office hum, izakaya chatter, train rumble) from
   freesound.org (CC0 filter). Let audio lead the picture by about half a second into each cut (a J-cut). Editors do this, and it hides cuts.
3. **Faces that talk.** **Rhubarb Lip Sync** (free, open source) turns a voice line into mouth shapes with timings. Drive the jaw bone
   (or the mouth blendshapes if the Tripo/Meshy heads have them) from that file. Add blinks every 2–6 s and small head turns toward
   whoever is speaking. Faces are where viewers look, and a still face kills a scene.
4. **Real acting from a webcam.** **FreeMoCap** (open source, one or two webcams) or MediaPipe-based tools record full-body
   animation. Act the scene yourself, export BVH/FBX, retarget in Blender (free) onto the Bip01 rig, then export clips into
   `people/real`. Use Mixamo (free) for stock gestures: talking, laughing, drinking, bowing, slumping at a desk.
5. **Lay out shots visually instead of typing numbers.** **Theatre.js** (free, open source, made for three.js) gives a timeline and
   keyframe editor in the browser. Scrub, drag the camera, then export JSON that `cutPlay` reads. Shots get far better when you
   can see them as you place them.
6. **Depth of field and grade.** three.js ships `BokehPass` (r128 has it in `examples/js/postprocessing`). Focus it on the speaker's head
   for close-ups only, since it's expensive. Add a LUT colour grade per scene (`LUTPass` with free `.cube` LUTs): cold blue for the office, warm
   amber for the izakaya, teal-orange for night streets.
7. **Light every shot.** Real-time scenes look flat because they use the street's light. Give each cutscene a three-point rig: a key light
   on the speaker's face, a rim light behind for separation, and a weak fill. Add a `lights: [...]` field to shots that
   switches them on for that shot only.
8. **Cinematography rules to follow while writing shots:**
   - Keep the camera on one side of a conversation (the 180° rule), so people don't swap sides between cuts.
   - Use a wide lens (fov 60–70) for places and a long lens (fov 30–45) for faces. Faces at fov 70 look distorted.
   - Cut on action (a bow, a door, a glass raised), and hold reaction shots: the listener's face is often the better shot.
   - Vary shot length. Every shot is 4–6 s today, so mix 1.5 s cutaways with 8 s held moments.
   - Frame people a third of the way across the shot, looking into the empty two-thirds.
9. **Pre-render the biggest beats.** For scenes that must look like a trailer (the opening, the promotion, a yakuza reveal), render them in
   Blender's Eevee with the same models, export WebM, and play them as a video layer. Keep everyday scenes real-time.
10. **Viggle (already in use).** It's good for stylised shots. Use it for flashbacks or the phone's MyGram videos, not for in-world scenes,
    where the switch of look breaks immersion.

## Shot fields (reference)

`{ dur, from: {pos, look}, to, lines: [[t, who, text]], enter(), tick(), always(), timeScale, near, fov, fovTo, roll, overlay, fadeIn,
linear, handheld, steady, push, dip, speaker }`
