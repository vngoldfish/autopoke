@echo off
chcp 65001 > nul
title Them / Dang Nhap Tai Khoan Moi
echo =====================================================================
echo    THÊM TÀI KHOẢN MỚI / ĐĂNG NHẬP LẦN ĐẦU (POKEMON CENTER)
echo =====================================================================
echo.
set /p accname=">> Nhập tên định danh cho tài khoản (Ví dụ: Nick_1, Nick_2): "
if "%accname%"=="" (
    echo [LỖI] Tên tài khoản không được để trống!
    pause
    exit /b
)

echo.
echo Đang mở trình duyệt Chrome cho [%accname%]...
echo Vui lòng đăng nhập và xác thực OTP trên cửa sổ Chrome vừa mở.
echo.
python multi_runner.py --setup %accname%
pause
