shader_type sky;
// The sky of Tōkonto: a gradient the day/night cycle recolours, a sun and a moon that cross it, stars that come out at night
// and a layer of drifting cloud that is lit from the sun's side. The cycle (scripts/sky_cycle.gd) sets the uniforms.

uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);
uniform vec3 moon_dir = vec3(0.0, -1.0, 0.0);
uniform vec3 top_col : source_color = vec3(0.2, 0.4, 0.8);
uniform vec3 horizon_col : source_color = vec3(0.7, 0.8, 0.9);
uniform vec3 ground_col : source_color = vec3(0.2, 0.2, 0.22);
uniform vec3 sun_col : source_color = vec3(1.0, 0.9, 0.75);
uniform float star_vis = 0.0;
uniform float cloud_cover = 0.5;
uniform vec3 cloud_lit : source_color = vec3(1.0);
uniform vec3 cloud_dark : source_color = vec3(0.5, 0.55, 0.65);
uniform float cloud_time = 0.0;
uniform float glow_strength = 1.0;

float h31(vec3 p) {
	p = fract(p * vec3(443.897, 441.423, 437.195));
	p += dot(p, p.yzx + 19.19);
	return fract((p.x + p.y) * p.z);
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
	for (int i = 0; i < 5; i++) {
		s += a * vnoise(p);
		p = p * 2.03 + vec2(17.1, 9.2);
		a *= 0.5;
	}
	return s;
}

void sky() {
	vec3 d = normalize(EYEDIR);
	float h = d.y;
	vec3 col;
	if (h >= 0.0) {
		col = mix(horizon_col, top_col, pow(clamp(h, 0.0, 1.0), 0.42));
	} else {
		col = mix(horizon_col, ground_col, pow(clamp(-h, 0.0, 1.0), 0.35));
	}
	// the glow round the sun, strongest when it is low
	float sd = max(dot(d, sun_dir), 0.0);
	float low = 1.0 - clamp(sun_dir.y * 2.2, 0.0, 1.0);
	col += sun_col * (pow(sd, 6.0) * (0.12 + 0.55 * low) + pow(sd, 40.0) * 0.25) * glow_strength * clamp(sun_dir.y + 0.25, 0.0, 1.0);
	float disk = smoothstep(0.99955, 0.9998, sd);
	col = mix(col, sun_col * 6.0, disk * step(0.0, h + 0.02));
	// the moon: a bright disc with a little halo, not a perfect one
	float md = max(dot(d, moon_dir), 0.0);
	float mdisk = smoothstep(0.99935, 0.9996, md);
	float crater = 0.85 + 0.15 * vnoise((d.xy + d.zx) * 220.0);
	col += vec3(0.55, 0.6, 0.7) * pow(md, 70.0) * 0.5 * smoothstep(-0.05, 0.1, moon_dir.y);
	col = mix(col, vec3(0.92, 0.94, 1.0) * crater * 2.2, mdisk * step(0.0, h) * smoothstep(-0.05, 0.1, moon_dir.y));
	// stars
	if (star_vis > 0.01 && h > 0.0) {
		vec3 p = d * 220.0;
		vec3 c = floor(p);
		float r = h31(c);
		float on = step(0.9935, r);
		vec3 f = fract(p) - 0.5;
		float tw = 0.65 + 0.35 * sin(TIME * (1.5 + r * 3.0) + r * 40.0);
		float st = on * smoothstep(0.32, 0.0, length(f)) * tw;
		col += vec3(0.85, 0.9, 1.0) * st * star_vis * smoothstep(0.0, 0.25, h) * 1.4;
	}
	// clouds on a plane overhead
	if (h > 0.01) {
		vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(cloud_time * 0.012, cloud_time * 0.004);
		float n = fbm(uv * 1.3);
		float dens = smoothstep(1.0 - cloud_cover, 1.0 - cloud_cover + 0.35, n);
		float sunside = clamp(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sun_dir.x, 0.0001, sun_dir.z))), -1.0, 1.0);
		float lit = clamp(0.55 + 0.45 * sunside * (0.5 + 0.5 * (1.0 - low)), 0.0, 1.0);
		float thin = fbm(uv * 1.3 + vec2(1.7, 3.1));
		vec3 cc = mix(cloud_dark, cloud_lit, lit * (1.0 - 0.35 * dens * thin));
		float fade = smoothstep(0.01, 0.2, h);
		col = mix(col, cc, dens * fade * 0.92);
	}
	COLOR = col;
}
