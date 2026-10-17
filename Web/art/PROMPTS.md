# Salary Man: image prompts for ChatGPT

Three prompts to paste into ChatGPT's image generator. The names, positions,
lines and counts in the two map prompts come straight out of the game's own
world data, so the art lines up with what is actually in Konto.

Tips for all three:

- Paste one prompt per chat. If the image comes back with misspelt labels, reply
  "Redraw it, same layout, and fix these labels: ..." instead of starting again.
- Macrons matter: Tōkonto, Kanjō, Chūō-dōri. Say so if they get dropped.
- Ask for a 3:2 landscape for the maps and 16:9 for the cover.

---

## 1. Cover art

```
Key art for a video game called "SALARY MAN". Wide 16:9 landscape.

Style: clean modern Japanese anime ink illustration, crisp black linework, flat
cel shading with a little soft gradient, matte finish. A limited palette:
near-black suits, white shirts, warm off-white paper background, and ONE accent
colour, vermilion red (#D8352A). It must look like the same series as a
character standing alone against a crowd of black silhouettes on a white
background.

Subject: Seiko Shigu, a young Japanese office worker in his mid twenties. Short
dark messy hair, calm, slightly tired, determined eyes. Black two-button suit,
white shirt, slim black tie, black leather briefcase, wristwatch. He walks
straight towards the viewer, centre of the frame, drawn in full detail and the
only figure with colour: a thin vermilion line around his briefcase clasp and a
vermilion tie pin.

Behind and around him: two staggered rows of identical black salaryman
silhouettes with briefcases, fading into the paper white, all walking the same
way. Long soft shadows fall towards the viewer.

Behind the crowd, a pale ink-wash skyline of the fictional capital city Tōkonto:
a tall slim broadcast tower with a lit observation deck (Soti Tower), glass
office blocks, an elevated railway viaduct with a green-banded stainless train
crossing it, a few neon signs reading only "ソティ", "ぎんばし" and "24h", and
at the far right a snow-capped mountain. Keep the skyline pale grey and low
contrast so Seiko stays the focus.

Title: the words "SALARY MAN" in big bold condensed sans-serif capitals,
vermilion red, set across the lower third behind his legs so his shoes overlap
the letters. Under it, smaller, in black: "Tōkonto, Konto". No other text, no
logos, no watermark, no price, no age rating.

Leave the top 15 percent of the image calm and empty so it can be cropped.
```

Follow-ups that usually help:

- "Make it a vertical 2:3 poster version, same composition."
- "Same image on a dusk background: warm orange sky, crowd in deep navy."

---

## 2. Island-wide transport map

The island is called **Konto**. It is one long crescent running from the
north-west tip to the south-east, widest at the south-east end, with open sea on
the south-west and north-east. The capital **Tōkonto** sits on the south-east
coast facing a bay. Positions below are percentages across a 3:2 map, measured
from the west edge and the north edge, so `(52,68)` means 52 percent of the way
east and 68 percent of the way south.

```
Draw an island-wide public transport map for the fictional island of Konto,
in the style of a modern Japanese rail network diagram (like the Tokyo metro
and JR network maps): clean, flat, vector look, thick coloured lines with only
horizontal, vertical and 45 degree segments, white-ringed station dots, a
legend, and a small title block. 3:2 landscape, off-white background, pale
blue sea, light green land. Everything labelled in English with the Japanese
name beneath it in smaller type. Title block: "NHRail · Konto Transport Map".

THE ISLAND: one long crescent-shaped island running from the north-west corner
to the south-east corner, widest at the south-east, with a deep bay on the
south-east coast. Open sea to the south-west and north-east. Keep the real
geography loose and schematic, but keep every place in the right relative
position.

TOWNS (dot, name, position as % from west, % from north):
- Tōkonto, the capital, large double ring: (52, 68), on the south-east coast
- Mizuho: (46, 41)
- Shiokawa: (29, 55)
- Nagisa: (76, 75)
- Hamaura: (62, 52)
- Isobe: (66, 62)
- Kaido: (49, 27)
- Tomari: (60, 42)

RAIL (NHRail, run by Nihon Rail). All of it is inside and around Tōkonto except
the shinkansen, which crosses the island:
1. NHRail Shinkansen: a thick white line with a blue outline, long and nearly
   straight, from the west at (26, 59) through Tōkonto Central (terminus) to the
   south-east end at (87, 84). Fast, few stops, drawn as a double line.
2. NHRail Kanjō Loop Line (the ring): green, elevated, a closed oval round
   central Tōkonto. Stations in order clockwise: Hinodecho, Shin-Hinodecho,
   Shin-Hinodecho North, Gakuendai, Seimon, Kanchogai, Kanmei-Ekimae, Sakuradai,
   Shiohama, Ginbashi. Show it as a thick green ring with white-ringed dots.
3. Radial lines, all starting at Tōkonto Central (a big interchange, the hub of
   the map, at (52, 68)):
   - Line 1, red: Tōkonto Central, Hinodecho, Shin-Hinodecho, Hakuchoen,
     then out to the east edge of the city.
   - Line 2, orange: Tōkonto Central, Marukane, Seimon, Gakuendai, then north.
   - Line 3, blue: Tōkonto Central, Marukane, Gosho, Kanchogai, Midorino,
     Shin-Midorino, running north-west towards Shiokawa.
   - Line 4, purple: Tōkonto Central, Marukane, Sakaebashi (short, to the west).
   - Line 5, yellow: Tōkonto Central, Ginbashi, Shiohama (short, to the south).
   - Line 6, pink: Tōkonto Central, Ginbashi, Shin-Ginbashi, Kanmei-futo
     (to the south-east, ending at the port).
   Mark interchanges with a white ring joined to a black outline, and mark the
   Loop Line interchanges where a radial line crosses it.

ROAD (thin grey lines under the rail lines): the Konto Metropolitan Expressway
and the coastal expressway, drawn as a single dark-grey ring road that follows
the whole coast of the island with a tiny "E10" shield, with six toll gates
marked by a small ¥ icon and name:
- Kaido Toll (8, 7), Shiokawa Toll (6, 31), Mizuho Toll (45, 29),
  Hamaura Toll (63, 35), Nagisa Toll (89, 49), Tōkonto Toll (38, 72)

SKI AREAS (small snowflake icons with names, in light blue):
- Aokami (14, 18), Shirotake (30, 29), Asagiri-dake (69, 41)

EXTRAS: a compass rose top right, a scale bar bottom left ("0 – 5 – 10 km"),
a legend panel bottom right listing every line colour with its name, plus the
symbols for interchange, toll gate and ski area. Keep the sea empty and clean.
No real-world city names, no logos of real railways, no watermark.
```

Follow-ups:

- "Move the legend to the left and make the Kanjō Loop Line a bit thicker."
- "Same map without any text, so I can add labels myself."
- "Make a night version, dark navy background, glowing lines."

---

## 3. Tōkonto detailed map (with bus stops)

Tōkonto is the capital and covers most of the south-east. It has **24 wards**.
The game has 28 rail stations, a viaduct ring, **110 bus stops**, and the bus
and walking street grid. Positions are again as percentages of the map frame,
where the frame covers the whole city (west edge of the city = 0, north = 0).

```
Draw a detailed street map of the fictional capital city Tōkonto, in the style
of a tourist or transit street map of central Tokyo: flat vector, off-white
paper, pale blue water, light green parks, pale yellow built-up blocks, white
roads with grey casing, thicker yellow-orange for arterial roads, a dark
grey elevated line for the expressway. 3:2 landscape. English labels with the
Japanese in smaller type beneath. Title block "Tōkonto City Map · 東コント" and
a legend. The city sits on the coast of a bay: the sea fills the west, the
south-west and the south edges of the frame, with the two reclaimed-land wards
(Shinkaijima and Mirai-futo) sitting in the water to the west.

WARDS (names in light grey capitals, placed at these positions, as % from the
west and % from the north of the map frame):
- Marukane, the city core: (50, 50)
- Gosho (the palace and gardens, with a moat): (43, 41)
- Kanchogai (government district): (35, 37)
- Kanmei-Ekimae (station quarter): (34, 40)
- Seimon: (46, 34)
- Hinodecho (retail): (65, 44)
- Ginbashi (retail, with the Ginbashi Scramble crossing): (62, 65)
- Sakaebashi (offices): (47, 63)
- Kanmei-futo (port): (68, 77)
- Shiohama (port): (53, 81)
- Mirai-futo (reclaimed land): (16, 64)
- Shinkaijima (reclaimed land, an island): (8, 37)
- Sakuradai (houses): (34, 56)
- Asahigaoka (apartments): (18, 36)
- Midorino (park): (24, 22)
- Hatsune: (23, 14)
- Takanodai (suburb): (35, 14)
- Gakuendai (university campus): (51, 23)
- Kurotani (works and industry): (62, 23)
- Yanagimachi: (71, 36)
- Inarizaka (a shrine on a hill): (73, 34)
- Hakuchoen (large park): (78, 41)
- Tsukimidai (apartments): (83, 60)
- Hazukidai (suburb): (88, 61)

LANDMARKS (small icons with names, same coordinate system): Tōkonto Central
station, the big hub (56, 55); Konto Central Bank (53, 54); Konto Broadcasting
Centre (45, 55); Soti Tower, a tall slim tower (55, 42); Konto Metropolitan
Government and Gosho Gardens, together, inside the moat (43, 41); Ginbashi
Scramble crossing (62, 61); five small shrines clustered round Inarizaka
(72 to 75, 24 to 34).

STREETS (label along the road, bold for the arterials):
- Ring roads: Kanjō 1-gō (the tightest ring, round Marukane), Kanjō 2-gō,
  Kanjō 3-gō, Kanjō 4-gō (the outermost). Four nested rings.
- Radial arterials from Marukane: Chūō-dōri (east, long), Asahi-dōri (south-east
  to the port), Suzuran-dōri (north-east), Hinode-dōri (north, long),
  Kanmei-dōri (north-west), Tokura-dōri (west, long), Midori-dōri (south-west,
  short), Yanagi-dōri (south), Kogane-dōri (south-west, short).
- Konto Metropolitan Expressway: a thick dark-grey elevated road in the south,
  through Ginbashi, with a ramp symbol where it meets the city.

RAIL (draw on top of the roads, same colours as the Konto Transport Map):
- NHRail Kanjō Loop Line, green, elevated, a ring through Hinodecho,
  Shin-Hinodecho, Gakuendai, Seimon, Kanchogai, Kanmei-Ekimae, Sakuradai,
  Shiohama and Ginbashi.
- Line 1 red (Tōkonto Central, Hinodecho, Shin-Hinodecho, Hakuchoen), Line 2
  orange (Tōkonto Central, Marukane, Seimon, Gakuendai), Line 3 blue (Tōkonto
  Central, Marukane, Gosho, Kanchogai, Midorino, Shin-Midorino), Line 4 purple
  (Tōkonto Central, Marukane, Sakaebashi), Line 5 yellow (Tōkonto Central,
  Ginbashi, Shiohama), Line 6 pink (Tōkonto Central, Ginbashi, Shin-Ginbashi,
  Kanmei-futo), Shinkansen white and blue (terminus at Tōkonto Central).

BUS (this is the point of this map): draw bus stops as small blue circles with a
white "B", about 110 of them, spread along the arterials and ring roads rather
than the side streets, roughly:
- Hinodecho 9, Gakuendai 9, Ginbashi 8, Sakaebashi 7, Hakuchoen 7, Tsukimidai 7,
  Takanodai 6, Kanmei-Ekimae 5, Sakuradai 5, Kanmei-futo 5, Hazukidai 5,
  Kanchogai 4, Marukane 4, Kurotani 4, Asahigaoka 4, Shinkaijima 4,
  Seimon 3, Inarizaka 3, Midorino 3, Hatsune 3, Shiohama 2, Gosho 1,
  Yanagimachi 1, Mirai-futo 1.
Draw these bus routes as thin dashed blue lines with a route number in a blue
rounded square, each one following the named road, with its stops:
- Bus 1: Chūō-dōri: Tōkonto Central, Marukane, Hinodecho, Hakuchoen, Tsukimidai
- Bus 2: Asahi-dōri: Tōkonto Central, Ginbashi, Kanmei-futo
- Bus 3: Hinode-dōri: Tōkonto Central, Seimon, Gakuendai, Kurotani
- Bus 4: Tokura-dōri: Tōkonto Central, Gosho, Kanchogai, Asahigaoka
- Bus 5: Kanmei-dōri: Kanmei-Ekimae, Sakuradai, Midorino, Hatsune, Takanodai
- Bus 6: Yanagi-dōri: Tōkonto Central, Sakaebashi, Shiohama
- Bus 7: Kanjō 3-gō ring: a full circle bus calling at Hinodecho, Ginbashi,
  Sakaebashi, Sakuradai, Kanmei-Ekimae, Gakuendai, Kurotani.
Give each interchange where a bus stop sits next to a rail station a small
"rail + bus" interchange icon.

OTHER ICONS: a toll gate where the expressway meets the city (Tōkonto Toll, at (31, 56),
just west of Sakuradai); a harbour anchor at Kanmei-futo and Shiohama; a book icon
at Gakuendai; a torii gate at Inarizaka; a tree at Hakuchoen, Midorino and Gosho
Gardens; a police box (kōban) icon at the Ginbashi Scramble; a hospital
cross, a fire station and a police station icon in Marukane, and the three
emergency numbers 110, 119 and 118 in a small corner box.

EXTRAS: compass rose, scale bar ("0 – 500 m – 1 km"), a legend panel at the
bottom right listing: rail lines (with colours), the bus stop symbol, bus
routes, expressway, ring roads, arterials, parks, and the landmark icons. No
real-world city names, no real logos, no watermark.
```

Follow-ups:

- "Make the bus routes bolder and the streets paler."
- "Zoom in on Marukane and Ginbashi only, same style, with every bus stop labelled."
- "Make a version without text."
