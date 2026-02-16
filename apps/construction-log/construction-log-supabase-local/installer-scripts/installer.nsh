; Custom NSIS script for seamless updates
; This script ensures the app is closed before updating

!macro customInit
  ; AGGRESSIVE KILL - Try every possible method to close the app
  
  ; Method 1: Kill main executable by exact name
  nsExec::ExecToStack 'taskkill /f /t /im "Sistema de Gestion de Obras.exe"'
  
  ; Method 2: Kill with hyphenated name variant
  nsExec::ExecToStack 'taskkill /f /t /im "Sistema-de-Gestion-de-Obras.exe"'
  
  ; Method 3: Kill Partes-de-Trabajo variant (from artifactName)
  nsExec::ExecToStack 'taskkill /f /t /im "Partes-de-Trabajo.exe"'
  
  ; Method 4: Kill by window title (multiple variants)
  nsExec::ExecToStack 'taskkill /f /fi "WINDOWTITLE eq Sistema de Gestion de Obras"'
  nsExec::ExecToStack 'taskkill /f /fi "WINDOWTITLE eq Sistema de Gestion*"'
  nsExec::ExecToStack 'taskkill /f /fi "WINDOWTITLE eq Partes de Trabajo*"'
  
  ; Method 5: Kill ALL Electron-related processes in the install directory
  nsExec::ExecToStack 'wmic process where "ExecutablePath like ''%Sistema de Gestion%''" call terminate'
  nsExec::ExecToStack 'wmic process where "ExecutablePath like ''%Partes-de-Trabajo%''" call terminate'

  ; Method 5.5: PowerShell fallback (kills by process Path match)
  ; NOTE: In NSIS, $ starts a variable. PowerShell uses $_, so we must escape it as $$_.
  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $$_.Path -like ''*Sistema*Gestion*Obras*'' -or $$_.Path -like ''*Partes-de-Trabajo*'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  
  ; Method 6: Kill any GPU and renderer helper processes (Electron spawns these)
  nsExec::ExecToStack 'taskkill /f /im "Sistema de Gestion de Obras Helper.exe"'
  nsExec::ExecToStack 'taskkill /f /im "Sistema de Gestion de Obras Helper (GPU).exe"'
  nsExec::ExecToStack 'taskkill /f /im "Sistema de Gestion de Obras Helper (Renderer).exe"'
  
  ; Method 7: Kill Update.exe from electron-updater
  nsExec::ExecToStack 'taskkill /f /t /im "Update.exe"'
  nsExec::ExecToStack 'taskkill /f /t /im "elevate.exe"'
  
  ; Wait for processes to fully terminate
  Sleep 2500
  
  ; Second round of kills in case something respawned
  nsExec::ExecToStack 'taskkill /f /t /im "Sistema de Gestion de Obras.exe"'
  nsExec::ExecToStack 'taskkill /f /t /im "Sistema-de-Gestion-de-Obras.exe"'
  nsExec::ExecToStack 'taskkill /f /t /im "Partes-de-Trabajo.exe"'
  nsExec::ExecToStack 'taskkill /f /t /im "Update.exe"'
  
  Sleep 1200

  ; Third round (stubborn cases / slow shutdown)
  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $$_.Path -like ''*Sistema*Gestion*Obras*'' -or $$_.Path -like ''*Partes-de-Trabajo*'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Sleep 800
  
  ; Clean lock files that might prevent installation
  Delete "$LOCALAPPDATA\sistema-de-gestion-de-obras-updater\pending\*.*"
  Delete "$LOCALAPPDATA\sistema-de-gestion-de-obras-updater\*.lock"
  RMDir "$LOCALAPPDATA\sistema-de-gestion-de-obras-updater\pending"
!macroend

!macro customInstall
  ; After installation, clean up old shortcuts if they exist with different paths
  ; This helps when updating from a version that was installed elsewhere
  
  ; Ensure the app directory exists and has proper permissions
  CreateDirectory "$INSTDIR"

  ; Extra safety: close any leftover running instances right before file operations
  nsExec::ExecToStack 'taskkill /f /t /im "Sistema de Gestion de Obras.exe"'
  nsExec::ExecToStack 'taskkill /f /t /im "Sistema-de-Gestion-de-Obras.exe"'
  nsExec::ExecToStack 'taskkill /f /t /im "Partes-de-Trabajo.exe"'
  nsExec::ExecToStack 'taskkill /f /t /im "Update.exe"'
  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $$_.Path -like ''*Sistema*Gestion*Obras*'' -or $$_.Path -like ''*Partes-de-Trabajo*'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Sleep 800
  
  ; Clean any leftover lock files
  Delete "$INSTDIR\*.lock"
  Delete "$LOCALAPPDATA\sistema-de-gestion-de-obras-updater\*.lock"
!macroend

!macro customUnInstall
  ; Ensure app is closed before uninstalling - AGGRESSIVE method
  nsExec::ExecToStack 'taskkill /f /t /im "Sistema de Gestion de Obras.exe"'
  nsExec::ExecToStack 'taskkill /f /t /im "Sistema-de-Gestion-de-Obras.exe"'
  nsExec::ExecToStack 'taskkill /f /t /im "Partes-de-Trabajo.exe"'
  nsExec::ExecToStack 'taskkill /f /fi "WINDOWTITLE eq Sistema de Gestion de Obras"'
  nsExec::ExecToStack 'taskkill /f /t /im "Update.exe"'
  nsExec::ExecToStack 'wmic process where "ExecutablePath like ''%Sistema de Gestion%''" call terminate'
  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $$_.Path -like ''*Sistema*Gestion*Obras*'' -or $$_.Path -like ''*Partes-de-Trabajo*'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  
  Sleep 2000
  
  ; Clean updater files
  Delete "$LOCALAPPDATA\sistema-de-gestion-de-obras-updater\*.*"
  RMDir /r "$LOCALAPPDATA\sistema-de-gestion-de-obras-updater"
!macroend
