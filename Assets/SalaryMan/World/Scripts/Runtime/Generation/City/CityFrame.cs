using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A city's own coordinate frame: x runs along the coast, y runs inland. Every part of the
    /// city plan is laid out in these coordinates, so the whole thing can be moved to another
    /// point on the island by changing two numbers in the site spec.
    /// </summary>
    public struct CityFrame
    {
        public Vector2 Origin;      // world position of the site anchor
        public Vector2 Along;       // unit vector along the coast
        public Vector2 Inland;      // unit vector pointing away from the sea, toward the island axis
        /// <summary>Signed lateral position of the anchor relative to the island axis, in metres.</summary>
        public float AnchorLateral;
        /// <summary>Position of the anchor along the arc, 0..1.</summary>
        public float AnchorT;
        /// <summary>Island half width at the anchor, in metres.</summary>
        public float HalfWidth;

        public static CityFrame Build(IslandArc arc, UrbanSiteSpec site)
        {
            var frame = new CityFrame();
            frame.AnchorT = Mathf.Clamp01(site.alongT);
            frame.HalfWidth = arc.HalfWidthAt(frame.AnchorT);
            frame.AnchorLateral = site.lateral * frame.HalfWidth;
            frame.Origin = arc.AnchorToWorld(frame.AnchorT, site.lateral);
            frame.Along = arc.TangentAt(frame.AnchorT);
            Vector2 normal = arc.NormalAt(frame.AnchorT);
            // The normal points to the ocean side. Inland is whichever way the island axis lies.
            frame.Inland = site.lateral >= 0f ? -normal : normal;
            return frame;
        }

        public Vector2 ToWorld(Vector2 local)
        {
            return Origin + Along * local.x + Inland * local.y;
        }

        public Vector2 ToWorld(float along, float inland)
        {
            return Origin + Along * along + Inland * inland;
        }

        public Vector2 ToLocal(Vector2 world)
        {
            Vector2 d = world - Origin;
            return new Vector2(Vector2.Dot(d, Along), Vector2.Dot(d, Inland));
        }

        /// <summary>
        /// Local coordinates worked out from an arc projection instead of from the straight
        /// frame. Used during the landmass pass, where every cell already knows where it sits
        /// on the arc, and it keeps the bay bending with the coast.
        /// </summary>
        public Vector2 ArcLocal(float arcT, float signedLateral, float arcLength)
        {
            float along = (arcT - AnchorT) * arcLength;
            float inland = AnchorLateral >= 0f ? AnchorLateral - signedLateral : signedLateral - AnchorLateral;
            return new Vector2(along, inland);
        }
    }
}
