class_name AdBoards
extends RefCounted
## Signage for the city, in the manner of a Japanese high street: shop-name signs over the doors,
## tall vertical blade signs (袖看板) standing out from the wall, big rooftop billboards, and
## banner screens on the towers. Everything advertises brands that exist in the game, so the
## streets tell you where the shops are.

const ADS := [
	# [headline, small line, background, text colour]
	["ガンバレ エナジー", "GANBARE ENERGY · 一日中、戦え。", Color(0.82, 0.08, 0.1), Color(1.0, 0.95, 0.3)],
	["SOTI So26 Ultra", "世界最高のカメラ · 2億画素", Color(0.04, 0.06, 0.1), Color(0.5, 0.92, 1.0)],
	["Pear P17 Pro", "もっと薄く。もっと速く。", Color(0.9, 0.9, 0.92), Color(0.08, 0.08, 0.1)],
	["黒鉄 プレステージ", "KUROGANE PRESTIGE", Color(0.03, 0.03, 0.04), Color(0.9, 0.74, 0.38)],
	["丸一カーセンター", "Maruichi Car Centre · 中古車", Color(0.12, 0.38, 0.8), Color.WHITE],
	["麺屋 一杯", "MENYA IPPAI · 深夜営業", Color(0.7, 0.12, 0.12), Color.WHITE],
	["すしゴーゴー", "SUSHI GO-GO · 一皿 ¥150〜", Color.WHITE, Color(0.76, 0.08, 0.17)],
	["クスリ プラス", "KUSURI PLUS · 薬・美容・健康", Color(0.06, 0.54, 0.32), Color.WHITE],
	["本の森", "HON-NO-MORI · 本・漫画・雑誌", Color(0.36, 0.23, 0.14), Color(0.96, 0.8, 0.4)],
	["スーツ セレクト", "SUIT SELECT · シャツ・ネクタイ", Color(0.1, 0.17, 0.29), Color(0.82, 0.84, 0.88)],
	["コント・プラザ", "KONTO PLAZA · 4フロア", Color(0.35, 0.23, 0.54), Color(1.0, 0.82, 0.1)],
	["ドコト カメラ", "DOKOTO CAMERA · カメラ スマホ ゲーム", Color(0.83, 0.08, 0.17), Color(1.0, 0.85, 0.1)],
	["カプセルホテル", "CAPSULE KAPUSERU · 一泊 ¥3,500", Color(0.1, 0.14, 0.19), Color(0.48, 0.82, 1.0)],
	["ミツボシ サイダー", "MITSUBOSHI CIDER · シュワッと", Color(0.16, 0.58, 0.48), Color.WHITE],
	["ポカリ スウェット", "POCARY SWEAT · 汗の分だけ", Color(0.17, 0.47, 0.85), Color.WHITE],
	["コント新聞", "KONTO SHIMBUN · 朝刊 ¥160", Color(0.92, 0.9, 0.82), Color(0.08, 0.08, 0.08)],
	["日本鉄道", "NIHON RAIL · 環状線", Color(0.08, 0.48, 0.27), Color.WHITE],
	["ライド", "RYDE · 3分でお迎え", Color(0.07, 0.7, 0.42), Color.WHITE],
	["ハヤビン", "HAYABIN · 即日配達", Color(0.95, 0.5, 0.1), Color.WHITE],
	["ブードル", "POODLE · 何でも検索", Color(0.23, 0.43, 0.66), Color.WHITE],
	["マイグラム", "MyGram · 今日の一枚", Color(0.2, 0.08, 0.32), Color(1.0, 0.5, 0.82)],
	["11 イレブン", "11 ELEVEN · 24時間営業", Color(0.04, 0.42, 0.26), Color(0.95, 0.5, 0.1)],
	["ペットマート", "PET MART · あなたの街の", Color(0.07, 0.45, 0.84), Color.WHITE],
	["パチンコ 黄金", "PACHINKO GOLDEN LOTUS", Color(0.7, 0.52, 0.04), Color(0.12, 0.02, 0.02)],
	["カラオケ 夜", "KARAOKE · 24時間", Color(0.5, 0.1, 0.6), Color(1.0, 0.9, 0.4)],
	["オロナミン Z", "ORONAMIN Z · 元気ハツラツ", Color(0.78, 0.4, 0.1), Color.WHITE],
	["残業ゼロ党", "OVERTIME ZERO PARTY · 定時で帰ろう", Color(0.16, 0.3, 0.55), Color(1.0, 0.95, 0.5)],
]
const BLADES := [
	["ラーメン", Color(1.0, 0.35, 0.45)], ["パチンコ", Color(1.0, 0.82, 0.2)], ["居酒屋", Color(1.0, 0.55, 0.25)],
	["カラオケ", Color(0.88, 0.48, 1.0)], ["薬局", Color(0.45, 1.0, 0.6)], ["ホテル", Color(1.0, 0.6, 0.2)],
	["スナック", Color(1.0, 0.45, 0.8)], ["寿司", Color(1.0, 0.35, 0.35)], ["焼肉", Color(1.0, 0.5, 0.2)],
	["二十四時間", Color(0.45, 1.0, 0.7)], ["美容室", Color(0.95, 0.6, 0.95)], ["歯科", Color(0.5, 0.85, 1.0)],
	["麻雀", Color(0.5, 1.0, 0.5)], ["古書", Color(0.95, 0.8, 0.45)], ["質屋", Color(1.0, 0.85, 0.3)],
	["英会話", Color(0.5, 0.8, 1.0)], ["珈琲", Color(0.85, 0.6, 0.35)], ["餃子", Color(1.0, 0.7, 0.3)],
]
const SHOP_NAMES := ["麺屋 一杯", "すしゴーゴー", "クスリ プラス", "本の森", "スーツ セレクト", "11 イレブン", "ペットマート", "ドコト カメラ", "カプセルホテル", "喫茶 夜行", "ブックオフ 昭和堂", "焼鳥 ひろ", "居酒屋 だるま", "雀荘 東風", "スナック 月影", "薬局 ひまわり", "写真館 光", "文具 まるき", "靴 みどり屋", "立ち飲み 角"]
const VISIBLE_TO := 150.0

static func _glow(c: Color, energy := 1.4) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c.darkened(0.55)
	m.emission_enabled = true
	m.emission = c
	m.emission_energy_multiplier = energy
	m.roughness = 0.6
	return m

static func _label(parent: Node3D, text: String, col: Color, pos: Vector3, yaw: float, px: float, size := 64, outline := 10) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.modulate = col
	l.shaded = false
	l.double_sided = false
	l.font_size = size
	l.pixel_size = px
	l.outline_size = outline
	l.outline_modulate = Color(0.02, 0.02, 0.04)
	l.position = pos
	l.rotation.y = yaw
	l.visibility_range_end = VISIBLE_TO
	parent.add_child(l)
	return l

static func _panel(parent: Node3D, size: Vector3, pos: Vector3, yaw: float, c: Color, energy := 1.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	bm.material = _glow(c, energy)
	mi.mesh = bm
	mi.position = pos
	mi.rotation.y = yaw
	mi.visibility_range_end = VISIBLE_TO + 60.0
	parent.add_child(mi)
	return mi

## A vertical blade sign standing out from a wall: a lit panel with the words stacked down it, readable
## from both directions along the street.
static func blade(parent: Node3D, base: Vector3, out_n: Vector3, height: float, word: String, col: Color) -> void:
	var yaw := atan2(out_n.x, out_n.z)                    # panel's local +Z points away from the wall
	var holder := Node3D.new()
	holder.position = base + out_n * 0.7
	holder.rotation.y = yaw
	parent.add_child(holder)
	_panel(holder, Vector3(0.28, height, 1.15), Vector3(0, height * 0.5, 0), 0.0, col.darkened(0.4), 0.7)
	var n := word.length()
	var step := minf(height / float(n + 1), 1.15)
	for side in [-1.0, 1.0]:
		for i in n:
			var y := height - (float(i) + 0.9) * step
			var l := _label(holder, word[i], col.lightened(0.35), Vector3(side * 0.15, y, 0), PI * 0.5 * side, 0.0095, 110, 14)
			l.double_sided = false

static func shop_sign(parent: Node3D, pos: Vector3, yaw: float, width: float, text: String, col: Color) -> void:
	var holder := Node3D.new()
	holder.position = pos
	holder.rotation.y = yaw
	parent.add_child(holder)
	_panel(holder, Vector3(width, 1.05, 0.2), Vector3.ZERO, 0.0, col.darkened(0.45), 0.9)
	_label(holder, text, col.lightened(0.4), Vector3(0, 0.0, 0.12), 0.0, 0.0105, 96, 12)

static func billboard(parent: Node3D, pos: Vector3, yaw: float, w: float, ad: Array) -> void:
	var holder := Node3D.new()
	holder.position = pos
	holder.rotation.y = yaw
	parent.add_child(holder)
	var h := w * 0.42
	var bg: Color = ad[2]
	var fg: Color = ad[3]
	# frame, panel, and two legs to the roof
	_panel(holder, Vector3(w + 0.5, h + 0.5, 0.35), Vector3(0, h * 0.5 + 1.2, -0.05), 0.0, Color(0.12, 0.12, 0.14), 0.0)
	_panel(holder, Vector3(w, h, 0.2), Vector3(0, h * 0.5 + 1.2, 0.05), 0.0, bg.lerp(Color.WHITE, 0.1), 0.9)
	for sx in [-0.35, 0.35]:
		_panel(holder, Vector3(0.25, 1.4, 0.25), Vector3(sx * w, 0.6, 0.0), 0.0, Color(0.14, 0.14, 0.16), 0.0)
	_label(holder, ad[0], fg, Vector3(0, h * 0.62 + 1.2, 0.2), 0.0, w * 0.0021, 120, 14)
	_label(holder, ad[1], fg.lerp(Color.WHITE, 0.3), Vector3(0, h * 0.2 + 1.2, 0.2), 0.0, w * 0.0009, 80, 8)
	# a bar of the brand colour along the foot, which is most of what makes a billboard read
	_panel(holder, Vector3(w, h * 0.06, 0.22), Vector3(0, 1.2 + h * 0.03, 0.06), 0.0, fg, 1.2)

## A tall banner on the wall of a tower.
static func wall_banner(parent: Node3D, pos: Vector3, out_n: Vector3, w: float, h: float, ad: Array) -> void:
	var yaw := atan2(out_n.x, out_n.z)
	var holder := Node3D.new()
	holder.position = pos + out_n * 0.12
	holder.rotation.y = yaw
	parent.add_child(holder)
	_panel(holder, Vector3(w, h, 0.12), Vector3.ZERO, 0.0, (ad[2] as Color), 0.75)
	_label(holder, ad[0], ad[3], Vector3(0, h * 0.18, 0.08), 0.0, w * 0.0058, 110, 12).autowrap_mode = TextServer.AUTOWRAP_ARBITRARY
	_label(holder, ad[1], (ad[3] as Color).lerp(Color.WHITE, 0.3), Vector3(0, -h * 0.3, 0.08), 0.0, w * 0.0026, 80, 8).autowrap_mode = TextServer.AUTOWRAP_ARBITRARY

## Dress one building. `box` is its world bounds, `outs` the street-facing directions (unit vectors in x or z).
static func dress(parent: Node3D, rng: RandomNumberGenerator, box: AABB, outs: Array, tall_enough_for_banner: bool) -> void:
	var top := box.position.y + box.size.y
	var centre := box.get_center()
	for out_n in outs:
		var n: Vector3 = out_n
		var t := Vector3(-n.z, 0, n.x)
		var face_w := absf(t.x) * box.size.x + absf(t.z) * box.size.z
		var depth := absf(n.x) * box.size.x * 0.5 + absf(n.z) * box.size.z * 0.5
		var wall := Vector3(centre.x, 0, centre.z) + n * depth
		var yaw := atan2(n.x, n.z)
		# the shop name over the door
		if rng.randf() < 0.85:
			var nm: String = SHOP_NAMES[rng.randi() % SHOP_NAMES.size()]
			var col: Color = BLADES[rng.randi() % BLADES.size()][1]
			shop_sign(parent, wall + n * 0.16 + t * rng.randf_range(-face_w * 0.25, face_w * 0.25) + Vector3(0, 3.55 + box.position.y, 0), yaw, minf(nm.length() * 0.95 + 1.2, face_w * 0.8), nm, col)
		# blade signs, one to three, at the corners and middle of the face
		var blades := rng.randi_range(1, 3)
		for i in blades:
			var b: Array = BLADES[rng.randi() % BLADES.size()]
			var along := (float(i) - float(blades - 1) * 0.5) * face_w * 0.4 + rng.randf_range(-1.0, 1.0)
			var hh := rng.randf_range(4.0, minf(9.0, box.size.y * 0.5))
			blade(parent, wall + t * clampf(along, -face_w * 0.45, face_w * 0.45) + Vector3(0, box.position.y + rng.randf_range(4.8, maxf(5.0, box.size.y * 0.55 - hh)), 0), n, hh, b[0], b[1])
		# a banner screen up the tower
		if tall_enough_for_banner and rng.randf() < 0.55:
			var ad: Array = ADS[rng.randi() % ADS.size()]
			var bh := rng.randf_range(7.0, 11.0)
			wall_banner(parent, wall + t * rng.randf_range(-face_w * 0.2, face_w * 0.2) + Vector3(0, box.position.y + maxf(10.0, box.size.y * 0.55), 0), n, minf(face_w * 0.35, 3.6), bh, ad)
	# a billboard on the roof of some, facing the first street
	if outs.size() > 0 and rng.randf() < 0.4:
		var n: Vector3 = outs[0]
		var t := Vector3(-n.z, 0, n.x)
		var face_w := absf(t.x) * box.size.x + absf(t.z) * box.size.z
		var depth := absf(n.x) * box.size.x * 0.5 + absf(n.z) * box.size.z * 0.5
		var pos := Vector3(centre.x, top, centre.z) + n * (depth - 1.0)
		billboard(parent, pos, atan2(n.x, n.z), clampf(face_w * 0.8, 5.0, 11.0), ADS[rng.randi() % ADS.size()])
