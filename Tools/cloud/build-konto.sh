#!/usr/bin/env bash
# Builds Konto on a Linux cloud machine with no desktop.
#
# The world build is arithmetic - erosion, hydrology, city planning, mesh and texture
# generation - so it wants cores and memory and no graphics card at all. That makes it the
# cheapest thing in this project to run in the cloud: a big headless box generates the world,
# and an ordinary machine opens the result.
#
#   ./build-konto.sh --project ~/Konto --low-memory
#
# The Unity project itself has to exist already, made from the Hub's 3D (HDRP) template,
# because that one step is genuinely easier in the GUI.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT=""
UNITY="${UNITY:-}"
LOW_MEMORY=0
SKIP_BUILD=0
PLAYER=0
EXTRA=()

usage() {
    sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    echo
    echo "  --project PATH   the HDRP Unity project to build into (required)"
    echo "  --repo PATH      this checkout (default: $REPO)"
    echo "  --unity PATH     the Unity executable (default: newest under ~/Unity/Hub/Editor)"
    echo "  --low-memory     build at settings that fit in about 16 GB"
    echo "  --skip-build     copy the code in and stop"
    echo "  --player         also package a Linux player"
    echo "  --               everything after this is passed to Unity"
    exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --project) PROJECT="$2"; shift 2 ;;
        --repo)    REPO="$2"; shift 2 ;;
        --unity)   UNITY="$2"; shift 2 ;;
        --low-memory) LOW_MEMORY=1; shift ;;
        --skip-build) SKIP_BUILD=1; shift ;;
        --player)  PLAYER=1; shift ;;
        --)        shift; EXTRA=("$@"); break ;;
        -h|--help) usage 0 ;;
        *) echo "unknown option: $1" >&2; usage 1 ;;
    esac
done

[[ -n "$PROJECT" ]] || { echo "--project is required" >&2; usage 1; }
[[ -f "$PROJECT/ProjectSettings/ProjectVersion.txt" ]] || {
    echo "$PROJECT is not a Unity project. Make one from the Hub's 3D (HDRP) template first." >&2
    exit 1
}

find_unity() {
    [[ -n "$UNITY" ]] && { echo "$UNITY"; return; }
    local root="$HOME/Unity/Hub/Editor"
    [[ -d "$root" ]] || { echo "Could not find Unity. Pass --unity <path>." >&2; exit 1; }
    # Newest installed version, which is what you want on a box with several.
    local found
    found="$(ls -1 "$root" | sort -Vr | while read -r v; do
        [[ -x "$root/$v/Editor/Unity" ]] && { echo "$root/$v/Editor/Unity"; break; }
    done)"
    [[ -n "$found" ]] || { echo "Could not find Unity under $root. Pass --unity <path>." >&2; exit 1; }
    echo "$found"
}

echo "==> Updating $REPO"
# Not fatal: you might be offline, on a detached head, or deliberately building something
# that is not the tip of the branch.
git -C "$REPO" pull --ff-only || echo "    (could not pull; building what is checked out)"

echo "==> Copying SalaryMan into $PROJECT/Assets/SalaryMan"
mkdir -p "$PROJECT/Assets/SalaryMan"

# The copy has to delete what upstream deleted, or stale scripts linger and the project stops
# compiling for reasons that are not in the code you are reading. But the generated world
# lives inside the target, is hours of work, and is deliberately not in git - so it is carried
# across the replacement rather than mirrored. rsync is not on every cloud image, hence both
# paths; the result is the same either way.
GENERATED="$PROJECT/Assets/SalaryMan/World/Generated"
if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude 'Generated/' --exclude 'Generated.meta' \
          "$REPO/Assets/SalaryMan/" "$PROJECT/Assets/SalaryMan/"
else
    STASH=""
    if [[ -d "$GENERATED" ]]; then
        STASH="$(mktemp -d)"
        mv "$GENERATED" "$STASH/Generated"
    fi
    rm -rf "$PROJECT/Assets/SalaryMan"
    mkdir -p "$PROJECT/Assets/SalaryMan"
    cp -a "$REPO/Assets/SalaryMan/." "$PROJECT/Assets/SalaryMan/"
    if [[ -n "$STASH" ]]; then
        mkdir -p "$(dirname "$GENERATED")"
        mv "$STASH/Generated" "$GENERATED"
        rmdir "$STASH"
    fi
fi

if [[ $SKIP_BUILD -eq 1 ]]; then
    echo "==> Code is in place."
    exit 0
fi

UNITY_BIN="$(find_unity)"
mkdir -p "$PROJECT/Logs"
LOG="$PROJECT/Logs/konto-build-$(date +%Y%m%d-%H%M%S).log"

ARGS=(-quit -batchmode -projectPath "$PROJECT"
      -executeMethod SalaryMan.World.EditorTools.KontoBatchBuild.World
      -logFile "$LOG")
[[ $LOW_MEMORY -eq 1 ]] && ARGS+=(-kontoLowMemory)
[[ ${#EXTRA[@]} -gt 0 ]] && ARGS+=("${EXTRA[@]}")

echo "==> Building the world with $UNITY_BIN"
echo "    log: $LOG"
START=$SECONDS

# Follow the interesting lines while it runs rather than watching a still cursor.
"$UNITY_BIN" "${ARGS[@]}" &
UNITY_PID=$!
sleep 3
touch "$LOG"
tail -f --pid="$UNITY_PID" "$LOG" 2>/dev/null | grep --line-buffered -E '\[Konto\]|error|Exception' || true
wait "$UNITY_PID" || BUILD_CODE=$?
BUILD_CODE=${BUILD_CODE:-0}

TOOK=$((SECONDS - START))
if [[ $BUILD_CODE -ne 0 ]]; then
    echo "==> Build FAILED after $((TOOK / 60))m $((TOOK % 60))s. Last of the log:"
    tail -40 "$LOG"
    exit "$BUILD_CODE"
fi
echo "==> World built in $((TOOK / 60))m $((TOOK % 60))s"

if [[ $PLAYER -eq 1 ]]; then
    echo "==> Packaging a player"
    PLAYER_LOG="$PROJECT/Logs/konto-player-$(date +%Y%m%d-%H%M%S).log"
    "$UNITY_BIN" -quit -batchmode -projectPath "$PROJECT" \
        -executeMethod SalaryMan.World.EditorTools.KontoBatchBuild.Player -logFile "$PLAYER_LOG" || {
        echo "==> Player build failed. Last of the log:"; tail -40 "$PLAYER_LOG"; exit 1; }
    echo "==> Player is in $PROJECT/Build/Konto"
fi
