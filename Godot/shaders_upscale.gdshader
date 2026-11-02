shader_type canvas_item;
// Spatial upscaler for the 3D view: Catmull-Rom bicubic resampling (nine bilinear taps), then a
// contrast-adaptive sharpen over the four neighbours, in the manner of FSR 1's EASU and RCAS passes.
// It is cheap enough for integrated graphics, and it runs in the Compatibility renderer, where
// Godot's own 3D scaling modes are not available.

uniform vec2 src_size = vec2(1280.0, 720.0);
uniform float sharpness : hint_range(0.0, 1.0) = 0.4;
uniform bool resample = true;
uniform sampler2D src : filter_linear, repeat_disable;

vec4 catmull(vec2 uv) {
	vec2 pos = uv * src_size;
	vec2 c = floor(pos - 0.5) + 0.5;
	vec2 f = pos - c;
	vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
	vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
	vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
	vec2 w3 = f * f * (-0.5 + 0.5 * f);
	vec2 w12 = w1 + w2;
	vec2 o12 = w2 / w12;
	vec2 t0 = (c - 1.0) / src_size;
	vec2 t3 = (c + 2.0) / src_size;
	vec2 t12 = (c + o12) / src_size;
	vec4 r = vec4(0.0);
	r += texture(src, vec2(t0.x, t0.y)) * w0.x * w0.y;
	r += texture(src, vec2(t12.x, t0.y)) * w12.x * w0.y;
	r += texture(src, vec2(t3.x, t0.y)) * w3.x * w0.y;
	r += texture(src, vec2(t0.x, t12.y)) * w0.x * w12.y;
	r += texture(src, vec2(t12.x, t12.y)) * w12.x * w12.y;
	r += texture(src, vec2(t3.x, t12.y)) * w3.x * w12.y;
	r += texture(src, vec2(t0.x, t3.y)) * w0.x * w3.y;
	r += texture(src, vec2(t12.x, t3.y)) * w12.x * w3.y;
	r += texture(src, vec2(t3.x, t3.y)) * w3.x * w3.y;
	return r;
}

void fragment() {
	vec2 uv = UV;
	vec3 col = resample ? max(catmull(uv).rgb, vec3(0.0)) : texture(src, uv).rgb;
	if (sharpness > 0.001) {
		vec2 px = 1.0 / src_size;
		vec3 a = texture(src, uv + vec2(0.0, -px.y)).rgb;
		vec3 b = texture(src, uv + vec2(-px.x, 0.0)).rgb;
		vec3 d = texture(src, uv + vec2(px.x, 0.0)).rgb;
		vec3 e = texture(src, uv + vec2(0.0, px.y)).rgb;
		vec3 mn = min(min(a, b), min(d, e));
		vec3 mx = max(max(a, b), max(d, e));
		// less sharpening where the neighbourhood already has hard edges, so nothing rings
		vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(0.001)), 0.0, 1.0));
		float peak = -1.0 / mix(8.0, 5.0, sharpness);
		vec3 w = amp * peak;
		vec3 rcp = 1.0 / (1.0 + 4.0 * w);
		col = clamp((col + (a + b + d + e) * w) * rcp, 0.0, 1.0);
	}
	COLOR = vec4(col, 1.0);
}
