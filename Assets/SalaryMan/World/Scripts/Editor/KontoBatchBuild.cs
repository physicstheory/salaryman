using System;
using System.Diagnostics;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Building Konto from a command line, with no editor window open.
    ///
    /// The world build is the expensive part of this project — erosion, hydrology, city
    /// planning, three thousand buildings, thirty terrain tiles — and all of it is arithmetic.
    /// It wants cores and memory and no graphics card at all. Only looking at the result needs
    /// a GPU. Splitting those apart is what makes a cloud machine worth renting: a big headless
    /// box generates the world for pennies an hour, commits the result, and an ordinary machine
    /// opens the finished scene.
    ///
    /// <code>
    /// Unity -quit -batchmode -projectPath &lt;project&gt; \
    ///       -executeMethod SalaryMan.World.EditorTools.KontoBatchBuild.World \
    ///       -kontoLowMemory -kontoScene Assets/Konto.unity -logFile -
    /// </code>
    ///
    /// Every switch is optional. With none of them it builds exactly what the window builds.
    /// </summary>
    public static class KontoBatchBuild
    {
        /// <summary>Build the world, save the scene, and say how long it took.</summary>
        public static void World()
        {
            int code = 0;
            var clock = Stopwatch.StartNew();
            try
            {
                var settings = KontoWorldBuilder.LoadOrCreateSettings();
                if (settings == null)
                {
                    Fail("No world settings asset, and one could not be created.");
                    return;
                }

                Apply(settings);
                EditorUtility.SetDirty(settings);

                var steps = Steps();
                Debug.Log(string.Format(
                    "[Konto] Batch build starting. Seed {0}, {1} x {2} tiles, working resolution {3}, "
                    + "{4} droplets, alphamap {5}, steps {6}.",
                    settings.seed, settings.tilesX, settings.tilesZ, settings.workingResolution,
                    settings.erosionDroplets, settings.alphamapResolution, steps));

                KontoWorldBuilder.BuildAll(settings, steps);

                string scene = Arg("-kontoScene", "Assets/SalaryMan/Konto.unity");
                if (!string.IsNullOrEmpty(scene))
                {
                    var open = EditorSceneManager.GetActiveScene();
                    if (!EditorSceneManager.SaveScene(open, scene))
                        Debug.LogWarning("[Konto] The scene could not be saved to " + scene);
                    else
                        Debug.Log("[Konto] Scene saved to " + scene);
                }

                AssetDatabase.SaveAssets();
                Debug.Log(string.Format("[Konto] Batch build finished in {0:0} minutes {1:00} seconds.",
                    Math.Floor(clock.Elapsed.TotalMinutes), clock.Elapsed.Seconds));
            }
            catch (Exception e)
            {
                Debug.LogError("[Konto] Batch build failed: " + e);
                code = 1;
            }

            // -quit on its own would exit 0 even after a failure, and a build machine that
            // reports success when it failed is worse than no build machine.
            if (Application.isBatchMode) EditorApplication.Exit(code);
        }

        /// <summary>
        /// Build a playable Windows executable from whatever scene the world build left behind.
        /// Runs after <see cref="World"/>, or on its own against a committed scene.
        /// </summary>
        public static void Player()
        {
            int code = 0;
            try
            {
                string scene = Arg("-kontoScene", "Assets/SalaryMan/Konto.unity");
                string output = Arg("-kontoOutput", "Build/Konto/Konto.exe");

                var options = new BuildPlayerOptions
                {
                    scenes = new[] { scene },
                    locationPathName = output,
                    target = BuildTarget.StandaloneWindows64,
                    options = BuildOptions.None,
                };

                var report = BuildPipeline.BuildPlayer(options);
                if (report == null)
                {
                    Fail("The build pipeline returned nothing.");
                    return;
                }

                Debug.Log("[Konto] Player build: " + report.summary.result
                    + ", " + report.summary.totalSize / (1024 * 1024) + " MB, to " + output);
                if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) code = 1;
            }
            catch (Exception e)
            {
                Debug.LogError("[Konto] Player build failed: " + e);
                code = 1;
            }

            if (Application.isBatchMode) EditorApplication.Exit(code);
        }

        // ------------------------------------------------------------------ settings

        /// <summary>
        /// Applies whatever the command line asked for. <c>-kontoLowMemory</c> is the one worth
        /// knowing: the island is the same island, the valleys are just coarser, and the peak
        /// memory drops by something like two thirds. It is the difference between building on
        /// a 16 GB machine and not.
        /// </summary>
        static void Apply(KontoWorldSettings settings)
        {
            if (Flag("-kontoLowMemory"))
            {
                settings.workingResolution = 1280;
                settings.erosionDroplets = 300000;
                settings.alphamapResolution = 512;
                settings.detailResolution = 512;
                KontoCityFactory.SurfaceTextureSize = 512;
                Debug.Log("[Konto] Low memory preset: working 1280, 300k droplets, 512 alphamaps "
                    + "and detail maps, 512 px surfaces.");
            }

            settings.seed = Int("-kontoSeed", settings.seed);
            settings.workingResolution = Int("-kontoWorking", settings.workingResolution);
            settings.erosionDroplets = Int("-kontoDroplets", settings.erosionDroplets);
            settings.alphamapResolution = Int("-kontoAlphamap", settings.alphamapResolution);
            settings.detailResolution = Int("-kontoDetail", settings.detailResolution);
            settings.tilesX = Int("-kontoTilesX", settings.tilesX);
            settings.tilesZ = Int("-kontoTilesZ", settings.tilesZ);
            KontoCityFactory.SurfaceTextureSize = Int("-kontoSurfaces", KontoCityFactory.SurfaceTextureSize);
            settings.Validate();
        }

        static KontoBuildSteps Steps()
        {
            string named = Arg("-kontoSteps", null);
            if (string.IsNullOrEmpty(named)) return KontoBuildSteps.All;

            var steps = KontoBuildSteps.None;
            foreach (var part in named.Split(','))
            {
                var trimmed = part.Trim();
                if (trimmed.Length == 0) continue;
                try
                {
                    steps |= (KontoBuildSteps)Enum.Parse(typeof(KontoBuildSteps), trimmed, true);
                }
                catch (ArgumentException)
                {
                    Debug.LogWarning("[Konto] Unknown build step '" + trimmed + "', ignored. "
                        + "The names are " + string.Join(", ", Enum.GetNames(typeof(KontoBuildSteps))) + ".");
                }
            }
            return steps == KontoBuildSteps.None ? KontoBuildSteps.All : steps;
        }

        // ------------------------------------------------------------------ the command line

        static string Arg(string name, string fallback)
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
                if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
                    return args[i + 1];
            return fallback;
        }

        static bool Flag(string name)
        {
            foreach (var a in Environment.GetCommandLineArgs())
                if (string.Equals(a, name, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        static int Int(string name, int fallback)
        {
            string raw = Arg(name, null);
            int value;
            if (raw != null && int.TryParse(raw, out value)) return value;
            if (raw != null) Debug.LogWarning("[Konto] " + name + " wants a whole number, not '" + raw + "'.");
            return fallback;
        }

        static void Fail(string why)
        {
            Debug.LogError("[Konto] " + why);
            if (Application.isBatchMode) EditorApplication.Exit(1);
        }
    }
}
