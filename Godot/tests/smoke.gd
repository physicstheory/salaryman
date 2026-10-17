extends Node
## Boots the real game headless, gets into a car, drives it, and checks the world behaves.
## Run: godot --headless --path Godot --script res://tests/smoke.gd

func _ready() -> void:
	Engine.physics_ticks_per_second = 120
	var scene := load("res://scenes/main.tscn") as PackedScene
	var g := scene.instantiate() as Game
	g.smoke_test = true
	add_child(g)
	_run.call_deferred(g)

func _run(g: Game) -> void:
	var fails := PackedStringArray()
	for i in 240:
		await get_tree().physics_frame
	print("buildings placed: ", g.world.building_count, "  crossings: ", g.world.crossings.size(), "  trains: ", g.world.trains.size(), "  parked: ", g.parked.size(), "  traffic: ", g.traffic.size())
	if g.world.building_count < 100: fails.append("too few buildings")
	var start := g.parked[0].global_position
	if absf(g.parked[0].global_position.y - g.parked[0].spec.com_height) > 0.15: fails.append("parked car not resting at ride height: %.2f" % g.parked[0].global_position.y)
	# walk to the sports car and get in
	g.player.global_position = start + Vector3(2.0, 0.2, 0)
	await get_tree().physics_frame
	var v := g.nearest_vehicle(g.player.global_position)
	if v == null: fails.append("no vehicle near the player")
	else:
		g.enter(v)
		if g.current != v: fails.append("could not enter")
	# drive: throttle and a little steering, hold for 8 seconds
	var traffic_start: Array[Vector3] = []
	for t in g.traffic: traffic_start.append(t.global_position)
	g.set_physics_process(false)
	# the parked cars are nose to tail, so start from open road
	v.global_position = Vector3(2.0 * CityWorld.P - 3.0, 0.6, 5.0 * CityWorld.P + 40.0)
	v.global_rotation = Vector3.ZERO
	v.linear_velocity = Vector3.ZERO
	await get_tree().physics_frame
	var p0 := v.global_position
	for i in 120 * 8:
		v.throttle = 1.0
		v.steer_in = 0.0
		await get_tree().physics_frame
	var d := p0.distance_to(v.global_position)
	print("drove %.0f m in 8 s, now %.0f km/h, gear %d, health %.0f" % [d, v.speed_kmh(), v.gear, v.health])
	if d < 60.0: fails.append("barely moved: %.1f m" % d)
	if is_nan(v.global_position.x): fails.append("NaN position")
	# leave
	v.throttle = 0.0
	v.brake = 1.0
	for i in 120 * 6: await get_tree().physics_frame
	g.leave()
	if g.current != null: fails.append("could not leave")
	# traffic should have moved
	var moved := 0
	for i in g.traffic.size():
		if g.traffic[i].global_position.distance_to(traffic_start[i]) > 15.0: moved += 1
	print("traffic cars that moved >15 m: %d of %d" % [moved, g.traffic.size()])
	if moved < g.traffic.size() / 2: fails.append("traffic is not driving")
	var wrecked := 0
	for t in g.traffic:
		if t.wrecked or t.global_position.y > 3.0 or t.global_position.y < -1.0: wrecked += 1
		print("  traffic %s health %.0f pos %s speed %.1f" % [t.kind, t.health, str(t.global_position.round()), t.speed_kmh()])
	print("traffic wrecked or lost: ", wrecked)
	# trains
	var tz := 0.0
	for tr in g.world.trains: if tr.waiting <= 0.0: tz = tr.z
	print("train positions: ", g.world.trains.map(func(t): return "%.0f(w%.1f)" % [t.z, t.waiting]))
	# shops: every chain should be on the map, and one should open and sell
	var brands := {}
	for s in g.world.shops: brands[s.brand] = true
	print("shops: %d  brands: %s  vending machines: %d" % [g.world.shops.size(), ", ".join(brands.keys()), g.world.vendors.size()])
	if g.world.shops.size() < 15: fails.append("too few shops")
	for need in ["eleven", "ramen", "petmart", "sushi", "pharmacy", "books", "clothes"]:
		if not brands.has(need): fails.append("no " + need)
	var shop = g.world.shops[0]
	g.player.global_position = shop.door
	g.player.global_position.y = 0.4
	var door = g.nearest_door(g.player.global_position)
	if door == null: fails.append("shop door not found")
	else:
		g.open_shop(door)
		var gs = get_node("/root/GameState")
		var yen0: int = gs.money
		var shelves: Array = get_node("/root/GameData").shelves_for(door.brand)
		g.shop_ui.shelves = shelves
		g.shop_ui._fill_shelves()
		g.shop_ui._buy(0)
		print("bought one thing at %s: money %d -> %d, bag %s" % [door.shop_name, yen0, gs.money, str(gs.bag)])
		if gs.money >= yen0: fails.append("purchase did not cost anything")
		g.shop_ui.close()
	print("SMOKE TEST ", "PASSED" if fails.is_empty() else "FAILED: " + ", ".join(fails))
	get_tree().quit(0 if fails.is_empty() else 1)
