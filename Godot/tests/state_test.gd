extends Node
## Rules checks for the shop data and the player state (no rendering needed).
func _ready() -> void:
	_run.call_deferred()
func _run() -> void:
	var gd = get_node("/root/GameData")
	var gs = get_node("/root/GameState")
	var fails := PackedStringArray()
	for b in ["eleven", "petmart", "arms", "vending", "ramen", "sushi", "pharmacy", "books", "clothes", "dokoto"]:
		var sh: Array = gd.shelves_for(b)
		var n := 0
		for s in sh:
			n += s.items.size()
		print("%-9s %d shelves, %d items" % [b, sh.size(), n])
		if n == 0: fails.append("empty shop " + b)
	# eleven sells the keypad phone, petmart does not
	var e := 0
	for s in gd.shelves_for("petmart"):
		for it in s.items:
			if it.id == "eleven": e += 1
	if e != 0: fails.append("petmart sells the 11 phone")
	# stress rules
	gs.stress = 0.8
	var r: float = gs.eat_relief("ramen", -0.1)
	print("comfort relief at stress 0.8: ", r)
	if r > -0.15: fails.append("comfort food should help more when stressed")
	gs.stress = 0.1
	if gs.eat_relief("ramen", -0.1) != -0.1: fails.append("comfort bonus applied when calm")
	gs.stress = 0.6
	var before: float = gs.stress
	gs.spend(5000)
	if gs.stress >= before: fails.append("buying did not ease stress")
	if gs.money != 495000: fails.append("money wrong")
	gs.give("bento", 1)
	var h0: float = gs.health
	gs.health = 0.5
	var line: String = gs.use("bento")
	print("use bento: ", line, " health ", gs.health)
	if gs.health <= 0.5 or gs.has_item("bento"): fails.append("bento did not heal or was not consumed")
	# health must not regenerate by itself
	gs.health = 0.5
	for i in 600: gs.tick(0.1)
	if gs.health != 0.5: fails.append("health regenerated on its own")
	# outdoors lowers stress
	gs.stress = 0.5
	gs.outdoors = true
	for i in 600: gs.tick(0.1)
	if gs.stress >= 0.5: fails.append("outdoors did not ease stress")
	print("STATE TEST ", "PASSED" if fails.is_empty() else "FAILED: " + ", ".join(fails))
	get_tree().quit(0 if fails.is_empty() else 1)
