extends SceneTree
func _initialize() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.25, 0.27, 0.32)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.7, 0.7, 0.75)
	env.environment = e
	root.add_child(env)
	var l := DirectionalLight3D.new()
	l.rotation_degrees = Vector3(-45, 35, 0)
	root.add_child(l)
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.current = true
	_go.call_deferred(cam)
func _go(cam: Camera3D) -> void:
	DirAccess.make_dir_recursive_absolute("/tmp/godot/bld")
	for i in range(1, 51):
		var m := load("res://assets/buildings/jp/b%02d.obj" % i) as Mesh
		var mi := MeshInstance3D.new()
		mi.mesh = m
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.82, 0.8, 0.76)
		mat.roughness = 0.9
		mi.material_override = mat
		root.add_child(mi)
		var bb := m.get_aabb()
		mi.position = Vector3(-(bb.position.x + bb.size.x * 0.5), -bb.position.y, -(bb.position.z + bb.size.z * 0.5))
		var r := maxf(bb.size.y, maxf(bb.size.x, bb.size.z))
		cam.fov = 40
		cam.global_position = Vector3(r * 1.1, bb.size.y * 0.7 + r * 0.25, r * 1.5)
		cam.look_at(Vector3(0, bb.size.y * 0.45, 0))
		await process_frame
		await process_frame
		root.get_texture().get_image().save_png("/tmp/godot/bld/b%02d.png" % i)
		print("b%02d size %.1f x %.1f x %.1f  tris %d" % [i, bb.size.x, bb.size.y, bb.size.z, (m.surface_get_arrays(0)[Mesh.ARRAY_INDEX] as PackedInt32Array).size() / 3])
		mi.queue_free()
	quit()
