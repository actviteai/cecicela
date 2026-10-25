# Install the skill tree into $env:CELA_HOME. Stage first, swap only after SKILL.md
# is present, so a failed copy cannot delete a working install.
$ErrorActionPreference = "Stop"

if (-not $PSCommandPath) {
    Write-Error "refusing a piped install. Run this script from the skill directory."
    exit 1
}

$SourceDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$SkillFile = Join-Path $SourceDir "SKILL.md"
if (-not (Test-Path -LiteralPath $SkillFile)) {
    throw "SKILL.md not found in $SourceDir"
}

if ($env:CELA_HOME) {
    $Target = $env:CELA_HOME
} else {
    $Target = Join-Path $env:USERPROFILE ".cela"
}

$SkillsDir = Join-Path $Target "skills"
$Dest = Join-Path $SkillsDir "cela"
$Stage = Join-Path $SkillsDir ".cela.staging-$PID"
$Backup = Join-Path $SkillsDir ".cela.backup-$PID"

New-Item -ItemType Directory -Force -Path $SkillsDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Target "memory") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Target "projects") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Target "registry") | Out-Null

if (Test-Path -LiteralPath $Stage) {
    Remove-Item -LiteralPath $Stage -Recurse -Force
}
Copy-Item -LiteralPath $SourceDir -Destination $Stage -Recurse -Force

$StagedSkill = Join-Path $Stage "SKILL.md"
if (-not (Test-Path -LiteralPath $StagedSkill)) {
    Remove-Item -LiteralPath $Stage -Recurse -Force
    throw "Staged copy is missing SKILL.md; existing install left untouched."
}

$moved = $false
if (Test-Path -LiteralPath $Dest) {
    if (Test-Path -LiteralPath $Backup) {
        Remove-Item -LiteralPath $Backup -Recurse -Force
    }
    Move-Item -LiteralPath $Dest -Destination $Backup
    $moved = $true
}

try {
    Move-Item -LiteralPath $Stage -Destination $Dest
} catch {
    if ($moved -and -not (Test-Path -LiteralPath $Dest) -and (Test-Path -LiteralPath $Backup)) {
        Move-Item -LiteralPath $Backup -Destination $Dest
    }
    throw
}

if ($moved -and (Test-Path -LiteralPath $Backup)) {
    Remove-Item -LiteralPath $Backup -Recurse -Force
}

Write-Output "Installed cela to $Dest"
