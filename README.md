# Salary Man

## Play it (the original web game, as a desktop app)

1. Install Node.js (the LTS version) from https://nodejs.org.
2. Download this repository as a ZIP, extract it, and open the extracted folder.
3. Double-click **Play Salary Man.bat**. The first run downloads what it needs (a few minutes); after that it starts straight away.

This runs `Web/konto.html` (Three.js) inside Electron, from the `Game` folder. The `Godot` and `WebGPU` folders are earlier experiments, kept for reference and not used by the game.

**Getting the latest version:** press **F9** in the game (or type `REFRESH`, or dial 5550199 on the phone). It downloads whatever changed in the `Web` folder of `physicstheory/salaryman` on the branch named in `Game/update.json`, keeps your saves, and offers to restart. F9 also lets you go back to the installed version. The repository is private, so the first time it asks you for a read-only GitHub token: it opens the token page, you make one for this repository (Contents: read-only), copy it, and press "Use the token on my clipboard". It is kept on your computer (or put it in `Game/Add Your Files/github-token.txt` yourself). In a browser, `REFRESH` just reloads the page. Cheats are listed in `Web/CHEATS.md`, or type `CHEATLIST`.

**The law:** a crime puts patrol cars on your tail, more of them the more stars you have. They chase you across the street and over the kerb, ram your car, and when you are on foot their officers get out and run you down. Out of their sight, stars fall one by one. If you are caught (boxed in in a car, or stopped on foot, or tackled) you are fined, spend the night in the cells of the nearest police station, and get a criminal record plus hours of community service. Walk up to the front desk and press the action key to do a litter-picking shift (a minute, twelve pieces) for each hour you owe; when the last hour is done your record is cleared. There is a police station in every town.

**The bubble:** around you everything is drawn in full: real windows, ledges, balconies and roof plant on the buildings within about 260 m, sharp ground underfoot. Further out the buildings are plainer boxes, and beyond a kilometre or two they are not drawn at all, while the mountains and the towers are always there for the view.

**Airports:** Tōkonto International (3.2 km runway, terminal, tower, hangars, airliners at the gates and one landing or taking off every few minutes) beside the capital, and four smaller airfields (Nagisa, Kaido, Mizuho, Tomari). They are on the map.

**Flying:** Tōkonto International has an expressway to it from the capital, a security gate on the airfield road, and a terminal you can walk through: a hall with check-in desks, pop-up branches of Konto's shops, a ticket office, Expedio kiosks and security; an airside concourse with more shops, duty free and six gates; and the cabin. Buy a ticket at the office, at a kiosk, or in the Expedio app on your phone (a parody of a certain travel site), go through security, board at your gate, sit down, and the seat-back screen offers short films (YouTube, so it needs a connection), a flight map and the cabin crew. Flights go to Seoul and to two island groups, Kohana and Ryūjima, each a small place of its own with a kiosk to fly home from. Or skip all that: drive through the airport gate, walk up to a parked airliner, press F, and fly it, with four stars, a lot of patrol cars and helicopters. Flying: W/S throttle, ↓ pull up, ↑ nose down, ←/→ bank, A/D rudder on the ground, F to get out when stopped; on a pad, left stick, RT/LT, LB/RB, Y.

**Flying and jumping:** the airliners and light planes are modelled (a swept, tapered wing with a winglet, engines with intakes, a tail, retractable gear, a windowed fuselage, a propeller on the small ones) and fly on a real lift/drag/thrust model: they stall if you pull up too slowly, bank to turn, and need the speed to rotate. W/S throttle, ↓ pull up, ↑ nose down, ←/→ roll, Q/E rudder, Space brakes, C changes camera (behind, far behind, cockpit). The instrument panel shows the horizon, speed, height, climb rate, heading, throttle and gear. While you fly, the world is drawn at lower resolution and as far as the eye can see. In the air, **F or Y** jumps out; you free-fall belly-down (W dives, S spreads), and **Space or A** opens the parachute. Glide with A/D, W for speed, S to brake and flare, and look around with the mouse: roofs, the sea and the shore all take a landing.

**Tōkonto International** is now a big airport: three terminals side by side (1, 2 and 3) on one long forecourt road, each with its own car park, hall, shops, security and gates. Your boarding pass tells you which terminal, and gate letters run A (Terminal 1), B (Terminal 2) and C (Terminal 3).

**Guns:** the arms dealer (Kanamono, "under the counter") sells a compact pistol, a machine pistol, a short shotgun and ammunition; they go on your weapon wheel (hold **Q**, or LB on a pad). With one equipped, Seiko carries it in his right hand. **Right mouse** (LT) to aim: the camera zooms in over his right shoulder and, as in GTA V, the aim locks on to the nearest person in front of you (a red diamond over them). **Tab** (RB) switches to the next target (Shift+Tab the other way); move the mouse yourself and you are free-aiming until you aim again. **Left mouse or Enter** (RT) to fire, **R** (X) to reload. Cheat: TOOLEDUP (5550180) gives you all of them.

**People:** the pavements of every town are walked by Japanese people: salarymen in their suits, office workers, and men and women in their own clothes, each a realistic scanned-style body with its own face and hair (26 of them, built from Microsoft's MIT-licensed Rocketbox avatars by `Game/tools/build-people.py`, with Seiko's own walk, run and idle retargeted onto them). Shop clerks are real people too.

**The rush hour:** from 6:45 to 9:30 and from 17:15 to 20:00 the streets near every station fill with commuters in suits, walking the real streets at a commuter's pace. In the morning the towns empty towards their stations and trains unload into Tōkonto in waves, a crowd spilling out of the station and fanning out to the offices; in the evening it runs the other way. The middle of the day is quieter, and the night quieter still. On high and ultra graphics the crowds are biggest.

**Seiko** is now a high-detail model (same white shirt, dark trousers and short black hair), with all his moves carried over.

**Parachuting** is physical: freefall is drag against gravity (about 195 km/h belly-down, 280 head-down with W, 165 spread with S; A/D turn). Space (A) opens a ram-air canopy that takes about two seconds to inflate, slowing you on its own. Under it: A/D pull the toggles (you swing out on the lines), W front risers for speed, S brakes. Pull both down near the ground to flare and step down; too fast and you tumble. Seiko arches in freefall, dives head-down, and hangs with his hands on the toggles under the canopy. SKYDIVE (5550122) puts you 1,200 m up in a light aircraft; AIRPLANE (5550120) gives you one on the ground.

**Flying:** Q/E (LB/RB) now work as a proper rudder in the air and on the ground, and the weapon wheel never opens in a vehicle.

**Helicopters** have flashing red/blue roof lights, navigation lights, a tail strobe and a working searchlight that lights you up at night. They only chase you near an airport or while you are in the air; get well away and they turn back.

**Airports:** every airport now has a big glass terminal under an arched steel roof (420 m long at Tōkonto International, 200 m at the regional ones), jet bridges, airliners at the gates and a tall control tower.

**Buildings:** offices, glass towers, flats and civic buildings use photographed facades (ambientCG, CC0), with relief maps and real lit windows at night. Cars have metallic-flake paint under a glossy clear coat.

**Home:** the family flat in Mizuho is now a room you walk into (Y at the door, or just walk in): a genkan with the shoes, wooden floors, a tatami corner with the futon out and a low tea table, a living room with a sofa, the television and the console, a kitchen with Mum at it, Dad at the dining table, a bookshelf and plants. Walk up to things and press E: the **futon** sleeps until morning and saves, the **kitchen** feeds you, the **television** is the one you know, and the **wardrobe** changes Seiko's clothes. He starts a new game in his village clothes (work jacket and trousers with boots), with a village shirt and jeans as well, and then the office shirt, black suit with red tie, charcoal suit, waistcoat, check suit, polo and shorts, blue shirt and jeans, T-shirt and jeans, or a track jacket. What you wear is saved.

**Interiors:** shops and the airport are fitted with photographed furniture and props (Poly Haven, CC0; `Game/tools/build-props.mjs`): tills, plants, cameras, benches, wet-floor signs. The airport halls are full of real people: check-in agents, guards and gate staff at their posts, and travellers walking the hall. Shops have a customer or two browsing.

**Trees:** every tree is a photograph of a real CC0 tree model from Poly Haven, baked into impostor atlases by `Game/tools/bake-trees.mjs` (the models are downloaded only to bake; the game ships the atlases, about 3 MB) and packed by `Game/tools/pack-impostors.py`. The ground textures come from `Game/tools/build-terrain.py`.

**Sitting:** people sit: travellers take the benches in the airport halls and at the gates for a while and then wander off again, and Dad sits at the dining table at home.

**Driving:** cars have proper tyre grip. Ask too much of the front and it understeers; the handbrake breaks the back loose into a slide; tyres squeal and leave skid marks; the body rolls in corners; grip is lower off the road; acceleration is limited by wheelspin.

**Crashes:** cars keep their damage. Each hit lands on the front, back or a side: scratches and dents appear there, the paint dulls, the bonnet crumples, a hard front-end hit cracks the windscreen, glass and plastic fly off, it steams and then smokes, pulls to the damaged side, loses power, and with enough damage the engine dies. The damage stays with the car when you get out. FIXCAR (5550181) repairs it.

**Flying:** engines take time to spool up, the stall drops a wing (and holding the stick back turns it into a spin), the air is bumpy low down, the ground cushions you just before touchdown, a firm landing bounces, over-rotating on take-off strikes the tail, and an aircraft that crashes stays where it came down, blackened and burning, with debris across the ground and Seiko thrown clear.

**Graphics:** Ultra is chosen automatically on recent graphics cards (RTX 30/40/50, Radeon RX 6000 and later, Apple M2 Pro/Max and later). Building textures are drawn at 1024 on High and 1536 on Ultra, with 1024/2048 relief maps and 4096 shadows.

**The land and the trees:** the ground is laid with CC0 photographs from Poly Haven over the island's own colour (meadow grass, mossy rock on the slopes, bare grey rock on the crags projected from the side so cliffs never smear, snow on the peaks, sand on the shore, scree and river gravel), each read at two sizes so it does not tile; High and Ultra light it per pixel. The high ground is weathered: sharp crests and wandering gullies above 150 m, where the old relief had been blurred into smooth cones. Every tree is a photograph of a real CC0 tree model (a fir for the cedars, a broadleaf for the keyaki, the same in blossom for the sakura and in autumn red for the momiji, a gnarled tree for the pines), baked from 24 directions with its normals and drawn as a single card that shows the right view and is lit by the sun: two triangles a tree, so the woods now reach 1.2 km (Low) to 3.4 km (Ultra) and the mountains are forested from a distance. The towns' trees cast shadows. Viaducts, platforms, concourses, kerbs and the expressway's barriers carry a worn-concrete photograph over their colour.

**Roads:** every town's main roads now run on to the coastal expressway as two-lane country roads (graded into the ground, with edge lines, gravel verges, a gap in the expressway barriers where they join, and their own traffic), instead of stopping in a smear on the grass. Inside the towns no street just stops: a street that ended in nothing is carried on along its line to the next road where the ground is clear, or cut back to its last junction, and streets now meet the avenues at the carriageway instead of a strip of verge. Nothing is built on a street (station concourses take whichever end of the platform is clear, and a town's buildings give way to its neighbour's streets), the palace grounds inside the moat have no streets across them, and trees stay off every road (`Game/tools/roadaudit.mjs` counts all three across the island).

**Radar and pause menu:** the minimap is a GTA V-style radar: a dark grey rectangle in the bottom left with light grey streets (the bigger the road, the lighter), a muted blue sea, green parks, a purple route, an N on the edge where north is, a frame that flashes red and blue while you are wanted, and thin health (green) and stress (blue) bars under it. It is drawn at at least twice the screen's pixel density, so it is sharp. The pause menu is monotone: the menu, its map and the world seen through it are all in greys, and its canvases render at at least twice the screen's density.

**Japanese cars:** the traffic is real Japanese cars and bikes: Honda Fit, Suzuki Carry kei van, Toyota Prius, Camry, Corolla taxi, Crown Athlete patrol car and RAV4, Nissan Cefiro and Skyline R34 GT-R, Honda NSX, Suzuki GSX-R750, Honda CB750 and CRF450. All are CC Attribution models (credited in `Web/cars/CREDITS.md`) taken from the open [pedrosoandre/carros](https://github.com/pedrosoandre/carros) library, so no account is needed. `Game/tools/cars/fetch-cars.mjs` downloads them and makes them game-ready: it drops stray parts, simplifies each one to a triangle budget, converts textures to 2048 px WebP, and names the paint, glass and tyres so every car in traffic gets its own colour. It then registers them in `Web/cars/user.json`. To refetch or change them, run `cd Game/tools/cars && npm install && node fetch-cars.mjs`; the list is `cars.json`. An entry with a Sketchfab `uid` instead of `carros` needs `SKETCHFAB_TOKEN`, and `--local <kind> <file>` processes a model you already have. `node Game/tools/carshow.mjs <dir>` renders a contact sheet that checks each model faces forward and has its paint found.

**Exotics:** eight rare supercars drive the streets too: a Ferrari F8 Tributo, Lamborghini Aventador SVJ, McLaren 720S, Bugatti Chiron Profilée, Pagani Huayra, Porsche 918 Spyder, Lexus LC 500 and Nissan GT-R R35. Only one is ever out at a time, and the next turns up a few minutes after the last. Which one you get is weighted, so a GT-R or LC 500 is common and a Chiron or Huayra almost never. Seiko remarks on one when it passes close by, and stealing one sets off its alarm. The Chiron and Huayra keep their factory colours; the others come in loud exotic paint. The `EXOTIC` cheat (5550117) gives you a random one.

**PC modes** (Esc, Settings, "PC mode"): two ready-made setups that take over from the graphics setting.
- **Low-end PC** aims for 40 frames a second. It uses the low tier, draws the world at 85% resolution (and drops to 58% when things get busy), uses medium-sized building textures, thins out the trees beyond 85 m, and has fewer people on the streets and in the rush hour.
- **High-end PC** aims for 60. It uses the ultra tier at 135% resolution (supersampled, so edges are clean), keeps the full forest out to 1.7 km with tree shadows, and fills the streets and stations.

Both keep the frame rate by changing the resolution a few per cent at a time, so the look stays the same and only the sharpness moves. Press the button again to cycle Low-end, High-end, off. Building textures change size the next time the game starts.

**Reactions:** point a gun at someone and their hands go up; fire, shoot someone, or run someone over and the people who saw it run screaming, duck with their arms over their heads, or stop with a phone to the ear (a red phone icon over them). When a call goes through the police come; aim at a caller and the call stops. If a patrol is close enough to see it, the stars come at once. If nobody sees it, nobody knows.

**Robbing a shop:** walk into a shop with a gun out and aim at the clerk (the aim settles on them). Keep it on them until the till opens, then a cursor runs along the drawer: press **Space / E** (A on a pad, or click) when it is over notes to grab a bundle. Every second, and every fumble, moves the clerk's foot nearer the silent alarm. Stop with **Esc** (B) or when the drawer is empty. A clean job (no more than one fumble, alarm not set off) and nobody calls the police; fumble more and the clerk calls them as you leave; set off the alarm (or fire a shot in the shop) and three stars are waiting outside. A shop that has been robbed has nothing to give for a while.

**Bikes and cars:** the controller rumbles with the engine, braking, skids, loose ground and wheelies, and the camera shakes on a big wheelie. Wheelie: pull back on the stick, or hold **Shift**, to lift the front wheel (push forward to put it down).

**Holiday-area maps:** Seoul, Kohana and Ryūjima each have their own map (terrain, streets, buildings, the departures kiosk), shown on the pause map and the minimap while you are there, and as islands out at sea on the main map.

**Waypoints:** the route follows the real streets (including the small ones), re-plans within a second if you leave it, and is drawn in the world as a green ribbon on the road ahead, a column of light over the destination, and a banner with the next turn, the distance and the time. Shops always face the nearest road, and no building stands in a street or inside another.

**Music:** put your own songs in `Game/Add Your Files/music` (or drop them on the window, or press F8). Loose files make a radio station of your own, "My Music"; a sub-folder named after a station (`gold1`, `tokonto43`, `soul`, `westside`, `nashville`) swaps that station's made-up songs for yours. Name files `Artist - Title.mp3`. In a browser, run `node Game/tools/make-music-index.mjs` after adding files to `Web/music`.

**Eating out:** walk into a restaurant and press **E** at a seat.
- *Sushi Go-Go* (the cheap chain) has a conveyor belt. Plates pass your seat; press **E** as one reaches you to take it. The pile of plates builds in the top-right corner, colour by colour (white ¥150, red ¥200, blue ¥250, gold ¥330, black ¥450), and you pay for the stack when you stand up (Esc).
- *Sushi Kōryū* (the traditional sushi-ya, ¥500 to ¥12,000) has a hinoki counter. Pick from the menu with the arrow keys and Enter, and the chef slices, presses and plates it in front of you.
- *Menya Ippai* (ramen) has booths with a bamboo blind. Tick the order sheet (broth, garlic, onion, red sauce, noodles, toppings) and hand it in; the blind rises on your bowl.

**Your own cars and road textures:** copy them into `Game/Add Your Files/` (see the README.txt there). No upload and no git needed.

---

An open world game set on **Konto**, a fictionalised island modelled on Honshu. A man leaves his
village in the mountains for the capital, **Tōkonto**, to take a job at **Soti**, the tech company
that owns half the skyline.

This repository is the **world**: the island, the city on it, and the man who walks around it.
Landscape, city plan, three thousand built and textured buildings, the street furniture between
them, traffic on the roads and a crowd on the pavements, and Seiko Shigu rigged and animated.

One button builds the lot: **Tools → SalaryMan → Build Konto (all steps)**.

---

## Engine

**Unity 6 (6000.x) with HDRP.** The reasons, in order of how much they mattered:

- **Streaming terrain at this size is solved.** Unity's terrain system gives heightmap tiles,
  splatmaps, detail instancing and tree billboarding out of the box, and this world is 126 km² of
  it. Building the same thing on a custom mesh pipeline is months of work before anything is
  drivable.
- **HDRP is the right renderer for this look.** Physically based sky, volumetric fog and clouds,
  a real water system, exposure and a restrained grade — the wet, hazy, high-contrast light that
  makes Japan look like Japan is the whole visual premise, and HDRP does it natively.
- **C# makes this kind of generation fast to write and fast enough to run.** The entire island,
  its erosion, its rivers and both cities are generated by the code in this repository, in minutes,
  deterministically from one seed.
- **Everything else is a known quantity**: Terrain tools, Timeline and Cinemachine for cutscenes,
  the Input System for pad support, Addressables for streaming, Enlighten/APV for lighting.

Unreal 5 would win on out-of-the-box visual fidelity (Nanite and Lumen are genuinely better than
anything in HDRP), and if the project were being staffed with an environment art team tomorrow it
would be the stronger choice. It loses on procedural iteration speed, which is what this stage of
the project is entirely made of. Godot is not there yet for a world this size.

Setup, and what every look-related setting is for: **[Docs/UNITY_HDRP_SETUP.md](Docs/UNITY_HDRP_SETUP.md)**.

---

## What it generates

### The island

An island arc laid out the way Honshu actually is, then taken apart by simulated weather:

- **A tectonic arc** with a long north east limb, a bend at the central rift and a south west
  limb, bulging out where the capital's plain is. Every landform is anchored to this arc, so the
  geography holds together at any world size.
- **Mountain ranges** along the arc: a long moderate backbone (Ōu), a high sharp alpine range
  through the centre (the Konto Alps), a worn rounded range in the south west (Chūgoku), and
  low dissected coastal hills — the satoyama belt that covers most of rural Japan.
- **A volcanic front**: isolated stratovolcano cones with concave flanks, summit craters and
  radial erosion gullies, plus a collapsed caldera that fills to a lake. Kogane-san, the Fuji
  analogue, stands three kilometres inland of the capital and is visible from its streets.
- **Intermontane basins** — flat floors ringed by steep walls, like Kōfu and Nagano. The village
  the story starts in sits in one.
- **Coastal alluvial plains** hugging the shore, so the mountains stay close behind the cities.
- **Two completely different coasts**: a drowned ria coast of deep V-shaped inlets on the ocean
  side, long smooth sandy arcs and dune ridges on the sheltered side.
- **Hydraulic and thermal erosion** — 1.1 million rain droplets carving the dense, finely branched
  valley networks that heavy rain on steep young rock produces, then gravity settling the slopes
  to their angle of repose.
- **A full drainage system**: depressions filled, flow routed, channels carved with width set by
  discharge, flood plains flattened along the valley floors, lakes found and filled, and rivers
  traced from the mountains to the sea as water-carrying ribbons.
- **Rice terraces** cut into gentle low ground near valley floors, in hamlet-sized patches.
- **Surfacing by rule**: eleven ground layers assigned from height, slope, discharge, aspect and
  distance from the coast — including more snow on the Sea of Konto side, because the north west
  coast of Honshu is one of the snowiest inhabited places on earth.
- **Vegetation zoned like the real thing**: pine holding the dune coast, bamboo and maple on damp
  valley floors, ruler-straight sugi plantations blanketing the lower slopes, oak above them,
  birch thinning toward the tree line, then scree and snow.
- **HDRP environment**: physically based sky, height and volumetric fog, volumetric clouds, a sun
  driven from real solar geometry at 36.2° N, six weather states that crossfade, and a restrained
  grade.

### The city

**Tōkonto**, on the Kanmei Plain, wrapped around its bay with the hills at its back — generated as
space, not as buildings:

- **A bay**, cut into the coast before erosion runs, with a narrow mouth and reclaimed islands in it.
- **A graded platform**: the landscape smoothed and held to a buildable gradient, quays, embankments
  and made ground, feathered back into open country at the edges.
- **18 – 22 named wards**, each with its own character, its own block size and **its own street grid
  at its own angle** — which is most of why a Japanese city map reads the way it does.
- **~350 blocks and ~1,700 reserved building plots**, every one fronting a street and **graded dead
  flat at a known height**, so a building dropped on a plot needs no fitting. A road clipping the
  corner of a block shaves the block rather than deleting it, which is what keeps the centre dense.
- **Roads**: an elevated expressway loop, ring roads, seven radial arterials that follow the easiest
  ground, local streets and alleys, and a waterfront promenade.
- **Railways**: a commuter loop around the core, six radial lines out to the suburbs and the
  villages, a shinkansen viaduct, a freight spur to the docks, two subway lines, and ~13 stations
  including a fourteen-platform terminus.
- **A moated palace park** at the centre, with the business district against it.
- **Reserved sites** for the buildings the story needs, starting with **Soti Tower** — which is
  modelled rather than reserved: 592 m, taken from the Ping An International Finance Centre in
  Shenzhen, standing on a whole block of its own.
- **Bridges** reserved wherever a road or a line crosses water.
- **Built buildings, not massing**: about three thousand of them, with podiums and setbacks,
  floor bands, parapets, balconies, canopies, shopfronts, box signs, pitched roofs, and the plant
  on the roofs that is most of what a Japanese skyline actually is. Generated PBR facades with
  pixel displacement, so the windows read as holes from the pavement.
- **Street furniture**: kerbs, lamp columns, signals at the junctions, vending machines, and the
  overhead power lines strung pole to pole that say which country this is.
- **Traffic**, driving on the left: kei cars, vans, taxis with their 行灯 roof lamps, box vans and
  buses, from parody marques with parody badges, keeping their lane, keeping a gap and stopping at
  the lights.
- **A crowd** on the footways: salarymen with briefcases, office ladies, students, workers in hard
  hats, all walking somewhere.

Around it, the island is forested the way Japan is — two thirds of the land under trees, sugi and
hinoki plantations on the lower slopes, natural forest above them, and bare ground only on the
highest tops and the faces too steep to hold soil.
- **Seiko Shigu**, rigged, with idle, walk and run on a blend tree, dropped into the scene with
  the rest of it.

**Mizuho** and **Isobe** are farming villages on the far side of the mountains from Tōkonto, on the valley plain there (Mizuho is about 6.4 km from the capital and Isobe 5.3 km), not suburbs of it. They are built of two-storey machiya houses with tiled roofs, kura storehouses and a shrine, with no offices, flats, car parks or megastores. Around them the valley floor is laid in rice paddies on level terraces: most deep green with rice, some flooded and mirroring the sky with young seedlings in rows, a few turning gold. A stream winds through each village between stones and reeds, with a red arched bridge where a road crosses it, and the houses have gardens with a pond, rocks, a stone lantern, a pine and a red maple. Mizuho is where the story starts, and the family home is there.

Everything is deterministic from one seed.

Full detail on the plan: **[Docs/CITY_TOKONTO.md](Docs/CITY_TOKONTO.md)**.
How the buildings and their materials work, and where to change them:
**[Docs/BUILDINGS_AND_SURFACES.md](Docs/BUILDINGS_AND_SURFACES.md)**.
How the cars drive and the crowd walks: **[Docs/TRAFFIC_AND_CROWD.md](Docs/TRAFFIC_AND_CROWD.md)**.

---

## Run it in a browser first

`Web/konto.html` is the same generator ported to Three.js in a single file: the island, the
erosion, the rivers, Tōkonto's wards, streets, railways and plots, the textured massing, Soti
Tower, and **Seiko Shigu** — rigged, with idle, walk and run cycles — who you can walk around it.

It also carries the street: sixteen kinds of vehicle driving on the left, NHRail commuter sets and
shinkansen on the viaducts, platforms and name boards at every station, Tokonto Bus stops along
the arterials, advertising on the buses, the trains, the hoardings and the rooftops, a scramble
crossing and the shrines. Serve the folder and open the page; nothing to install.

```
python3 -m http.server 8000 --directory Web    # then open http://localhost:8000/konto.html
```

See **[Web/README.md](Web/README.md)**.

## Or play it properly

`Game/` wraps the same engine in Electron and turns it into something you
install: a window with no browser in it, an Xbox pad laid out the way GTA V is,
the libraries vendored so it starts with no internet, and builds made in the
cloud and left on GitHub for you to download.

```
cd Game && npm install && npm start
```

**[Docs/PLAYING_ON_A_PC.md](Docs/PLAYING_ON_A_PC.md)** is the whole of it: where
to get a build, how to pair the controller, every button, and what to turn off
if it runs badly.

---

## Quick start

1. Create a Unity 6 project from the **3D (HDRP)** template.
2. Copy `Assets/SalaryMan` into the project.
3. **Tools → SalaryMan → Configure HDRP Asset**.
4. **Tools → SalaryMan → Konto World Builder** → **Build Konto**. It takes a while; it is a big
   island.
5. Save the scene. Press play; right mouse to look, WASD to fly.
6. **Tools → SalaryMan → Konto City** to find a ward, look up a plot, or drop a building on one.

---

## Layout

```
Assets/SalaryMan/World/Scripts/
  Runtime/Generation/
    KontoNoise.cs             gradient, ridged, billow, cellular and tileable noise
    Field2D.cs                float raster with bicubic sampling, blur and resampling
    KontoWorldSettings.cs     every parameter, plus the Honshu-derived default layout
    IslandArc.cs              the tectonic arc everything is anchored to
    LandmassBuilder.cs        coastline, bays, ranges, volcanoes, basins, plains, town terraces
    ErosionPasses.cs          thermal (repose angle) and hydraulic (droplet) erosion
    HydrologyPass.cs          depression filling, flow routing, channels, lakes, river paths
    KontoWorldGenerator.cs    runs the whole pipeline in order
    KontoWorldData.cs         the finished world, sampled continuously in world space
    SurfaceClassifier.cs      which ground layer goes where, city surfaces included
    VegetationRules.cs        which species grows where, and where nothing grows
    KontoFoliageLibrary.cs    art slots for trees and ground detail
    KontoTerrainBuilder.cs    terrain tiles, splatmaps, grass, trees, stitching
  Runtime/Generation/City/
    CityEnums.cs              districts, plot kinds, road and rail classes, ground surfaces
    CitySpec.cs               per city settings, and the district rule table
    CityLayout.cs             the finished plan: wards, blocks, plots, roads, rails, stations
    CityFrame.cs              a city's own coordinate frame: along the coast, and inland
    CityGeom.cs               rotated rectangle maths shared by the planner and the grading
    CityFootprint.cs          where a city is allowed to be, and where it stops
    CityBay.cs                the bay, cut into the coastline
    CityNames.cs              ward, station and road names
    CityWardGrid.cs           one ward's street grid, as a closed form
    CitySegmentIndex.cs       spatial index of everything that has already claimed ground
    CityTerrain.cs            world space access to the landscape, for the city passes
    CityPlanner.cs            wards, roads, railways, blocks and every reserved plot
    UrbanRaster.cs            the per city rasters: graded height, influence, surface
    CityGrading.cs            the civil engineering: platform, streets, plots, rail beds, moat
  Runtime/City/
    CitySurface.cs            the material slots the whole city, its traffic and its crowd are made of
    BuildingMesh.cs           the mesh accumulator: a ward of buildings welded into one mesh
    BuildingLibrary.cs        a plot in, a building out: massing, articulation, roof plant
    FacadeTextures.cs         paints every surface: albedo, normal, mask and height
    StreetProps.cs            kerbs, lamps, signals, vending machines, poles and their wires
    VehicleLibrary.cs         nine bodies, parody marques, parody badges, green commercial plates
    PedestrianLibrary.cs      six kinds of person, as a body and two legs
    CityLanes.cs              the road plan as lanes to drive on and footways to walk on
    KontoTraffic.cs           the traffic: lanes, gaps, stop lines, and a pool around the player
    KontoCrowd.cs             the crowd: footways, leg swings, and cloth tinted per person
    CityMeshPiece.cs          a baked mesh with its materials and which surface each submesh is
    SotiTower.cs              the one modelled building: Soti's head office, Ping An's form
    KontoCityLayoutAsset.cs   the plan as an asset, with lookup and one-line building placement
    KontoCityRoot.cs          the scene's handle on a city, and its gizmos
    CityPlotMarker.cs         a marker sitting on a reserved plot
  Runtime/Environment/
    HdrpReflection.cs         version-tolerant access to HDRP
    KontoTimeOfDay.cs         real solar position, sun and moon
    KontoWeather.cs           six weather states, crossfaded
  Runtime/Player/
    KontoInput.cs             keyboard, mouse and Xbox pad, either input backend
    KontoCharacter.cs         third person character movement, drives the animator
    KontoThirdPersonCamera.cs orbit camera with collision and a first person toggle
    KontoFreeCamera.cs        fly camera for surveying
    KontoWalker.cs            first person tester, no model needed
  Editor/
    KontoWorldBuilderWindow.cs  the build window and menu items
    KontoWorldBuilder.cs        build orchestration and asset saving
    KontoCityWindow.cs          find a ward, find a plot, drop a building on it
    KontoCityFactory.cs         city hierarchy, markers, moat water, massing blockout, Soti Tower
    KontoBuildingFactory.cs     the buildings, batched into one mesh per ward
    KontoPropFactory.cs         the street furniture, chunked so it culls
    KontoTrafficFactory.cs      bakes the fleet and the crowd, drops the spawners in
    KontoBatchBuild.cs          the command line entry point, for building with no editor open
    KontoSurfaceLibrary.cs      generates the facade, roof and metal materials
    KontoSeikoSetup.cs          imports the character, builds his blend tree, puts him in
    KontoTextureFactory.cs      procedural tiling ground textures and terrain layers
    KontoFoliageFactory.cs      stand-in trees, grass billboards, materials
    KontoMeshBuilder.cs         procedural mesh primitives
    KontoEnvironmentFactory.cs  sky, fog, clouds, lighting, grade, weather profiles
    KontoWaterFactory.cs        ocean, lakes, and city water
    KontoRiverBuilder.cs        river ribbon meshes
    KontoHdrpAssetConfigurator.cs  switches on the HDRP features this world needs
    KontoCharacterWindow.cs     drops a model in as a playable character
    KontoCharacterFactory.cs    builds the rig: capsule, movement, camera, layers
    KontoProjectSettingsUtil.cs creates layers, installs gamepad axes
    KontoSceneUtil.cs           makes sure the scene has a usable camera

Tools/
  rig_seiko.py                Blender: rigs and animates the character into a GLB and an FBX

Assets/SalaryMan/Characters/
  Seiko.fbx                   the rigged character, with Idle / Walk / Run

Web/
  konto.html                  the whole generator, in a browser, in one file
  seiko.glb                   Seiko Shigu, rigged, with idle / walk / run

Tools/
  cloud/build-konto.ps1|.sh   build the world on a rented machine, no editor window
  web/make-standalone.py      fold the model into the page, for phones and one-file hosts
```

Character setup, Blender export settings and the full control map:
**[Docs/CHARACTER_AND_CONTROLLER.md](Docs/CHARACTER_AND_CONTROLLER.md)**.

Building it on a rented machine, when the island outgrows your own:
**[Docs/CLOUD_BUILD.md](Docs/CLOUD_BUILD.md)**. The short version is that generating the world
wants memory and no graphics card, so the expensive half can run headless for pennies:
`Tools/cloud/build-konto.sh --project ~/Konto --low-memory`.

---

## Notes

- **Scale.** Konto is a compressed Honshu: about **12.3 × 10.2 km (126 km²)** by default against
  Honshu's 1300 km, with peaks near 1500 m. Slopes are therefore steeper than the real thing. That
  is deliberate — at true scale a 1:80 Fuji would be 47 m high and read as a hill. For comparison,
  the whole of GTA V is about 8 × 6 km.
- **The city is space, not buildings.** Plots, streets, rails and reservations exist; nothing stands
  on them but an optional grey blockout. That is the handover point.
- **Plots are flat on purpose.** A plot on sloping ground is levelled with a step at its edge,
  because that step is a retaining wall, and Japanese hill suburbs are built exactly that way.
- **HDRP versions.** Every HDRP-specific call goes through reflection, so a parameter renamed
  between HDRP versions logs a warning instead of failing to compile.
- **The stand-in art is stand-in art.** The procedural textures and low-poly trees exist so the
  landscape can be judged before any art is made. Swapping them out changes nothing else.
