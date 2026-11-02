using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// One ward's street grid, as a closed form. Both the planner and the grading pass build it
    /// from the same ward and the same seed, so the tarmac always lands exactly between the
    /// blocks with no rounding to go wrong between the two.
    ///
    /// In the dense wards alleys alternate with streets. That fine grain - a proper street, then
    /// a two metre gap between buildings, then another street - is most of what makes a Japanese
    /// city feel different to an American grid.
    /// </summary>
    public struct CityWardGrid
    {
        public Vector2 Origin;
        public float Yaw;
        public float Sx, Sy;
        public float StreetWidth;
        public float AlleyWidth;
        public bool Alleys;

        public static CityWardGrid For(CityWard ward, int wardIndex, int citySeed)
        {
            var profile = DistrictProfiles.Get(ward.kind);
            float r1 = KontoNoise.White(citySeed + 7717, wardIndex * 17 + 1, 3);
            float r2 = KontoNoise.White(citySeed + 7717, wardIndex * 17 + 2, 5);

            bool alleys = ward.kind == DistrictKind.Retail || ward.kind == DistrictKind.Nightlife
                       || ward.kind == DistrictKind.Residential || ward.kind == DistrictKind.StationFront
                       || ward.kind == DistrictKind.Apartments;

            return new CityWardGrid
            {
                Origin = ward.center,
                Yaw = ward.gridAngle,
                Sx = Mathf.Lerp(profile.blockSpacingMin, profile.blockSpacingMax, r1),
                Sy = Mathf.Lerp(profile.blockSpacingMin, profile.blockSpacingMax, r2),
                StreetWidth = profile.streetWidth,
                AlleyWidth = Mathf.Max(3.6f, profile.streetWidth * 0.45f),
                Alleys = alleys,
            };
        }

        public float LineWidth(int index)
        {
            if (!Alleys) return StreetWidth;
            return (index & 1) == 0 ? StreetWidth : AlleyWidth;
        }

        /// <summary>Centre and size of block (i, j), in world space.</summary>
        public void Block(int i, int j, out Vector2 center, out Vector2 size)
        {
            float w0 = LineWidth(i) * 0.5f;
            float w1 = LineWidth(i + 1) * 0.5f;
            float h0 = LineWidth(j) * 0.5f;
            float h1 = LineWidth(j + 1) * 0.5f;

            float x0 = i * Sx + w0;
            float x1 = (i + 1) * Sx - w1;
            float y0 = j * Sy + h0;
            float y1 = (j + 1) * Sy - h1;

            size = new Vector2(x1 - x0, y1 - y0);
            center = CityGeom.FromRectLocal(new Vector2((x0 + x1) * 0.5f, (y0 + y1) * 0.5f), Origin, Yaw);
        }

        /// <summary>
        /// Distance from a world point to the nearest street centre line, and that line's width.
        /// The grading pass lays the carriageway and its footways from this.
        /// </summary>
        public void NearestLine(Vector2 world, out float distance, out float width, out bool alley)
        {
            Vector2 g = CityGeom.ToRectLocal(world, Origin, Yaw);
            int i = Mathf.RoundToInt(g.x / Sx);
            int j = Mathf.RoundToInt(g.y / Sy);
            float dx = Mathf.Abs(g.x - i * Sx);
            float dy = Mathf.Abs(g.y - j * Sy);
            float wx = LineWidth(i);
            float wy = LineWidth(j);

            // Whichever line is nearest as a fraction of its own width, so at a junction the
            // wide street wins and the alley runs into it.
            if (dx / Mathf.Max(1f, wx) <= dy / Mathf.Max(1f, wy))
            {
                distance = dx;
                width = wx;
                alley = Alleys && (i & 1) != 0;
            }
            else
            {
                distance = dy;
                width = wy;
                alley = Alleys && (j & 1) != 0;
            }
        }
    }
}
