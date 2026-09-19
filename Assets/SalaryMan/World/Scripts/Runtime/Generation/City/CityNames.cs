using System.Collections.Generic;
using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Ward and station names. Invented, but built the way Japanese place names are built, so
    /// they read as a real city: a feature or a direction, then a suffix that says what kind of
    /// ground it is. -dai and -yama are hills, -hama and -ura are shore, -bashi is a bridge,
    /// -machi and -cho are neighbourhoods, -jima is an island, -mae is "in front of".
    /// </summary>
    public static class CityNames
    {
        static readonly string[] Core = { "Marukane", "Tokura", "Shinmei", "Kanezaki", "Otoribashi" };
        static readonly string[] StationFront = { "Kanmei-Ekimae", "Shin-Tokura", "Nishiguchi", "Higashiguchi" };
        static readonly string[] Retail = { "Ginbashi", "Kikyocho", "Nakadori", "Suzuran", "Hinodecho" };
        static readonly string[] Nightlife = { "Yoicho", "Hanazono", "Korakucho", "Akariba" };
        static readonly string[] Office = { "Sakaebashi", "Nijubashi", "Kandamachi", "Toyosaka", "Hakuundai" };
        static readonly string[] Civic = { "Kanchogai", "Seimon", "Gakushicho" };
        static readonly string[] Palace = { "Gosho", "Kyuen" };
        static readonly string[] Apartments = { "Tsukimidai", "Asahigaoka", "Kotobuki", "Wakabadai", "Fujimicho" };
        static readonly string[] Residential = { "Yanagimachi", "Sakuradai", "Hatsune", "Tsutsujigaoka", "Kamiyanagi", "Shimogawa", "Kikumachi", "Umezono", "Nagisadai", "Hozumi" };
        static readonly string[] Suburb = { "Takanodai", "Suzuriyama", "Momijidai", "Shirakabadai", "Oyamada", "Hazukidai", "Tamagawara", "Kuzunohara" };
        static readonly string[] Industrial = { "Kurotani", "Tekkohama", "Kogyobashi", "Shiogama" };
        static readonly string[] Port = { "Kanmei-futo", "Shiohama", "Higashiura" };
        static readonly string[] Reclaimed = { "Shinkaijima", "Mirai-futo", "Umishima" };
        static readonly string[] University = { "Gakuendai", "Bunkyodai" };
        static readonly string[] Park = { "Midorino", "Hakuchoen", "Kaedegaoka" };
        static readonly string[] Shrine = { "Inarizaka", "Tenjinmae", "Mitamamori" };
        static readonly string[] RailYard = { "Sharyoku", "Kitaguchi-soko" };
        static readonly string[] Waterfront = { "Nagisa", "Umibashi", "Kawaguchi", "Shioiri" };
        static readonly string[] Fallback = { "Nishikawa", "Higashida", "Minamino", "Kitazono", "Nakamura-higashi", "Onodai", "Kurogane", "Hoshizaki" };

        static string[] PoolFor(DistrictKind kind)
        {
            switch (kind)
            {
                case DistrictKind.CoreBusiness: return Core;
                case DistrictKind.StationFront: return StationFront;
                case DistrictKind.Retail: return Retail;
                case DistrictKind.Nightlife: return Nightlife;
                case DistrictKind.Office: return Office;
                case DistrictKind.Civic: return Civic;
                case DistrictKind.Palace: return Palace;
                case DistrictKind.Apartments: return Apartments;
                case DistrictKind.Residential: return Residential;
                case DistrictKind.Suburb: return Suburb;
                case DistrictKind.Industrial: return Industrial;
                case DistrictKind.Port: return Port;
                case DistrictKind.Reclaimed: return Reclaimed;
                case DistrictKind.University: return University;
                case DistrictKind.Park: return Park;
                case DistrictKind.Shrine: return Shrine;
                case DistrictKind.RailYard: return RailYard;
                case DistrictKind.Waterfront: return Waterfront;
                default: return Fallback;
            }
        }

        /// <summary>
        /// Picks a name for a ward that has not been used yet. The index walk is deterministic,
        /// so the same seed always produces the same city.
        /// </summary>
        public static string NextWardName(DistrictKind kind, int salt, HashSet<string> used)
        {
            string[] pool = PoolFor(kind);
            for (int attempt = 0; attempt < pool.Length; attempt++)
            {
                string candidate = pool[Mathf.Abs(salt + attempt) % pool.Length];
                if (used.Add(candidate)) return candidate;
            }
            for (int attempt = 0; attempt < Fallback.Length; attempt++)
            {
                string candidate = Fallback[Mathf.Abs(salt * 7 + attempt) % Fallback.Length];
                if (used.Add(candidate)) return candidate;
            }
            // Everything is taken: fall back to a numbered district, the way new towns are named.
            for (int n = 2; n < 40; n++)
            {
                string candidate = string.Format("{0} {1}-chome", pool[Mathf.Abs(salt) % pool.Length], n);
                if (used.Add(candidate)) return candidate;
            }
            return "Unnamed";
        }

        /// <summary>
        /// Three letter code for a plot address. Built from the name's first letter and its next
        /// two consonants, which is short, stable and readable: Yanagimachi becomes YNG.
        /// </summary>
        public static string WardCode(string wardName, HashSet<string> used)
        {
            string letters = "";
            for (int i = 0; i < wardName.Length; i++)
            {
                char c = char.ToUpperInvariant(wardName[i]);
                if (c >= 'A' && c <= 'Z') letters += c;
            }
            if (letters.Length == 0) letters = "WRD";

            string code = letters.Substring(0, 1);
            const string vowels = "AEIOU";
            for (int i = 1; i < letters.Length && code.Length < 3; i++)
            {
                if (vowels.IndexOf(letters[i]) >= 0) continue;
                code += letters[i];
            }
            for (int i = 1; i < letters.Length && code.Length < 3; i++) code += letters[i];
            while (code.Length < 3) code += "X";

            if (used == null || used.Add(code)) return code;

            // Collision: walk the last character until the code is free.
            string stem = code.Substring(0, 2);
            for (char c = 'A'; c <= 'Z'; c++)
            {
                string candidate = stem + c;
                if (used.Add(candidate)) return candidate;
            }
            for (int n = 0; n < 100; n++)
            {
                string candidate = code.Substring(0, 1) + n.ToString("00");
                if (used.Add(candidate)) return candidate;
            }
            return code;
        }

        /// <summary>A station name for a ward. Japanese stations take the name of the place they serve.</summary>
        public static string StationName(string wardName, bool terminus, bool secondary)
        {
            if (terminus) return wardName + " Central";
            if (!secondary) return wardName;
            return "Shin-" + wardName;
        }

        /// <summary>Names for the numbered arterial routes, the way Japanese city roads are signed.</summary>
        public static string RoadName(RoadClass klass, int index, string wardName)
        {
            switch (klass)
            {
                case RoadClass.Expressway: return string.Format("Konto Expressway Route {0}", index + 1);
                case RoadClass.Arterial: return string.Format("Route {0} ({1} Dori)", 14 + index * 3, wardName);
                case RoadClass.Avenue: return string.Format("{0} Dori", wardName);
                case RoadClass.Promenade: return string.Format("{0} Promenade", wardName);
                case RoadClass.Alley: return string.Format("{0} Yokocho", wardName);
                default: return string.Format("{0} Street", wardName);
            }
        }

        public static string RingRoadName(int ringIndex)
        {
            return string.Format("Ring Road {0}", ringIndex + 1);
        }

        public static string RailLineName(RailClass klass, int index, string destination)
        {
            switch (klass)
            {
                case RailClass.Loop: return "Kanjo Loop Line";
                case RailClass.Shinkansen: return "Konto Shinkansen";
                case RailClass.Freight: return "Konto Freight Line";
                case RailClass.Subway: return string.Format("Subway Line {0}", index + 1);
                default: return string.Format("{0} Line", destination);
            }
        }
    }
}
