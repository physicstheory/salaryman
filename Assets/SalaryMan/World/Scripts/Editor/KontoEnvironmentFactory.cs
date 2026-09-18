using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace SalaryMan.World.EditorTools
{
    /// <summary>
    /// Builds the HDRP lighting environment: a physically based sky, height fog, volumetric
    /// clouds, a sun driven from real solar geometry, and a grade that leaves the image looking
    /// like a place rather than like a demo.
    ///
    /// Every HDRP parameter is written through HdrpReflection, so a parameter that was renamed
    /// or removed in your HDRP version is skipped with a warning rather than failing to compile.
    /// </summary>
    public static class KontoEnvironmentFactory
    {
        public const string RootName = "Konto Environment";

        public static GameObject Build(KontoWorldSettings settings, bool rebuildProfiles = true)
        {
            KontoAssetPaths.EnsureAll();
            HdrpReflection.VerboseLogging = true;

            var root = GameObject.Find(RootName);
            if (root == null) root = new GameObject(RootName);

            Light sun = FindOrCreateLight(root.transform, "Sun", 50f, 130f);
            Light moon = FindOrCreateLight(root.transform, "Moon", -40f, 310f);
            ConfigureSun(sun);
            ConfigureMoon(moon);

            VolumeProfile baseProfile = BuildBaseProfile(rebuildProfiles);
            Volume skyVolume = FindOrCreateVolume(root.transform, "Sky and Fog Volume", 0f);
            skyVolume.profile = baseProfile;

            var timeOfDay = root.GetComponent<KontoTimeOfDay>();
            if (timeOfDay == null) timeOfDay = root.AddComponent<KontoTimeOfDay>();
            timeOfDay.sun = sun;
            timeOfDay.moon = moon;
            timeOfDay.latitude = 36.2f;
            timeOfDay.dayOfYear = 266;       // late September: clear air, low humidity, long shadows
            timeOfDay.timeOfDay = 9.25f;
            timeOfDay.Apply();

            BuildWeather(root, rebuildProfiles);
            ConfigureMainCamera(settings);

            EditorUtility.SetDirty(root);
            return root;
        }

        // ---------------------------------------------------------------- lights

        static Light FindOrCreateLight(Transform parent, string name, float pitch, float yaw)
        {
            Transform t = parent.Find(name);
            GameObject go = t != null ? t.gameObject : new GameObject(name);
            go.transform.SetParent(parent, false);
            var light = go.GetComponent<Light>();
            if (light == null) light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            go.transform.rotation = Quaternion.Euler(pitch, yaw, 0f);
            return light;
        }

        static void ConfigureSun(Light sun)
        {
            HdrpReflection.EnsureLightData(sun);
            sun.shadows = LightShadows.Soft;
            sun.useColorTemperature = true;
            sun.colorTemperature = 5800f;
            sun.color = Color.white;
            HdrpReflection.SetPhysicalIntensity(sun, 100000f, "Lux");

            // The real sun subtends about half a degree. Getting this right is what gives
            // shadows their correct softening with distance from the caster.
            HdrpReflection.SetLightProperty(sun, "angularDiameter", 0.53f);
            HdrpReflection.SetLightProperty(sun, "volumetricDimmer", 1f);
            HdrpReflection.SetLightProperty(sun, "shadowNearPlane", 0.1f);
            HdrpReflection.SetLightProperty(sun, "affectsVolumetric", true);
            HdrpReflection.SetLightProperty(sun, "interactsWithSky", true);
            HdrpReflection.SetLightProperty(sun, "distance", 150000000f);
        }

        static void ConfigureMoon(Light moon)
        {
            HdrpReflection.EnsureLightData(moon);
            moon.shadows = LightShadows.Soft;
            moon.useColorTemperature = true;
            moon.colorTemperature = 4200f;
            HdrpReflection.SetPhysicalIntensity(moon, 0.3f, "Lux");
            HdrpReflection.SetLightProperty(moon, "angularDiameter", 0.5f);
            HdrpReflection.SetLightProperty(moon, "interactsWithSky", false);
        }

        // ---------------------------------------------------------------- volumes

        static Volume FindOrCreateVolume(Transform parent, string name, float priority)
        {
            Transform t = parent.Find(name);
            GameObject go = t != null ? t.gameObject : new GameObject(name);
            go.transform.SetParent(parent, false);
            var v = go.GetComponent<Volume>();
            if (v == null) v = go.AddComponent<Volume>();
            v.isGlobal = true;
            v.priority = priority;
            v.weight = 1f;
            return v;
        }

        static VolumeProfile LoadOrCreateProfile(string assetName, bool rebuild)
        {
            string path = KontoAssetPaths.Profiles + "/" + assetName + ".asset";
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(path);
            if (profile != null && !rebuild) return profile;

            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(profile, path);
            }
            else
            {
                // Clear it out so a rebuild does not stack duplicate overrides.
                var components = new List<VolumeComponent>(profile.components);
                foreach (var c in components)
                {
                    profile.Remove(c.GetType());
                    Object.DestroyImmediate(c, true);
                }
                profile.isDirty = true;
            }
            return profile;
        }

        /// <summary>The base environment: sky, fog, clouds, exposure, shadows and the grade.</summary>
        static VolumeProfile BuildBaseProfile(bool rebuild)
        {
            var profile = LoadOrCreateProfile("Konto_Environment_Base", rebuild);
            if (profile.components.Count > 0 && !rebuild) return profile;

            // --- sky -------------------------------------------------------------------
            var visualEnv = HdrpReflection.AddVolumeComponent(profile, "VisualEnvironment");
            HdrpReflection.SetPhysicallyBasedSky(visualEnv);
            HdrpReflection.SetParameter(visualEnv, "skyAmbientMode", "Dynamic");
            HdrpReflection.SetParameter(visualEnv, "windOrientation", 315f);
            HdrpReflection.SetParameter(visualEnv, "windSpeed", 18f);

            var sky = HdrpReflection.AddVolumeComponent(profile, "PhysicallyBasedSky");
            HdrpReflection.SetParameter(sky, "type", "EarthSimple");
            // A dark, wet, forested ground bounce. A bright ground tint is the usual reason an
            // HDRP sky looks like a product render instead of like outdoors.
            HdrpReflection.SetParameter(sky, "groundTint", new Color(0.12f, 0.13f, 0.10f));
            HdrpReflection.SetParameter(sky, "aerosolDensity", 0.0115f);
            HdrpReflection.SetParameter(sky, "aerosolAnisotropy", 0.72f);
            HdrpReflection.SetParameter(sky, "aerosolTint", new Color(0.88f, 0.90f, 0.94f));
            HdrpReflection.SetParameter(sky, "ozoneDensityDimmer", 1.0f);
            HdrpReflection.SetParameter(sky, "horizonTint", new Color(0.78f, 0.82f, 0.88f));
            HdrpReflection.SetParameter(sky, "zenithTint", new Color(0.42f, 0.55f, 0.80f));
            HdrpReflection.SetParameter(sky, "multiplier", 1f);
            HdrpReflection.SetParameter(sky, "renderingMode", "Default");

            // --- fog -------------------------------------------------------------------
            var fog = HdrpReflection.AddVolumeComponent(profile, "Fog");
            HdrpReflection.SetParameter(fog, "enabled", true);
            HdrpReflection.SetParameter(fog, "colorMode", "SkyColor");
            HdrpReflection.SetParameter(fog, "tint", new Color(0.86f, 0.90f, 0.96f));
            // Haze that thickens with distance and thins with height: humid Japanese air, and
            // it is what gives a view over a mountain range its depth.
            HdrpReflection.SetParameter(fog, "meanFreePath", 5200f);
            HdrpReflection.SetParameter(fog, "baseHeight", 0f);
            HdrpReflection.SetParameter(fog, "maximumHeight", 850f);
            HdrpReflection.SetParameter(fog, "mipFogMaxMip", 0.55f);
            HdrpReflection.SetParameter(fog, "enableVolumetric", true);
            HdrpReflection.SetParameter(fog, "enableVolumetricFog", true);
            HdrpReflection.SetParameter(fog, "depthExtent", 2400f);
            HdrpReflection.SetParameter(fog, "anisotropy", 0.42f);
            HdrpReflection.SetParameter(fog, "multipleScatteringIntensity", 0.32f);
            HdrpReflection.SetParameter(fog, "sliceDistributionUniformity", 0.78f);
            HdrpReflection.SetParameter(fog, "globalLightProbeDimmer", 1f);

            // --- clouds ----------------------------------------------------------------
            var clouds = HdrpReflection.AddVolumeComponent(profile, "VolumetricClouds");
            HdrpReflection.SetParameter(clouds, "enable", true);
            HdrpReflection.SetParameter(clouds, "localClouds", false);
            HdrpReflection.SetParameter(clouds, "cloudPreset", "Cloudy");
            HdrpReflection.SetParameter(clouds, "shadows", true);
            HdrpReflection.SetParameter(clouds, "shadowOpacity", 0.55f);
            HdrpReflection.SetParameter(clouds, "shadowDistance", 12f);
            HdrpReflection.SetParameter(clouds, "ambientLightProbeDimmer", 0.9f);
            HdrpReflection.SetParameter(clouds, "temporalAccumulationFactor", 0.92f);
            HdrpReflection.SetParameter(clouds, "globalWindSpeed", 22f);
            HdrpReflection.SetParameter(clouds, "orientation", 315f);

            // --- exposure and shadows ---------------------------------------------------
            var exposure = HdrpReflection.AddVolumeComponent(profile, "Exposure");
            HdrpReflection.SetParameter(exposure, "mode", "Automatic");
            HdrpReflection.SetParameter(exposure, "meteringMode", "CenterWeighted");
            HdrpReflection.SetParameter(exposure, "luminanceSource", "ColorBuffer");
            HdrpReflection.SetParameter(exposure, "compensation", 0.35f);
            HdrpReflection.SetParameter(exposure, "limitMin", -1f);
            HdrpReflection.SetParameter(exposure, "limitMax", 16f);
            HdrpReflection.SetParameter(exposure, "adaptationSpeedDarkToLight", 2.2f);
            HdrpReflection.SetParameter(exposure, "adaptationSpeedLightToDark", 1.0f);

            var shadows = HdrpReflection.AddVolumeComponent(profile, "HDShadowSettings");
            HdrpReflection.SetParameter(shadows, "maxShadowDistance", 1400f);
            HdrpReflection.SetParameter(shadows, "cascadeShadowSplitCount", 4);
            HdrpReflection.SetParameter(shadows, "cascadeShadowSplit0", 0.035f);
            HdrpReflection.SetParameter(shadows, "cascadeShadowSplit1", 0.11f);
            HdrpReflection.SetParameter(shadows, "cascadeShadowSplit2", 0.32f);
            HdrpReflection.SetParameter(shadows, "cascadeShadowBorder0", 0.15f);

            var contact = HdrpReflection.AddVolumeComponent(profile, "ContactShadows");
            HdrpReflection.SetParameter(contact, "enable", true);
            HdrpReflection.SetParameter(contact, "length", 0.18f);
            HdrpReflection.SetParameter(contact, "opacity", 0.8f);

            var micro = HdrpReflection.AddVolumeComponent(profile, "MicroShadowing");
            HdrpReflection.SetParameter(micro, "enable", true);
            HdrpReflection.SetParameter(micro, "opacity", 0.55f);

            var ao = HdrpReflection.AddVolumeComponent(profile, "AmbientOcclusion");
            HdrpReflection.SetParameter(ao, "intensity", 0.55f);
            HdrpReflection.SetParameter(ao, "radius", 1.6f);
            HdrpReflection.SetParameter(ao, "directLightingStrength", 0.25f);

            var ssr = HdrpReflection.AddVolumeComponent(profile, "ScreenSpaceReflection");
            HdrpReflection.SetParameter(ssr, "enabled", true);
            HdrpReflection.SetParameter(ssr, "minSmoothness", 0.5f);
            HdrpReflection.SetParameter(ssr, "smoothnessFadeStart", 0.6f);

            var indirect = HdrpReflection.AddVolumeComponent(profile, "IndirectLightingController");
            HdrpReflection.SetParameter(indirect, "indirectDiffuseLightingMultiplier", 1.05f);
            HdrpReflection.SetParameter(indirect, "reflectionLightingMultiplier", 1f);

            // --- grade -------------------------------------------------------------------
            var tonemap = HdrpReflection.AddVolumeComponent(profile, "Tonemapping");
            HdrpReflection.SetParameter(tonemap, "mode", "Neutral");
            HdrpReflection.SetParameter(tonemap, "neutralHDRRangeReductionMode", "BT2390");

            var colorAdjust = HdrpReflection.AddVolumeComponent(profile, "ColorAdjustments");
            HdrpReflection.SetParameter(colorAdjust, "postExposure", 0f);
            HdrpReflection.SetParameter(colorAdjust, "contrast", 8f);
            HdrpReflection.SetParameter(colorAdjust, "saturation", 4f);
            HdrpReflection.SetParameter(colorAdjust, "colorFilter", new Color(1f, 0.995f, 0.98f));

            var whiteBalance = HdrpReflection.AddVolumeComponent(profile, "WhiteBalance");
            HdrpReflection.SetParameter(whiteBalance, "temperature", 3f);
            HdrpReflection.SetParameter(whiteBalance, "tint", -2f);

            var shadowsMidHigh = HdrpReflection.AddVolumeComponent(profile, "ShadowsMidtonesHighlights");
            // Lift a touch of blue into the shadows, the way skylight actually fills them.
            HdrpReflection.SetParameter(shadowsMidHigh, "shadows", new Vector4(0.96f, 0.98f, 1.04f, 0f));
            HdrpReflection.SetParameter(shadowsMidHigh, "highlights", new Vector4(1.02f, 1.0f, 0.97f, 0f));

            var bloom = HdrpReflection.AddVolumeComponent(profile, "Bloom");
            HdrpReflection.SetParameter(bloom, "intensity", 0.12f);
            HdrpReflection.SetParameter(bloom, "scatter", 0.68f);
            HdrpReflection.SetParameter(bloom, "tint", new Color(1f, 0.98f, 0.94f));

            var vignette = HdrpReflection.AddVolumeComponent(profile, "Vignette");
            HdrpReflection.SetParameter(vignette, "intensity", 0.18f);
            HdrpReflection.SetParameter(vignette, "smoothness", 0.45f);

            var grain = HdrpReflection.AddVolumeComponent(profile, "FilmGrain");
            HdrpReflection.SetParameter(grain, "type", "Thin1");
            HdrpReflection.SetParameter(grain, "intensity", 0.10f);
            HdrpReflection.SetParameter(grain, "response", 0.85f);

            var aberration = HdrpReflection.AddVolumeComponent(profile, "ChromaticAberration");
            HdrpReflection.SetParameter(aberration, "intensity", 0.045f);

            var motionBlur = HdrpReflection.AddVolumeComponent(profile, "MotionBlur");
            HdrpReflection.SetParameter(motionBlur, "intensity", 0.28f);

            profile.isDirty = true;
            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return profile;
        }

        // ---------------------------------------------------------------- weather

        static void BuildWeather(GameObject root, bool rebuild)
        {
            var weather = root.GetComponent<KontoWeather>();
            if (weather == null) weather = root.AddComponent<KontoWeather>();

            Transform windT = root.transform.Find("Wind");
            GameObject windGo = windT != null ? windT.gameObject : new GameObject("Wind");
            windGo.transform.SetParent(root.transform, false);
            var wind = windGo.GetComponent<WindZone>();
            if (wind == null) wind = windGo.AddComponent<WindZone>();
            weather.windZone = wind;

            weather.EnsureRuntimeVolumes();
            weather.states = new List<KontoWeatherState>
            {
                MakeState(KontoWeatherType.Clear,      rebuild, 2.0f, 0.2f, 0f,    1.2f),
                MakeState(KontoWeatherType.Fair,       rebuild, 3.5f, 0.35f, 0f,   3.0f),
                MakeState(KontoWeatherType.Overcast,   rebuild, 5.0f, 0.5f, 0.15f, 1.6f),
                MakeState(KontoWeatherType.Rain,       rebuild, 7.0f, 0.7f, 0.85f, 1.2f),
                MakeState(KontoWeatherType.Storm,      rebuild, 16f,  1.0f, 1.0f,  0.25f),
                MakeState(KontoWeatherType.ValleyMist, rebuild, 1.2f, 0.15f, 0.3f, 0.6f),
            };
            weather.SetWeatherImmediate(KontoWeatherType.Fair);
        }

        static KontoWeatherState MakeState(KontoWeatherType type, bool rebuild, float windSpeed, float turbulence, float wetness, float likelihood)
        {
            var profile = LoadOrCreateProfile("Konto_Weather_" + type, rebuild);
            if (rebuild || profile.components.Count == 0) FillWeatherProfile(profile, type);

            return new KontoWeatherState
            {
                type = type,
                profile = profile,
                windSpeed = windSpeed,
                windTurbulence = turbulence,
                wetness = wetness,
                likelihood = likelihood,
            };
        }

        /// <summary>
        /// Each weather state only overrides what actually changes with the weather: the fog,
        /// the clouds and a little grading. Everything else keeps coming from the base profile.
        /// </summary>
        static void FillWeatherProfile(VolumeProfile profile, KontoWeatherType type)
        {
            var fog = HdrpReflection.AddVolumeComponent(profile, "Fog");
            var clouds = HdrpReflection.AddVolumeComponent(profile, "VolumetricClouds");
            var color = HdrpReflection.AddVolumeComponent(profile, "ColorAdjustments");

            HdrpReflection.SetParameter(fog, "enabled", true);
            HdrpReflection.SetParameter(clouds, "enable", true);
            HdrpReflection.SetParameter(clouds, "localClouds", false);

            switch (type)
            {
                case KontoWeatherType.Clear:
                    HdrpReflection.SetParameter(fog, "meanFreePath", 9000f);
                    HdrpReflection.SetParameter(fog, "maximumHeight", 700f);
                    HdrpReflection.SetParameter(fog, "anisotropy", 0.35f);
                    HdrpReflection.SetParameter(clouds, "cloudPreset", "Sparse");
                    HdrpReflection.SetParameter(clouds, "densityMultiplier", 0.25f);
                    HdrpReflection.SetParameter(color, "saturation", 6f);
                    HdrpReflection.SetParameter(color, "contrast", 10f);
                    break;

                case KontoWeatherType.Fair:
                    HdrpReflection.SetParameter(fog, "meanFreePath", 5200f);
                    HdrpReflection.SetParameter(fog, "maximumHeight", 850f);
                    HdrpReflection.SetParameter(clouds, "cloudPreset", "Cloudy");
                    HdrpReflection.SetParameter(color, "saturation", 4f);
                    break;

                case KontoWeatherType.Overcast:
                    HdrpReflection.SetParameter(fog, "meanFreePath", 2600f);
                    HdrpReflection.SetParameter(fog, "maximumHeight", 1400f);
                    HdrpReflection.SetParameter(fog, "anisotropy", 0.2f);
                    HdrpReflection.SetParameter(clouds, "cloudPreset", "Overcast");
                    HdrpReflection.SetParameter(clouds, "shadowOpacity", 0.25f);
                    HdrpReflection.SetParameter(color, "saturation", -12f);
                    HdrpReflection.SetParameter(color, "contrast", -6f);
                    break;

                case KontoWeatherType.Rain:
                    HdrpReflection.SetParameter(fog, "meanFreePath", 1200f);
                    HdrpReflection.SetParameter(fog, "maximumHeight", 1800f);
                    HdrpReflection.SetParameter(fog, "anisotropy", 0.1f);
                    HdrpReflection.SetParameter(fog, "multipleScatteringIntensity", 0.5f);
                    HdrpReflection.SetParameter(clouds, "cloudPreset", "Overcast");
                    HdrpReflection.SetParameter(clouds, "densityMultiplier", 0.9f);
                    HdrpReflection.SetParameter(color, "saturation", -18f);
                    HdrpReflection.SetParameter(color, "postExposure", -0.35f);
                    break;

                case KontoWeatherType.Storm:
                    HdrpReflection.SetParameter(fog, "meanFreePath", 650f);
                    HdrpReflection.SetParameter(fog, "maximumHeight", 2200f);
                    HdrpReflection.SetParameter(fog, "multipleScatteringIntensity", 0.65f);
                    HdrpReflection.SetParameter(clouds, "cloudPreset", "Stormy");
                    HdrpReflection.SetParameter(clouds, "densityMultiplier", 1f);
                    HdrpReflection.SetParameter(color, "saturation", -26f);
                    HdrpReflection.SetParameter(color, "postExposure", -0.8f);
                    break;

                case KontoWeatherType.ValleyMist:
                    // Clear above, thick below: the inversion that fills Japanese basins at dawn.
                    HdrpReflection.SetParameter(fog, "meanFreePath", 320f);
                    HdrpReflection.SetParameter(fog, "baseHeight", 0f);
                    HdrpReflection.SetParameter(fog, "maximumHeight", 260f);
                    HdrpReflection.SetParameter(fog, "anisotropy", 0.6f);
                    HdrpReflection.SetParameter(fog, "multipleScatteringIntensity", 0.55f);
                    HdrpReflection.SetParameter(clouds, "cloudPreset", "Sparse");
                    HdrpReflection.SetParameter(color, "saturation", -8f);
                    break;
            }

            profile.isDirty = true;
            EditorUtility.SetDirty(profile);
        }

        // ---------------------------------------------------------------- camera

        static void ConfigureMainCamera(KontoWorldSettings settings)
        {
            Camera cam = Camera.main;
            if (cam == null) return;

            cam.nearClipPlane = 0.25f;
            // Far enough to see the far side of the island from a summit.
            cam.farClipPlane = Mathf.Max(6000f, settings.WorldSize.magnitude * 1.1f);
            cam.fieldOfView = 60f;

            var camDataType = HdrpReflection.FindType("HDAdditionalCameraData");
            var camData = camDataType != null ? cam.GetComponent(camDataType) : null;
            if (camData != null)
            {
                HdrpReflection.SetMember(camData, "antialiasing", "TemporalAntialiasing");
                HdrpReflection.SetMember(camData, "taaQualityLevel", "High");
                HdrpReflection.SetMember(camData, "dithering", true);
                HdrpReflection.SetMember(camData, "stopNaNs", true);
            }
        }
    }
}
