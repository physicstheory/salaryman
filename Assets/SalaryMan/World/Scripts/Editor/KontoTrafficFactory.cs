using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Bakes the moving city: a fleet of vehicles and a cast of pedestrians, as mesh assets, and
    /// the two spawners that drive them.
    ///
    /// Everything moving is built the same way as everything standing still — the same surface
    /// materials, the same mesh accumulator — so the cars and the crowd add no materials and no
    /// texture memory to a scene that already has the city in it. What they do add is a handful
    /// of small meshes: a few variants of each body, since one Kei car repeated ninety times
    /// reads as ninety of the same car, and half a dozen variants does not.
    ///
    /// The meshes are compacted: a car uses six of the twenty-eight surfaces, so it is built with
    /// six submeshes and six materials rather than the full palette.
    /// </summary>
    public static class KontoTrafficFactory
    {
        public const string GroupName = "Traffic and crowd";

        /// <summary>Bodies baked per vehicle kind. Each one is a different seed: different wheels,
        /// different badge, different plate.</summary>
        public const int VariantsPerKind = 3;
        /// <summary>And per kind of person.</summary>
        public const int VariantsPerPerson = 2;

        /// <summary>
        /// Says whether this scene has traffic in it, and if not, which of the several ways it
        /// can be missing is the one that happened. "It is not there" is not a diagnosis.
        /// </summary>
        public static void Report()
        {
            var sb = new System.Text.StringBuilder();
            sb.AppendLine("[Konto] Traffic and crowd:");

            var cities = Object.FindObjectsByType<KontoCityRoot>(FindObjectsSortMode.None);
            if (cities == null || cities.Length == 0)
            {
                sb.Append("  no city in this scene at all. Build the world first.");
                Debug.LogWarning(sb.ToString());
                return;
            }

            foreach (var city in cities)
            {
                sb.AppendLine("  " + city.name + ": layout "
                    + (city.city != null && city.city.layout != null
                        ? city.city.layout.name + ", " + city.city.layout.roads.Count + " roads"
                        : "MISSING - nothing can be built for this city"));

                var traffic = city.GetComponentInChildren<KontoTraffic>(true);
                var crowd = city.GetComponentInChildren<KontoCrowd>(true);

                if (traffic == null)
                    sb.AppendLine("    traffic: NOT IN THE SCENE. This is the usual one: the scene was "
                        + "built before the traffic existed, and updating the scripts does not reach into "
                        + "a built scene. Run Tools > SalaryMan > Add The Traffic And The Crowd.");
                else
                    sb.AppendLine("    traffic: " + traffic.variants.Length + " bodies, pool of "
                        + traffic.maxVehicles + ", spawn radius " + traffic.spawnRadius + " m"
                        + (Valid(traffic.variants) ? "" : "  -- SOME BODIES HAVE NO MESH OR MATERIALS"));

                if (crowd == null)
                    sb.AppendLine("    crowd:   NOT IN THE SCENE. Same fix.");
                else
                    sb.AppendLine("    crowd:   " + crowd.bodies.Length + " bodies, pool of "
                        + crowd.maxPeople + ", spawn radius " + crowd.spawnRadius + " m");

                if (city.city != null && city.city.layout != null)
                {
                    var lanes = CityLanes.Build(city.city.layout);
                    sb.AppendLine("    lanes:   " + lanes.driving.Count + " to drive on, "
                        + lanes.footways.Count + " to walk on, " + lanes.junctions.Count + " junctions");

                    // Where the player is standing decides whether any of it is near enough to see.
                    var player = Object.FindFirstObjectByType<KontoCharacter>();
                    Vector3 at = player != null ? player.transform.position
                               : (Camera.main != null ? Camera.main.transform.position : Vector3.zero);
                    float best = float.MaxValue;
                    for (int i = 0; i < lanes.driving.Count; i++)
                    {
                        var pts = lanes.driving[i].points;
                        for (int k = 1; k < pts.Length; k++)
                            best = Mathf.Min(best, CityGeom.DistanceToSegment(new Vector2(at.x, at.z),
                                new Vector2(pts[k - 1].x, pts[k - 1].z), new Vector2(pts[k].x, pts[k].z)));
                    }
                    sb.AppendLine("    nearest road to " + (player != null ? "Seiko" : "the camera")
                        + ": " + best.ToString("0") + " m"
                        + (traffic != null && best > traffic.spawnRadius
                            ? "  -- further than the spawn radius, so you would see nothing from there"
                            : ""));
                }
            }

            sb.Append("  Both spawn around the camera when the game runs, so the editor view stays empty.");
            Debug.Log(sb.ToString());
        }

        static bool Valid(CityMeshPiece[] pieces)
        {
            if (pieces == null) return false;
            foreach (var p in pieces)
                if (p == null || !p.Valid) return false;
            return true;
        }

        /// <summary>
        /// Adds the traffic and the crowd to a city that is already in the scene.
        ///
        /// Replacing the scripts in a project does nothing to a scene that was built before they
        /// existed: the city in the scene is meshes and GameObjects made by the last build, and
        /// nothing in it knows what a vehicle is. This is the cheap way to get the moving parts
        /// without rebuilding an island - it finds the cities in the open scene and fits them
        /// out. Returns how many cities were done.
        /// </summary>
        public static int BuildIntoOpenScene()
        {
            var cities = Object.FindObjectsByType<KontoCityRoot>(FindObjectsSortMode.None);
            if (cities == null || cities.Length == 0)
            {
                Debug.LogWarning("[Konto] There is no city in this scene to put traffic in. Build the world "
                    + "first, or use Tools > SalaryMan > Rebuild the city only.");
                return 0;
            }

            int done = 0;
            foreach (var city in cities)
            {
                var asset = city.city;
                if (asset == null || asset.layout == null)
                {
                    Debug.LogWarning("[Konto] " + city.name + " has no layout asset, so it was skipped.");
                    continue;
                }

                // Whatever the city was painted with, not a fresh repaint: this should take
                // seconds, and the textures are already on disk.
                int seed;
                if (!int.TryParse(asset.builtFromSeed, out seed)) seed = asset.layout.seed;
                var surfaces = KontoSurfaceLibrary.CreateOrUpdate(seed, false);

                var existing = city.transform.Find(GroupName);
                if (existing != null) Object.DestroyImmediate(existing.gameObject);

                Build(asset.layout, asset, city.transform, surfaces);
                done++;
            }

            AssetDatabase.SaveAssets();
            return done;
        }

        public static void Build(CityLayout layout, KontoCityLayoutAsset asset, Transform parent, Material[] surfaces)
        {
            if (layout == null || asset == null || surfaces == null) return;

            var group = new GameObject(GroupName);
            group.transform.SetParent(parent, true);

            int cars = BuildTraffic(layout, asset, group.transform, surfaces);
            int people = BuildCrowd(layout, asset, group.transform, surfaces);

            Debug.Log(string.Format("[Konto] {0}: {1} vehicle bodies and {2} pedestrian bodies baked. " +
                "The lanes are worked out from the road network when the scene starts.",
                layout.name, cars, people));
        }

        // ------------------------------------------------------------------ vehicles

        static int BuildTraffic(CityLayout layout, KontoCityLayoutAsset asset, Transform parent, Material[] surfaces)
        {
            var go = new GameObject("Traffic");
            go.transform.SetParent(parent, true);
            var traffic = go.AddComponent<KontoTraffic>();
            traffic.city = asset;

            var pieces = new List<CityMeshPiece>();
            var kinds = new List<VehicleLibrary.VehicleKind>();
            var order = new List<CitySurface>();

            for (int k = 0; k < (int)VehicleLibrary.VehicleKind.Count; k++)
            {
                var kind = (VehicleLibrary.VehicleKind)k;
                for (int v = 0; v < VariantsPerKind; v++)
                {
                    int seed = 4200 + k * 101 + v * 17;
                    var builder = new BuildingMesh();
                    VehicleLibrary.Build(kind, seed, builder);
                    if (builder.VertexCount == 0) continue;

                    var piece = Save(builder, order, surfaces, string.Format("Vehicle_{0}_{1}", kind, v));
                    pieces.Add(piece);
                    kinds.Add(kind);
                }
            }

            traffic.variants = pieces.ToArray();
            traffic.variantKinds = kinds.ToArray();
            return pieces.Count;
        }

        // ------------------------------------------------------------------ people

        static int BuildCrowd(CityLayout layout, KontoCityLayoutAsset asset, Transform parent, Material[] surfaces)
        {
            var go = new GameObject("Crowd");
            go.transform.SetParent(parent, true);
            var crowd = go.AddComponent<KontoCrowd>();
            crowd.city = asset;

            var bodies = new List<KontoCrowd.Body>();
            var order = new List<CitySurface>();

            for (int k = 0; k < (int)PedestrianLibrary.PersonKind.Count; k++)
            {
                var kind = (PedestrianLibrary.PersonKind)k;
                for (int v = 0; v < VariantsPerPerson; v++)
                {
                    int seed = 9100 + k * 71 + v * 13;
                    var person = Describe(kind, seed);

                    var body = new BuildingMesh();
                    var legL = new BuildingMesh();
                    var legR = new BuildingMesh();
                    PedestrianLibrary.Build(person, seed, body, legL, legR);
                    if (body.VertexCount == 0) continue;

                    bodies.Add(new KontoCrowd.Body
                    {
                        kind = kind,
                        body = Save(body, order, surfaces, string.Format("Person_{0}_{1}", kind, v)),
                        legLeft = Save(legL, order, surfaces, string.Format("PersonLegL_{0}_{1}", kind, v)),
                        legRight = Save(legR, order, surfaces, string.Format("PersonLegR_{0}_{1}", kind, v)),
                        height = person.height,
                        hipHeight = person.hipHeight,
                        pace = person.pace,
                    });
                }
            }

            crowd.bodies = bodies.ToArray();
            return bodies.Count;
        }

        /// <summary>
        /// A person of a given kind. Describe() picks the kind from the seed as well, which is
        /// what the crowd wants at runtime and not what the factory wants, so this walks seeds
        /// until it gets the kind it was asked for.
        /// </summary>
        static PedestrianLibrary.Person Describe(PedestrianLibrary.PersonKind kind, int seed)
        {
            for (int i = 0; i < 400; i++)
            {
                var p = PedestrianLibrary.Describe(seed + i * 37);
                if (p.kind == kind) return p;
            }
            var fallback = PedestrianLibrary.Describe(seed);
            fallback.kind = kind;
            return fallback;
        }

        // ------------------------------------------------------------------ assets

        /// <summary>
        /// Saves one compacted mesh and the materials it needs. The surface list travels with it,
        /// so the spawners know which submesh is the paint and which is the shirt.
        /// </summary>
        static CityMeshPiece Save(BuildingMesh builder, List<CitySurface> order, Material[] surfaces, string name)
        {
            var mesh = builder.BuildCompact(name, order);

            string path = string.Format("{0}/Konto_{1}.asset", KontoAssetPaths.Meshes, name);
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null) AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);

            var used = new Material[order.Count];
            var list = new CitySurface[order.Count];
            for (int i = 0; i < order.Count; i++)
            {
                list[i] = order[i];
                int index = (int)order[i];
                used[i] = index < surfaces.Length ? surfaces[index] : null;
            }

            return new CityMeshPiece { mesh = mesh, materials = used, surfaces = list };
        }
    }
}
