@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0native\uninstall-native-host.ps1"
if errorlevel 1 (
  echo.
  echo Uninstallation failed. Review the error above.
) else (
  echo.
  echo Uninstallation completed.
)
pause
