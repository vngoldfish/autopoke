@echo off
chcp 65001 > nul
title Pokemon Center Online - Auto Lottery Tool
echo =====================================================================
echo    TOOL TỰ ĐỘNG ĐĂNG KÝ XỔ SỐ / ĐẶT MUA POKEMON CENTER ONLINE
echo =====================================================================
echo.
echo Đang kiểm tra môi trường Python...
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [LỖI] Không tìm thấy Python trên máy tính của bạn!
    echo Vui lòng cài đặt Python và tích chọn "Add python.exe to PATH".
    pause
    exit /b
)

echo Đang khởi chạy script auto_lottery.py...
echo.
python auto_lottery.py
pause
