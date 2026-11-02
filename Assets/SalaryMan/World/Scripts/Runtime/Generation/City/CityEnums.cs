namespace SalaryMan.World
{
    /// <summary>
    /// The character of a ward. This is the one value that decides everything else about it:
    /// how big its blocks are, how tightly it is packed, how tall it is allowed to build, what
    /// kind of plot goes in it and what the streets look like.
    /// </summary>
    public enum DistrictKind
    {
        CoreBusiness = 0,   // Marunouchi / Nishi-Shinjuku: the towers, and Soti's head office
        StationFront,       // the dense retail crush around a terminus
        Retail,             // department stores and covered shopping streets
        Nightlife,          // Kabukicho / Golden Gai: tiny plots, narrow alleys, all neon
        Office,             // mid rise offices and business hotels
        Civic,              // ministries, city hall, museums, the law courts
        Palace,             // the moated gardens at the centre of the city
        Apartments,         // mansion blocks and danchi estates
        Residential,        // low rise houses on lanes too narrow for two cars
        Suburb,             // the outer sprawl, where the commuter lines end
        Industrial,         // works and light factories along the river and the freight line
        Port,               // wharves, container yard, cranes
        Reclaimed,          // made ground out in the bay: exhibition halls and new towers
        University,         // a campus, walled off from the grid around it
        Park,               // green, kept clear of buildings
        Shrine,             // grounds, trees, a gravel approach
        RailYard,           // depot and carriage sidings
        Waterfront,         // promenade, warehouses converted to bars
    }

    /// <summary>
    /// What a reserved plot is meant to hold. This is a hint for whoever fills the city in
    /// later, not a rule: the plot is a rectangle of flat, road-fronted ground and anything
    /// that fits inside it will sit correctly on the terrain.
    /// </summary>
    public enum PlotKind
    {
        Vacant = 0,
        Landmark,       // reserved, oversized, prominent: corporate headquarters
        Tower,          // 20 floors and up
        Office,         // 8 - 20 floors
        MidRise,        // 4 - 8 floors, offices over shops
        Shophouse,      // 2 - 5 floors, shop at street level, narrow frontage
        Apartment,      // mansion block or danchi slab
        HouseCluster,   // a whole block of low rise housing, filled with a cluster prefab
        Civic,          // public building standing in its own grounds
        Station,        // station box, concourse and platforms
        Warehouse,
        Factory,
        Wharf,          // quayside, cranes, container stacks
        Parking,        // surface car park or a multi storey
        ParkSpace,      // planting, ponds, paths
        ShrineGround,
        Campus,
        Stadium,
    }

    /// <summary>How a district is parcelled up.</summary>
    public enum ParcelMode
    {
        /// <summary>One plot per building, addressed individually. Used anywhere a named building might go.</summary>
        Individual = 0,
        /// <summary>One plot per city block, to be filled with a cluster or terrace prefab. Used for low rise sprawl, where 40,000 individual house lots would be useless.</summary>
        Block,
    }

    public enum RoadClass
    {
        Expressway = 0,  // the elevated urban motorway, Shuto style
        Arterial,        // six lanes, the numbered routes
        Avenue,          // four lanes, the ward's main streets
        Street,          // two lanes with a footway
        Alley,           // one lane, no footway, service access
        Promenade,       // pedestrian only: waterfront, station plaza, park path
    }

    public enum RailClass
    {
        Loop = 0,        // the commuter ring around the core
        Radial,          // out to the suburbs and the villages beyond
        Shinkansen,      // the long distance line, always elevated
        Freight,
        Subway,          // underground: recorded for later, nothing is built on the surface
    }

    /// <summary>
    /// What the ground is made of inside the city, written per urban raster cell. Drives the
    /// terrain splatmap, and keeps trees, grass and rice paddy off the streets.
    /// </summary>
    public enum UrbanSurface : byte
    {
        None = 0,        // outside the city, or countryside inside its outline
        Asphalt,         // carriageway
        Sidewalk,        // footway, kerb strip
        Plaza,           // paved open space: station front, civic square
        Lot,             // a reserved building plot, graded flat and waiting
        Fill,            // made ground: reclaimed land, embankment, cut and fill
        Park,            // maintained green inside the city
        RailBed,         // ballast
        Water,           // river, canal, moat or dock kept open through the city
    }
}
