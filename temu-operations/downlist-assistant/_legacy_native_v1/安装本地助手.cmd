@echo off
chcp 65001 >nul
setlocal
echo 正在为当前 Windows 用户安装 Temu 下架助手本地组件...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0native\install-native-host.ps1"
if errorlevel 1 (
  echo.
  echo 安装失败。请检查是否已完整解压压缩包，并查看上方错误信息。
) else (
  echo.
  echo 安装成功。请完全退出并重新打开比特浏览器。
)
pause
