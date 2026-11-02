# Prop textures: the painting brief

The street props (cones, bins, vending machines, bicycles, lamps, poles, benches...) are detailed primitives built in
`Engine/src/world/Props.js`. Every part is drawn with a named **texture slot**, and every slot is a PBR set in
`Web/art/props/`:

| file | what it is |
|---|---|
| `<slot>.jpg` | base colour (albedo): the painting |
| `<slot>_nor.jpg` | tangent-space normal map (OpenGL / green-up) |
| `<slot>_rough.jpg` | roughness, greyscale: white = rough/matte, black = glossy |

The repo ships procedural stand-ins for every slot so the game always runs. **Replace them with painted textures, one
slot at a time, keeping the file names.** No code changes are needed: the engine picks up whatever is in the folder.

## How to paint a slot (ChatGPT)

1. Read the slot's entry below: the layout, the size, whether it is tinted, and the brief.
2. Generate the **base colour** image with ChatGPT image generation. Photographic, evenly lit (no baked shadows or
   highlights, no perspective: straight-on orthographic), the real object's wear and dirt included. Prompt template:

   > Seamless photographic PBR albedo texture, straight-on, flat even lighting, no shadows, no perspective, no text
   > unless asked: **<brief>**. **<layout>**. Square, **<size>** px.

   For **face** slots drop "seamless" and describe the face exactly as it is seen straight on.
3. Save it as `Web/art/props/<slot>.jpg` (JPEG, quality 90, at the size listed; 1024 px or more is welcome).
4. Make the normal and roughness maps from it:
   `python3 Tools/props/make_prop_maps.py <slot>`
   (or paint them too: a height map saved as `<slot>_height.jpg` gives the tool better relief; a hand-made
   `_nor.jpg` / `_rough.jpg` is kept if you pass `--keep`).
5. Run `python3 Tools/qa/aaa_gate.py`: it checks every slot has all three maps at size, and lists the slots that still
   carry the procedural stand-in (advice, never a failure).
6. Commit the three files and push.

**Tinted slots** (`tint: yes`) are recoloured in game (bins come green or blue, bicycles in four colours, vending
machines in four liveries). Paint those in light neutral grey (about #c8c8c8) with all the wear in them; the game
multiplies the colour in.

To change the props themselves (more parts, new props), edit `Engine/src/world/Props.js` / `PropSlots.js`, then run
`node Engine/tools/prop-slots.mjs` (rewrites this file and slots.json), `python3 Tools/props/make_prop_maps.py --placeholders`
(stand-ins for new slots) and `node Engine/build.mjs`.

## Slots (42)

### cone

- **`cone_body`**: cone shell. Material: plastic. Size: 1024 px. Tint: no (real colours).
  - Layout: unrolled wrap: left edge to right edge goes once round the part (edges must meet seamlessly), bottom of image = bottom of part.
  - Brief: A Japanese road-works traffic cone unrolled: fluorescent red-orange PVC, two white retro-reflective sleeves (one wide band at 55-70% height, one thin band at 30%), faint moulding seams, black tyre scuffs and grey road dust towards the bottom, a few scratches through the reflective film.
- **`cone_base`**: square rubber foot. Material: rubber. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.4 m x 0.4 m of the real surface.
  - Brief: Recycled black rubber, slightly speckled, with grit and dried mud in the grooves.

### bin

- **`bin_body`**: drum. Material: plastic. Size: 1024 px. Tint: yes (paint in neutral grey).
  - Layout: unrolled wrap: left edge to right edge goes once round the part (edges must meet seamlessly), bottom of image = bottom of part.
  - Brief: A tall municipal plastic litter bin unrolled, painted in neutral grey for tinting: vertical moulded ribs every 8 cm, a darker drip line under the lid, scuffs and sun-faded patches, a sticker residue patch, grime collecting at the base.
- **`bin_lid`**: lid and rim. Material: plastic. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.6 m x 0.6 m of the real surface.
  - Brief: Charcoal moulded plastic with a fine matte texture, scratches and dust in the corners.
- **`bin_label`**: sorting label. Material: plastic. Size: 512 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 0.75:1 (pad to a square 512 px canvas only if you must, centred).
  - Brief: A white sorting sticker for a Japanese bin: a coloured header band, large text 'もえるゴミ' (burnable), small icons of paper and food waste, small English 'Burnable', slightly peeled corner, rain stains.

### crate

- **`crate_wood`**: planks. Material: wood. Size: 1024 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.6 m x 0.6 m of the real surface.
  - Brief: Rough-sawn pine crate planks running horizontally, 10 cm wide boards with gaps, nail heads, saw marks, grey weathering and a faded stencilled lot number.

### pallet

- **`pallet_wood`**: boards. Material: wood. Size: 1024 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 1.2 m x 1.2 m of the real surface.
  - Brief: A used shipping pallet's boards: heat-treated pine, an 'HT' stamp, dark water stains, forklift gouges, splinters.

### barrier

- **`barrier_panel`**: striped panel. Material: plastic. Size: 1024 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 4.2:1 (pad to a square 1024 px canvas only if you must, centred).
  - Brief: A Japanese road-works barrier panel: diagonal yellow and black stripes, a white plate in the middle reading '工事中' with smaller 'ご迷惑をおかけします', scuffed, a strip of reflective tape, dirt splashes along the bottom.
- **`barrier_frame`**: steel legs. Material: galv. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.5 m x 0.5 m of the real surface.
  - Brief: Galvanised steel with spangle pattern, white rust spots and scratches.
- **`barrier_foot`**: rubber feet. Material: rubber. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.4 m x 0.4 m of the real surface.
  - Brief: Heavy black rubber ballast block, moulded grip texture, worn smooth on top.

### bicycle

- **`bicycle_frame`**: painted frame. Material: paint. Size: 512 px. Tint: yes (paint in neutral grey).
  - Layout: seamless tileable square, one copy covers 0.5 m x 0.5 m of the real surface.
  - Brief: Glossy painted steel tube in neutral grey for tinting, chips showing grey primer, a few scratches, a small registration sticker (防犯登録).
- **`bicycle_tyre`**: tyres. Material: rubber. Size: 512 px. Tint: no (real colours).
  - Layout: unrolled wrap: left edge to right edge goes once round the part (edges must meet seamlessly), bottom of image = bottom of part.
  - Brief: A bicycle tyre tread unrolled: fine block tread down the middle, smooth sidewall with faint lettering, dust.
- **`bicycle_steel`**: chrome parts, spokes, basket. Material: metal. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.3 m x 0.3 m of the real surface.
  - Brief: Chrome-plated steel, slightly pitted, small rust freckles, fingerprints.
- **`bicycle_saddle`**: saddle and grips. Material: leather. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.25 m x 0.25 m of the real surface.
  - Brief: Black vinyl saddle cover, stitched seam, cracks from the sun.
- **`bicycle_basket`**: front basket. Material: metal. Size: 512 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 1.2:1 (pad to a square 512 px canvas only if you must, centred).
  - Brief: A wire mamachari basket seen from the front: a grid of steel wires with a rolled rim, on a mid-grey background (the background shows through as the basket's fill).

### vending

- **`vending_body`**: cabinet. Material: paint. Size: 1024 px. Tint: yes (paint in neutral grey).
  - Layout: seamless tileable square, one copy covers 1 m x 1 m of the real surface.
  - Brief: Powder-coated steel cabinet in neutral grey for tinting: panel seams, rivets, sun fading, sticker residue, a dented corner, grime at the bottom.
- **`vending_front`**: drinks window. Material: glow. Size: 1024 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 0.96:1 (pad to a square 1024 px canvas only if you must, centred).
  - Brief: The lit display window of a Japanese drinks vending machine, seen straight on: three shelves of about 10 cans and PET bottles each (green tea, coffee, cola, water, sports drinks - invented brands), small price tags '¥130' / '¥160' under each with blue 'つめた~い' and red 'あたたか~い' labels, a row of round push buttons, slight reflections on the plastic.
- **`vending_panel`**: lower control panel. Material: plastic. Size: 1024 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 1.9:1 (pad to a square 1024 px canvas only if you must, centred).
  - Brief: The lower half of the vending machine front: coin slot, note acceptor, IC-card reader (contactless logo), change return lever, the wide dark pickup flap 'とりだしぐち', a QR sticker, scratches and finger marks.
- **`vending_trim`**: trim and kickplate. Material: metal. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.5 m x 0.5 m of the real surface.
  - Brief: Brushed stainless steel kickplate, scuffed by shoes, water stains.

### bench

- **`bench_wood`**: slats. Material: wood. Size: 1024 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.8 m x 0.8 m of the real surface.
  - Brief: Hardwood park-bench slats along the length, oiled but weathered, grain, rounded edges, carved initials, bird droppings.
- **`bench_iron`**: cast frame. Material: paint. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.4 m x 0.4 m of the real surface.
  - Brief: Black-painted cast iron with a slight casting texture, paint chips showing rust.

### bollard

- **`bollard_body`**: post. Material: galv. Size: 1024 px. Tint: no (real colours).
  - Layout: unrolled wrap: left edge to right edge goes once round the part (edges must meet seamlessly), bottom of image = bottom of part.
  - Brief: A Japanese steel car-stop bollard unrolled: galvanised grey body, a yellow reflective band near the top, scrape marks from bumpers at 40-60 cm, rust weeping at the base.
- **`bollard_cap`**: cap. Material: metal. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.2 m x 0.2 m of the real surface.
  - Brief: Yellow powder-coated dome cap, chipped.

### lamp

- **`lamp_pole`**: pole and arm. Material: paint. Size: 1024 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 1 m x 1 m of the real surface.
  - Brief: Grey painted steel lamp column: vertical weld seam, faded paint, layers of torn flyer paper and tape residue near head height, rust at the base flange.
- **`lamp_head`**: lantern head. Material: paint. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.4 m x 0.4 m of the real surface.
  - Brief: Dark grey die-cast aluminium luminaire housing with cooling fins, bird droppings, dust.
- **`lamp_lens`**: light lens. Material: glow. Size: 512 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 0.6:1 (pad to a square 512 px canvas only if you must, centred).
  - Brief: The underside lens of an LED street lamp: a grid of small LED dots behind a frosted diffuser, warm white, slightly dirty edges.

### pole

- **`pole_concrete`**: concrete pole. Material: concrete. Size: 1024 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 1.5 m x 1.5 m of the real surface.
  - Brief: A Japanese spun-concrete utility pole: light grey with fine pores, faint vertical form lines, climbing-step bolt holes, black grime streaks running down, moss at the bottom.
- **`pole_guard`**: yellow guard. Material: plastic. Size: 512 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 0.43:1 (pad to a square 512 px canvas only if you must, centred).
  - Brief: The yellow-and-black diagonally striped reflective guard wrapped round the base of a utility pole, scuffed by cars.
- **`pole_plate`**: pole advert plate. Material: paint. Size: 1024 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 0.33:1 (pad to a square 1024 px canvas only if you must, centred).
  - Brief: A tall Japanese utility-pole advertisement plate (電柱広告): a local clinic or real-estate agent's name in big vertical kanji, an arrow, '200m', a phone number, weathered with rust trickles.
- **`pole_metal`**: cross-arms and transformer. Material: galv. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.6 m x 0.6 m of the real surface.
  - Brief: Weathered galvanised steel and grey painted metal: bolts, rust staining, a warning sticker.

### tree

- **`tree_bark`**: trunk. Material: wood. Size: 1024 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.8 m x 0.8 m of the real surface.
  - Brief: Street-tree bark (zelkova / plane tree): flaking plates of grey-brown bark with lighter patches, lichen.
- **`tree_leaves`**: canopy. Material: leaves. Size: 1024 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 1.5 m x 1.5 m of the real surface.
  - Brief: A dense mass of small deciduous leaves seen from a few metres away, varied greens with sunlit and shadowed clusters, tiny gaps.
- **`tree_grate`**: tree grate. Material: metal. Size: 1024 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 1:1 (pad to a square 1024 px canvas only if you must, centred).
  - Brief: A square cast-iron tree grate seen from above: radiating slots around a round hole, rust, cigarette butts and leaves caught in it.

### planter

- **`planter_box`**: concrete planter. Material: concrete. Size: 1024 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.8 m x 0.8 m of the real surface.
  - Brief: Precast concrete planter box with exposed aggregate, chipped corners, damp dark stains at the bottom.
- **`planter_shrub`**: shrubs. Material: leaves. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.8 m x 0.8 m of the real surface.
  - Brief: Clipped azalea / box shrubs: tight small dark-green leaves, a few pink flowers.

### signpost

- **`signpost_pole`**: post. Material: galv. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.6 m x 0.6 m of the real surface.
  - Brief: Galvanised steel sign post with spangle pattern, stickers half peeled.
- **`sign_face`**: sign front. Material: paint. Size: 1024 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 1:1 (pad to a square 1024 px canvas only if you must, centred).
  - Brief: A Japanese 'no entry' road sign (車両進入禁止): red disc, white horizontal bar, white rim, retro-reflective sheeting texture, slight fading, a small dent. On a transparent-looking light grey square background (only the disc is used).
- **`sign_back`**: sign back. Material: galv. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.4 m x 0.4 m of the real surface.
  - Brief: The bare aluminium back of a road sign, brushed, with a stamped maker's label and bolts.

### ac

- **`ac_body`**: casing. Material: paint. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.5 m x 0.5 m of the real surface.
  - Brief: Off-white painted steel casing of an aircon outdoor unit, rust streaks from the screws, grime, a faded spec label.
- **`ac_grille`**: fan grille. Material: metal. Size: 512 px. Tint: no (real colours).
  - Layout: one flat face shown whole; paint it at width:height = 1:1 (pad to a square 512 px canvas only if you must, centred).
  - Brief: The round fan grille of an aircon outdoor unit seen straight on: concentric wire rings with a dark fan blade behind, dust, rust spots.
- **`ac_fins`**: side fins. Material: metal. Size: 512 px. Tint: no (real colours).
  - Layout: seamless tileable square, one copy covers 0.3 m x 0.3 m of the real surface.
  - Brief: Aluminium heat-exchanger fins: very fine vertical slats, bent in places, dusty.

### ball

- **`ball_skin`**: football. Material: leather. Size: 512 px. Tint: no (real colours).
  - Layout: unrolled wrap: left edge to right edge goes once round the part (edges must meet seamlessly), bottom of image = bottom of part.
  - Brief: A worn football's panels unrolled (white with black pentagons), scuffed and grass-stained.
