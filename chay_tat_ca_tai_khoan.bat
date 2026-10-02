@echo off
chcp 65001 > nul
title Chay Tu Dong Tat Ca Tai Khoan
echo =====================================================================
echo    CHẠY TỰ ĐỘNG BỐC THĂM TẤT CẢ TÀI KHOẢN (MULTI-ACCOUNT RUNNER)
echo =====================================================================
echo.
python multi_runner.py --run-all
pause
