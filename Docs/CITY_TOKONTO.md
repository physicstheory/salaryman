# Tōkonto — the city space

The capital of Konto, generated as **space rather than buildings**: the ground it stands on, its
wards, its road and rail networks, and every reserved building plot, graded flat and waiting.

No building is placed by this pass. That is deliberate — buildings are the part that needs art
direction, and everything here is what has to exist *before* that conversation.

A second, much smaller site is generated the same way: **Mizuho**, the mountain village the story
starts in, on the far side of the range.

---

## What you get

| | Tōkonto (default seed) |
|---|---|
| Footprint | about **6.8 × 2.8 km**, wrapped around its bay |
| Wards | 18 – 22, each named, each with its own character and street grid |
| Blocks | ~350 |
| Reserved plots | ~1,700, about **2.5 km² of building ground** |
| Roads | ~76 km, including an elevated expressway loop |
| Railways | ~51 km: a commuter loop, six radial lines, a shinkansen viaduct, a freight spur |
| Stations | ~13, one of them a fourteen-platform terminus |
| Bridges | ~30 spans reserved where a road or a line crosses water |
| Made ground | reclaimed islands and wharves out in the bay |

Numbers move with the seed and with the world settings. The build log prints the real ones, and
so does **Tools → SalaryMan → Konto City**.

---

## The shape of it, and why

The city is laid out the way a Japanese capital actually grew, because that is what makes a map
read as a place rather than as a grid:

- **A moated palace park at the centre.** Square moat, gates, gardens, nothing parcelled inside it.
  The business district sits against it and the ministries sit on its far side.
- **A commuter loop around the core** with a terminus on it, and radial lines running out to the
  suburbs and the villages past them. Commuting is the premise of the game, so the network is laid
  out first and the city fills in around it.
- **Every ward on its own grid, at its own angle.** This is the single biggest thing: a Japanese
  city is a patchwork of grids that do not line up, cut across by arterials that ignore all of
  them. One city-wide grid looks American; this does not.
- **Alleys between the streets in the dense wards.** A proper street, then a two-metre gap, then
  another street. That fine grain is most of what separates Shinjuku from downtown Denver.
- **Plots around the edge of each block**, all fronting a street, with whatever is left in the
  middle becoming a car park or a courtyard.
- **The bay**, cut into the coast before any erosion runs, with reclaimed rectangles in it and a
  narrow mouth. The city then wraps around it.
- **Hills at its back.** The city climbs the foothills on its inland side and stops where the
  ground gets too steep, so the western wards are hilly and green and the eastern ones are flat,
  low and full of water.

---

## The ground under it

The city pass does the civil engineering, and this is what makes it usable rather than decorative:

- The natural landscape is **smoothed and held to a buildable gradient** inside the city outline,
  then feathered back into open country over about 190 m.
- **Every plot is graded dead flat**, at a height snapped to 10 cm, and the plot record stores it.
  A building prefab placed at the plot's position and rotation needs no fitting at all.
- **Roads get a running profile**: sampled off the platform, smoothed along their length, then held
  to a maximum gradient per class (4.5% for the expressway, 6.5% arterial, 11% for a street).
- **Water stays water.** Rivers keep their channels through the city, and where a road or a line
  crosses one, no ground is graded: a bridge span is recorded instead.
- **Reclaimed ground** is filled to 4.2 m above sea level with a quay edge rather than a beach.
- Surfaces are written per 2 m cell — carriageway, footway, plaza, building plot, made ground,
  park, ballast, water — and the terrain splatmaps, the grass and the trees all read them. Nothing
  grows through tarmac, and no rice paddy appears between two office blocks.

Two consequences worth knowing:

- A plot on sloping ground is **flat with a step at its edge**, because that is what a retaining
  wall is. Japanese hill suburbs are built exactly this way.
- Grading stops at the city's own outline. A commuter line running 4 km into the mountains is a
  polyline on the map out there, not an earthwork.

---

## Addressing a plot

Every plot has an address: **`TKT-GNB-B025-P18`** — city code, ward code, block number, plot number.

In the editor, **Tools → SalaryMan → Konto City** will look one up, jump the scene view to it, make
a marker on it, or drop a prefab onto it. In code, the layout asset is all you need:

```csharp
// Assets/SalaryMan/World/Settings/KontoCityLayout_TKT.asset
public KontoCityLayoutAsset city;

void PlaceTheHeadOffice(GameObject sotiTowerPrefab)
{
    // By address.
    city.PlaceOnPlot(sotiTowerPrefab, "TKT-GNB-B025-P18");

    // Or by what it was reserved for.
    CityPlot plot;
    if (city.TryGetReservedPlot("Soti Tower", out plot))
        city.PlaceOnPlot(sotiTowerPrefab, plot);

    // Or "the eight biggest tower sites, tallest first".
    foreach (var site in city.LargestPlots(PlotKind.Tower, 8))
        Debug.Log(city.layout.PlotCode(site) + " allows " + site.maxFloors + " floors");
}
```

A plot carries its centre, its frontage and depth, its rotation (local **+Z points into the plot
from its street**), its graded ground height, what kind of building it is meant for, and how many
floors the plan allows.

---

## Reserved sites

These are created with markers in the scene, under `Konto Cities/Tōkonto/Reserved sites`:

| Site | What it is for |
|---|---|
| **Soti Tower** | Head office of Soti, and the tallest building in Konto. The biggest plot in the business district, ~58 floors allowed |
| **Konto Central Bank** | Flagship bank tower, facing the palace across the moat |
| **Konto Broadcasting Centre** | Studios and a mast, for the skyline |
| **Tōkonto Central** | The terminus: concourse, fourteen platforms, a department store over the top, bus and taxi on the plaza |
| **Konto Metropolitan Government** | City hall |
| **Gosho Gardens** | The moated palace park. Walls, gates, gardens and a keep go inside the moat |
| **Mizuho shrine** | Torii, gravel approach, hall, one very old tree |
| **Family home** | The house the player leaves in the first scene |

---

## Districts

Each ward is one of these, and the kind decides its block size, its parcel size, how tightly it
packs and how tall it may build:

`CoreBusiness` · `StationFront` · `Retail` · `Nightlife` · `Office` · `Civic` · `Palace` ·
`Apartments` · `Residential` · `Suburb` · `Industrial` · `Port` · `Reclaimed` · `University` ·
`Park` · `Shrine` · `RailYard` · `Waterfront`

The dense commercial wards are parcelled **individually** — one plot per building, because that is
where named buildings go. The low-rise sprawl is parcelled **by the block**: one plot per city
block, to be filled with a cluster or terrace prefab. Forty thousand individual house lots would be
useless to anybody.

Plot kinds are hints, not rules: `Landmark`, `Tower`, `Office`, `MidRise`, `Shophouse`,
`Apartment`, `HouseCluster`, `Civic`, `Station`, `Warehouse`, `Factory`, `Wharf`, `Parking`,
`ParkSpace`, `ShrineGround`, `Campus`. Anything that fits inside the rectangle will sit correctly
on the ground.

---

## Moving or resizing a city

Everything is in `KontoWorldSettings → Cities`. A site is anchored to the island's tectonic arc by
`alongT` (0 = north east tip, 1 = south west tip) and `lateral` (fraction of the local island half
width, positive toward the ocean), so a city can be moved along the island without any of its parts
coming apart.

| Setting | What it does |
|---|---|
| `alongRadius`, `inlandRadius` | Half extents of the footprint: along the coast, and inland |
| `coreOffset` | Where the centre sits relative to the anchor. Downtown usually belongs at the head of the bay |
| `coreRadius` | Size of the business district |
| `wardCount` | How many named districts |
| `maxBuildSlope`, `maxBuildAltitude` | Where the city gives up and leaves the hillside green |
| `maxPlatformSlope` | Steepest gradient the graded platform may reach |
| `bay` | The bay: its reach inland, its width, its depth, and how far its mouth is closed |
| `radialCount`, `ringCount`, `expressway` | The road network |
| `railLoop`, `railRadialCount`, `shinkansen` | The rail network |
| `palaceGardens`, `palaceRadius`, `moatWidth` | The moated park at the centre |

The settlement always gets a **buildable terrace cut under it before erosion runs**, tilted so it
still drains — that is what a real town stands on, and it is why the city does not depend on the
seed happening to leave flat ground in the right place. If a site is anchored somewhere impossible
anyway (out at sea, on a cliff) the planner walks it to the nearest ground that will hold it and
says so in the log.

Two numbers to watch in the log:

```
[Konto] Tokonto blocks: 324 laid out, rejected 2293 outside the ward, 796 outside the city,
        47 on reserved ground, 350 on ground too steep or wet, 41 under a road or railway.
```

If a city comes out thin, that line says which test threw the blocks away, and therefore what to
change: the footprint (`alongRadius` / `coreOffset`), the ground limits (`maxBuildSlope`,
`maxBuildAltitude`), or the network density (`radialCount`, `ringCount`).

---

## The buildings

The build puts up about three thousand buildings: podiums and setbacks, floor bands, corner
pilasters, parapets and copings, balconies, canopies, shopfronts and box signs, pitched roofs
with eaves on the houses, and roof plant on everything with a flat top. Facades are generated PBR
sets with pixel displacement, so the windows read as openings from the pavement rather than as
wallpaper.

Everything on a ward's plots goes into one mesh with one submesh per material, so a ward is
eighteen draw calls rather than eighteen thousand. About 950 triangles a building, 1.5 million
for the capital.

How it fits together, and where to change it:
**[BUILDINGS_AND_SURFACES.md](BUILDINGS_AND_SURFACES.md)**.

## The street furniture

Kerbs along the arterials and avenues, lamp columns every 26 m, signals where two roads of
consequence cross, vending machines against the shopfronts, and utility poles every 34 m with
the wires strung between them — Japan's distribution network is overhead, and the catenaries
over a street are most of what places it.

## The blockout

The grey massing blockout is still there behind a toggle in the build window, for when you want
to judge the plan without waiting for the buildings, or to compare the two. Heights come from
each plot's floor allowance with a deterministic wobble, so it has a skyline.

Plots whose kind is a shophouse, a mid-rise, an apartment block or an office have their frontage
split into two to five narrower buildings of differing height, because a shopping street is a run
of party walls and not one slab, and that rhythm is most of what the eye reads in close.

`Konto City → Delete the grey massing blockout` removes it, or just delete the `Blockout` object
under each city.

---

## Soti Tower

The one exception to "no buildings". Soti's head office is the thing the whole story walks into,
so it is modelled rather than massed, in `Runtime/City/SotiTower.cs`.

The form is taken from the **Ping An International Finance Centre** in Shenzhen: a square plan with
deeply chamfered corners, a shaft that tapers the whole way up, and eight stainless steel
mega-columns standing proud of the glass that run the full height and close over the roof into the
claw, with a short mast above. 592 m to the tip, 116 floors, 65 m across at the podium roof
tapering to about 45 m at the shaft top.

`ReserveLandmarks()` gives it the **whole block**: the rest of that block's plots become open
ground, so it stands in its own plaza the way Ping An does, and the plot is widened if the block
is smaller than the podium. `SotiTower.Build()` lofts the curtain wall through 76 rings and
extrudes a tapering blade on each of the eight plan corners; submesh 0 is the glass and submesh 1
is the steel, so one renderer carries both materials.

---

## What is deliberately not here

- No interiors. Buildings are shells: the shopfront glazing has a shop painted behind it and that
  is as far in as you get.
- No carriageway meshes. The road surface is painted onto the terrain; the kerbs are geometry,
  but markings, crossings and drains want a proper road ribbon later.
- No traffic, no pedestrians, no navmesh.
- No station interiors or platforms — the box and the plaza are reserved, the building is not.
- Subway lines are recorded as polylines with nothing built on the surface.
- No LODs yet. At 1.5 million triangles for the capital it has not needed them, but a distant
  ward drawing its roof plant is waste that a two step LOD would remove.
