<#
.SYNOPSIS
    Builds Konto on a Windows cloud machine, start to finish, from a checkout of this repo.

.DESCRIPTION
    This repository is not a Unity project: it is the Assets/SalaryMan folder that goes inside
    one. So the first thing anyone does on a fresh machine is create an HDRP project and copy
    the folder in, and then the second thing is do it again after every pull. This does both,
    and then runs the world build with no editor window open.

    Make the Unity project once, by hand, because the one step that is genuinely easier in the
    GUI is picking the 3D (HDRP) template in Unity Hub. Everything after that is this script.

.PARAMETER ProjectPath
    The HDRP Unity project to build into. Created from the Hub's 3D (HDRP) template.

.PARAMETER RepoPath
    This checkout. Defaults to two folders up from the script.

.PARAMETER Unity
    The Unity executable. Found automatically under the usual Hub install folder if omitted.

.PARAMETER LowMemory
    Build at the settings that fit in about 16 GB. Same island, coarser valleys.

.PARAMETER SkipBuild
    Copy the code in and stop, for when you want to press the button yourself.

.PARAMETER Player
    Also package a standalone Windows player once the world is built.

.EXAMPLE
    .\build-konto.ps1 -ProjectPath C:\Konto -LowMemory
#>
param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$Unity,
    [switch]$LowMemory,
    [switch]$SkipBuild,
    [switch]$Player
)

$ErrorActionPreference = 'Stop'

function Find-Unity {
    if ($Unity) { return $Unity }
    $roots = @("$env:ProgramFiles\Unity\Hub\Editor", "C:\Program Files\Unity\Hub\Editor")
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        # Newest version wins, which is what you want on a machine with several installed.
        $found = Get-ChildItem $root -Directory |
                 Sort-Object Name -Descending |
                 ForEach-Object { Join-Path $_.FullName 'Editor\Unity.exe' } |
                 Where-Object { Test-Path $_ } |
                 Select-Object -First 1
        if ($found) { return $found }
    }
    throw "Could not find Unity. Install it through Unity Hub, or pass -Unity <path to Unity.exe>."
}

if (-not (Test-Path $ProjectPath)) {
    throw "$ProjectPath does not exist. Create the project first: Unity Hub > New project > 3D (HDRP)."
}
if (-not (Test-Path (Join-Path $ProjectPath 'ProjectSettings\ProjectVersion.txt'))) {
    throw "$ProjectPath is not a Unity project. Create one from the Hub's 3D (HDRP) template."
}

# ---- bring the code up to date and mirror it into the project ---------------------------
Write-Host "==> Updating $RepoPath" -ForegroundColor Cyan
# Not fatal: you might be offline, on a detached head, or deliberately building something
# that is not the tip of the branch.
try { git -C $RepoPath pull --ff-only } catch { Write-Host "    (could not pull; building what is checked out)" -ForegroundColor DarkGray }

$source = Join-Path $RepoPath 'Assets\SalaryMan'
$target = Join-Path $ProjectPath 'Assets\SalaryMan'
Write-Host "==> Copying SalaryMan into $target" -ForegroundColor Cyan

# /MIR would be right except for one thing: the generated world lives inside the target and
# is deliberately not in git, so mirroring without excluding it would delete hours of build.
$null = New-Item -ItemType Directory -Force -Path $target
robocopy $source $target /MIR /XD Generated /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copy failed with robocopy code $LASTEXITCODE" }
Write-Host "    done" -ForegroundColor DarkGray

if ($SkipBuild) {
    Write-Host "==> Code is in place. Open the project and use Tools > SalaryMan > Build Konto." -ForegroundColor Green
    exit 0
}

# ---- build ------------------------------------------------------------------------------
$exe = Find-Unity
$logDir = Join-Path $ProjectPath 'Logs'
$null = New-Item -ItemType Directory -Force -Path $logDir
$log = Join-Path $logDir ("konto-build-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

$arguments = @(
    '-quit', '-batchmode',
    '-projectPath', $ProjectPath,
    '-executeMethod', 'SalaryMan.World.EditorTools.KontoBatchBuild.World',
    '-logFile', $log
)
if ($LowMemory) { $arguments += '-kontoLowMemory' }

Write-Host "==> Building the world. This is the long part; the log is $log" -ForegroundColor Cyan
$started = Get-Date

# Run it detached so the log can be followed, which beats staring at a frozen console.
$process = Start-Process -FilePath $exe -ArgumentList $arguments -PassThru -NoNewWindow
Start-Sleep -Seconds 3
$reader = $null
while (-not $process.HasExited) {
    if (-not $reader -and (Test-Path $log)) {
        $reader = [System.IO.StreamReader]::new(
            [System.IO.File]::Open($log, 'Open', 'Read', 'ReadWrite'))
    }
    if ($reader) {
        while (($line = $reader.ReadLine()) -ne $null) {
            if ($line -match '\[Konto\]|error|Exception') { Write-Host $line }
        }
    }
    Start-Sleep -Milliseconds 500
}
if ($reader) { $reader.Dispose() }

$took = (Get-Date) - $started
if ($process.ExitCode -ne 0) {
    Write-Host ("==> Build FAILED after {0:hh\:mm\:ss}. Last of the log:" -f $took) -ForegroundColor Red
    Get-Content $log -Tail 40
    exit $process.ExitCode
}
Write-Host ("==> World built in {0:hh\:mm\:ss}" -f $took) -ForegroundColor Green

if ($Player) {
    Write-Host "==> Packaging a Windows player" -ForegroundColor Cyan
    $playerLog = Join-Path $logDir ("konto-player-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
    & $exe -quit -batchmode -projectPath $ProjectPath `
        -executeMethod SalaryMan.World.EditorTools.KontoBatchBuild.Player -logFile $playerLog
    if ($LASTEXITCODE -ne 0) {
        Write-Host "==> Player build failed. Last of the log:" -ForegroundColor Red
        Get-Content $playerLog -Tail 40
        exit $LASTEXITCODE
    }
    Write-Host "==> Player is in $ProjectPath\Build\Konto" -ForegroundColor Green
}
