shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
// Tarmac, with what is painted on it. The surface is a tiled PBR set (albedo, normal, occlusion/roughness/metal) sampled twice at two
// scales so it does not repeat, then worn by tyre tracks, repair patches, hairline cracks and oil. Lane paint is drawn from the road's own
// UVs: edge lines, a dashed centre line that turns into a double yellow near each junction, zebra crossings and stop lines. After dark the
// street is damp: puddles that mirror the neon (they pick up reflections in Forward+).

global uniform float night;

uniform sampler2D alb_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D nor_tex : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D arm_tex : filter_linear_mipmap_anisotropic, repeat_enable;
uniform float tile_m = 4.0;
uniform float road_len = 428.0;
uniform float road_w = 12.0;
uniform float pitch = 52.0;
uniform float markings = 1.0;
uniform float surface = 0.0;       // 0 tarmac, 1 pavement slabs

varying vec3 wp;

void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float h21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
float vnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
	float a = 0.5, s = 0.0;
	for (int i = 0; i < 4; i++) {
		s += a * vnoise(p);
		p = p * 2.07 + vec2(13.7, 4.1);
		a *= 0.5;
	}
	return s;
}
float bar(float x, float c, float hw) {
	return step(abs(x - c), hw);
}

void fragment() {
	vec2 uv = wp.xz / tile_m;
	vec2 uv2 = wp.xz / (tile_m * 3.7) + vec2(0.37, 0.11);
	vec3 a1 = texture(alb_tex, uv).rgb;
	vec3 a2 = texture(alb_tex, uv2).rgb;
	vec3 alb = a1 * (0.78 + 0.5 * dot(a2, vec3(0.333)));
	vec3 tn = texture(nor_tex, uv).xyz * 2.0 - 1.0;
	vec3 tn2 = texture(nor_tex, uv * 5.3).xyz * 2.0 - 1.0;
	tn.xy += tn2.xy * 0.45;
	vec3 arm = texture(arm_tex, uv).rgb;
	float rough = arm.g;
	float ao = arm.r;

	if (surface > 0.5) {
		// pavement: concrete slabs a little over a metre across, with joints, stains and the odd chipped corner
		vec2 g = wp.xz / 1.2;
		vec2 f = fract(g);
		float joint = clamp(step(f.x, 0.022) + step(f.y, 0.022), 0.0, 1.0);
		float slab = h21(floor(g) + 7.0);
		vec3 c = vec3(0.5, 0.49, 0.46) * (0.8 + 0.4 * slab) * (0.55 + 0.9 * dot(a1, vec3(0.333)) * 1.6);
		c *= 0.82 + 0.35 * fbm(wp.xz * 0.12);
		c = mix(c, c * 0.45, joint);
		float damp = night * 0.5;
		c *= 1.0 - 0.3 * damp;
		vec3 nwp = normalize(vec3(tn.x * 0.6, tn.z, -tn.y * 0.6));
		NORMAL = normalize((VIEW_MATRIX * vec4(nwp, 0.0)).xyz);
		ALBEDO = c;
		ROUGHNESS = clamp(0.85 - 0.3 * damp - 0.1 * (1.0 - joint) * slab, 0.2, 1.0);
		METALLIC = 0.0;
		SPECULAR = 0.4;
		AO = ao;
		AO_LIGHT_AFFECT = 0.6;
	} else {
	// position on the road: across (0..road_w) and along (metres from the first junction centre)
	float u = UV.x * road_w;
	float s = UV.y * road_len - 6.0;
	float srel = mod(s + pitch * 0.5, pitch) - pitch * 0.5;      // signed distance to the nearest junction centre
	float d = abs(srel);

	// slow variation: lighter, bleached stretches and darker, patched ones
	float macro = fbm(wp.xz * 0.045);
	alb *= 0.82 + 0.4 * macro;
	// tyre tracks: two bands per lane, darker with the rubber and a little polished
	float lane_u = markings > 0.5 ? u : wp.x;
	float track = 0.0;
	if (markings > 0.5) {
		track = max(bar(u, 2.2, 0.38), max(bar(u, 3.9, 0.38), max(bar(u, 8.1, 0.38), bar(u, 9.8, 0.38))));
		track *= 0.5 + 0.5 * vnoise(vec2(u * 3.0, s * 0.35));
	}
	alb *= 1.0 - 0.22 * track;
	rough -= 0.1 * track;
	// repair patches: rectangles of newer, darker asphalt with a seam round them
	vec2 pc = floor(wp.xz / vec2(7.0, 11.0));
	vec2 pf = fract(wp.xz / vec2(7.0, 11.0));
	float hp = h21(pc + 3.7);
	if (hp > 0.9) {
		vec2 lo = vec2(0.1 + 0.2 * h21(pc + 1.0), 0.1 + 0.25 * h21(pc + 2.0));
		vec2 hi = lo + vec2(0.35 + 0.3 * h21(pc + 4.0), 0.25 + 0.3 * h21(pc + 5.0));
		float inside = step(lo.x, pf.x) * step(pf.x, hi.x) * step(lo.y, pf.y) * step(pf.y, hi.y);
		float edge = inside * (1.0 - step(0.012, min(min(pf.x - lo.x, hi.x - pf.x), min(pf.y - lo.y, hi.y - pf.y))));
		alb = mix(alb, alb * 0.62, inside);
		alb = mix(alb, alb * 0.4, edge);
		rough = mix(rough, 0.97, inside * 0.6);
	}
	// hairline cracks along ridges of a noise field, where the road is old
	float cr = abs(fbm(wp.xz * 0.9) - 0.5);
	float crack = smoothstep(0.012, 0.0, cr) * smoothstep(0.5, 0.65, fbm(wp.xz * 0.06 + 9.0));
	alb *= 1.0 - 0.7 * crack;
	ao *= 1.0 - 0.5 * crack;
	// oil and fuel stains, dark and smooth
	float oil = smoothstep(0.7, 0.8, vnoise(wp.xz * 0.35 + 5.0)) * track;
	alb *= 1.0 - 0.3 * oil;
	rough = mix(rough, 0.35, oil);

	// paint
	float paint = 0.0;
	vec3 pcol = vec3(0.8);
	if (markings > 0.5) {
		float edge_l = bar(u, 0.7, 0.08) + bar(u, road_w - 0.7, 0.08);
		float dash = bar(u, road_w * 0.5, 0.08) * step(mod(s, 9.0), 3.0) * step(9.5 + 14.0, d);
		float dbl = (bar(u, road_w * 0.5 - 0.17, 0.07) + bar(u, road_w * 0.5 + 0.17, 0.07)) * step(d, 9.5 + 14.0) * step(9.5, d);
		float zebra = step(6.4, d) * step(d, 9.4) * step(1.0, u) * step(u, road_w - 1.0) * step(mod(u, 1.1), 0.55);
		float stop = step(10.0, d) * step(d, 10.45) * step(0.8, u) * step(u, road_w - 0.8);
		float edge_gap = step(d, 6.3) * 0.0;
		float yellow = dbl;
		float white = clamp(edge_l * step(6.4, d) + dash + zebra + stop, 0.0, 1.0);
		float wear = 0.6 + 0.4 * smoothstep(0.25, 0.75, vnoise(wp.xz * 2.3));
		wear *= 0.8 + 0.2 * (1.0 - track * 0.8);
		float grain = 0.8 + 0.4 * texture(alb_tex, uv * 2.0).r * 3.0;
		paint = clamp(max(white, yellow), 0.0, 1.0) * wear;
		pcol = mix(vec3(0.78, 0.78, 0.76), vec3(0.82, 0.6, 0.08), yellow) * min(grain, 1.2);
		alb = mix(alb, pcol, paint * 0.95);
		rough = mix(rough, 0.55, paint);
		tn = mix(tn, vec3(0.0, 0.0, 1.0), paint * 0.5);
	}

	// after dark the street is damp, with standing water in the dips
	float wet = night * 0.55;
	float pud = smoothstep(0.56, 0.66, fbm(wp.xz * 0.16 + 3.0)) * night * (1.0 - paint * 0.6);
	alb *= 1.0 - 0.3 * wet - 0.3 * pud;
	rough = mix(rough * (1.0 - 0.35 * wet), 0.04, pud);
	tn = mix(tn, vec3(0.0, 0.0, 1.0), pud);

	// the tangent frame is the world's: image right is +X, image up is -Z
	vec3 nw = normalize(vec3(tn.x, tn.z, -tn.y));
	NORMAL = normalize((VIEW_MATRIX * vec4(nw, 0.0)).xyz);
	ALBEDO = clamp(alb, 0.0, 1.0);
	ROUGHNESS = clamp(rough, 0.03, 1.0);
	METALLIC = 0.0;
	SPECULAR = mix(0.5, 0.8, wet);
	AO = ao;
	AO_LIGHT_AFFECT = 0.7;
	}
}
