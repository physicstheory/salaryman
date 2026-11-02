using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The cars on Konto's roads.
    ///
    /// The mix is the thing here, more than any single model. A street in Japan is not a street
    /// of sedans: it is roughly a third kei cars — 3.4 m long, 1.48 m wide, tall and square,
    /// because the tax class says so — plus kei vans and kei trucks doing every delivery,
    /// compacts, a lot of tall minivans, black sedans, and a taxi every thirty seconds. Getting
    /// those proportions right does more for the look of a road than any amount of panel detail.
    ///
    /// Every marque here is invented. The logos are drawn to sit in the same visual family as the
    /// real Japanese marques — a circle with a line through it, three shapes in a group, a
    /// stylised initial — because that is what makes a parody read as one, but the names and the
    /// geometry are their own. See <see cref="Marques"/>.
    /// </summary>
    public static class VehicleLibrary
    {
        public enum VehicleKind
        {
            KeiCar = 0,     // 軽自動車: the box on wheels that is a third of every Japanese road
            KeiVan,         // the same footprint with the back squared off, doing a delivery
            KeiTruck,       // and the same again with a flat bed
            Compact,        // a five door hatch
            Sedan,          // the company car, usually white or black
            Minivan,        // tall, sliding doors, the family one
            Taxi,           // a sedan with a roof sign and a company livery
            BoxVan,         // 2 t delivery van
            Bus,            // a route bus

            Count
        }

        /// <summary>
        /// The marques. Invented names, marks drawn in the same family as the real thing so the
        /// joke lands, but not the real thing.
        /// </summary>
        public struct Marque
        {
            public string name;
            public string kana;
            public int badge;       // cell in the livery atlas
            public string note;
        }

        public static readonly Marque[] Marques =
        {
            new Marque { name = "Kosei",    kana = "コウセイ", badge = 0, note = "Two crossed ovals. The one that makes half the cars on the road." },
            new Marque { name = "Ryusei",   kana = "リュウセイ", badge = 1, note = "A circle with a shooting star through it." },
            new Marque { name = "Kaneda",   kana = "カネダ",   badge = 2, note = "An angular K in a rounded square. Makes the engines everyone borrows." },
            new Marque { name = "Mitsuwa",  kana = "ミツワ",   badge = 3, note = "Three triangles in a pinwheel. Also builds ships and air conditioners." },
            new Marque { name = "Suzume",   kana = "スズメ",   badge = 4, note = "A swept chevron. Kei cars, mostly." },
            new Marque { name = "Nanatsu",  kana = "ナナツ",   badge = 5, note = "Seven stars in an oval. Flat engines, four wheel drive, a following." },
            new Marque { name = "Daichi",   kana = "ダイチ",   badge = 6, note = "A mountain glyph. The kei specialist." },
            new Marque { name = "Ganseki",  kana = "ガンセキ", badge = 7, note = "A hexagon with a bar. Trucks and buses." },
        };

        /// <summary>Which marques plausibly build which body. Index into <see cref="Marques"/>.</summary>
        public static int MarqueFor(VehicleKind kind, float r)
        {
            switch (kind)
            {
                case VehicleKind.KeiCar:
                case VehicleKind.KeiVan:
                case VehicleKind.KeiTruck:
                    // Kei is Daichi and Suzume's business, with the big two also in it.
                    return r < 0.32f ? 6 : (r < 0.62f ? 4 : (r < 0.82f ? 0 : 2));
                case VehicleKind.BoxVan:
                    return r < 0.45f ? 7 : (r < 0.75f ? 0 : 1);
                case VehicleKind.Bus:
                    return 7;
                case VehicleKind.Minivan:
                    return r < 0.40f ? 0 : (r < 0.70f ? 2 : 1);
                case VehicleKind.Taxi:
                    return r < 0.60f ? 0 : 1;
                default:
                    return Mathf.Clamp(Mathf.FloorToInt(r * Marques.Length), 0, Marques.Length - 1);
            }
        }

        /// <summary>Body dimensions, in metres, and how often each turns up.</summary>
        public struct Spec
        {
            public float length, width, height;
            public float weight;        // share of the traffic mix
            public float topSpeed;      // m/s on an arterial
        }

        public static Spec SpecFor(VehicleKind kind)
        {
            switch (kind)
            {
                case VehicleKind.KeiCar:   return new Spec { length = 3.40f, width = 1.475f, height = 1.68f, weight = 0.20f, topSpeed = 13f };
                case VehicleKind.KeiVan:   return new Spec { length = 3.40f, width = 1.475f, height = 1.86f, weight = 0.11f, topSpeed = 12f };
                case VehicleKind.KeiTruck: return new Spec { length = 3.40f, width = 1.475f, height = 1.78f, weight = 0.07f, topSpeed = 11f };
                case VehicleKind.Compact:  return new Spec { length = 4.00f, width = 1.695f, height = 1.52f, weight = 0.18f, topSpeed = 14f };
                case VehicleKind.Sedan:    return new Spec { length = 4.70f, width = 1.760f, height = 1.45f, weight = 0.13f, topSpeed = 15f };
                case VehicleKind.Minivan:  return new Spec { length = 4.70f, width = 1.730f, height = 1.86f, weight = 0.12f, topSpeed = 14f };
                case VehicleKind.Taxi:     return new Spec { length = 4.60f, width = 1.700f, height = 1.72f, weight = 0.10f, topSpeed = 14f };
                case VehicleKind.BoxVan:   return new Spec { length = 5.00f, width = 1.890f, height = 2.60f, weight = 0.06f, topSpeed = 12f };
                default:                   return new Spec { length = 10.5f, width = 2.490f, height = 3.10f, weight = 0.03f, topSpeed = 11f };
            }
        }

        /// <summary>Picks a body from the mix. <paramref name="r"/> is 0..1.</summary>
        public static VehicleKind Pick(float r)
        {
            float total = 0f;
            for (int i = 0; i < (int)VehicleKind.Count; i++) total += SpecFor((VehicleKind)i).weight;
            float t = r * total;
            for (int i = 0; i < (int)VehicleKind.Count; i++)
            {
                t -= SpecFor((VehicleKind)i).weight;
                if (t <= 0f) return (VehicleKind)i;
            }
            return VehicleKind.KeiCar;
        }

        // ------------------------------------------------------------------ the livery atlas

        /// <summary>The livery sheet is a four by four grid. FacadeTextures.PaintLivery fills it.</summary>
        public const int AtlasGrid = 4;
        public const int CellPlatePrivate = 8;
        public const int CellPlateCommercial = 9;
        public const int CellTaxiLamp = 10;
        public const int CellVacancy = 11;
        public const int CellPanel = 12;        // 12..14 are delivery panels
        public const int CellBlind = 15;        // a bus destination blind

        public static Rect AtlasCell(int index)
        {
            int k = Mathf.Clamp(index, 0, AtlasGrid * AtlasGrid - 1);
            float c = 1f / AtlasGrid;
            return new Rect((k % AtlasGrid) * c, 1f - ((k / AtlasGrid) + 1) * c, c, c);
        }

        // ------------------------------------------------------------------ bodies

        /// <summary>
        /// Builds one vehicle, centred on the origin, nose pointing +Z, sitting on y = 0. The
        /// paint goes in its own submesh so the traffic system can tint each car separately
        /// without a material per car.
        /// </summary>
        /// <summary>
        /// The same vehicle, stamped somewhere. Used for cars parked at the kerb, which are
        /// baked into the static mesh rather than being given to the traffic system.
        /// </summary>
        public static void BuildAt(VehicleKind kind, int seed, Vector3 position, float yawDegrees, BuildingMesh mesh)
        {
            mesh.PlaceAt(position, yawDegrees);
            Build(kind, seed, mesh);
            mesh.Unplace();
        }

        public static void Build(VehicleKind kind, int seed, BuildingMesh mesh)
        {
            var spec = SpecFor(kind);
            float r = KontoNoise.White(seed, 11, 17);
            int marque = MarqueFor(kind, r);
            // Green plates are for vehicles carrying goods or people for hire.
            bool commercial = kind == VehicleKind.KeiVan || kind == VehicleKind.KeiTruck
                           || kind == VehicleKind.BoxVan || kind == VehicleKind.Bus
                           || kind == VehicleKind.Taxi;

            switch (kind)
            {
                case VehicleKind.KeiCar:   Kei(spec, mesh, seed, marque, commercial, false); break;
                case VehicleKind.KeiVan:   Kei(spec, mesh, seed, marque, commercial, true); break;
                case VehicleKind.KeiTruck: KeiTruck(spec, mesh, seed, marque, commercial); break;
                case VehicleKind.Compact:  Car(spec, mesh, seed, marque, commercial, 0.56f, 0.34f, false); break;
                case VehicleKind.Sedan:    Car(spec, mesh, seed, marque, commercial, 0.46f, 0.46f, true); break;
                case VehicleKind.Minivan:  Car(spec, mesh, seed, marque, commercial, 0.72f, 0.18f, false); break;
                case VehicleKind.Taxi:     Taxi(spec, mesh, seed, marque); break;
                case VehicleKind.BoxVan:   BoxVan(spec, mesh, seed, marque); break;
                default:                   Bus(spec, mesh, seed, marque); break;
            }
        }

        /// <summary>
        /// A kei car: the regulations say 3.4 m by 1.48 m, so every one of them is exactly that,
        /// and the only way to get space inside is to go up. That is why they look like this.
        /// </summary>
        static void Kei(Spec spec, BuildingMesh mesh, int seed, int marque, bool commercial, bool van)
        {
            float L = spec.length, W = spec.width, H = spec.height;
            float sill = 0.62f, glass = H - sill - 0.10f;

            // Lower body, very slightly tucked in at the bottom.
            mesh.AddTaperedBox(Vector2.zero, new Vector2(W * 0.94f, L * 0.97f), new Vector2(W, L),
                0f, 0.30f, sill - 0.30f, CitySurface.CarPaint);
            mesh.AddTaperedBox(Vector2.zero, new Vector2(W * 0.88f, L * 0.90f), new Vector2(W * 0.94f, L * 0.97f),
                0f, 0.16f, 0.14f, CitySurface.CarPaint);

            // Greenhouse: upright, barely tapered, which is the whole point of the class.
            float rear = van ? 0f : -L * 0.06f;
            mesh.AddTaperedBox(new Vector2(0f, rear), new Vector2(W * 0.97f, L * (van ? 0.86f : 0.74f)),
                new Vector2(W * 0.90f, L * (van ? 0.80f : 0.64f)), 0f, sill, glass,
                CitySurface.CarGlass, van ? 0f : L * 0.03f);

            // Roof, pillars and the bonnet stub.
            mesh.AddBox(new Vector2(0f, rear), new Vector2(W * 0.93f, L * (van ? 0.82f : 0.68f)), 0f,
                sill + glass - 0.06f, 0.10f, CitySurface.CarPaint);
            mesh.AddBox(new Vector2(0f, L * 0.40f), new Vector2(W * 0.98f, L * 0.16f), 0f,
                sill - 0.04f, 0.10f, CitySurface.CarPaint);

            Wheels(mesh, spec, 0.265f, L * 0.33f);
            Ends(mesh, spec, 0.34f, seed, marque, commercial);
        }

        static void KeiTruck(Spec spec, BuildingMesh mesh, int seed, int marque, bool commercial)
        {
            float L = spec.length, W = spec.width;
            // Cab over the front axle, flat bed behind: a 軽トラ.
            mesh.AddTaperedBox(Vector2.zero, new Vector2(W * 0.94f, L * 0.97f), new Vector2(W, L),
                0f, 0.34f, 0.28f, CitySurface.CarPaint);
            mesh.AddTaperedBox(new Vector2(0f, L * 0.26f), new Vector2(W * 0.97f, L * 0.40f),
                new Vector2(W * 0.92f, L * 0.36f), 0f, 0.62f, 1.00f, CitySurface.CarGlass);
            mesh.AddBox(new Vector2(0f, L * 0.26f), new Vector2(W * 0.94f, L * 0.38f), 0f, 1.56f, 0.09f,
                CitySurface.CarPaint);
            // The bed, with drop sides.
            mesh.AddBox(new Vector2(0f, -L * 0.20f), new Vector2(W, L * 0.52f), 0f, 0.62f, 0.06f,
                CitySurface.CarTrim);
            mesh.AddWallRing(new Vector2(0f, -L * 0.20f), new Vector2(W, L * 0.52f), 0f, 0.68f, 0.34f, 0.06f,
                CitySurface.CarPaint);

            Wheels(mesh, spec, 0.265f, L * 0.33f);
            Ends(mesh, spec, 0.40f, seed, marque, commercial);
        }

        /// <summary>
        /// A three box or two box car. <paramref name="cabin"/> is how much of the length the
        /// greenhouse takes and <paramref name="boot"/> how much sticks out behind it, which is
        /// the whole difference between a hatch, a sedan and a minivan.
        /// </summary>
        static void Car(Spec spec, BuildingMesh mesh, int seed, int marque, bool commercial, float cabin, float boot, bool threeBox)
        {
            float L = spec.length, W = spec.width, H = spec.height;
            float sill = H * 0.46f;

            mesh.AddTaperedBox(Vector2.zero, new Vector2(W * 0.93f, L * 0.98f), new Vector2(W, L),
                0f, 0.28f, sill - 0.28f, CitySurface.CarPaint);
            mesh.AddTaperedBox(Vector2.zero, new Vector2(W * 0.86f, L * 0.92f), new Vector2(W * 0.93f, L * 0.98f),
                0f, 0.15f, 0.13f, CitySurface.CarPaint);

            // Bonnet, and a boot lid if it is a three box.
            mesh.AddTaperedBox(new Vector2(0f, L * (0.5f - 0.16f)), new Vector2(W * 0.97f, L * 0.30f),
                new Vector2(W * 0.90f, L * 0.26f), 0f, sill, H * 0.06f, CitySurface.CarPaint, L * 0.01f);
            if (threeBox)
                mesh.AddTaperedBox(new Vector2(0f, -L * (0.5f - boot * 0.5f)), new Vector2(W * 0.97f, L * boot),
                    new Vector2(W * 0.92f, L * boot * 0.92f), 0f, sill, H * 0.09f, CitySurface.CarPaint);

            // Greenhouse: raked at both ends, which is what stops a car reading as a shoebox.
            float glass = H - sill - H * 0.07f;
            float centre = threeBox ? -L * 0.04f : -L * 0.02f;
            mesh.AddTaperedBox(new Vector2(0f, centre), new Vector2(W * 0.94f, L * cabin),
                new Vector2(W * 0.80f, L * cabin * 0.66f), 0f, sill, glass, CitySurface.CarGlass, -L * 0.03f);
            mesh.AddBox(new Vector2(0f, centre - L * 0.03f), new Vector2(W * 0.82f, L * cabin * 0.68f), 0f,
                sill + glass - 0.05f, 0.09f, CitySurface.CarPaint);

            Wheels(mesh, spec, H * 0.20f, L * 0.31f);
            Ends(mesh, spec, sill * 0.52f, seed, marque, commercial);
        }

        static void Taxi(Spec spec, BuildingMesh mesh, int seed, int marque)
        {
            Car(spec, mesh, seed, marque, true, 0.62f, 0.26f, true);
            float W = spec.width, L = spec.length, H = spec.height;

            // The 行灯 on the roof, lit, with the company name on both sides.
            Vector2 c = new Vector2(0f, -L * 0.02f);
            mesh.AddBoxAtlas(c, new Vector2(W * 0.34f, 0.30f), 0f, H - 0.04f, 0.20f,
                CitySurface.Livery, AtlasCell(CellTaxiLamp));
            // The 空車 card in the corner of the windscreen: red means the cab is free.
            mesh.AddBoxAtlas(new Vector2(-W * 0.26f, L * 0.22f), new Vector2(0.24f, 0.05f), 0f, H * 0.56f, 0.12f,
                CitySurface.Livery, AtlasCell(CellVacancy));
            // Door livery stripe.
            for (int s = -1; s <= 1; s += 2)
                mesh.AddBoxAtlas(new Vector2(s * W * 0.505f, -L * 0.02f), new Vector2(0.03f, L * 0.42f), 0f,
                    H * 0.30f, 0.16f, CitySurface.Livery,
                    AtlasCell(CellPanel + (KontoNoise.Hash(seed, 3, 5) & 1)));
        }

        static void BoxVan(Spec spec, BuildingMesh mesh, int seed, int marque)
        {
            float L = spec.length, W = spec.width, H = spec.height;
            // Cab first, then the box, which is taller and slightly wider than the cab.
            mesh.AddTaperedBox(new Vector2(0f, L * 0.30f), new Vector2(W * 0.95f, L * 0.36f),
                new Vector2(W * 0.93f, L * 0.34f), 0f, 0.42f, 1.30f, CitySurface.CarPaint);
            mesh.AddTaperedBox(new Vector2(0f, L * 0.36f), new Vector2(W * 0.90f, L * 0.16f),
                new Vector2(W * 0.86f, L * 0.16f), 0f, 1.16f, 0.62f, CitySurface.CarGlass);
            mesh.AddBox(new Vector2(0f, -L * 0.14f), new Vector2(W, L * 0.62f), 0f, 0.62f, H - 0.62f,
                CitySurface.CarPaint);
            // The panel the delivery firm's name goes on.
            for (int s = -1; s <= 1; s += 2)
                mesh.AddBox(new Vector2(s * W * 0.505f, -L * 0.14f), new Vector2(0.03f, L * 0.48f), 0f,
                    1.05f, 1.05f, CitySurface.Livery, 1f);

            Wheels(mesh, spec, 0.34f, L * 0.30f);
            Ends(mesh, spec, 0.55f, seed, marque, true);
        }

        static void Bus(Spec spec, BuildingMesh mesh, int seed, int marque)
        {
            float L = spec.length, W = spec.width, H = spec.height;
            mesh.AddTaperedBox(Vector2.zero, new Vector2(W * 0.96f, L * 0.99f), new Vector2(W, L),
                0f, 0.36f, 0.64f, CitySurface.CarPaint);
            mesh.AddBox(Vector2.zero, new Vector2(W, L), 0f, 1.00f, 1.32f, CitySurface.CarGlass);
            mesh.AddBox(Vector2.zero, new Vector2(W * 0.99f, L * 0.99f), 0f, 2.32f, H - 2.32f,
                CitySurface.CarPaint);
            mesh.AddBox(Vector2.zero, new Vector2(W * 0.96f, L * 0.98f), 0f, H - 0.05f, 0.06f,
                CitySurface.CarPaint);
            // Route number board over the windscreen, and a stripe down the flank.
            mesh.AddBox(new Vector2(0f, L * 0.49f), new Vector2(W * 0.62f, 0.05f), 0f, 2.34f, 0.34f,
                CitySurface.Livery, 1f);
            for (int s = -1; s <= 1; s += 2)
                mesh.AddBox(new Vector2(s * W * 0.505f, 0f), new Vector2(0.03f, L * 0.9f), 0f, 0.74f, 0.22f,
                    CitySurface.Livery, 1f);

            Wheels(mesh, spec, 0.46f, L * 0.33f, true);
            Ends(mesh, spec, 0.70f, seed, marque, true, false);
        }

        // ------------------------------------------------------------------ shared parts

        static void Wheels(BuildingMesh mesh, Spec spec, float radius, float axle, bool twin = false)
        {
            float W = spec.width;
            float inset = W * 0.5f - 0.04f;
            for (int f = -1; f <= 1; f += 2)
            for (int s = -1; s <= 1; s += 2)
            {
                float z = f * axle;
                Vector3 a = new Vector3(s * (inset - 0.09f), radius, z);
                Vector3 b = new Vector3(s * inset, radius, z);
                mesh.AddCylinder(a, b, radius, 12, CitySurface.Tyre);
                // Wheel face, slightly proud, so it catches light as something other than tyre.
                mesh.AddCylinder(b - new Vector3(s * 0.012f, 0f, 0f), b, radius * 0.62f, 10, CitySurface.CarTrim);
                if (!twin) continue;
                Vector3 c = a - new Vector3(s * 0.10f, 0f, 0f);
                mesh.AddCylinder(c, a, radius, 12, CitySurface.Tyre);
            }
        }

        /// <summary>Bumpers, lamps, plate and badge — the bits that tell you which end is which.</summary>
        static void Ends(BuildingMesh mesh, Spec spec, float y, int seed, int marque, bool commercial, bool badge = true)
        {
            float L = spec.length, W = spec.width;

            // The lamp sheet is clear over red: the top half is a headlamp, the bottom half a
            // tail lamp, and each end picks its half rather than both coming out red.
            var headlamp = new Rect(0.05f, 0.55f, 0.90f, 0.40f);
            var taillamp = new Rect(0.05f, 0.05f, 0.90f, 0.40f);

            for (int f = -1; f <= 1; f += 2)
            {
                bool front = f > 0;
                float z = f * (L * 0.5f - 0.02f);
                float bumperY = y - 0.16f;
                mesh.AddBox(new Vector2(0f, z), new Vector2(W * 1.00f, 0.16f), 0f, bumperY, 0.26f,
                    CitySurface.CarTrim, 1f);

                float lampY = front ? y + 0.10f : y + 0.16f;
                float lampW = front ? W * 0.26f : W * 0.20f;
                for (int s = -1; s <= 1; s += 2)
                    mesh.AddBoxAtlas(new Vector2(s * (W * 0.5f - lampW * 0.5f - 0.04f), z + f * 0.02f),
                        new Vector2(lampW, 0.06f), 0f, lampY, 0.13f, CitySurface.CarLight,
                        front ? headlamp : taillamp);

                // Number plate, standing proud of the bumper rather than buried in it.
                mesh.AddBoxAtlas(new Vector2(0f, z + f * 0.10f), new Vector2(0.33f, 0.02f), 0f,
                    bumperY + 0.04f, 0.17f, CitySurface.Livery,
                    AtlasCell(commercial ? CellPlateCommercial : CellPlatePrivate));
            }

            if (!badge) return;
            // The marque badge, small, high on the nose where a badge goes.
            mesh.AddBoxAtlas(new Vector2(0f, L * 0.5f + 0.012f), new Vector2(0.14f, 0.02f), 0f,
                y + 0.30f, 0.10f, CitySurface.Livery, AtlasCell(marque));
        }
    }
}
