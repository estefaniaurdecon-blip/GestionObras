# Android Startup Perf Validation (2026-03-12)

## Scope

- App package: `com.partesdetrabajo.app`
- Device used for the valid baseline: `emulator-5554` (`Medium_Tablet`)
- Scenario: controlled cold start, app kept in foreground for 20 seconds
- Reference capture: `perf-captures/20260312-101505/`
- Current goal: verify that the startup patch reduced main-thread pressure without changing app logic

## Baseline To Compare Against

Baseline source:
- `perf-captures/20260312-101505/capture-meta.txt`
- `perf-captures/latest-reading.txt`

Reference numbers from the valid pass on March 12, 2026:

| Metric | Baseline |
|---|---:|
| Frames | 380 |
| Janky frames | 83.95% |
| p50 | 65 ms |
| p90 | 89 ms |
| p95 | 105 ms |
| p99 | 900 ms |
| Missed Vsync | 255 |
| High input latency | 63 |
| Slow UI thread | 205 |
| Slow issue draw commands | 319 |
| TOTAL PSS | 101,075 KB |
| TOTAL RSS | 244,480 KB |
| Displayed MainActivity | +3.348 s |
| Choreographer skipped | 50 and 59 |
| `Capacitor/Console Msg: undefined` | 28 |

## What Should Improve After The Patch

These are the most important signals to check first:

- `Msg: undefined` should drop to zero or near zero.
- `p99` should fall clearly below `900 ms`.
- `Skipped 50` and `Skipped 59` should disappear or become materially smaller.
- `Slow UI thread` and `Slow issue draw commands` should go down.
- `Displayed MainActivity` should stay at or below `+3.348 s`.

Do not over-read later spikes:
- bootstrap sync now starts at about `30 s` on native
- initial offline pending scan now starts at about `45 s`
- silent update check now starts at about `45 s`

If you keep the capture window at `20 s`, those deferred tasks should stay outside the startup measurement.

## One-Command Automation

From `apps/construction-log/construction-log-supabase-local`:

```powershell
npm run perf:android:capture
```

If you want the script to rebuild, sync, assemble, and reinstall the debug APK before the capture:

```powershell
npm run perf:android:capture -- -PrepareApp
```

Useful optional switches:

```powershell
npm run perf:android:capture -- -PrepareApp -Serial emulator-5554
npm run perf:android:capture -- -DurationSeconds 20
npm run perf:android:capture -- -ConfigPath perf-captures/20260312-101505/perfetto-config.pbtxt
```

The script writes these artifacts automatically:

- `perf-captures/<stamp>/capture-meta.txt`
- `perf-captures/<stamp>/quick-reading.txt`
- `perf-captures/<stamp>/gfxinfo.txt`
- `perf-captures/<stamp>/meminfo.txt`
- `perf-captures/<stamp>/emulator-5554-logcat.txt`
- `perf-captures/<stamp>/emulator-5554-perfetto-trace.bin`

## Exact Re-run Checklist

### 1. Build and install the patched app

Run from `apps/construction-log/construction-log-supabase-local`:

```powershell
npm run build
npx cap sync android
.\android\gradlew.bat assembleDebug
```

Install on the emulator:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$serial = "emulator-5554"
$apk = ".\android\app\build\outputs\apk\debug\app-debug.apk"

& $adb -s $serial install -r $apk
```

### 2. Prepare a new capture directory

Run from repo root:

```powershell
$repo = (Get-Location).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $repo "perf-captures\$stamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
```

### 3. Reset the device state before launch

```powershell
$pkg = "com.partesdetrabajo.app"

& $adb -s $serial shell am force-stop $pkg
& $adb -s $serial shell dumpsys gfxinfo $pkg reset
& $adb -s $serial logcat -c
```

### 4. Start logcat capture in terminal A

Run from repo root:

```powershell
$outDir = "perf-captures\<new-stamp>"
$logcatFile = Join-Path $outDir "$serial-logcat.txt"

& $adb -s $serial logcat -v threadtime | Tee-Object -FilePath $logcatFile
```

Leave this terminal running until the 20-second window is over.

### 5. Start Perfetto in terminal B using the validated config

Run from repo root:

```powershell
$config = "perf-captures/20260312-101505/perfetto-config.pbtxt"
$remoteTrace = "/data/misc/perfetto-traces/<new-stamp>-trace.bin"

Get-Content $config -Raw | & $adb -s $serial shell perfetto --txt -c - -o $remoteTrace
```

This command blocks for the configured `20 s` duration. Start the app immediately from terminal C after launching this trace.

### 6. Launch the app in terminal C and keep it in foreground

```powershell
$pkg = "com.partesdetrabajo.app"

& $adb -s $serial shell monkey -p $pkg -c android.intent.category.LAUNCHER 1
Start-Sleep -Milliseconds 500
$appPid = (& $adb -s $serial shell pidof $pkg | Out-String).Trim()
$appPid
Start-Sleep -Seconds 20
```

During this window:
- do not background the app
- do not tap around unless the exact scenario requires it
- do not trigger extra flows manually

### 7. Pull the trace and export the supporting artifacts

Run after Perfetto has finished:

```powershell
$outDir = "perf-captures/<new-stamp>"
$remoteTrace = "/data/misc/perfetto-traces/<new-stamp>-trace.bin"
$traceFile = Join-Path $outDir "$serial-perfetto-trace.bin"
$gfxFile = Join-Path $outDir "gfxinfo.txt"
$memFile = Join-Path $outDir "meminfo.txt"
$focusFile = Join-Path $outDir "top-window.txt"
$pidFile = Join-Path $outDir "pid.txt"

& $adb -s $serial pull $remoteTrace $traceFile
& $adb -s $serial shell dumpsys gfxinfo $pkg framestats > $gfxFile
& $adb -s $serial shell dumpsys meminfo $pkg > $memFile
& $adb -s $serial shell dumpsys window windows > $focusFile
$appPid | Set-Content $pidFile
```

### 8. Validate that the capture is clean

Before comparing metrics, confirm all of this:

- same PID from app launch to the end of the 20-second window
- no kill or relaunch in logcat
- app remained in foreground the full time
- local trace file exists and is non-zero
- `top-window.txt` still points to `com.partesdetrabajo.app/.MainActivity`

If any of those fail, treat the run as noisy and do not compare it against the baseline.

## Comparison Checklist

Use this order. It avoids wasting time on noisy runs.

1. Check validity first.
2. Check `Choreographer` lines filtered by the real app PID.
3. Check `framestats` percentiles and jank counters.
4. Check `Msg: undefined` count in logcat.
5. Check memory only after the startup timing looks better.

Useful commands:

```powershell
$logcatFile = "perf-captures/<new-stamp>/emulator-5554-logcat.txt"
$appPid = Get-Content "perf-captures/<new-stamp>/pid.txt"

Select-String -Path $logcatFile -Pattern "Choreographer|Displayed com.partesdetrabajo.app|Msg: undefined|offline-db|sql-wasm|performTraversals"
Select-String -Path $logcatFile -Pattern "Skipped " | Select-String -Pattern " $appPid "
Select-String -Path $logcatFile -Pattern "Msg: undefined" | Measure-Object
```

## Interpretation Guide

### Good result

- same PID throughout
- no `Skipped 50` / `Skipped 59`
- `p99` materially below `900 ms`
- `Msg: undefined` at `0` or close to `0`
- startup still completes with the same visible app behavior

### Mixed result

- median metrics improve but one or two large startup outliers remain
- `Msg: undefined` drops but does not fully disappear
- memory is better but `Displayed MainActivity` is flat

This usually means the redundant persistence work was reduced, but there is still one expensive startup block on the main thread.

### No real improvement

- same PID and same scenario, but `p99` remains near `900 ms`
- `Skipped 50` / `Skipped 59` are still present
- `Msg: undefined` stays around the same count

If that happens, the next place to inspect is the exact startup gap around:
- `sql-wasm.wasm` loading
- offline DB restore
- first React commit before the splash fully disappears

## Suggested Summary Template

When you finish a run, summarize it in this format:

```text
perf-captures/<new-stamp>

Controlled cold start:
- PID stable <pid> -> <pid>
- foreground sustained 20 s
- trace valid: yes/no

Quick read:
- frames:
- janky:
- p50:
- p90:
- p95:
- p99:
- Missed Vsync:
- High input latency:
- Slow UI thread:
- Slow issue draw commands:
- TOTAL PSS:
- TOTAL RSS:
- Displayed MainActivity:
- Choreographer app PID:
- Msg: undefined:

Comparison vs 2026-03-12 10:15:05:
- better / same / worse:
- likely next focus:
```
