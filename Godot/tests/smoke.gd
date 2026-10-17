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
	# map, waypoint and pause menu
	g._open_map()
	if not g.map_ui.visible: fails.append("map did not open")
	g.map_ui.close()
	var gs2 = get_node("/root/GameState")
	gs2.waypoint = g.player.global_position + Vector3(200, 0, 0)
	g._update_waypoint()
	if not g.beam.visible: fails.append("waypoint beam not shown")
	g.player.global_position = Vector3(gs2.waypoint.x - 3.0, 0.3, gs2.waypoint.z)
	g._update_waypoint()
	if gs2.waypoint != Vector3.INF: fails.append("waypoint did not clear on arrival")
	g._pause()
	if not g.pause_menu.visible: fails.append("pause menu did not open")
	g._resume()
	if get_tree().paused: fails.append("still paused after resume")
	print("street name test: ", MapDraw.street_name(g.world, 104.0, 104.0), " | ", MapDraw.street_name(g.world, 104.0, 130.0))
	# activities: each opens, runs and ends with a result, moving stress
	var gsx = get_node("/root/GameState")
	var act: ActivityUI = g.activity_ui
	gsx.money = 100000
	for k in ["sento", "bench", "pachinko", "karaoke", "arcade", "fishing"]:
		gsx.stress = 0.7
		act.open(k)
		if k == "arcade":
			act._choose(0)
			for i in 600:
				act.step(0.05)
				if i % 7 == 0: act._play_key(KEY_UP if (i / 7) % 2 == 0 else KEY_RIGHT)
				if act._mode != "play": break
			act.close()
			act.open(k)
			act._choose(1)
			for i in 4000:
				act.step(0.02)
				if act._mode != "play": break
		else:
			act._choose(0)
			if k == "karaoke":
				var tt := 0.0
				while act._mode == "play" and tt < 40.0:
					act.step(0.02)
					tt += 0.02
					for nt in act._notes:
						if not nt.done and absf(nt.t - act._t) < 0.03:
							act._karaoke_press(nt.lane)
			elif k == "fishing":
				var tt2 := 0.0
				while act._mode == "play" and tt2 < 30.0:
					act.step(0.02)
					tt2 += 0.02
					if act._bite and act._bar >= act._zone.x and act._bar <= act._zone.y:
						act._fish_press()
			elif k == "pachinko":
				for i in 200: act.step(0.02)
		print("activity %-9s -> mode %s | stress %.2f | %s" % [k, act._mode, gsx.stress, act._result])
		if act._mode == "play": fails.append(k + " never finished")
		if k in ["sento", "bench", "karaoke"] and gsx.stress >= 0.7: fails.append(k + " did not lower stress")
		act.close()
	print("spots: %d  (benches and piers)" % g.world.spots.size())
	# the phone: open every app and make sure each builds without error
	g._open_phone()
	for a in GameData.raw.phone_apps:
		g.phone_ui.open_app(a[0])
		await get_tree().process_frame
	g.phone_ui.open_app("Poodle")
	await get_tree().process_frame
	for s in GameData.raw.web:
		g.phone_ui._site(s)
		await get_tree().process_frame
		g.phone_ui._back()
	for s in GameData.raw.filler_sites:
		g.phone_ui._site(s)
		await get_tree().process_frame
		g.phone_ui._back()
	var gs3 = get_node("/root/GameState")
	var money0: int = gs3.money
	var item := {"id": "coffee", "name": "Canned coffee", "price": 130}
	g.phone_ui._web_buy(item, 2.0)
	if gs3.money != money0 - 130 or gs3.deliveries.size() != 1: fails.append("online order did not charge or queue")
	gs3.advance_minutes(200.0)
	gs3.tick(0.01)
	if not gs3.has_item("coffee"): fails.append("parcel never arrived")
	g.phone_ui.close_phone()
	print("phone: all %d apps and %d sites built" % [GameData.raw.phone_apps.size(), GameData.raw.web.size() + GameData.raw.filler_sites.size()])
	print("SMOKE TEST ", "PASSED" if fails.is_empty() else "FAILED: " + ", ".join(fails))
	get_tree().quit(0 if fails.is_empty() else 1)
