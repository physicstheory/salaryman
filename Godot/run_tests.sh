#!/bin/sh
# Headless checks. Needs Godot 4.3 on the PATH as "godot" (or set GODOT=/path/to/godot).
# --fixed-fps matches the 120 Hz physics tick, so the tests run flat out instead of in real time.
G="${GODOT:-godot}"
cd "$(dirname "$0")"
"$G" --headless --path . --import >/dev/null 2>&1
"$G" --headless --fixed-fps 120 --path . --script res://tests/physics_test.gd | grep -E "settle|skidpad|handbrake|PASSED|FAILED"
"$G" --headless --fixed-fps 120 --path . --script res://tests/smoke.gd | grep -E "buildings|drove|traffic cars|SMOKE"
