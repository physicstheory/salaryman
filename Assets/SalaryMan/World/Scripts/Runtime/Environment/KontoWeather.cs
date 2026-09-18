using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SalaryMan.World
{
    public enum KontoWeatherType
    {
        Clear,          // the dry, brilliant Pacific side winter
        Fair,           // scattered cumulus, the default
        Overcast,       // flat grey ceiling
        Rain,           // steady rain, low cloud, washed out colour
        Storm,          // typhoon fringe: hard wind, dark cloud, sheeting rain
        ValleyMist,     // dawn mist pooled in the basins, clear above
    }

    [Serializable]
    public class KontoWeatherState
    {
        public KontoWeatherType type = KontoWeatherType.Fair;
        [Tooltip("Volume profile holding the sky, cloud, fog and grading for this weather.")]
        public VolumeProfile profile;
        [Tooltip("Particle system prefab for rain or snow. Left empty for dry weather.")]
        public GameObject precipitationPrefab;
        public float windSpeed = 3.5f;
        public float windTurbulence = 0.4f;
        [Range(0f, 1f)] public float wetness = 0f;
        [Tooltip("Relative probability of this weather being picked when the weather changes on its own.")]
        public float likelihood = 1f;
    }

    /// <summary>
    /// Crossfades between weather states by blending two volumes. Konto's weather follows
    /// Honshu's: long clear spells on the ocean side, low cloud and rain against the mountains,
    /// mist that pools in the basins before dawn, and typhoons off the south in late summer.
    /// </summary>
    [ExecuteAlways]
    [AddComponentMenu("SalaryMan/Konto Weather")]
    public class KontoWeather : MonoBehaviour
    {
        [Header("Blend volumes")]
        [Tooltip("Two global volumes the weather crossfades between. Both are created automatically if left empty.")]
        public Volume volumeA;
        public Volume volumeB;
        [Tooltip("Priority for the weather volumes. Must sit above your base environment volume.")]
        public float volumePriority = 10f;

        [Header("States")]
        public List<KontoWeatherState> states = new List<KontoWeatherState>();

        [Header("Transition")]
        public float transitionSeconds = 25f;
        public bool changeAutomatically = false;
        public Vector2 secondsBetweenChanges = new Vector2(180f, 600f);

        [Header("Wind")]
        public WindZone windZone;
        [Tooltip("Prevailing wind direction in degrees, clockwise from north. Konto's winter monsoon comes out of the north west.")]
        public float prevailingWindDirection = 315f;

        [Header("Runtime state, read only")]
        [SerializeField] KontoWeatherType current = KontoWeatherType.Fair;
        [SerializeField, Range(0f, 1f)] float blend = 1f;

        KontoWeatherState _from;
        KontoWeatherState _to;
        float _blendSpeed;
        float _nextChangeTime;
        GameObject _activePrecipitation;

        public KontoWeatherType Current { get { return current; } }
        /// <summary>0 = dry, 1 = soaked. Drive puddles, surface smoothness and audio from this.</summary>
        public float Wetness { get; private set; }

        void OnEnable()
        {
            _to = Find(current);
            _from = _to;
            blend = 1f;
            // Deliberately does not create the blend volumes here: OnEnable can run while the
            // scene is still loading, and creating GameObjects at that point is an error.
            if (volumeA != null && volumeB != null) ApplyImmediate();
        }

        void Update()
        {
            if (_to == null) _to = Find(current);
            if (_to == null) return;

            if (volumeA == null || volumeB == null)
            {
                if (!Application.isPlaying && !gameObject.scene.isLoaded) return;
                EnsureRuntimeVolumes();
                ApplyImmediate();
            }

            if (blend < 1f)
            {
                blend = Mathf.Clamp01(blend + Time.deltaTime * _blendSpeed);
                ApplyBlend();
            }

            if (Application.isPlaying && changeAutomatically && Time.time >= _nextChangeTime)
            {
                SetWeather(PickRandomWeather());
                ScheduleNextChange();
            }
        }

        /// <summary>Creates the two crossfade volumes if they are missing. Safe to call from editor tooling.</summary>
        public void EnsureRuntimeVolumes()
        {
            if (volumeA == null) volumeA = CreateChildVolume("Weather Volume A");
            if (volumeB == null) volumeB = CreateChildVolume("Weather Volume B");
            volumeA.priority = volumePriority;
            volumeB.priority = volumePriority + 0.1f;
        }

        Volume CreateChildVolume(string childName)
        {
            var existing = transform.Find(childName);
            GameObject go = existing != null ? existing.gameObject : new GameObject(childName);
            go.transform.SetParent(transform, false);
            var v = go.GetComponent<Volume>();
            if (v == null) v = go.AddComponent<Volume>();
            v.isGlobal = true;
            v.weight = 0f;
            return v;
        }

        KontoWeatherState Find(KontoWeatherType type)
        {
            for (int i = 0; i < states.Count; i++)
                if (states[i] != null && states[i].type == type) return states[i];
            return states.Count > 0 ? states[0] : null;
        }

        /// <summary>Starts a crossfade to another weather state.</summary>
        public void SetWeather(KontoWeatherType type, float seconds = -1f)
        {
            var target = Find(type);
            if (target == null || target == _to) return;

            _from = _to;
            _to = target;
            current = type;
            blend = 0f;
            float duration = seconds > 0f ? seconds : transitionSeconds;
            _blendSpeed = 1f / Mathf.Max(0.05f, duration);

            EnsureRuntimeVolumes();
            volumeA.profile = _from != null ? _from.profile : null;
            volumeB.profile = _to.profile;
            SwapPrecipitation(_to);
            ApplyBlend();
        }

        public void SetWeatherImmediate(KontoWeatherType type)
        {
            SetWeather(type, 0.01f);
            blend = 1f;
            ApplyImmediate();
        }

        void ApplyImmediate()
        {
            EnsureRuntimeVolumes();
            if (_to == null) return;
            volumeA.profile = _to.profile;
            volumeB.profile = _to.profile;
            SwapPrecipitation(_to);
            ApplyBlend();
        }

        void ApplyBlend()
        {
            if (_to == null) return;
            float t = Mathf.Clamp01(blend);

            // A over B: A holds the old weather and fades out under B.
            if (volumeA != null) volumeA.weight = 1f;
            if (volumeB != null) volumeB.weight = t;

            float fromWind = _from != null ? _from.windSpeed : _to.windSpeed;
            float fromTurb = _from != null ? _from.windTurbulence : _to.windTurbulence;
            float fromWet = _from != null ? _from.wetness : _to.wetness;

            Wetness = Mathf.Lerp(fromWet, _to.wetness, t);

            if (windZone != null)
            {
                windZone.mode = WindZoneMode.Directional;
                windZone.windMain = Mathf.Lerp(fromWind, _to.windSpeed, t);
                windZone.windTurbulence = Mathf.Lerp(fromTurb, _to.windTurbulence, t);
                windZone.windPulseMagnitude = 0.6f;
                windZone.windPulseFrequency = 0.12f;
                windZone.transform.rotation = Quaternion.Euler(0f, prevailingWindDirection, 0f);
            }

            // Anything in the project can read these to react to the weather.
            Shader.SetGlobalFloat("_KontoWetness", Wetness);
            Shader.SetGlobalFloat("_KontoWindSpeed", windZone != null ? windZone.windMain : 0f);
        }

        void SwapPrecipitation(KontoWeatherState state)
        {
            if (_activePrecipitation != null)
            {
                if (Application.isPlaying) Destroy(_activePrecipitation);
                else DestroyImmediate(_activePrecipitation);
                _activePrecipitation = null;
            }
            if (state == null || state.precipitationPrefab == null) return;

            _activePrecipitation = Instantiate(state.precipitationPrefab, transform);
            _activePrecipitation.name = state.precipitationPrefab.name + " (active)";
        }

        KontoWeatherType PickRandomWeather()
        {
            float total = 0f;
            for (int i = 0; i < states.Count; i++) if (states[i] != null) total += Mathf.Max(0f, states[i].likelihood);
            if (total <= 0f) return current;

            float pick = UnityEngine.Random.value * total;
            for (int i = 0; i < states.Count; i++)
            {
                if (states[i] == null) continue;
                pick -= Mathf.Max(0f, states[i].likelihood);
                if (pick <= 0f) return states[i].type;
            }
            return current;
        }

        void ScheduleNextChange()
        {
            _nextChangeTime = Time.time + UnityEngine.Random.Range(secondsBetweenChanges.x, secondsBetweenChanges.y);
        }
    }
}
