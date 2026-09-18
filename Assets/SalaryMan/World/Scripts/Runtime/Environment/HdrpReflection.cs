using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using UnityEngine.Rendering;

namespace SalaryMan.World
{
    /// <summary>
    /// Thin reflection layer over HDRP.
    ///
    /// HDRP renames and moves volume parameters between versions, and a direct reference to a
    /// field that no longer exists is a hard compile error that takes the whole project down.
    /// Everything HDRP specific therefore goes through here: if a parameter is missing on your
    /// HDRP version the call is skipped and logged instead of breaking the build.
    /// </summary>
    public static class HdrpReflection
    {
        const string HdrpNamespace = "UnityEngine.Rendering.HighDefinition.";
        static readonly Dictionary<string, Type> TypeCache = new Dictionary<string, Type>();

        public static bool VerboseLogging = false;

        /// <summary>Finds a type by name, with or without its namespace, across all loaded assemblies.</summary>
        public static Type FindType(string name)
        {
            Type cached;
            if (TypeCache.TryGetValue(name, out cached)) return cached;

            string full = name.Contains(".") ? name : HdrpNamespace + name;
            Type found = Type.GetType(full);
            if (found == null)
            {
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    found = asm.GetType(full);
                    if (found != null) break;
                }
            }
            TypeCache[name] = found;
            return found;
        }

        public static bool IsHdrpAvailable
        {
            get { return FindType("HDRenderPipelineAsset") != null; }
        }

        // ---------------------------------------------------------------- volumes

        /// <summary>Adds (or fetches) a volume component on a profile by type name.</summary>
        public static VolumeComponent AddVolumeComponent(VolumeProfile profile, string typeName)
        {
            if (profile == null) return null;
            Type t = FindType(typeName);
            if (t == null)
            {
                Warn("Volume component type '" + typeName + "' not found on this HDRP version.");
                return null;
            }

            VolumeComponent existing;
            if (profile.TryGet(t, out existing) && existing != null) return existing;
            return profile.Add(t, false);
        }

        /// <summary>
        /// Sets a volume parameter and turns its override on. Handles the whole VolumeParameter
        /// family, including the clamped, min, int, enum, colour and texture variants.
        /// </summary>
        public static bool SetParameter(VolumeComponent component, string parameterName, object value, bool overrideState = true)
        {
            if (component == null) return false;

            FieldInfo field = component.GetType().GetField(parameterName, BindingFlags.Public | BindingFlags.Instance | BindingFlags.FlattenHierarchy);
            if (field == null)
            {
                Warn(component.GetType().Name + " has no parameter '" + parameterName + "' on this HDRP version.");
                return false;
            }

            var parameter = field.GetValue(component) as VolumeParameter;
            if (parameter == null) return false;

            PropertyInfo valueProp = null;
            try
            {
                valueProp = field.FieldType.GetProperty("value", BindingFlags.Public | BindingFlags.Instance | BindingFlags.FlattenHierarchy);
            }
            catch (AmbiguousMatchException)
            {
                // A parameter type that shadows 'value' rather than overriding it. Take the
                // declaration on the most derived type.
                for (Type t = field.FieldType; t != null && valueProp == null; t = t.BaseType)
                    valueProp = t.GetProperty("value", BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
            }

            if (valueProp == null || !valueProp.CanWrite)
            {
                Warn("Parameter '" + parameterName + "' on " + component.GetType().Name + " is not writable.");
                return false;
            }

            try
            {
                object converted = Convert(value, valueProp.PropertyType);
                valueProp.SetValue(parameter, converted, null);
                parameter.overrideState = overrideState;
                return true;
            }
            catch (Exception e)
            {
                Warn("Could not set '" + parameterName + "' on " + component.GetType().Name + ": " + e.Message);
                return false;
            }
        }

        static object Convert(object value, Type target)
        {
            if (value == null) return null;
            if (target.IsInstanceOfType(value)) return value;

            if (target.IsEnum)
            {
                if (value is string) return Enum.Parse(target, (string)value, true);
                return Enum.ToObject(target, System.Convert.ToInt32(value));
            }
            if (target == typeof(float)) return System.Convert.ToSingle(value);
            if (target == typeof(int)) return System.Convert.ToInt32(value);
            if (target == typeof(bool)) return System.Convert.ToBoolean(value);
            return System.Convert.ChangeType(value, target);
        }

        /// <summary>Sets the sky to Physically Based Sky, using HDRP's own id lookup where possible.</summary>
        public static bool SetPhysicallyBasedSky(VolumeComponent visualEnvironment)
        {
            if (visualEnvironment == null) return false;
            Type skySettings = FindType("SkySettings");
            Type pbSky = FindType("PhysicallyBasedSky");
            if (skySettings == null || pbSky == null) return false;

            int id = 0;
            MethodInfo getId = null;
            foreach (var m in skySettings.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (m.Name != "GetUniqueID") continue;
                var ps = m.GetParameters();
                if (ps.Length == 1 && ps[0].ParameterType == typeof(Type)) { getId = m; break; }
                if (m.IsGenericMethodDefinition && ps.Length == 0) { getId = m.MakeGenericMethod(pbSky); break; }
            }

            if (getId != null)
            {
                object result = getId.IsGenericMethod
                    ? getId.Invoke(null, null)
                    : getId.Invoke(null, new object[] { pbSky });
                id = System.Convert.ToInt32(result);
            }

            if (id == 0) id = pbSky.Name.GetHashCode();
            return SetParameter(visualEnvironment, "skyType", id);
        }

        // ---------------------------------------------------------------- lights

        /// <summary>
        /// Sets a light's intensity in physical units. HDRP is a physically based renderer, so
        /// a directional light wants lux, not the arbitrary 0..8 of the built in pipeline:
        /// roughly 100000 lux for midday sun, 400 at sunrise, 0.3 for a full moon.
        /// </summary>
        public static bool SetPhysicalIntensity(Light light, float value, string unitName = "Lux")
        {
            if (light == null) return false;
            Type hdLightType = FindType("HDAdditionalLightData");
            if (hdLightType == null)
            {
                light.intensity = value;
                return false;
            }

            var data = light.GetComponent(hdLightType);
            if (data == null)
            {
                // These setters run from OnValidate, where adding a component is not allowed.
                // EnsureLightData covers creation; here we just fall back.
                light.intensity = value;
                return false;
            }

            Type unitType = FindType("LightUnit");
            MethodInfo setIntensity = null;
            if (unitType != null)
            {
                setIntensity = hdLightType.GetMethod("SetIntensity", new[] { typeof(float), unitType });
            }

            if (setIntensity != null)
            {
                object unit = Enum.Parse(unitType, unitName, true);
                setIntensity.Invoke(data, new object[] { value, unit });
                return true;
            }

            PropertyInfo intensityProp = hdLightType.GetProperty("intensity");
            if (intensityProp != null && intensityProp.CanWrite)
            {
                intensityProp.SetValue(data, value, null);
                return true;
            }

            light.intensity = value;
            return false;
        }

        /// <summary>
        /// Makes sure a light carries HDRP's extra light data. Call this when creating lights from
        /// editor tooling; never from OnValidate, where Unity refuses component creation.
        /// </summary>
        public static bool EnsureLightData(Light light)
        {
            if (light == null) return false;
            Type hdLightType = FindType("HDAdditionalLightData");
            if (hdLightType == null) return false;
            if (light.GetComponent(hdLightType) != null) return true;
            return light.gameObject.AddComponent(hdLightType) != null;
        }

        /// <summary>Sets a property or field on the HDAdditionalLightData of a light.</summary>
        public static bool SetLightProperty(Light light, string memberName, object value)
        {
            if (light == null) return false;
            Type hdLightType = FindType("HDAdditionalLightData");
            if (hdLightType == null) return false;
            var data = light.GetComponent(hdLightType);
            if (data == null) return false;

            PropertyInfo prop = hdLightType.GetProperty(memberName, BindingFlags.Public | BindingFlags.Instance);
            if (prop != null && prop.CanWrite)
            {
                try { prop.SetValue(data, Convert(value, prop.PropertyType), null); return true; }
                catch (Exception e) { Warn("Light property '" + memberName + "': " + e.Message); return false; }
            }

            FieldInfo field = hdLightType.GetField(memberName, BindingFlags.Public | BindingFlags.Instance);
            if (field != null)
            {
                try { field.SetValue(data, Convert(value, field.FieldType)); return true; }
                catch (Exception e) { Warn("Light field '" + memberName + "': " + e.Message); return false; }
            }

            Warn("HDAdditionalLightData has no member '" + memberName + "'.");
            return false;
        }

        /// <summary>Generic component member setter, used for the water surface and anything else version sensitive.</summary>
        public static bool SetMember(object target, string memberName, object value)
        {
            if (target == null) return false;
            Type t = target.GetType();

            PropertyInfo prop = t.GetProperty(memberName, BindingFlags.Public | BindingFlags.Instance);
            if (prop != null && prop.CanWrite)
            {
                try { prop.SetValue(target, Convert(value, prop.PropertyType), null); return true; }
                catch (Exception e) { Warn(t.Name + "." + memberName + ": " + e.Message); return false; }
            }

            FieldInfo field = t.GetField(memberName, BindingFlags.Public | BindingFlags.Instance);
            if (field != null)
            {
                try { field.SetValue(target, Convert(value, field.FieldType)); return true; }
                catch (Exception e) { Warn(t.Name + "." + memberName + ": " + e.Message); return false; }
            }

            Warn(t.Name + " has no member '" + memberName + "' on this HDRP version.");
            return false;
        }

        static void Warn(string message)
        {
            if (VerboseLogging) Debug.LogWarning("[Konto HDRP] " + message);
        }
    }
}
