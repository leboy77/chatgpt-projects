@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0native\install-native-host.ps1"
if errorlevel 1 (
  echo.
  echo Installation failed. Review the error above.
) else (
  echo.
  echo Installation completed.
)
pause
