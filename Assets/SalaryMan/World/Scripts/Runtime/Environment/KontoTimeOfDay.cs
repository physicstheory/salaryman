using UnityEngine;
using UnityEngine.Rendering;

namespace SalaryMan.World
{
    /// <summary>
    /// Drives the sun and moon from a real solar position model at Konto's latitude, which is
    /// the same as central Honshu. Because HDRP's Physically Based Sky derives the whole sky,
    /// the fog colour and the ambient light from the sun direction, getting this right is most
    /// of what makes the world look like a real place at a real time of day.
    /// </summary>
    [ExecuteAlways]
    [AddComponentMenu("SalaryMan/Konto Time Of Day")]
    public class KontoTimeOfDay : MonoBehaviour
    {
        [Header("Place")]
        [Tooltip("Degrees north. Central Honshu sits around 36; Konto uses the same.")]
        [Range(-90f, 90f)] public float latitude = 36.2f;
        [Range(-180f, 180f)] public float longitude = 138.6f;
        [Tooltip("Day of the year. 1 = 1 January, 172 = summer solstice, 266 = the clear light of late September.")]
        [Range(1, 365)] public int dayOfYear = 266;

        [Header("Time")]
        [Range(0f, 24f)] public float timeOfDay = 9.5f;
        public bool advanceTime = true;
        [Tooltip("Real seconds for one full in-game day.")]
        public float secondsPerDay = 1800f;

        [Header("Lights")]
        public Light sun;
        public Light moon;

        [Header("Sun response")]
        [Tooltip("Direct sunlight at midday, in lux. Clear midday sun is around 100000.")]
        public float middayIntensity = 105000f;
        [Tooltip("Direct sunlight when the sun is on the horizon, in lux.")]
        public float horizonIntensity = 420f;
        [Tooltip("Colour temperature of the sun at midday, in kelvin.")]
        public float middayTemperature = 6100f;
        [Tooltip("Colour temperature of the sun at sunrise and sunset, in kelvin.")]
        public float horizonTemperature = 2100f;
        [Tooltip("Full moon illumination, in lux. The real value is about 0.25.")]
        public float moonIntensity = 0.32f;
        public float moonTemperature = 4200f;

        [Header("Night grade (optional)")]
        [Tooltip("A volume whose weight is raised after dark. Use it for a cooler grade, higher fog and a different exposure.")]
        public Volume nightVolume;
        [Tooltip("Sun altitude in degrees at which the night volume reaches full weight.")]
        public float nightFullAltitude = -6f;
        public float nightStartAltitude = 8f;

        /// <summary>Sun altitude above the horizon in degrees. Negative at night.</summary>
        public float SunAltitude { get; private set; }
        /// <summary>Sun azimuth in degrees, clockwise from north.</summary>
        public float SunAzimuth { get; private set; }
        public bool IsDaytime { get { return SunAltitude > 0f; } }

        void OnEnable()
        {
            Apply();
        }

        void Update()
        {
            if (advanceTime && Application.isPlaying && secondsPerDay > 0.01f)
            {
                timeOfDay += Time.deltaTime * 24f / secondsPerDay;
                while (timeOfDay >= 24f) { timeOfDay -= 24f; dayOfYear = dayOfYear % 365 + 1; }
            }
            Apply();
        }

        void OnValidate()
        {
            Apply();
        }

        public void Apply()
        {
            ComputeSunPosition(out float altitude, out float azimuth);
            SunAltitude = altitude;
            SunAzimuth = azimuth;

            if (sun != null)
            {
                sun.transform.rotation = Quaternion.Euler(altitude, azimuth, 0f);

                // The low sun is dim and red not because the sun changed but because its light
                // is crossing far more atmosphere. Curve both together off the same altitude.
                float t = Mathf.Clamp01(Mathf.InverseLerp(-2f, 18f, altitude));
                float shaped = t * t * (3f - 2f * t);
                float lux = Mathf.Lerp(horizonIntensity, middayIntensity, Mathf.Pow(shaped, 0.75f));
                float kelvin = Mathf.Lerp(horizonTemperature, middayTemperature, Mathf.Pow(shaped, 0.55f));

                bool sunUp = altitude > -3f;
                if (sun.enabled != sunUp) sun.enabled = sunUp;
                sun.useColorTemperature = true;
                sun.colorTemperature = kelvin;
                sun.color = Color.white;
                HdrpReflection.SetPhysicalIntensity(sun, lux, "Lux");
            }

            if (moon != null)
            {
                // Keep the moon roughly opposite the sun; good enough for a game, and it means
                // there is always some light to read the landscape by at night.
                moon.transform.rotation = Quaternion.Euler(-altitude, azimuth + 180f, 0f);
                bool moonUp = altitude < 2f;
                if (moon.enabled != moonUp) moon.enabled = moonUp;
                moon.useColorTemperature = true;
                moon.colorTemperature = moonTemperature;
                float fade = Mathf.Clamp01(Mathf.InverseLerp(4f, -6f, altitude));
                HdrpReflection.SetPhysicalIntensity(moon, moonIntensity * fade, "Lux");
            }

            if (nightVolume != null)
            {
                nightVolume.weight = Mathf.Clamp01(Mathf.InverseLerp(nightStartAltitude, nightFullAltitude, altitude));
            }
        }

        /// <summary>
        /// Standard solar position: declination from the day of year, hour angle from local
        /// solar time, then altitude and azimuth from spherical trigonometry.
        /// </summary>
        public void ComputeSunPosition(out float altitudeDegrees, out float azimuthDegrees)
        {
            float declination = -23.44f * Mathf.Cos(2f * Mathf.PI / 365f * (dayOfYear + 10f));
            float declRad = declination * Mathf.Deg2Rad;
            float latRad = latitude * Mathf.Deg2Rad;

            // Equation of time, in minutes. Worth including: without it sunrise drifts by up to
            // a quarter of an hour across the year, which is visible if the clock is on screen.
            float b = 2f * Mathf.PI * (dayOfYear - 81f) / 364f;
            float equationOfTime = 9.87f * Mathf.Sin(2f * b) - 7.53f * Mathf.Cos(b) - 1.5f * Mathf.Sin(b);

            float solarTime = timeOfDay + equationOfTime / 60f;
            float hourAngle = (solarTime - 12f) * 15f * Mathf.Deg2Rad;

            float sinAlt = Mathf.Sin(latRad) * Mathf.Sin(declRad) + Mathf.Cos(latRad) * Mathf.Cos(declRad) * Mathf.Cos(hourAngle);
            sinAlt = Mathf.Clamp(sinAlt, -1f, 1f);
            float altitude = Mathf.Asin(sinAlt);

            float cosAz = (Mathf.Sin(declRad) - Mathf.Sin(altitude) * Mathf.Sin(latRad)) / Mathf.Max(1e-5f, Mathf.Cos(altitude) * Mathf.Cos(latRad));
            float azimuth = Mathf.Acos(Mathf.Clamp(cosAz, -1f, 1f)) * Mathf.Rad2Deg;
            if (hourAngle > 0f) azimuth = 360f - azimuth;

            altitudeDegrees = altitude * Mathf.Rad2Deg;
            azimuthDegrees = azimuth;
        }

        /// <summary>Jumps straight to a time of day. Handy for cinematics and for checking the lighting.</summary>
        public void SetTime(float hours)
        {
            timeOfDay = Mathf.Repeat(hours, 24f);
            Apply();
        }
    }
}
