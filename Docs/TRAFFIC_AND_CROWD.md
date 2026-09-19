# Traffic and the crowd

How Tōkonto stops being empty.

A city of three thousand correct buildings with nothing moving in it reads as a model of a city,
and it reads that way instantly. Cars and people are the difference, and they are a different
engineering problem from the buildings, because they move and there are a lot of them.

---

## The trade, again

Seiko is one skinned mesh with a skeleton and a blend tree, which is right for the one person the
camera is always looking at and ruinous for the two hundred who are not.

| | |
|---|---|
| **A vehicle is** | one rigid mesh of about 550 triangles, positioned on a lane |
| **A pedestrian is** | three rigid pieces of about 149 triangles total — body, and a leg each |
| **The crowd system does** | two leg rotations and a bob, per person, per frame |
| **Nobody does** | skinning, an animator, a state machine or a navmesh |

At the distance you ever see a background pedestrian, that is indistinguishable from the expensive
version, and it costs about a thousandth as much.

Nothing exists beyond a radius of the player. Cars spawn onto lanes ahead, drive, and are recycled
once they fall behind; people do the same on the footways. A car three wards away is not on screen
and nobody can tell whether it exists.

## Lanes

`CityLanes` turns the road plan into something a car can drive on.

The plan stores a road as a centre line and a half width, which is exactly what you want for
grading ground and nothing like what you want for driving. So every road becomes lanes: polylines
offset from the centre line, each with a speed limit and an arc length, so a vehicle is just a
distance along a lane and its position is a sample.

**Traffic keeps left, because Konto is Japan.** The rule is stated once: a lane always sits to the
left of its own direction of travel, and the opposing lanes are made by walking the same road
backwards — which puts them on the other side of the centre line for free.

| Road class | Lanes each way | Limit |
|---|---|---|
| Arterial | 2 | 55 km/h |
| Avenue | 2 | 45 |
| Street | 1 | 31 |
| Alley | 1 | 18, and barely |
| Expressway, Promenade | none | — |

A narrow street gets one lane each way whatever its class says it wants: the lanes have to fit
between the kerbs. Footways come out of the same pass, offset past the kerb, and the crowd walks
those.

## Junctions and signals

Junctions are found the same cheap way `StreetProps` finds them — a coarse grid, and any cell two
different roads both land in — so **the signals the street furniture puts up and the signals the
traffic obeys are the same signals**.

Each junction has a phase taken from its position, so neighbouring ones are not in step, and a
27 second cycle split between the two axes. The last 3.2 seconds of each half are amber.

A car stops at red. On amber it stops **if there is room to stop in and time to clear the line
before it turns** — otherwise it keeps going, which is what amber is for and what stops a queue
nosing into a junction it cannot clear.

## Driving

The whole model is a gap, a stop line and an acceleration limit.

- The speed limit is the lower of the lane's and the vehicle's own.
- Following: a car must still be able to stop **if the thing in front brakes as hard as it can**.
  That is the only rule that actually keeps cars out of each other; anything that assumes the
  leader will keep its speed puts cars inside each other whenever the leader brakes.
- A frame of margin is given away because this is checked thirty times a second and not
  continuously. Without it, cars arrive touching.
- Spawning obeys the same physics: a car never appears closer to stopped traffic than it could
  stop in, never astride a stop line, and never at a speed the gap ahead does not allow. A car
  that arrives at a red light arrives stopped, at the back of the queue.

## What is in the traffic

Nine bodies, at real dimensions, mixed the way a Japanese street is — which means a fifth of it is
kei cars, because kei cars are a fifth of the cars in Japan.

Kei car, kei van, kei truck, compact, sedan, minivan, taxi with its 行灯 roof lamp and 空車 card,
box van, and a bus. Commercial vehicles carry green number plates, because in Japan they do.

The marques are parody, and the badges are geometry in the idiom of car badges rather than tracings
of anybody's trademark — the joke is the names:

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

Paint is a `MaterialPropertyBlock` on the paint submesh, so ninety cars in ninety colours are still
one material. The palette is weighted the way Japanese traffic actually is: a third white, a
quarter silver, a sixth black, and a colour is rare enough to be worth noticing.

## What is in the crowd

Six kinds, in the mix you would see on a pavement at six in the evening: salarymen with briefcases
(a third of them — it is that kind of city), office ladies with tote bags, students with satchels,
casuals, elders who walk slower, and workers in hard hats.

Heights, paces and clothing all come from the seed. Japanese street clothing is mostly dark and a
crowd of primary colours looks wrong immediately, so the bright end of the palette is rare on
purpose. The two cloth surfaces are tinted per person through a property block, the same way the
cars are painted, so a street full of people is four materials.

## Checking it without Unity

The driving model is the kind of code that looks right and is not, so it is run headlessly: a
hundred and twenty cars driven for two minutes of game time across a grid of streets, asserting
that no two cars are ever inside each other, that nobody crosses a stop line on red, that the lane
lists stay ordered, that nobody faces backwards or drifts off their lane, and that the grid does
not deadlock.

The first run of that found three real faults — cars spawning too close to stopped traffic to stop
in time, cars appearing astride a stop line on red, and a following rule that assumed the car in
front would not brake. None of them would have been obvious from watching.

## Where to change things

| Want to | Go to |
|---|---|
| More or fewer cars | `KontoTraffic.maxVehicles`, and the radii next to it |
| More or fewer people | `KontoCrowd.maxPeople` |
| How cars drive | `acceleration`, `braking`, `standingGap`, `headway` on `KontoTraffic` |
| Lane widths, limits, lanes per road class | `CityLanes.Build` |
| Signal timing | `CityLanes.SignalCycle` and `Amber` |
| A new body, or new dimensions | `VehicleLibrary` |
| A new kind of person | `PedestrianLibrary` |
| How many variants of each are baked | `KontoTrafficFactory.VariantsPerKind` |
| Turn it all off | the toggle under the city step in the build window |
