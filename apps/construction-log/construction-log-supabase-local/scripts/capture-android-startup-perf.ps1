[CmdletBinding()]
param(
  [string]$Serial = "emulator-5554",
  [string]$PackageName = "com.partesdetrabajo.app",
  [int]$DurationSeconds = 20,
  [string]$AdbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  [string]$OutputRoot = "",
  [string]$ConfigPath = "",
  [switch]$PrepareApp,
  [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[perf] $Message"
}

function Resolve-ExistingCommand {
  param(
    [string]$PreferredPath,
    [string]$CommandName
  )

  if ($PreferredPath -and (Test-Path -LiteralPath $PreferredPath)) {
    return (Resolve-Path -LiteralPath $PreferredPath).Path
  }

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  throw "Could not find $CommandName. Checked '$PreferredPath' and PATH."
}

function Resolve-AbsolutePath {
  param(
    [string]$BasePath,
    [string]$Candidate
  )

  if ([string]::IsNullOrWhiteSpace($Candidate)) {
    return $Candidate
  }

  if ([System.IO.Path]::IsPathRooted($Candidate)) {
    return $Candidate
  }

  return (Join-Path $BasePath $Candidate)
}

function Invoke-CheckedCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$Description,
    [string]$WorkingDirectory = ""
  )

  Write-Step $Description
  if ([string]::IsNullOrWhiteSpace($WorkingDirectory)) {
    & $FilePath @Arguments
  } else {
    Push-Location $WorkingDirectory
    try {
      & $FilePath @Arguments
    } finally {
      Pop-Location
    }
  }
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Invoke-CheckedScript {
  param(
    [scriptblock]$Action,
    [string]$Description
  )

  Write-Step $Description
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Wait-ForAppPid {
  param(
    [string]$AdbExecutable,
    [string]$DeviceSerial,
    [string]$AppPackage,
    [int]$TimeoutSeconds = 10
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $resolvedPid = (& $AdbExecutable -s $DeviceSerial shell pidof $AppPackage | Out-String).Trim()
    if (-not [string]::IsNullOrWhiteSpace($resolvedPid)) {
      return $resolvedPid
    }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)

  throw "Could not resolve PID for $AppPackage within $TimeoutSeconds seconds."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Split-Path -Parent $scriptDir
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $appRoot))

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $repoRoot "perf-captures"
} else {
  $OutputRoot = Resolve-AbsolutePath -BasePath $repoRoot -Candidate $OutputRoot
}

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $repoRoot "perf-captures\20260312-101505\perfetto-config.pbtxt"
} else {
  $ConfigPath = Resolve-AbsolutePath -BasePath $repoRoot -Candidate $ConfigPath
}

$AdbPath = Resolve-ExistingCommand -PreferredPath $AdbPath -CommandName "adb"

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Perfetto config not found at '$ConfigPath'."
}

if (-not (Test-Path -LiteralPath $OutputRoot)) {
  New-Item -ItemType Directory -Path $OutputRoot | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$captureDir = Join-Path $OutputRoot $stamp
New-Item -ItemType Directory -Path $captureDir | Out-Null

$remoteTrace = "/data/misc/perfetto-traces/$stamp-trace.bin"
$traceFile = Join-Path $captureDir "$Serial-perfetto-trace.bin"
$logcatFile = Join-Path $captureDir "$Serial-logcat.txt"
$perfettoLogFile = Join-Path $captureDir "perfetto-stderr.txt"
$gfxFile = Join-Path $captureDir "gfxinfo.txt"
$memFile = Join-Path $captureDir "meminfo.txt"
$focusFile = Join-Path $captureDir "top-window.txt"
$pidFile = Join-Path $captureDir "pid.txt"
$metaFile = Join-Path $captureDir "capture-meta.txt"
$quickFile = Join-Path $captureDir "quick-reading.txt"
$configCopy = Join-Path $captureDir "perfetto-config.pbtxt"

Copy-Item -LiteralPath $ConfigPath -Destination $configCopy -Force

if ($PrepareApp) {
  Push-Location $appRoot
  try {
    Invoke-CheckedScript -Description "Building web app" -Action { npm run build }
    Invoke-CheckedScript -Description "Syncing Capacitor Android" -Action { npx cap sync android }
    Invoke-CheckedCommand `
      -FilePath (Join-Path $appRoot "android\gradlew.bat") `
      -Arguments @("assembleDebug") `
      -Description "Assembling Android debug APK" `
      -WorkingDirectory (Join-Path $appRoot "android")

    if (-not $SkipInstall) {
      $apkPath = Join-Path $appRoot "android\app\build\outputs\apk\debug\app-debug.apk"
      if (-not (Test-Path -LiteralPath $apkPath)) {
        throw "APK not found at '$apkPath'."
      }
      Invoke-CheckedCommand `
        -FilePath $AdbPath `
        -Arguments @("-s", $Serial, "install", "-r", $apkPath) `
        -Description "Installing debug APK"
    }
  } finally {
    Pop-Location
  }
}

$startedAt = Get-Date

Invoke-CheckedCommand -FilePath $AdbPath -Arguments @("-s", $Serial, "shell", "am", "force-stop", $PackageName) -Description "Force-stopping app"
Invoke-CheckedCommand -FilePath $AdbPath -Arguments @("-s", $Serial, "shell", "dumpsys", "gfxinfo", $PackageName, "reset") -Description "Resetting gfxinfo stats"
Invoke-CheckedCommand -FilePath $AdbPath -Arguments @("-s", $Serial, "logcat", "-c") -Description "Clearing logcat buffer"

Write-Step "Starting Perfetto trace"
$perfettoJob = Start-Job -ScriptBlock {
  param(
    [string]$ConfigFile,
    [string]$AdbExecutable,
    [string]$DeviceSerial,
    [string]$RemoteTracePath,
    [string]$PerfettoLogPath
  )

  $jobErrorActionPreference = "Stop"
  try {
    $output = Get-Content -LiteralPath $ConfigFile -Raw | & $AdbExecutable -s $DeviceSerial shell perfetto --txt -c - -o $RemoteTracePath 2>&1
    ($output | ForEach-Object { $_.ToString() }) | Set-Content -LiteralPath $PerfettoLogPath
    if ($LASTEXITCODE -ne 0) {
      throw "perfetto exited with code $LASTEXITCODE."
    }
  } catch {
    $_ | Out-String | Set-Content -LiteralPath $PerfettoLogPath
    throw
  }
} -ArgumentList $ConfigPath, $AdbPath, $Serial, $remoteTrace, $perfettoLogFile

Start-Sleep -Milliseconds 500

Invoke-CheckedCommand `
  -FilePath $AdbPath `
  -Arguments @("-s", $Serial, "shell", "monkey", "-p", $PackageName, "-c", "android.intent.category.LAUNCHER", "1") `
  -Description "Launching app"

$pidStart = Wait-ForAppPid -AdbExecutable $AdbPath -DeviceSerial $Serial -AppPackage $PackageName
$pidStart | Set-Content -LiteralPath $pidFile
Write-Step "Captured app PID: $pidStart"

Write-Step "Keeping app in foreground window for $DurationSeconds seconds"
Start-Sleep -Seconds $DurationSeconds

$null = Wait-Job -Job $perfettoJob -Timeout ($DurationSeconds + 30)
if ($perfettoJob.State -eq "Running") {
  Stop-Job -Job $perfettoJob | Out-Null
  Remove-Job -Job $perfettoJob -Force | Out-Null
  throw "Perfetto capture timed out."
}

if ($perfettoJob.State -eq "Failed") {
  $reason = $perfettoJob.ChildJobs[0].JobStateInfo.Reason
  Remove-Job -Job $perfettoJob -Force | Out-Null
  throw "Perfetto capture failed. $reason"
}

Receive-Job -Job $perfettoJob | Out-Null
Remove-Job -Job $perfettoJob -Force | Out-Null

$pidEnd = (& $AdbPath -s $Serial shell pidof $PackageName | Out-String).Trim()
$endedAt = Get-Date

Write-Step "Exporting artifacts"
& $AdbPath -s $Serial logcat -d -v threadtime > $logcatFile
if ($LASTEXITCODE -ne 0) {
  throw "Exporting logcat failed with exit code $LASTEXITCODE."
}

& $AdbPath -s $Serial pull $remoteTrace $traceFile | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Pulling Perfetto trace failed with exit code $LASTEXITCODE."
}

& $AdbPath -s $Serial shell dumpsys gfxinfo $PackageName framestats > $gfxFile
if ($LASTEXITCODE -ne 0) {
  throw "Exporting gfxinfo framestats failed with exit code $LASTEXITCODE."
}

& $AdbPath -s $Serial shell dumpsys meminfo $PackageName > $memFile
if ($LASTEXITCODE -ne 0) {
  throw "Exporting meminfo failed with exit code $LASTEXITCODE."
}

$windowDump = & $AdbPath -s $Serial shell dumpsys window windows
if ($LASTEXITCODE -ne 0) {
  throw "Exporting window dump failed with exit code $LASTEXITCODE."
}
$windowDump | Set-Content -LiteralPath $focusFile

$traceInfo = Get-Item -LiteralPath $traceFile
$samePid = $pidStart -eq $pidEnd
$escapedPackageName = [regex]::Escape($PackageName)
$topWindowExcerpt = @(
  $windowDump |
    Select-String -Pattern "WindowStateAnimator.*$escapedPackageName|mPackageName=$escapedPackageName|mCurrentFocus=.*$escapedPackageName|mFocusedApp=.*$escapedPackageName|mObscuringWindow=.*$escapedPackageName|mPreferredTopFocusableRootTask=.*$escapedPackageName|mLastFocusedRootTask=.*$escapedPackageName|\* Task\{.*$escapedPackageName" |
    ForEach-Object { $_.Line }
)
$logLines = Get-Content -LiteralPath $logcatFile
$choreographerLines = $logLines | Where-Object { $_ -match "Choreographer: Skipped" -and $_ -match "\s$pidStart\s" }
$undefinedCount = ($logLines | Where-Object { $_ -like "*Msg: undefined*" } | Measure-Object).Count
$displayedLine = $logLines | Where-Object { $_ -like "*Displayed $PackageName*" } | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($displayedLine)) {
  $displayedLine = "not found"
}

@(
  "capture_dir=$captureDir"
  "started_at=$($startedAt.ToString("o"))"
  "ended_at=$($endedAt.ToString("o"))"
  "device=$Serial"
  "package=$PackageName"
  "duration=${DurationSeconds}s"
  "trace_file=$traceFile"
  "logcat_file=$logcatFile"
  "mode=controlled-cold-start-foreground-device-perfetto"
  "pid_start=$pidStart"
  "pid_end=$pidEnd"
  "same_pid=$samePid"
  "top_window_excerpt<<EOF"
) + $topWindowExcerpt + @(
  "EOF"
) | Set-Content -LiteralPath $metaFile

@(
  "$($captureDir.Replace('\', '/'))"
  ""
  "Controlled cold start:"
  "- PID stable $pidStart -> $pidEnd"
  "- foreground sustained $DurationSeconds s"
  "- trace valid: $([bool]($traceInfo.Length -gt 0))"
  ""
  "Quick read:"
  "- trace bytes: $($traceInfo.Length)"
  "- Displayed MainActivity: $displayedLine"
  "- Choreographer app PID: $(if ($choreographerLines) { $choreographerLines -join ' | ' } else { 'none' })"
  "- Msg: undefined: $undefinedCount"
) | Set-Content -LiteralPath $quickFile

Write-Step "Capture complete: $captureDir"
Write-Step "Meta: $metaFile"
Write-Step "Quick read: $quickFile"
