namespace SalaryMan.World
{
    /// <summary>
    /// The material slots a built city uses. Every piece of geometry the building and prop
    /// builders emit goes into one of these, and a combined mesh carries one submesh per slot,
    /// so a whole ward of buildings is fifteen draw calls rather than fifteen thousand.
    ///
    /// The order is fixed: it is the order of the material array on every renderer, and
    /// KontoSurfaceLibrary builds the materials in the same order.
    /// </summary>
    public enum CitySurface
    {
        GlassCurtain = 0,   // sealed curtain wall, mullions and spandrels in the texture
        Precast,            // precast concrete frame with punched windows: the ordinary office
        PrecastSand,        // the same, in the warmer sand grey half of them are
        Tile,               // small ceramic tile over the upper floors of a shophouse
        TileWhite,          // white tile, which is most of what Japan built in the eighties
        Render,             // painted render, apartment blocks and danchi
        RenderGrey,         // the same, weathered to grey
        Siding,             // house cladding
        Corrugated,         // factory and warehouse sheeting
        Stone,              // civic buildings standing in their own grounds
        Shopfront,          // ground floor glazing, signage band above it
        RoofMembrane,       // flat roof: felt, upstands, plant bases
        RoofTile,           // pitched roof: kawara
        RoofMetal,          // pitched roof: seamed steel, and canopies
        TrimMetal,          // anodised aluminium: copings, frames, railings, louvres
        DarkMetal,          // plant, ducting, poles, signals
        Signage,            // shop signs and box lanterns
        Concrete,           // podiums, plinths, kerbs, retaining, stair cores

        // Traffic. Car paint is tinted per vehicle through a MaterialPropertyBlock, so one
        // material covers every car on the road in every colour.
        CarPaint,
        CarGlass,
        CarTrim,            // bumpers, mirrors, black plastic, chrome
        CarLight,           // lamp lenses, front and rear
        Tyre,
        Livery,             // marque badges, number plates, taxi signs, delivery panels

        Count
    }
}
