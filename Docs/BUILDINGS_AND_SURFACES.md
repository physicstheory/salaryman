# Buildings and surfaces

How Tōkonto stops being grey boxes.

There are about three thousand buildings in the capital. That number decides the whole approach,
so it is worth being explicit about it before anything else.

---

## The trade

A window modelled as a punched opening with a reveal is nine quads. A ten storey building with
six bays on four faces has two hundred and forty of them, so it is four and a half thousand
triangles of window before a single wall exists. Times three thousand buildings, that is over ten
million triangles for the windows alone, and none of them do anything except sit still.

So the work is split the way every open world splits it:

| | |
|---|---|
| **The mesh carries** | massing, setbacks, podiums, floor bands, corner pilasters, parapets and copings, balconies, canopies, shopfronts, box signs, pitched roofs with eaves, and everything on the roof |
| **The material carries** | the window grid, mullions, spandrels, tiling, frames, sills, staining, and the glass |

That comes out at about **950 triangles a building** — 1.5 million for the whole city, which a
modern GPU does not notice — and the facades still read as masonry from the pavement, because the
material is not just a picture.

## Why the facades are not wallpaper

Every surface gets a full PBR set: albedo, normal, an HDRP mask map (metallic, AO, height,
smoothness) and a height map. The height map drives HDRP Lit's **pixel displacement**, so the
window reveals parallax against the wall as you walk past them. A reveal that moves is a reveal;
a reveal that is painted on is a sticker. `KontoSurfaceLibrary` sets `_DisplacementMode` to pixel
displacement on the facades, with `_PPDLodThreshold` set so buildings across the bay stop paying
for it.

Everything is generated: `FacadeTextures` paints the pixels, at 1024² by default, and writes them
to `Assets/SalaryMan/World/Generated/Textures`. They are cached, so a rebuild does not repaint
them unless you ask. **Tools → SalaryMan → Repaint the city surfaces** asks.

## The bay grid

The join between the mesh and the material is a grid of window bays and floors.

- Every style has a `bayWidth` (2.6 – 4.5 m) and a `floorHeight` (2.9 – 6.5 m).
- Every footprint is snapped to a whole number of bays, every storey to a whole number of floors.
- Facade UVs are in **bay and floor units**, not metres.
- One texture repeat covers `UvBays` × `UvFloors` — four by four.

Because the footprint is a whole number of bays, a repeat boundary always lands on a bay line, so
the window grid carries round a corner and meets its neighbour's. Nothing is ever cut in half.

Each building also shifts its UV origin by a whole number of bays and floors, chosen from its
position. That picks a different patch of the same tiling texture, which is what stops a street
of one material looking like one wall stamped sixteen times. Sixteen phases, no extra cost.

## The surfaces

`CitySurface` is the palette, and it is also the submesh order: a ward's buildings are one mesh
with one submesh per surface, so a whole ward is twenty-odd draw calls. The traffic and the crowd
share the palette, so they add no materials to a scene that already has the city in it — but they
are built compacted, with a submesh only for the surfaces they actually use, because there are
hundreds of them and a car uses six of the twenty-eight.

| | |
|---|---|
| `GlassCurtain` | sealed curtain wall: mullions, transoms, spandrel bands, varied glass |
| `Precast` / `PrecastSand` | concrete frame with punched windows, floor bands, sill staining |
| `Tile` / `TileWhite` | 45 mm ceramic tile, which is most of what Japan built in the eighties |
| `Render` / `RenderGrey` | painted render, apartment blocks and danchi |
| `Siding` | lap boarded houses |
| `Corrugated` | factory and warehouse sheeting, with a strip window band and rust at the bottom |
| `Stone` | ashlar, for civic buildings in their own grounds |
| `Shopfront` | ground floor: glazing, lit interiors, roller shutters, a sign band |
| `RoofMembrane` / `RoofTile` / `RoofMetal` | felt with puddles / kawara / standing seam |
| `TrimMetal` / `DarkMetal` | anodised aluminium / painted steel |
| `Signage` | sign panels, for shopfronts and box signs |
| `Concrete` | podiums, parapets, kerbs, balcony slabs |
| `Skin` / `Hair` | the crowd |
| `ClothTop` / `ClothBottom` | the crowd's clothing, painted white and tinted per person |
| `CarPaint` / `CarGlass` / `CarTrim` / `CarLight` / `Tyre` / `Livery` | the traffic; paint is tinted per car, and the livery sheet is an atlas of badges, number plates and destination blinds |

Adding one means adding an enum entry, a painter in `FacadeTextures`, and a spec in
`FacadeTextures.All()`. Nothing else has to change.

## The roofs

Roofs matter more than they sound like they should, because the moment the camera is above the
second floor a flat roof is a lie. Every building gets a parapet with a coping, a membrane deck,
and plant: a stair and lift bulkhead, a water tank up on legs, a row of condensers, ducting, and
a mast on anything big enough to want one. That clutter is most of what a Japanese skyline is.

## Street furniture

`StreetProps` puts in what carries scale between the buildings: kerbs, lamp columns, traffic
signals at junctions, vending machines against shopfronts, and — most of all — **utility poles
with the wires strung between them**, because Japan's distribution network is overhead and the
catenaries over a street are the single fastest thing that tells you where you are.

It all goes into the same surfaces as the buildings, so it costs no extra materials. It is
chunked into meshes of about 220k vertices so it culls.

## Traffic and the crowd

The cars and the people are built out of the same accumulator and painted with the same surfaces.
They have their own document: [TRAFFIC_AND_CROWD.md](TRAFFIC_AND_CROWD.md).

## Soti Tower

The one building that is modelled rather than massed, in `SotiTower.cs`. See
[CITY_TOKONTO.md](CITY_TOKONTO.md).

## Where to change things

| Want to | Go to |
|---|---|
| Change what a plot kind builds | `BuildingLibrary.StyleFor` |
| Change the massing rules | `BuildingLibrary.One` |
| Change how a surface looks | the painter in `FacadeTextures` |
| Add a material | `CitySurface` + a painter + a spec |
| Change the street furniture | `StreetProps` |
| Change texture resolution | `KontoSurfaceLibrary.DefaultSize` |
| Turn the parallax off | `displacement = 0` on the spec |
