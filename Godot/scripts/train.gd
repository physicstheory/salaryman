class_name Train
extends AnimatableBody3D
## A train on the fenced line. It shuttles end to end, waits, and goes again; anything on the
## track when it arrives is killed, and the body itself is solid so cars crumple against it.

var dir := 1.0
var speed := 22.0
var car_len := 7.4
var cars: Array[Node3D] = []
var rail_x := 0.0
var track_off := 2.0
var world_len := 416.0
var waiting := 0.0
var z := 0.0
var front := 0.0
var tail := 0.0
var _shape: CollisionShape3D

func setup(names: Array, d: float, rx: float, wl: float, sp: float, start_z: float, wait: float) -> void:
	dir = d
	rail_x = rx
	world_len = wl
	speed = sp
	track_off = 2.0 * d
	sync_to_physics = true
	for i in names.size():
		var scn := load("res://assets/kenney/train/%s.glb" % names[i]) as PackedScene
		var c := scn.instantiate() as Node3D
		c.scale = Vector3.ONE * 3.0
		# the kit's rear car is turned round so its cab faces the other way
		c.rotation.y = (PI if i == names.size() - 1 else 0.0) + (PI if d < 0.0 else 0.0)
		add_child(c)
		cars.append(c)
	# the whole consist is a single box, centred between the first and last car
	_shape = CollisionShape3D.new()
	var box := BoxShape3D.new()
	var n := float(names.size())
	box.size = Vector3(3.6, 6.0, n * car_len)
	_shape.shape = box
	_shape.position = Vector3(0, 3.2, 0)
	add_child(_shape)
	z = start_z
	waiting = wait
	if wait > 0.0:
		z = d * 1.0e4
	_apply()

func _apply() -> void:
	# the lead car sits at z; the others trail behind it
	var n := cars.size()
	# the body sits at the middle of the consist; car 0 leads, so it is furthest along the direction of travel
	position = Vector3(rail_x + track_off, 0.0, z - dir * float(n - 1) * car_len * 0.5)
	for i in n:
		var along := (float(n - 1) * 0.5 - float(i)) * car_len * dir
		cars[i].position = Vector3(0, 0.62 + 0.36 * 3.0, along)
	front = z + dir * car_len * 0.5
	tail = z - dir * (float(n - 1) * car_len + car_len * 0.5)

func _physics_process(dt: float) -> void:
	if waiting > 0.0:
		waiting -= dt
		if waiting <= 0.0:
			z = -car_len * cars.size() - 20.0 if dir > 0.0 else world_len + car_len * cars.size() + 20.0
	else:
		z += dir * speed * dt
		var n := float(cars.size())
		if (dir > 0.0 and z - n * car_len > world_len + 30.0) or (dir < 0.0 and z + n * car_len < -30.0):
			waiting = 5.0 + randf() * 8.0
			z = dir * 1.0e4
	_apply()
	if waiting <= 0.0:
		var lo := minf(front, tail) - 1.0
		var hi := maxf(front, tail) + 1.0
		for node in get_tree().get_nodes_in_group("killable"):
			var p := (node as Node3D).global_position
			if absf(p.x - (rail_x + track_off)) < 2.3 and p.z > lo and p.z < hi:
				if node.has_method("die"):
					node.die("HIT BY A TRAIN")
