class_name Crossing
extends Node3D
## One level crossing: two barrier arms, two flashing lamps, and a flag the traffic reads.

var down := false
var amount := 1.0       # 1 = raised, 0 = lowered
var road_z := 0.0
var rail_x := 0.0
var _arms: Array[Node3D] = []
var _dirs: Array[float] = []
var _lamps: Array[MeshInstance3D] = []
var _t := 0.0

func setup(zk: float, rx: float) -> void:
	road_z = zk
	rail_x = rx
	var arm_mat := StandardMaterial3D.new()
	arm_mat.albedo_color = Color(0.95, 0.95, 0.95)
	arm_mat.emission_enabled = true
	arm_mat.emission = Color(0.25, 0.1, 0.1)
	var stripe_mat := StandardMaterial3D.new()
	stripe_mat.albedo_color = Color(0.82, 0.12, 0.12)
	stripe_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var post_mat := StandardMaterial3D.new()
	post_mat.albedo_color = Color(0.22, 0.25, 0.3)
	for d in [[-1.0, -6.0, 1.0], [1.0, 6.0, -1.0]]:
		var piv := Node3D.new()
		piv.position = Vector3(rx + d[0] * 7.4, 0.3, zk + d[1])
		add_child(piv)
		var arm := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.2, 0.22, 6.0)
		bm.material = arm_mat
		arm.mesh = bm
		arm.position.z = d[2] * 3.0
		piv.add_child(arm)
		for n in 3:
			var st := MeshInstance3D.new()
			var sm := BoxMesh.new()
			sm.size = Vector3(0.22, 0.24, 0.6)
			sm.material = stripe_mat
			st.mesh = sm
			st.position.z = d[2] * (1.0 + n * 2.0)
			piv.add_child(st)
		var post := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.12
		cm.bottom_radius = 0.12
		cm.height = 3.2
		cm.material = post_mat
		post.mesh = cm
		post.position = Vector3(rx + d[0] * 7.4, 1.9, zk + d[1])
		add_child(post)
		var lamp := MeshInstance3D.new()
		var sm2 := SphereMesh.new()
		sm2.radius = 0.28
		sm2.height = 0.56
		var lm := StandardMaterial3D.new()
		lm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		lm.albedo_color = Color(0.25, 0.06, 0.06)
		sm2.material = lm
		lamp.mesh = sm2
		lamp.position = Vector3(rx + d[0] * 7.4, 3.6, zk + d[1])
		add_child(lamp)
		_arms.append(piv)
		_dirs.append(d[2])
		_lamps.append(lamp)

func update_state(dt: float, trains: Array) -> void:
	_t += dt
	down = false
	for tr in trains:
		if tr.waiting > 0.0:
			continue
		if tr.dir > 0:
			if tr.front > road_z - 95.0 and tr.tail < road_z + 16.0:
				down = true
		else:
			if tr.front < road_z + 95.0 and tr.tail > road_z - 16.0:
				down = true
	amount += ((0.0 if down else 1.0) - amount) * minf(1.0, 2.2 * dt)
	for i in _arms.size():
		_arms[i].rotation.x = -_dirs[i] * 1.3 * amount
		var on := down and int(_t * 3.0) % 2 == (i % 2)
		var m := (_lamps[i].mesh as SphereMesh).material as StandardMaterial3D
		m.albedo_color = Color(1.0, 0.1, 0.08) if on else Color(0.25, 0.06, 0.06)
