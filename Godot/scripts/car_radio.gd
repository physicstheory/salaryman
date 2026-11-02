class_name CarRadio
extends Node
## The car radio: eight dial positions (six stations, a night talk station and "off"), each playing something right now whether or not you are
## tuned in, so tuning away and back finds the song where it would have got to. Same stations, songs and talk as the web build.
## R taps to the next one; holding R opens the wheel. It only plays when you are in a car.

signal changed(text: String)

var st := 0
var driving := false
var music: PhoneMusic
var _t0 := randf() * 4000.0
var _song_key := ""
var _talk_i := -1
var _tuned := -1

# the web build's synth styles, by station style
const STYLE_OF := {"synth80": [6, 118.0], "jpop": [7, 128.0], "kpop": [8, 116.0], "gfunk": [9, 92.0], "country": [10, 100.0], "talk": [5, 60.0]}

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	music = PhoneMusic.new()
	music.volume_db = -9.0
	add_child(music)

func stations() -> Array:
	return GameData.raw.radio

func station(i: int) -> Dictionary:
	var l := stations()
	return l[((i % l.size()) + l.size()) % l.size()]

func now() -> float:
	return Time.get_ticks_msec() / 1000.0 + _t0

func is_off(i := -1) -> bool:
	return bool(station(st if i < 0 else i).get("off", false))

## What is on a station right now: song, artist, position in it and its length (and the host's line on talk stations).
func info(s: Dictionary) -> Dictionary:
	var songs: Array = s.songs
	var total := 0.0
	for x in songs:
		total += float(x[2])
	var off := songs.size() * 17.3 * (stations().find(s) + 1)
	var pos := fposmod(now() + off, total)
	var i := 0
	while pos >= float(songs[i][2]):
		pos -= float(songs[i][2])
		i += 1
	var out := {"title": songs[i][0], "artist": songs[i][1], "pos": pos, "dur": float(songs[i][2]), "idx": i, "cap": ""}
	if s.has("talk"):
		var lines: Array = GameData.raw.talk_lines[s.talk]
		var li := int(now() / 6.5) % lines.size()
		out.cap = "%s: %s" % [lines[li][0], lines[li][1]]
		out.line = li
	return out

func next(d := 1) -> void:
	set_station(st + d)

func set_station(i: int) -> void:
	st = ((i % stations().size()) + stations().size()) % stations().size()
	_tuned = -1
	_song_key = ""
	var s := station(st)
	changed.emit("Radio off" if s.get("off", false) else "%s  ·  %s  %s" % [s.name, s.freq, info(s).title])

func update(is_driving: bool) -> void:
	driving = is_driving
	var s := station(st)
	if not driving or s.get("off", false):
		if music.playing >= 0:
			music.stop()
		_song_key = ""
		_talk_i = -1
		return
	var inf := info(s)
	var key := "%d:%d" % [st, int(inf.idx)]
	var sty: Array = STYLE_OF.get(s.get("style", "talk"), [5, 60.0])
	if key != _song_key:
		_song_key = key
		music.play(int(sty[0]), float(sty[1]) + float((int(inf.idx) * 5) % 9) - 4.0, st * 7 + int(inf.idx))
	if s.has("talk") and int(inf.get("line", -1)) != _talk_i:
		_talk_i = int(inf.line)
		_speak(String(inf.cap))

## The host's line, read aloud where the system has a voice for it.
func _speak(text: String) -> void:
	if DisplayServer.has_feature(DisplayServer.FEATURE_TEXT_TO_SPEECH):
		var voices := DisplayServer.tts_get_voices_for_language("en")
		if not voices.is_empty():
			DisplayServer.tts_stop()
			DisplayServer.tts_speak(text.substr(text.find(":") + 2), voices[0], 55)
