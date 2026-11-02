class_name SkyCycle
extends Node
## The day and the night. The clock in GameState turns the sun and the moon across a procedural sky, recolours the sky, the haze and the
## ambient light, warms the sunlight as it drops, lights the windows, signs and street lamps when it gets dark, and (in Forward+) adds
## ambient occlusion, reflections, volumetric haze and a softer, brighter bloom.
##
## Anything that should come on at night registers itself in `glowers` as [material, energy at night, share left on by day].

static var glowers: Array = []
static var night_amount := 1.0

const AZIMUTH := deg_to_rad(125.0)
# sun elevation (sine of the angle above the horizon) -> sky colours
const KEYS := [
	[-0.30, Color(0.012, 0.02, 0.055), Color(0.05, 0.045, 0.11), Color(0.012, 0.012, 0.03)],
	[-0.10, Color(0.02, 0.04, 0.11), Color(0.16, 0.1, 0.2), Color(0.02, 0.02, 0.05)],
	[-0.02, Color(0.07, 0.11, 0.26), Color(0.62, 0.3, 0.3), Color(0.06, 0.05, 0.08)],
	[0.06, Color(0.14, 0.26, 0.52), Color(0.98, 0.55, 0.32), Color(0.12, 0.1, 0.1)],
	[0.25, Color(0.17, 0.36, 0.72), Color(0.66, 0.74, 0.84), Color(0.2, 0.2, 0.2)],
	[0.8, Color(0.16, 0.38, 0.8), Color(0.62, 0.78, 0.95), Color(0.22, 0.24, 0.26)],
]

var world: Node3D
var sky_mat: ShaderMaterial
var env: Environment
var sun: DirectionalLight3D
var moon: DirectionalLight3D
var lamps: PackedVector3Array = PackedVector3Array()
var focus: Node3D
var _pool: Array[OmniLight3D] = []
var _pool_t := 0.0
var _forward := false
var _t_cloud := 0.0
var debug_hour := -1.0               # >= 0 pins the clock, for screenshots

func _ready() -> void:
	_forward = RenderingServer.get_rendering_device() != null      # Forward+ or Mobile; Compatibility has no rendering device
	var sh := load("res://shaders/sky.gdshader") as Shader
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = sh
	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.process_mode = Sky.PROCESS_MODE_REALTIME
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_white = 6.0
	env.fog_enabled = true
	env.fog_sun_scatter = 0.25
	env.fog_aerial_perspective = 0.35
	env.glow_enabled = true
	env.glow_normalized = true
	env.glow_hdr_threshold = 1.0
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.08
	env.adjustment_contrast = 1.05
	if _forward:
		env.ssao_enabled = true
		env.ssao_radius = 1.6
		env.ssao_intensity = 2.2
		env.ssao_power = 1.6
		env.ssil_enabled = true
		env.ssil_radius = 4.0
		env.ssil_intensity = 0.8
		env.ssr_enabled = true
		env.ssr_max_steps = 48
		env.ssr_fade_in = 0.15
		env.ssr_fade_out = 2.0
		env.volumetric_fog_enabled = true
		env.volumetric_fog_length = 90.0
		env.volumetric_fog_gi_inject = 0.0
		env.volumetric_fog_ambient_inject = 0.0
		env.volumetric_fog_anisotropy = 0.55
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.light_angular_distance = 0.5
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS if _forward else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 260.0
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.4
	add_child(sun)
	moon = DirectionalLight3D.new()
	moon.light_color = Color(0.55, 0.66, 1.0)
	moon.shadow_enabled = true
	moon.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	moon.directional_shadow_max_distance = 150.0
	add_child(moon)
	for i in 12:
		var l := OmniLight3D.new()
		l.light_color = Color(1.0, 0.76, 0.48)
		l.omni_range = 24.0
		l.omni_attenuation = 1.6
		l.light_energy = 0.0
		l.shadow_enabled = false
		if _forward:
			l.light_volumetric_fog_energy = 1.0
		add_child(l)
		_pool.append(l)
	update(0.0)

## Hours since midnight, from the game clock.
func hour() -> float:
	return debug_hour if debug_hour >= 0.0 else GameState.clock_min / 60.0

func _sample(e: float) -> Array:
	if e <= KEYS[0][0]:
		return [KEYS[0][1], KEYS[0][2], KEYS[0][3]]
	for i in KEYS.size() - 1:
		var a: Array = KEYS[i]
		var b: Array = KEYS[i + 1]
		if e <= b[0]:
			var t := smoothstep(0.0, 1.0, (e - a[0]) / (b[0] - a[0]))
			return [a[1].lerp(b[1], t), a[2].lerp(b[2], t), a[3].lerp(b[3], t)]
	var l: Array = KEYS[KEYS.size() - 1]
	return [l[1], l[2], l[3]]

func update(dt: float) -> void:
	_t_cloud += dt
	var hr := hour()
	# the sun rises at six and sets at six; its elevation is a sine of the hour
	var ang := (hr - 6.0) / 24.0 * TAU
	var e := sin(ang)
	var sun_dir := Vector3(cos(AZIMUTH) * cos(ang) * 0.9, e, sin(AZIMUTH) * cos(ang) * 0.9).normalized()
	var moon_dir := Vector3(-sun_dir.x, -sun_dir.y, -sun_dir.z)
	moon_dir = (moon_dir + Vector3(0.12, 0.0, -0.08)).normalized()
	var cols := _sample(e)
	var night := smoothstep(0.06, -0.1, e)
	night_amount = night
	RenderingServer.global_shader_parameter_set("night", night)
	sky_mat.set_shader_parameter("sun_dir", sun_dir)
	sky_mat.set_shader_parameter("moon_dir", moon_dir)
	sky_mat.set_shader_parameter("top_col", cols[0])
	sky_mat.set_shader_parameter("horizon_col", cols[1])
	sky_mat.set_shader_parameter("ground_col", cols[2])
	sky_mat.set_shader_parameter("star_vis", smoothstep(-0.02, -0.2, e))
	var low := 1.0 - clampf(e * 2.2, 0.0, 1.0)
	var sun_c := Color(1.0, 0.95, 0.88).lerp(Color(1.0, 0.5, 0.25), clampf(low, 0.0, 1.0) * smoothstep(-0.1, 0.1, e))
	sky_mat.set_shader_parameter("sun_col", sun_c)
	sky_mat.set_shader_parameter("cloud_time", _t_cloud + hr * 600.0)
	sky_mat.set_shader_parameter("cloud_cover", 0.52)
	sky_mat.set_shader_parameter("cloud_lit", Color(1.0, 0.97, 0.94).lerp(Color(1.0, 0.62, 0.45), low * smoothstep(-0.1, 0.12, e)).lerp(Color(0.1, 0.11, 0.18), night))
	sky_mat.set_shader_parameter("cloud_dark", Color(0.52, 0.58, 0.7).lerp(Color(0.35, 0.28, 0.4), low * smoothstep(-0.1, 0.12, e)).lerp(Color(0.03, 0.035, 0.07), night))
	# the sun, and the moon after it
	sun.look_at_from_position(Vector3.ZERO, -sun_dir, Vector3.UP if absf(sun_dir.y) < 0.99 else Vector3.RIGHT)
	var sun_on := smoothstep(-0.03, 0.12, e)
	sun.light_energy = sun_on * 2.4 * clampf(0.35 + e * 1.2, 0.0, 1.0)
	sun.light_color = sun_c
	sun.shadow_enabled = e > -0.01
	sun.visible = sun_on > 0.001
	moon.look_at_from_position(Vector3.ZERO, -moon_dir, Vector3.UP)
	moon.light_energy = night * 0.5 * smoothstep(-0.05, 0.12, moon_dir.y)
	moon.shadow_enabled = night > 0.5
	moon.visible = moon.light_energy > 0.001
	# ambient: the sky's own light, with a floor so the night is playable
	env.ambient_light_energy = lerpf(0.85, 0.9, night)
	env.ambient_light_color = Color(0.62, 0.64, 0.7).lerp(Color(0.5, 0.58, 0.8), clampf(low * 0.5, 0.0, 1.0)).lerp(Color(0.26, 0.31, 0.5), night)
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_white = 6.0
	env.fog_enabled = true
	env.fog_sun_scatter = 0.25
	env.fog_aerial_perspective = 0.35
	env.glow_enabled = true
	env.glow_normalized = true
	env.glow_hdr_threshold = 1.0
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.08
	env.adjustment_contrast = 1.05
	if _forward:
		env.ssao_enabled = true
		env.ssao_radius = 1.6
		env.ssao_intensity = 2.2
		env.ssao_power = 1.6
		env.ssil_enabled = true
		env.ssil_radius = 4.0
		env.ssil_intensity = 0.8
		env.ssr_enabled = true
		env.ssr_max_steps = 48
		env.ssr_fade_in = 0.15
		env.ssr_fade_out = 2.0
		env.volumetric_fog_enabled = true
		env.volumetric_fog_length = 90.0
		env.volumetric_fog_gi_inject = 0.0
		env.volumetric_fog_ambient_inject = 0.0
		env.volumetric_fog_anisotropy = 0.55
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.light_angular_distance = 0.5
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS if _forward else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 260.0
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.4
	add_child(sun)
	moon = DirectionalLight3D.new()
	moon.light_color = Color(0.55, 0.66, 1.0)
	moon.shadow_enabled = true
	moon.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	moon.directional_shadow_max_distance = 150.0
	add_child(moon)
	for i in 12:
		var l := OmniLight3D.new()
		l.light_color = Color(1.0, 0.76, 0.48)
		l.omni_range = 24.0
		l.omni_attenuation = 1.6
		l.light_energy = 0.0
		l.shadow_enabled = false
		if _forward:
			l.light_volumetric_fog_energy = 1.0
		add_child(l)
		_pool.append(l)
	update(0.0)

## Hours since midnight, from the game clock.
func hour() -> float:
	return debug_hour if debug_hour >= 0.0 else GameState.clock_min / 60.0

func _sample(e: float) -> Array:
	if e <= KEYS[0][0]:
		return [KEYS[0][1], KEYS[0][2], KEYS[0][3]]
	for i in KEYS.size() - 1:
		var a: Array = KEYS[i]
		var b: Array = KEYS[i + 1]
		if e <= b[0]:
			var t := smoothstep(0.0, 1.0, (e - a[0]) / (b[0] - a[0]))
			return [a[1].lerp(b[1], t), a[2].lerp(b[2], t), a[3].lerp(b[3], t)]
	var l: Array = KEYS[KEYS.size() - 1]
	return [l[1], l[2], l[3]]

func update(dt: float) -> void:
	_t_cloud += dt
	var hr := hour()
	# the sun rises at six and sets at six; its elevation is a sine of the hour
	var ang := (hr - 6.0) / 24.0 * TAU
	var e := sin(ang)
	var sun_dir := Vector3(cos(AZIMUTH) * cos(ang) * 0.9, e, sin(AZIMUTH) * cos(ang) * 0.9).normalized()
	var moon_dir := Vector3(-sun_dir.x, -sun_dir.y, -sun_dir.z)
	moon_dir = (moon_dir + Vector3(0.12, 0.0, -0.08)).normalized()
	var cols := _sample(e)
	var night := smoothstep(0.06, -0.1, e)
	night_amount = night
	RenderingServer.global_shader_parameter_set("night", night)
	sky_mat.set_shader_parameter("sun_dir", sun_dir)
	sky_mat.set_shader_parameter("moon_dir", moon_dir)
	sky_mat.set_shader_parameter("top_col", cols[0])
	sky_mat.set_shader_parameter("horizon_col", cols[1])
	sky_mat.set_shader_parameter("ground_col", cols[2])
	sky_mat.set_shader_parameter("star_vis", smoothstep(-0.02, -0.2, e))
	var low := 1.0 - clampf(e * 2.2, 0.0, 1.0)
	var sun_c := Color(1.0, 0.95, 0.88).lerp(Color(1.0, 0.5, 0.25), clampf(low, 0.0, 1.0) * smoothstep(-0.1, 0.1, e))
	sky_mat.set_shader_parameter("sun_col", sun_c)
	sky_mat.set_shader_parameter("cloud_time", _t_cloud + hr * 600.0)
	sky_mat.set_shader_parameter("cloud_cover", 0.52)
	sky_mat.set_shader_parameter("cloud_lit", Color(1.0, 0.97, 0.94).lerp(Color(1.0, 0.62, 0.45), low * smoothstep(-0.1, 0.12, e)).lerp(Color(0.1, 0.11, 0.18), night))
	sky_mat.set_shader_parameter("cloud_dark", Color(0.52, 0.58, 0.7).lerp(Color(0.35, 0.28, 0.4), low * smoothstep(-0.1, 0.12, e)).lerp(Color(0.03, 0.035, 0.07), night))
	# the sun, and the moon after it
	sun.look_at_from_position(Vector3.ZERO, -sun_dir, Vector3.UP if absf(sun_dir.y) < 0.99 else Vector3.RIGHT)
	var sun_on := smoothstep(-0.03, 0.12, e)
	sun.light_energy = sun_on * 2.4 * clampf(0.35 + e * 1.2, 0.0, 1.0)
	sun.light_color = sun_c
	sun.shadow_enabled = e > -0.01
	sun.visible = sun_on > 0.001
	moon.look_at_from_position(Vector3.ZERO, -moon_dir, Vector3.UP)
	moon.light_energy = night * 0.5 * smoothstep(-0.05, 0.12, moon_dir.y)
	moon.shadow_enabled = night > 0.5
	moon.visible = moon.light_energy > 0.001
	# ambient: the sky's own light, with a floor so the night is playable
	env.ambient_light_energy = lerpf(1.0, 0.55, night)
	env.ambient_light_color = Color(0.2, 0.24, 0.42).lerp(Color(0.5, 0.55, 0.65), 1.0 - night)
	env.ambient_light_sky_contribution = lerpf(1.0, 0.55, night)
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_exposure = lerpf(0.9, 1.25, night)
	# haze takes the horizon colour, thicker at dawn, dusk and night
	env.fog_light_color = cols[1].lerp(Color(0.1, 0.09, 0.17), night * 0.5)
	env.fog_density = lerpf(0.0016, 0.0034, night) + 0.0014 * low * smoothstep(-0.1, 0.1, e)
	env.fog_sun_scatter = lerpf(0.3, 0.0, night)
	env.glow_intensity = lerpf(0.35, 0.9, night)
	env.glow_bloom = lerpf(0.0, 0.06, night)
	if _forward:
		env.volumetric_fog_density = lerpf(0.0012, 0.006, night)
		env.volumetric_fog_albedo = cols[1].lerp(Color.WHITE, 0.35)
	env.adjustment_brightness = 1.0
	# things that glow by night
	for g in glowers:
		var m: BaseMaterial3D = g[0]
		m.emission_energy_multiplier = float(g[1]) * lerpf(float(g[2]), 1.0, night)

## Tell the cycle where the street lamps are; the pool of real lights follows whichever are nearest.
func set_lamps(p: PackedVector3Array) -> void:
	lamps = p

func _process(dt: float) -> void:
	update(dt)
	_pool_t -= dt
	if _pool_t > 0.0 or focus == null or lamps.is_empty():
		return
	_pool_t = 0.35
	var fp := focus.global_position
	var near: Array = []
	for v in lamps:
		var d := (v - fp).length_squared()
		if d < 90.0 * 90.0:
			near.append([d, v])
	near.sort_custom(func(a, b): return a[0] < b[0])
	for i in _pool.size():
		var l := _pool[i]
		if i < near.size() and night_amount > 0.05:
			l.global_position = near[i][1] + Vector3(0, -0.4, 0)
			l.light_energy = 3.2 * night_amount
			l.visible = true
		else:
			l.visible = false
