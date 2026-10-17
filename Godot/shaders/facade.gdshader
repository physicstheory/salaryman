shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;
// A procedural Japanese city facade, drawn from world position so it does not depend on the mesh's UVs.
// Floors, bays, windows, balconies, air-conditioner boxes, a shopfront and a fascia on the ground storey,
// and a night pass where a share of the windows are lit.

uniform vec4 wall_col : source_color = vec4(0.72, 0.70, 0.66, 1.0);
uniform vec4 trim_col : source_color = vec4(0.30, 0.31, 0.34, 1.0);
uniform vec4 shop_col : source_color = vec4(1.0, 0.4, 0.5, 1.0);
uniform float style = 0.0;        // 0 apartment, 1 office curtain wall, 2 older concrete, 3 shop-house
uniform float seed = 1.0;
uniform float lit_ratio = 0.45;
uniform float floor_h = 3.4;
uniform float bay_w = 3.1;
uniform float shop_h = 4.6;
uniform float glow = 1.0;

varying vec3 wpos;
varying vec3 wnrm;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

float h21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
float box(vec2 p, vec2 lo, vec2 hi) {
	vec2 a = step(lo, p) * step(p, hi);
	return a.x * a.y;
}
float vnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
vec3 lamp_colour(float r) {
	if (r < 0.55) return vec3(1.0, 0.78, 0.45);       // warm bulbs
	if (r < 0.8) return vec3(0.85, 0.95, 1.0);        // white tube
	if (r < 0.92) return vec3(0.55, 0.7, 1.0);        // a television
	return vec3(1.0, 0.55, 0.7);                       // a pink room
}

void fragment() {
	vec3 n = normalize(wnrm);
	vec3 col = wall_col.rgb;
	float rough = 0.88;
	float metal = 0.0;
	float spec = 0.35;
	vec3 emis = vec3(0.0);

	if (abs(n.y) > 0.6) {
		// roofs: dark membrane with gravel speckle; undersides darker
		float g = h21(floor(wpos.xz * 3.0));
		col = mix(vec3(0.15, 0.16, 0.18), vec3(0.28, 0.28, 0.3), g) * (n.y > 0.0 ? 1.0 : 0.5);
		rough = 0.95;
	} else {
		vec2 t = normalize(vec2(-n.z, n.x));
		float face = floor(atan(n.z, n.x) * 1.27324) + seed * 13.0;      // which side of the building
		float u = dot(wpos.xz, t) + seed * 5.17;
		float v = wpos.y;

		// weathering: streaks down from the sills, a slow stain, a little grain
		float streak = vnoise(vec2(u * 1.7, v * 0.08 + face));
		float stain = vnoise(vec2(u * 0.12 + face, v * 0.05));
		col *= 0.86 + 0.22 * stain - 0.1 * streak * smoothstep(0.0, 14.0, 14.0 - v);
		col *= 0.97 + 0.06 * h21(floor(vec2(u, v) * 9.0));

		if (v < shop_h) {
			// ---- ground storey: shopfront
			float cx = floor(u / (bay_w * 1.3));
			float fx = fract(u / (bay_w * 1.3));
			float r = h21(vec2(cx, face + seed));
			float glass = box(vec2(fx, v), vec2(0.07, 0.35), vec2(0.93, 3.05));
			float fascia = box(vec2(fx, v), vec2(0.0, 3.1), vec2(1.0, 4.35));
			float pillar = 1.0 - step(0.07, fx) * step(fx, 0.93);
			if (r < 0.2) {
				// a roll-down shutter, closed for the night
				float slat = 0.5 + 0.5 * sin(v * 40.0);
				col = mix(vec3(0.34, 0.36, 0.38), vec3(0.42, 0.44, 0.46), slat) * step(0.35, v);
				metal = 0.6; rough = 0.45;
				if (fascia > 0.5) col = shop_col.rgb * 0.5;
			} else {
				if (glass > 0.5) {
					// lit window with shelves or a counter showing through
					float shelf = step(0.5, fract(v * 3.2 + h21(vec2(cx, 3.0))));
					vec3 inner = mix(vec3(1.0, 0.92, 0.75), vec3(0.8, 0.9, 1.0), h21(vec2(cx, 9.0)));
					emis = inner * (0.28 + 0.3 * shelf) * glow;
					col = vec3(0.05);
					metal = 0.2; rough = 0.2;
				}
				if (fascia > 0.5) {
					col = shop_col.rgb * (0.55 + 0.45 * h21(vec2(cx, 5.0)));
					emis = shop_col.rgb * 0.55 * glow;
				}
				if (pillar > 0.5 && glass < 0.5 && fascia < 0.5) col = trim_col.rgb;
			}
		} else {
			// ---- upper storeys
			float yy = (v - shop_h) / floor_h;
			float cy = floor(yy);
			float fy = fract(yy);
			float cx = floor(u / bay_w);
			float fx = fract(u / bay_w);
			float r = h21(vec2(cx + face * 7.0, cy + seed * 3.0));
			float win = 0.0;
			float rail = 0.0;
			float ac = 0.0;
			if (style < 0.5) {
				// apartments: a sliding door onto a balcony, a rail, and an air-conditioner on the wall
				win = box(vec2(fx, fy), vec2(0.12, 0.2), vec2(0.62, 0.8));
				rail = box(vec2(fx, fy), vec2(0.04, 0.05), vec2(0.96, 0.3)) * (1.0 - box(vec2(fx, fy), vec2(0.07, 0.08), vec2(0.93, 0.27)));
				ac = box(vec2(fx, fy), vec2(0.7, 0.45), vec2(0.9, 0.62)) * step(0.45, h21(vec2(cx, cy + face)));
			} else if (style < 1.5) {
				// office: a continuous band of glass between spandrels, mullions every bay
				win = box(vec2(fx, fy), vec2(0.0, 0.12), vec2(1.0, 0.86)) * (1.0 - box(vec2(fx, fy), vec2(0.47, 0.0), vec2(0.53, 1.0)));
			} else if (style < 2.5) {
				win = box(vec2(fx, fy), vec2(0.28, 0.28), vec2(0.72, 0.72));
				ac = box(vec2(fx, fy), vec2(0.08, 0.1), vec2(0.22, 0.24)) * step(0.7, r);
			} else {
				win = box(vec2(fx, fy), vec2(0.15, 0.2), vec2(0.85, 0.78));
				ac = box(vec2(fx, fy), vec2(0.4, 0.02), vec2(0.6, 0.14)) * step(0.5, r);
			}
			// floor band
			float band = box(vec2(1.0, fy), vec2(0.0, 0.0), vec2(2.0, 0.045));
			col = mix(col, trim_col.rgb, band * 0.8);
			col = mix(col, trim_col.rgb * 1.1, rail * 0.9);
			col = mix(col, vec3(0.78, 0.8, 0.82), ac);
			if (win > 0.5) {
				float on = step(r, lit_ratio) * step(0.04, fract(r * 97.0));
				vec3 lc = lamp_colour(fract(r * 53.0));
				float curtain = 0.55 + 0.45 * h21(vec2(cx, cy + 11.0));
				if (on > 0.5) {
					emis = lc * curtain * 0.85 * glow;
					col = vec3(0.06);
				} else {
					// dark glass that picks up the sky
					col = vec3(0.025, 0.035, 0.055);
					metal = 0.85; rough = 0.08; spec = 0.9;
				}
			}
		}
	}
	ALBEDO = col;
	ROUGHNESS = rough;
	METALLIC = metal;
	SPECULAR = spec;
	EMISSION = emis;
}
