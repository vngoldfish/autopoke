@echo off
chcp 65001 > nul
title Pokemon Center Online - Auto Lottery Monitor (10 phut/lan)
echo =====================================================================
echo    TOOL TỰ ĐỘNG CANH ĐẶT HÀNG POKEMON CENTER (ĐỊNH KỲ 10 PHÚT/LẦN)
echo =====================================================================
echo.
python auto_lottery.py --monitor 10
pause
