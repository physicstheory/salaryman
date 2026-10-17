class_name AIDriver
extends Node
## Drives a Vehicle round the city grid, in the left-hand lane, like the traffic in the web build.
## Pure pursuit on a point a little ahead in the lane, a ray for the car in front, and the
## level-crossing barriers read from the world.

var car: Vehicle
var world: CityWorld
var heading := Vector3(0, 0, -1)
var cruise := 11.0
var _ray: RayCast3D
var _stuck := 0.0
var _next := Vector3(0, 0, -1)
var _decided_line := -999.0

func setup(c: Vehicle, w: CityWorld, h: Vector3, speed: float) -> void:
	car = c
	world = w
	heading = h
	_next = h
	cruise = speed
	_ray = RayCast3D.new()
	_ray.target_position = Vector3(0, 0, -18)
	_ray.position = Vector3(0, 0.6, -2.4)
	_ray.add_exception(car)
	_ray.collide_with_areas = false
	car.add_child(_ray)

func _coord(p: Vector3) -> float:
	return p.x if absf(heading.x) > 0.5 else p.z

func _left() -> Vector3:
	return Vector3(heading.z, 0, -heading.x)

func _physics_process(dt: float) -> void:
	if car == null or car.wrecked:
		return
	var P := CityWorld.P
	var N := CityWorld.N
	var pos := car.global_position
	var lane := 3.0
	var L := clampf(car.forward_speed * 0.8, 6.0, 14.0)
	var axis_x := absf(heading.x) > 0.5
	var c := pos.x if axis_x else pos.z
	var sgn := heading.x + heading.z
	# the next intersection line ahead, and how far off it is
	var line := floorf(c / P) + (1.0 if sgn > 0.0 else 0.0)
	if _decided_line > -900.0:
		line = _decided_line           # stay on the line we have chosen for until we are across it
	var dist := (line * P - c) * sgn
	if _decided_line != line and dist < 18.0:
		_choose_turn(pos, line)
		_decided_line = line
	var other := pos.z if axis_x else pos.x
	var o := clampf(roundf(other / P), 0, N)
	var cx := line * P if axis_x else o * P
	var cz := o * P if axis_x else line * P
	var turning := _next != heading
	var target: Vector3
	var left := Vector3(heading.z, 0, -heading.x)
	if turning and dist < 11.0:
		# aim for the middle of the exit lane, a little way down the new road
		var el := Vector3(_next.z, 0, -_next.x)
		target = Vector3(cx, 0, cz) + _next * 13.0 + el * lane
	elif axis_x:
		target = Vector3(pos.x + heading.x * L, 0, o * P + lane * left.z)
	else:
		target = Vector3(o * P + lane * left.x, 0, pos.z + heading.z * L)
	# commit to the new heading once the car is across the line
	if dist <= 0.0 and _decided_line == line:
		heading = _next
		_decided_line = -999.0
	var local := car.global_transform.affine_inverse() * target
	var ang := atan2(local.x, -local.z)
	car.steer_in = clampf(ang * 1.7, -1.0, 1.0)
	var spd := cruise * (1.0 - 0.5 * minf(absf(car.steer_in), 1.0))
	if turning and dist < 24.0:
		spd = minf(spd, 6.5)
	if _ray.is_colliding():
		var d := (_ray.get_collision_point() - _ray.global_position).length()
		spd = minf(spd, maxf(0.0, (d - 4.5) * 1.5))
	var bd := world.barrier_distance(pos, heading)
	if bd < INF:
		spd = minf(spd, maxf(0.0, (bd - 0.5) * 1.8))
	var err := spd - car.forward_speed
	car.throttle = clampf(err * 0.35, 0.0, 0.8)
	car.brake = clampf(-err * 0.25, 0.0, 1.0)
	car.handbrake = false
	if absf(car.forward_speed) < 0.4 and spd > 1.0:
		_stuck += dt
	else:
		_stuck = 0.0
	if _stuck > 6.0:
		_stuck = 0.0
		_recover()

## Put a stranded car back on its lane, facing the way it was going.
func _recover() -> void:
	var P := CityWorld.P
	var N := CityWorld.N
	var pos := car.global_position
	var left := Vector3(heading.z, 0, -heading.x)
	var np := pos
	if absf(heading.x) > 0.5:
		np = Vector3(pos.x, 0.9, clampf(roundf(pos.z / P), 0, N) * P + 3.0 * left.z)
	else:
		np = Vector3(clampf(roundf(pos.x / P), 0, N) * P + 3.0 * left.x, 0.9, pos.z)
	np.x = clampf(np.x, 3.0, P * N - 3.0)
	np.z = clampf(np.z, 3.0, P * N - 3.0)
	car.global_transform = Transform3D(Basis(Vector3.UP, atan2(-heading.x, -heading.z)), np)
	car.linear_velocity = Vector3.ZERO
	car.angular_velocity = Vector3.ZERO
	for w in car.wheels:
		w.omega = 0.0
	_next = heading
	_decided_line = -999.0

func _choose_turn(pos: Vector3, line: float) -> void:
	var P := CityWorld.P
	var N := CityWorld.N
	var other := pos.z if absf(heading.x) > 0.5 else pos.x
	var o := clampf(roundf(other / P), 0, N)
	var opts: Array = [heading]
	var sides: Array = [Vector3(0, 0, 1), Vector3(0, 0, -1)] if absf(heading.x) > 0.5 else [Vector3(1, 0, 0), Vector3(-1, 0, 0)]
	for s in sides:
		var idx: float = o + (s.x + s.z)
		if idx >= 0 and idx <= N:
			opts.append(s)
	var ahead := line + (heading.x + heading.z)
	if ahead < 0 or ahead > N:
		opts.pop_front()
	if opts.is_empty():
		_next = heading
		return
	_next = opts[0] if randf() < 0.55 else opts[randi() % opts.size()]
