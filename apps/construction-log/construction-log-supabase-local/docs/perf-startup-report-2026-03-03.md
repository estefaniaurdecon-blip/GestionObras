# Startup Perf Report (2026-03-03)

## Scope
- App: `com.partesdetrabajo.app`
- Device: Android emulator `emulator-5554` (Medium_Tablet profile)
- Scenario: cold start, 10s window
- Goal: reduce main-thread pressure on first render (`Skipped frames`, `framestats p99`, high input latency)

## Repro Commands (same methodology, PID-safe)

```powershell
$adb = "C:\Users\pinnovacion\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$serial = "emulator-5554"
$pkg = "com.partesdetrabajo.app"

# (optional) reinstall fresh debug APK before measuring
& $adb -s $serial install -r .\android\app\build\outputs\apk\debug\app-debug.apk

# 1) reset gfxinfo stats
& $adb -s $serial shell dumpsys gfxinfo $pkg reset

# 2) force-stop app
& $adb -s $serial shell am force-stop $pkg

# 3) clear logcat
& $adb -s $serial logcat -c

# 4) launch app
& $adb -s $serial shell monkey -p $pkg -c android.intent.category.LAUNCHER 1

# 5) wait until PID exists, then keep 10s window
$appPid = (& $adb -s $serial shell pidof $pkg | Out-String).Trim()
Start-Sleep -Seconds 10

# 6) skipped frames (filtered by real process PID)
& $adb -s $serial logcat --pid=$appPid -d Choreographer:I *:S

# 7) framestats
& $adb -s $serial shell dumpsys gfxinfo $pkg framestats

# 8) meminfo
& $adb -s $serial shell dumpsys meminfo $pkg
```

## Before vs After

| Metric | Before (baseline provided) | After (2026-03-03, run #2) |
|---|---:|---:|
| Choreographer skipped frames | 46 | 0 |
| Framestats janky frames | 7 / 36 (19.44%) | 8 / 34 (23.53%) |
| Framestats p90 | 117ms | 109ms |
| Framestats p95 | 133ms | 133ms |
| Framestats p99 | 850ms | 150ms |
| High input latency | (high, not quantified in baseline) | 37 |
| Slow issue draw commands | (not captured in baseline) | 6 |
| TOTAL PSS | ~140MB (baseline noted ~2MB delta only) | 140,683 KB |
| TOTAL RSS | N/A | 267,572 KB |

Additional consistency run (`run #3`) after same rebuild/install flow:
- Skipped frames: `0`
- p99: `150ms`
- p90/p95: `113ms / 125ms`
- High input latency: `33`

## Raw Outputs

- `docs/perf-raw/after-logcat-20260303-110152.txt`
- `docs/perf-raw/after-gfx-20260303-110152.txt`
- `docs/perf-raw/after-mem-20260303-110152.txt`
- `docs/perf-raw/after-logcat-20260303-110234.txt`
- `docs/perf-raw/after-gfx-20260303-110234.txt`
- `docs/perf-raw/after-mem-20260303-110234.txt`

## Notes

- One intermediate iteration (before the final `useWorks` defer) still showed regression (`Skipped 49`, `p99 900ms`).  
  Final iteration moved non-critical startup work outside the first 10s window and removed those outliers.
