# What this is modelled on

Konto is a fictionalised Honshu, so nearly everything in it has a real counterpart. This is the
record of which one, and what was taken from it — the numbers, not a mood board.

A note on images: the references below are named and linked rather than reproduced. The
photographs belong to the people who took them, and the point of a reference is the dimension
you take from it, which is written down here where a picture would only imply it.

---

## Soti Tower

| | |
|---|---|
| **Height** | 248 m — [Midtown Tower, Akasaka](https://en.wikipedia.org/wiki/Tokyo_Midtown) (2007), Mitsui Fudosan, 813 ft architectural height |
| **Against its neighbours** | 1.35× the tallest building on its block, 1.63× the ordinary ones |
| **Floorplate** | 48 m square at the base, stepping to 42 m then 38 m |
| **Setbacks** | two, at 42% and 74% of the shaft |
| **Floors** | 54 office floors at 4.1 m |
| **Podium** | five storeys, 62 m across, with a canopy projecting 1.4 m over the footway |

It used to be the [Ping An Finance Centre](https://en.wikipedia.org/wiki/Ping_An_Finance_Centre)
from Shenzhen: 592 m, eight steel mega-columns closing over the roof into a claw, a mast above
that. Next to neighbours of 150 m it was nearly four times the height of anything around it, and
it read as science fiction rather than as a city.

Tokyo does not look like that. Its towers cluster. [Toranomon Hills Station
Tower](https://architecturalrecord.com/articles/16745-in-tokyo-a-tower-by-oma-twists-and-turns-to-embrace-the-public)
is 266 m among towers of 185–220 m; Midtown Tower is 248 m in a district of similar height. The
tallest office building in a Tokyo district stands about one and a half times its neighbours,
which is what Soti does now.

Three things make the silhouette read as Tokyo rather than as anywhere:

- **The steps.** Tokyo towers step back as they rise because of the sky-exposure rules
  (斜線制限), which limit how much of the sky a building may take from the street.
- **The mechanical floors.** Louvred plant bands sit under each setback and at the top of the
  shaft, and they are visible from the street as solid bands in a glass wall.
- **The podium.** Five storeys of stone meeting the pavement under a deep canopy, rather than
  glass running into the ground.

## The traffic

Dimensions are the manufacturers' own, in millimetres, because a vehicle that is the wrong size
is wrong in a way you notice before you notice anything else. The share is the fraction of the
traffic each one is, which is the other half of making a street look Japanese: a quarter of it
is the same small upright box.

| In the game | Real counterpart | L × W × H (mm) | Share |
|---|---|---|---|
| Kei car | the kei class limits | 3400 × 1480 × 1700 | 15% |
| Kei van | the same limits, one-box body | 3400 × 1470 × 1890 | 7% |
| Hatchback | [Honda Fit / Jazz](https://www.truedelta.com/Honda-Fit-vs-Toyota-Prius-specs-comparison,99-272,2016-2009&r=4) (2020) | 4050 × 1700 × 1520 | 14% |
| Fastback sedan | [Toyota Prius](https://www.carexpert.com.au/toyota/prius/2024/dimensions) (5th gen, 2024) | 4580 × 1760 × 1490 | 11% |
| Saloon | Toyota Crown proportions | 4910 × 1800 × 1460 | 5.5% |
| Crossover | Toyota Harrier / Honda CR-V | 4600 × 1860 × 1690 | 9% |
| One-box minivan | Toyota Noah / Nissan Serena | 4700 × 1730 × 1860 | 7% |
| Taxi | Toyota JPN Taxi, with the 行灯 roof lamp and a 空車 card | 4400 × 1695 × 1750 | 7.5% |
| Ride-hailing car | the saloon, in black, with a lit windscreen badge | 4910 × 1800 × 1460 | 3.5% |
| Patrol car | 白黒パトカー: white over black, red bar | 4690 × 1780 × 1480 | 1.2% |
| Sports coupe | Toyota GR86 / Subaru BRZ | 4270 × 1780 × 1310 | 2.8% |
| Supercar | a mid-engined wedge, 1.17 m to the roof | 4550 × 1970 × 1170 | 0.8% |
| Motorcycle | a 400 cc naked, with a rider | 2100 × 760 × 1260 | 3% |
| Delivery scooter | Yamaha GEAR proportions: step-through, front crate | 1900 × 700 × 1320 | 2.5% |
| Box truck | Isuzu ELF 2-tonne, cab over the front axle | 6190 × 1900 × 3100 | 2.2% |
| Bus | Hino Blue Ribbon, municipal single-decker | 10490 × 2490 × 3100 | 1.3% |

The kei class is the one worth knowing: a legal category capped at 3.4 m long and 1.48 m wide,
which is why a fifth of the cars on a Japanese street are the same small size and shape.

Commercial vehicles carry **green number plates**, which in Japan means a vehicle carrying goods
or people for hire; kei vehicles carry **yellow** ones; private cars carry white. The traffic
keeps left.

### Paint

Four palettes, because a kei car is not painted like a saloon and a supercar is not painted like
either.

| | |
|---|---|
| **Family cars** | white, pearl, silver, gunmetal and black for the half of the street that is monochrome in Japan, then navy, bright blue, dark red, bright red, beige, deep green, leaf green, amber, plum, teal and terracotta. Weighted a little more colourful than the sales figures, because a street of eighteen white cars reads as a bug |
| **Kei cars** | the one class allowed to be cheerful, because they genuinely are: mustard, mint, pale blue, coral, chocolate, ivory, raspberry — and half of them with a different coloured roof, which is the quickest way to tell a kei car from a small hatchback at a distance |
| **Coupes** | red, white, black, metallic blue, gold, racing green |
| **Supercars** | yellow, orange, lime, blue, red — saturated, because nobody buys a beige one |

### The modelled cars

Nine of the sixteen kinds are real meshes rather than boxes. They arrive from a
text-to-3D generator as sealed, untextured shells at 130,000 to 400,000 faces, and
`Tools/cars/prepare_car.py` turns each one into a game asset:

| | |
|---|---|
| **Orient** | the width is the axis whose geometry is most even about its own centre, because a car is mirror-symmetric left to right and not front to back or floor to roof. The length is the longest. Whatever is left is up. Measuring it beats assuming it — one of the five arrived standing on its nose |
| **Resize** | to the real car's L × W × H on all three axes. A generated kei car came out 1.9 m wide for a class capped by law at 1.48, and a car that does not fit its lane is wrong immediately |
| **Shrink** | to 4,000–5,500 triangles. A hundred and thirty cars at 150k faces is twenty million triangles. Going the other way does not help either: at 11,000 the geometric material cut starts picking up the shell's own noise and the roof comes out mottled, so the budget is what the cut can take, not what the GPU can take |
| **Cut** | into four materials by geometry alone, since there is nothing to sample: below the sill and near a hub is tyre, below the sill otherwise is trim, above the beltline and vertical (or raked, near the ends of the greenhouse) is glass, the rest is paint |

The game then gives every copy its own `paint` material, so one mesh is forty
different cars. A taxi, a ride-hailing car and a patrol car are the same saloon
with different paint and something on the roof, which is what they are in the
street.

| In the game | What it is |
|---|---|
| Kei | a kei crossover: 3.40 × 1.48 × 1.68 m |
| Kei van | a tall kei one-box: 3.40 × 1.47 × 1.89 m |
| Fastback sedan, saloon, taxi, Ryde, patrol car | one compact saloon body: 4.58 × 1.78 × 1.46 m |
| Coupe | a rear-engined sports car: 4.52 × 1.85 × 1.30 m |
| Motorcycle | a 600 supersport: 2.10 × 0.78 × 1.20 m |

### Driving one

The traffic drives at the speeds in the catalogue. When **you** drive, the
numbers are the real car's: a top speed and a nought-to-a-hundred time, which
between them give the acceleration. It falls off towards the top the way a real
one does, which is what stops a supercar reaching 94 m/s in four seconds.

| | Top | 0–100 km/h |
|---|---|---|
| Kei | 38 m/s (137 km/h) | 13.5 s |
| Fastback sedan | 50 m/s | 9.2 s |
| Patrol car | 58 m/s | 7.0 s |
| Coupe | 80 m/s (288 km/h) | 3.5 s |
| Supercar | 94 m/s | 2.9 s |
| Motorcycle | 78 m/s | 3.1 s |
| Bus | 25 m/s | 25 s |

**Weight.** Forward on the left stick puts the weight over the nose and back
puts it on the rear wheels. On a bike that is a stoppie and a wheelie — back on
the stick with the throttle open and more than 2 m/s on the clock lifts the
front to about 37°; forward on it under braking puts the nose down. On a car it
is dive and squat, which is the same thing with a suspension in the way. On a
keyboard the throttle is already on W, so shift is the lean.

**The handbrake** (A, or space) locks the back: it scrubs speed and roughly
doubles the rate the tail comes round, which is a handbrake turn rather than a
simulation of one.

**The engine** is synthesised, not sampled. A four-cylinder firing twice a
revolution at 3,000 rpm is 100 Hz, so that is what it is: three sawtooths at
the firing frequency and its second and third harmonic, through a low pass that
opens as the throttle does, with a breath of noise for the induction. Six gear
ratios, so the note climbs and drops rather than rising forever with road
speed. A bike revs to twice a car's; a bus and a truck are slow-turning
diesels. Four oscillators, no download, and it tracks the gearbox — which a
loop of someone else's engine cannot. The patrol car's siren is a square wave
yelping between 320 and 960 Hz, on **LB** or **H**.

**How many there are** follows the city's own footprint: the middle of Tōkonto
is nose to tail and a road through the rice is nearly empty.

### If you have another modelled car

The bodies are built out of boxes, and boxes have a ceiling: they can be the right size, the
right shape and the right surface, and they will still not be photographs. `CAR_MODELS` at the
top of the traffic section takes a `.glb` per kind and uses it instead of the built body —
everything else (the traffic, the collision, the paint, getting in) keeps working off the
catalogue entry. A kind with no entry, or whose file does not load, keeps the built body.

Vehicle mods for other games are not a source for this. They belong to whoever made them, and
most of them are unlicensed recreations of real cars on top of that, so they carry both a
copyright and a trademark problem into anything they are shipped in.

### On the rails

| In the game | Real counterpart | Per car (m) | Speed |
|---|---|---|---|
| NHRail commuter set | a six-car stainless E233-ish set, four doors a side | 19.5 × 2.95 × 3.60 | 24 m/s |
| NHRail shinkansen | an eight-car set, 6.2 m nose on the end cars | 24.5 × 3.36 × 3.65 | 72 m/s |

### The marques, and everything else with a name on it

Parody, and deliberately so. **No real manufacturer's badge, livery or wordmark appears anywhere
in Konto** — not Toyota, Honda, Nissan, Mazda, Subaru, Suzuki, Daihatsu, Lexus, Mitsubishi,
Isuzu, Hino, Yamaha, Kawasaki, JR, Uber, or any of the Italian names on the supercar page of a
reference sheet. The real ones are what the *proportions* come from, in the table above. The
badges are geometry in the idiom of car badges — ovals, chevrons, pinwheels, mountain glyphs —
and the joke is the names.

| | | |
|---|---|---|
| **Kosei** コウセイ | two crossed ovals | the one that makes half the cars on the road |
| **Ryusei** リュウセイ | a circle with a shooting star through it | |
| **Kaneda** カネダ | an angular K in a rounded square | makes the engines everyone borrows |
| **Mitsuwa** ミツワ | three triangles in a pinwheel | also builds ships and air conditioners |
| **Suzume** スズメ | a swept chevron | kei cars, mostly |
| **Nanatsu** ナナツ | seven stars in an oval | flat engines, four wheel drive, a following |
| **Daichi** ダイチ | a mountain glyph | the kei specialist |
| **Ganseki** ガンセキ | a hexagon with a bar | trucks and buses |
| **Ryde** ライド | a green lozenge, lit, on the windscreen | the ride-hailing one |
| **Tokonto Kotsu** トコント交通 | a yellow door panel and a freephone number | the taxi operator |
| **Hayabin** 速便 | a dragonfly on yellow | parcels, by scooter, by tomorrow |
| **NHRail** 日本鉄道 | NH worked into one mark, in green | Nihon Rail: the loop, the radials, the shinkansen |
| **Tokonto Bus** トコントバス | a blue roundel on a white flag | the municipal operator |
| **Konto Police** コント県警 | a five-petal roundel on the bonnet | |

A badge moves with a per-instance texture offset rather than a second mesh, so one hatchback
geometry wears four different marques and one bus flank carries eight different advertisements.

### The advertising

Eight panels at 8:1, which is the shape of the side of a bus, the side of a train and the sign
over a Tokyo street. They go on bus flanks, train flanks, roadside hoardings, the bands wrapped
round the buildings at the scramble crossing, station concourses and bus shelters. The joke in
each is Japan laughing at itself, which is the only kind of advertisement worth putting on a bus:

| | |
|---|---|
| **Kombini 24** コンビニ二四 | Open 26 hours. Egg sandwich, umbrella, regret. |
| **Ganbare Energy** 強炭酸 | Your third wind, in a can. Apology included. |
| **NHRail apologises** ご迷惑をかけます | for the 19-second delay. Written notes at the barrier. |
| **Mochi Mochi Soft** 期間限定 | Seasonal flavour no. 148: sakura. Ends Thursday. |
| **Meishi Master** 名刺道 | Card etiquette, now with a bowing-angle sensor. |
| **Capsule Living** カプセル暮らし | 1.2 m² of pure Tōkonto. Wi-Fi in the ceiling. |
| **Karaoke Eien** カラオケ永遠 | Nine hours. One song. Nobody is judging you. |
| **Queue with Pride** 整列ご協力 | Please form an orderly line for our orderly lines. |

## The city

| | |
|---|---|
| Island | Honshu, compressed to 12.3 × 10.2 km |
| Tōkonto | Tokyo: wards with their own grid angles, a moated palace at the centre, a loop line, bay reclamation |
| Mizuho | a Nagano-basin village: one shopping street, a shrine, a station |
| Facade tile | 45 mm ceramic, which is most of what Japan built in the 1980s |
| Roofs | kawara tile, standing-seam metal, felt with puddles |
| Scramble crossing | Shibuya: five arms crossing on one change of the lights, screens up every wall around it, a 交番 police box on one corner and a bronze dog on the other. Found rather than placed — wherever the inner ring road crosses a radial nearest a nightlife ward |
| NHRail stations | side platforms 8 m wide and 1.1 m above the railhead, a canopy 3.5 m over them, name boards hung from it, a tactile strip 0.55 m in from the edge |
| Bus stops | a flag, a timetable and one shelter in three, every 300 m, alternating carriageways |
| Shrines | a torii, a gravel approach, a hall on a stone base under a kawara roof, a 手水舎 basin, a guardian pair and stone lanterns |
| Overhead wiring | Japan's distribution network is overhead, and the catenaries over a street are the fastest thing that says which country this is |
| Forest cover | 66% of the land, against Japan's real 67% |
| Tree line | 1400 m, because Honshu at Konto's altitudes is forested to the summit |

## The crowd

Six kinds, in the mix on a pavement at six in the evening: salarymen with briefcases (a third of
them), office ladies with tote bags, students with satchels, casuals, elders, workers in hard
hats. Japanese street clothing is mostly dark, so the bright end of the palette is rare on
purpose.

## Seiko

Generated with Meshy from a text description of a Japanese salaryman, then rigged and animated
here. The proportions are set to 1.74 m, which is close to the Japanese male average.

What he is not: a scanned or sculpted character. A photoreal human has to come from a tool built
for it — MetaHuman, Character Creator, a scan — and that is the honest ceiling on how real he
can look while he is generated from a prompt.
