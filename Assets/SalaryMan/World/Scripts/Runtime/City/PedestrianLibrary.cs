using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// The people on the pavement.
    ///
    /// A crowd is a different problem from a hero character. Seiko is one skinned mesh with a
    /// skeleton and clips, which is right for the one person the camera is always looking at and
    /// ruinous for the two hundred who are not. So a pedestrian is three rigid pieces — the body
    /// from the hips up, and a leg each — and the crowd system swings the legs and bobs the body
    /// by moving transforms. Three renderers, no skinning, no animator, and at the distance you
    /// ever see one it is indistinguishable from the expensive version.
    ///
    /// Each piece is built around the joint it turns about, so the crowd system only has to set
    /// a rotation: the legs have their origin at the hip, the body has its origin at the waist.
    ///
    /// Colour comes from tinting the two cloth slots per person through a property block, so a
    /// hundred pedestrians are still four materials.
    /// </summary>
    public static class PedestrianLibrary
    {
        public enum PersonKind
        {
            Salaryman = 0,  // dark suit, white shirt, briefcase: the whole premise of the game
            OfficeLady,     // blouse and skirt, tote bag
            Student,        // school uniform, satchel on the back
            Casual,         // jacket and jeans
            Elder,          // muted, stooped, slower
            Worker,         // hi-vis over overalls, hard hat

            Count
        }

        public struct Person
        {
            public PersonKind kind;
            public float height;        // metres, sole to crown
            public float hipHeight;     // where the legs hinge
            public float pace;          // metres per second
            public Color top, bottom;   // the two cloth tints
        }

        /// <summary>The mix on a Tokonto pavement at about six in the evening.</summary>
        static readonly float[] Mix = { 0.34f, 0.20f, 0.12f, 0.20f, 0.09f, 0.05f };

        public static PersonKind Pick(float r)
        {
            float t = r;
            for (int i = 0; i < Mix.Length; i++)
            {
                t -= Mix[i];
                if (t <= 0f) return (PersonKind)i;
            }
            return PersonKind.Salaryman;
        }

        public static Person Describe(int seed)
        {
            float r0 = KontoNoise.White(seed, 3, 5);
            float r1 = KontoNoise.White(seed, 7, 11);
            float r2 = KontoNoise.White(seed, 13, 17);
            var kind = Pick(r0);

            var p = new Person { kind = kind };
            switch (kind)
            {
                case PersonKind.OfficeLady: p.height = Mathf.Lerp(1.52f, 1.66f, r1); p.pace = Mathf.Lerp(1.25f, 1.50f, r2); break;
                case PersonKind.Student:    p.height = Mathf.Lerp(1.50f, 1.72f, r1); p.pace = Mathf.Lerp(1.30f, 1.65f, r2); break;
                case PersonKind.Elder:      p.height = Mathf.Lerp(1.45f, 1.60f, r1); p.pace = Mathf.Lerp(0.75f, 1.00f, r2); break;
                case PersonKind.Worker:     p.height = Mathf.Lerp(1.62f, 1.76f, r1); p.pace = Mathf.Lerp(1.15f, 1.40f, r2); break;
                default:                    p.height = Mathf.Lerp(1.62f, 1.80f, r1); p.pace = Mathf.Lerp(1.35f, 1.65f, r2); break;
            }
            p.hipHeight = p.height * 0.50f;

            // Japanese street clothing is mostly dark, and a crowd that is all primary colours
            // looks wrong immediately, so the bright end of the palette is rare on purpose.
            float c1 = KontoNoise.White(seed, 23, 29), c2 = KontoNoise.White(seed, 31, 37);
            switch (kind)
            {
                case PersonKind.Salaryman:
                    p.top = Grey(0.10f, 0.22f, c1);
                    p.bottom = Grey(0.08f, 0.18f, c2);
                    break;
                case PersonKind.OfficeLady:
                    p.top = c1 < 0.55f ? Grey(0.62f, 0.88f, c1) : Muted(c1, 0.32f);
                    p.bottom = Grey(0.10f, 0.30f, c2);
                    break;
                case PersonKind.Student:
                    p.top = c1 < 0.5f ? Grey(0.72f, 0.92f, c1) : new Color(0.10f, 0.13f, 0.26f);
                    p.bottom = new Color(0.09f, 0.11f, 0.22f);
                    break;
                case PersonKind.Elder:
                    p.top = Grey(0.28f, 0.52f, c1);
                    p.bottom = Grey(0.20f, 0.40f, c2);
                    break;
                case PersonKind.Worker:
                    p.top = c1 < 0.6f ? new Color(0.86f, 0.42f, 0.08f) : new Color(0.55f, 0.72f, 0.22f);
                    p.bottom = new Color(0.22f, 0.26f, 0.34f);
                    break;
                default:
                    p.top = c1 < 0.62f ? Grey(0.14f, 0.55f, c1) : Muted(c1, 0.40f);
                    p.bottom = c2 < 0.7f ? new Color(0.17f, 0.21f, 0.32f) : Grey(0.12f, 0.35f, c2);
                    break;
            }
            return p;
        }

        static Color Grey(float lo, float hi, float t)
        {
            float v = Mathf.Lerp(lo, hi, t);
            return new Color(v, v * 0.99f, v * 0.97f);
        }

        static Color Muted(float t, float sat)
        {
            // A colour, but a coat's worth of it, not a highlighter's.
            float h = t * 6.2831853f;
            return new Color(
                Mathf.Clamp01(0.34f + Mathf.Cos(h) * sat),
                Mathf.Clamp01(0.32f + Mathf.Cos(h - 2.09f) * sat),
                Mathf.Clamp01(0.36f + Mathf.Cos(h + 2.09f) * sat));
        }

        // ------------------------------------------------------------------ geometry

        /// <summary>
        /// Builds the three pieces. <paramref name="body"/> has its origin at the hip, so the
        /// crowd system can bob and lean it; each leg has its origin at its own hip joint and
        /// hangs downwards, so setting a rotation swings it.
        /// </summary>
        public static void Build(in Person p, int seed, BuildingMesh body, BuildingMesh legL, BuildingMesh legR)
        {
            float H = p.height, hip = p.hipHeight;
            float shoulderW = H * (p.kind == PersonKind.OfficeLady || p.kind == PersonKind.Student ? 0.20f : 0.235f);
            float depth = H * 0.115f;
            float r = KontoNoise.White(seed, 41, 43);

            // ---- body, from the hip up. Local y = 0 is the hip.
            float torso = H * 0.30f;
            bool skirt = p.kind == PersonKind.OfficeLady && r < 0.6f;

            if (skirt)
            {
                // The skirt hangs below the hip and belongs to the body, not the legs.
                body.AddTaperedBox(Vector2.zero, new Vector2(shoulderW * 0.95f, depth * 1.05f),
                    new Vector2(shoulderW * 0.72f, depth * 0.88f), 0f, -H * 0.16f, H * 0.16f,
                    CitySurface.ClothBottom);
            }

            // Hips into chest: a tapered box, wider at the shoulders.
            body.AddTaperedBox(Vector2.zero, new Vector2(shoulderW * 0.78f, depth),
                new Vector2(shoulderW, depth * 1.02f), 0f, 0f, torso, CitySurface.ClothTop);

            // Arms, hanging, slightly out. They do not move: at the distance a pedestrian is
            // ever seen, legs carry the walk and arms carry nothing.
            float armLen = H * 0.42f, armW = H * 0.052f;
            for (int s = -1; s <= 1; s += 2)
            {
                float ax = s * (shoulderW * 0.5f + armW * 0.42f);
                body.AddTaperedBox(new Vector2(ax, 0f), new Vector2(armW, armW),
                    new Vector2(armW * 0.86f, armW * 0.86f), 0f, torso - armLen, armLen,
                    CitySurface.ClothTop);
                // Hands.
                body.AddBox(new Vector2(ax, 0f), new Vector2(armW * 0.9f, armW * 0.9f), 0f,
                    torso - armLen - H * 0.035f, H * 0.035f, CitySurface.Skin, 1f);
            }

            // Neck, head, hair.
            float headH = H * 0.13f, headW = H * 0.088f;
            body.AddBox(Vector2.zero, new Vector2(headW * 0.5f, headW * 0.5f), 0f, torso, H * 0.022f,
                CitySurface.Skin, 1f);
            body.AddBox(Vector2.zero, new Vector2(headW, headW * 0.92f), 0f, torso + H * 0.022f, headH,
                CitySurface.Skin, 1f);
            // A cap of hair, and a fringe at the front.
            body.AddBox(Vector2.zero, new Vector2(headW * 1.05f, headW * 0.97f), 0f,
                torso + H * 0.022f + headH * 0.52f, headH * 0.52f, CitySurface.Hair, 1f);
            body.AddBox(new Vector2(0f, headW * 0.44f), new Vector2(headW * 1.02f, headW * 0.12f), 0f,
                torso + H * 0.022f + headH * 0.34f, headH * 0.22f, CitySurface.Hair, 1f);
            if (p.kind == PersonKind.OfficeLady && r > 0.45f)
                body.AddTaperedBox(new Vector2(0f, -headW * 0.42f), new Vector2(headW * 0.8f, headW * 0.5f),
                    new Vector2(headW * 0.55f, headW * 0.35f), 0f, torso - headH * 0.25f, headH * 0.8f,
                    CitySurface.Hair);
            if (p.kind == PersonKind.Worker)
                body.AddTaperedBox(Vector2.zero, new Vector2(headW * 1.18f, headW * 1.1f),
                    new Vector2(headW * 0.7f, headW * 0.66f), 0f, torso + H * 0.022f + headH * 0.62f,
                    headH * 0.42f, CitySurface.ClothTop);

            // What they are carrying. Everybody in Tokonto is carrying something.
            switch (p.kind)
            {
                case PersonKind.Salaryman:
                    // A briefcase, hanging at the right hand.
                    body.AddBox(new Vector2(shoulderW * 0.62f, 0f), new Vector2(H * 0.03f, H * 0.16f), 0f,
                        torso - armLen - H * 0.20f, H * 0.16f, CitySurface.ClothBottom, 1f);
                    break;
                case PersonKind.OfficeLady:
                    body.AddBox(new Vector2(shoulderW * 0.56f, -depth * 0.3f), new Vector2(H * 0.05f, H * 0.11f),
                        0f, torso - armLen + H * 0.04f, H * 0.14f, CitySurface.ClothBottom, 1f);
                    break;
                case PersonKind.Student:
                    // A satchel on the back.
                    body.AddBox(new Vector2(0f, -depth * 0.78f), new Vector2(shoulderW * 0.72f, depth * 0.5f),
                        0f, torso * 0.34f, torso * 0.46f, CitySurface.ClothBottom, 1f);
                    break;
            }

            // ---- legs, each about its own hip joint, hanging down to y = -hip.
            float legW = H * 0.062f;
            for (int s = -1; s <= 1; s += 2)
            {
                var into = s < 0 ? legL : legR;
                float lx = s * legW * 0.62f;
                if (skirt)
                {
                    // Bare leg below the hem.
                    into.AddTaperedBox(new Vector2(lx, 0f), new Vector2(legW * 0.82f, legW * 0.82f),
                        new Vector2(legW * 0.62f, legW * 0.62f), 0f, -hip + H * 0.04f, hip - H * 0.20f,
                        CitySurface.Skin);
                }
                else
                {
                    into.AddTaperedBox(new Vector2(lx, 0f), new Vector2(legW, legW * 1.04f),
                        new Vector2(legW * 0.74f, legW * 0.80f), 0f, -hip + H * 0.035f, hip - H * 0.035f,
                        CitySurface.ClothBottom);
                }
                // Shoe: a little longer than it is wide, pointing forward.
                into.AddBox(new Vector2(lx, H * 0.012f), new Vector2(legW * 0.92f, H * 0.075f), 0f,
                    -hip, H * 0.035f, CitySurface.ClothBottom, 1f);
            }
        }
    }
}
