"""
=============================================================================
  HỆ THỐNG QUẢN LÝ & CHẠY ĐA TÀI KHOẢN (MULTI-ACCOUNT RUNNER)
  POKÉMON CENTER ONLINE LOTTERY AUTOMATION
=============================================================================
Hỗ trợ:
- Quản lý đa tài khoản độc lập qua từng Chrome Profile riêng biệt.
- Mỗi nick chỉ cần đăng nhập 1 lần duy nhất (nhập mật khẩu + OTP), session lưu vĩnh viễn.
- Tự động nạp Chrome Extension đã tối ưu bộ lọc [本人未認証枠].
- Tự động chạy tuần tự từng nick: Mở -> Nộp đơn -> Chụp ảnh kết quả -> Đóng -> Chuyển nick tiếp theo.
- Hỗ trợ gán Proxy riêng cho từng tài khoản (nếu cần đổi IP).
"""

import sys
import os
import time
import json
import argparse
import random
from datetime import datetime
from pathlib import Path

# Đảm bảo in tiếng Việt chuẩn trên Windows Command Prompt
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from playwright.sync_api import sync_playwright
from otp_reader import fetch_pokemon_otp_from_gmail

BASE_DIR = Path(__file__).resolve().parent
PROFILES_DIR = BASE_DIR / "profiles"
SCREENSHOTS_DIR = BASE_DIR / "screenshots"
ACCOUNTS_FILE = BASE_DIR / "accounts.json"
CONFIG_FILE = BASE_DIR / "profiles.json"
EXTENSION_DIR = BASE_DIR / "pokemon-lottery-extension"

LOTTERY_APPLY_URL = "https://www.pokemoncenter-online.com/lottery/apply.html"

def log(msg, level="INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    prefix = {
        "INFO": "[INFO]",
        "SUCCESS": "[OK]",
        "WARN": "[WARN]",
        "ERROR": "[ERR]",
    }.get(level, "[INFO]")
    print(f"[{timestamp}] {prefix} {msg}")

def load_profiles():
    # Ưu tiên đọc từ accounts.json nếu có
    target_file = ACCOUNTS_FILE if ACCOUNTS_FILE.exists() else CONFIG_FILE
    if not target_file.exists():
        default_config = [
            {
                "name": "Nick_1",
                "enabled": True,
                "pokemon_email": "",
                "pokemon_password": "",
                "gmail_app_password": "",
                "proxy": ""
            }
        ]
        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(default_config, f, indent=2, ensure_ascii=False)
        return default_config
    try:
        with open(target_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log(f"Lỗi đọc file cấu hình tài khoản: {e}", "ERROR")
        return []

def save_profiles(profiles):
    target_file = ACCOUNTS_FILE if ACCOUNTS_FILE.exists() else CONFIG_FILE
    with open(target_file, "w", encoding="utf-8") as f:
        json.dump(profiles, f, indent=2, ensure_ascii=False)

def get_launch_args(profile_path, proxy=None):
    """Tạo cấu hình khởi chạy Chrome với Extension và Profile riêng biệt."""
    ext_path = str(EXTENSION_DIR)
    args = [
        f"--disable-extensions-except={ext_path}",
        f"--load-extension={ext_path}",
        "--disable-blink-features=AutomationControlled",
        "--start-maximized"
    ]
    kwargs = {
        "user_data_dir": str(profile_path),
        "channel": "chrome",
        "headless": False,
        "args": args,
        "no_viewport": True
    }
    if proxy and proxy.strip():
        kwargs["proxy"] = {"server": proxy.strip()}
    return kwargs

def setup_account(name):
    """Mở Chrome cho tài khoản chỉ định để người dùng đăng nhập lần đầu."""
    profile_path = PROFILES_DIR / name
    profile_path.mkdir(parents=True, exist_ok=True)
    
    log(f"=== BẮT ĐẦU CÀI ĐẶT / ĐĂNG NHẬP CHO TÀI KHOẢN: [{name}] ===", "INFO")
    log(f"Thư mục lưu phiên: {profile_path}")
    log("Đang khởi chạy Chrome với Extension có sẵn...")

    with sync_playwright() as p:
        kwargs = get_launch_args(profile_path)
        context = p.chromium.launch_persistent_context(**kwargs)
        page = context.pages[0] if context.pages else context.new_page()

        page.goto(LOTTERY_APPLY_URL)
        print("\n" + "=" * 70)
        print(f"👉 VUI LÒNG ĐĂNG NHẬP TÀI KHOẢN [{name}] TRÊN TRÌNH DUYỆT CHROME VỪA MỞ.")
        print("👉 Nhập email, mật khẩu và mã OTP SMS (nếu có).")
        print("👉 Sau khi đăng nhập thành công vào trang, bạn có thể ĐÓNG trình duyệt.")
        print("👉 Phiên đăng nhập sẽ được lưu lại vĩnh viễn cho nick này!")
        print("=" * 70 + "\n")

        try:
            # Chờ người dùng đóng trình duyệt hoặc nhấn Enter trong terminal
            input("Nhấn phím [ENTER] trên bàn phím sau khi bạn đã đăng nhập xong...")
        except KeyboardInterrupt:
            pass

        try:
            context.close()
        except Exception:
            pass
        log(f"Đã lưu xong phiên đăng nhập cho tài khoản [{name}]!", "SUCCESS")

def handle_login_and_otp(page, account):
    """Tự động điền tài khoản, mật khẩu và đọc mã OTP từ Gmail nếu cần."""
    name = account.get("name", "Unknown")
    email_val = account.get("pokemon_email", "").strip()
    pwd_val = account.get("pokemon_password", "").strip()
    app_pwd = account.get("gmail_app_password", "").strip()

    if not email_val or not pwd_val:
        log(f"[{name}] Chưa cấu hình pokemon_email/pokemon_password trong accounts.json", "WARN")
        return False

    current_url = page.url.lower()

    # 1. Nếu đang ở trang đăng nhập
    if "login" in current_url and "mfa" not in current_url:
        log(f"[{name}] Đang tự động điền Email và Mật khẩu...", "INFO")
        time.sleep(2)

        email_selectors = [
            'input[name="loginID"]',
            'input[name="email"]',
            'input[type="email"]',
            '#loginId',
            '#mailAddress',
            'input[placeholder*="メール"]'
        ]
        for sel in email_selectors:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.fill(email_val)
                break

        time.sleep(0.5)
        pwd_selectors = [
            'input[name="password"]',
            'input[type="password"]',
            '#password',
            'input[placeholder*="パスワード"]'
        ]
        for sel in pwd_selectors:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.fill(pwd_val)
                break

        time.sleep(1)
        btn_selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '#loginBtn',
            '.loginBtn',
            'a.comBtn01',
            'button:has-text("ログイン")',
            'a:has-text("ログイン")'
        ]
        for sel in btn_selectors:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                log(f"[{name}] Đang bấm nút Đăng nhập...", "INFO")
                loc.first.click()
                break

        time.sleep(5)

    # 2. Kiểm tra nếu chuyển hướng sang trang nhập Passcode/OTP
    current_url = page.url.lower()
    if "mfa" in current_url or "passcode" in current_url:
        log(f"[{name}] Đã đến trang nhập mã xác thực OTP (login-mfa.html)!", "WARN")
        if not app_pwd:
            log(f"[{name}] Chưa cài đặt gmail_app_password trong accounts.json để tự đọc OTP!", "ERROR")
            return False

        log(f"[{name}] Đang kết nối Gmail để đọc mã OTP tự động...", "INFO")
        otp_code = fetch_pokemon_otp_from_gmail(email_val, app_pwd, timeout_seconds=90)

        if not otp_code:
            log(f"[{name}] Không nhận được mã OTP từ Gmail!", "ERROR")
            return False

        log(f"[{name}] -> TÌM THẤY MÃ OTP: [{otp_code}]. Đang điền vào trang web...", "SUCCESS")
        otp_selectors = [
            'input[name="passcode"]',
            'input[name="code"]',
            '#passcode',
            'input[type="text"]',
            'input[type="number"]'
        ]
        for sel in otp_selectors:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.fill(otp_code)
                break

        time.sleep(1)
        auth_btn_selectors = [
            'button[type="submit"]',
            '#authBtn',
            '#verifyBtn',
            'input[type="submit"]',
            'button:has-text("認証")',
            'a:has-text("認証")',
            'button:has-text("送信")'
        ]
        for sel in auth_btn_selectors:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                log(f"[{name}] Bấm nút Xác thực OTP...", "INFO")
                loc.first.click()
                break

        time.sleep(5)

    # 3. Kiểm tra xem đã vào được trang bốc thăm chưa
    if "apply.html" in page.url.lower():
        log(f"[{name}] Đăng nhập thành công và đã vào trang bốc thăm!", "SUCCESS")
        return True
    elif "login" not in page.url.lower():
        return True
    return False

def run_single_account(p, account):
    """Thực thi quy trình đăng ký cho một tài khoản cụ thể."""
    name = account.get("name", "Unknown")
    proxy = account.get("proxy", "")
    profile_path = PROFILES_DIR / name
    profile_path.mkdir(parents=True, exist_ok=True)

    log(f"----------------------------------------------------------------------")
    log(f"▶ BẮT ĐẦU XỬ LÝ TÀI KHOẢN: [{name}] (Proxy: {proxy if proxy else 'IP Gốc'})")
    
    kwargs = get_launch_args(profile_path, proxy)
    
    try:
        context = p.chromium.launch_persistent_context(**kwargs)
    except Exception as e:
        log(f"Không thể mở Chrome cho [{name}]: {e}", "ERROR")
        return {"name": name, "status": "LỖI_MỞ_TRÌNH_DUYỆT", "detail": str(e)}

    page = context.pages[0] if context.pages else context.new_page()

    try:
        log(f"[{name}] Đang truy cập trang bốc thăm xổ số...")
        page.goto(LOTTERY_APPLY_URL, wait_until="domcontentloaded", timeout=60000)
        time.sleep(3)

        # Nếu phát hiện trang login hoặc mfa -> Thực hiện tự động đăng nhập & đọc OTP từ Gmail
        if "login" in page.url.lower() or "mfa" in page.url.lower():
            log(f"[{name}] Phiên đăng nhập cần xác thực. Đang tiến hành đăng nhập tự động...", "INFO")
            ok = handle_login_and_otp(page, account)
            if not ok and ("login" in page.url.lower() or "mfa" in page.url.lower()):
                log(f"[{name}] Không thể hoàn thành đăng nhập tự động!", "WARN")
                context.close()
                return {"name": name, "status": "LỖI_ĐĂNG_NHẬP", "detail": "Không thể vượt qua login/OTP"}
            time.sleep(3)

        # Đợi Gigya và Extension tự động chạy
        log(f"[{name}] Đang chờ Extension quét và xử lý (tối đa 25 giây)...")
        
        # Theo dõi trạng thái trên trang
        applied = False
        start_wait = time.time()
        
        while time.time() - start_wait < 25:
            # Kiểm tra xem có log thành công từ extension hoặc trang không
            log_entries = page.evaluate("""
                () => {
                    const logs = document.querySelectorAll('#pk-bot-logs .pk-log-line');
                    return Array.from(logs).map(el => el.textContent);
                }
            """)
            
            # Kiểm tra nếu có thông báo hoàn thành hoặc không có sản phẩm mở
            full_log_text = " ".join(log_entries)
            if "HOÀN THÀNH" in full_log_text or "THÀNH CÔNG" in full_log_text:
                log(f"[{name}] Phát hiện Extension đã nộp đơn thành công!", "SUCCESS")
                applied = True
                time.sleep(3)
                break
            elif "KHÔNG CÓ sản phẩm" in full_log_text:
                log(f"[{name}] Không có sản phẩm nào đang mở cần nộp đơn.", "INFO")
                applied = True
                break
                
            time.sleep(2)

        # Chụp ảnh xác nhận kết quả
        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        screenshot_file = SCREENSHOTS_DIR / f"{name}_{timestamp}.png"
        page.screenshot(path=str(screenshot_file), full_page=False)
        log(f"[{name}] Đã lưu ảnh chụp kết quả: {screenshot_file.name}", "INFO")

        context.close()
        return {"name": name, "status": "THÀNH_CÔNG" if applied else "ĐÃ_XỬ_LÝ", "screenshot": str(screenshot_file)}

    except Exception as e:
        log(f"[{name}] Lỗi trong quá trình chạy: {e}", "ERROR")
        try:
            context.close()
        except Exception:
            pass
        return {"name": name, "status": "LỖI", "detail": str(e)}

def run_all_accounts():
    """Chạy tuần tự toàn bộ danh sách tài khoản trong profiles.json."""
    profiles = load_profiles()
    active_accounts = [acc for acc in profiles if acc.get("enabled", True)]

    if not active_accounts:
        log("Không tìm thấy tài khoản nào đang được kích hoạt (enabled: true) trong profiles.json!", "WARN")
        return

    log(f"=== BẮT ĐẦU TIẾN TRÌNH CHẠY ĐA TÀI KHOẢN ({len(active_accounts)} TÀI KHOẢN) ===")
    
    results = []
    with sync_playwright() as p:
        for idx, acc in enumerate(active_accounts, 1):
            log(f"\n[TIẾN ĐỘ: {idx}/{len(active_accounts)}]")
            res = run_single_account(p, acc)
            results.append(res)

            # Nghỉ ngẫu nhiên giữa các tài khoản để đảm bảo tự nhiên
            if idx < len(active_accounts):
                delay = random.randint(4, 8)
                log(f"Tạm nghỉ {delay} giây trước khi chuyển sang tài khoản tiếp theo...")
                time.sleep(delay)

    # In báo cáo tổng kết
    print("\n" + "=" * 80)
    print(f"{'STT':<5} | {'TÊN TÀI KHOẢN':<20} | {'TRẠNG THÁI':<18} | {'CHI TIẾT'}")
    print("-" * 80)
    for i, r in enumerate(results, 1):
        st = r.get("status", "")
        detail = r.get("detail", r.get("screenshot", "OK"))
        print(f"{i:<5} | {r.get('name', ''):<20} | {st:<18} | {str(detail)[-30:]}")
    print("=" * 80 + "\n")
    log("Tất cả tài khoản đã được xử lý xong!", "SUCCESS")

def setup_flow(acc_name):
    profiles = load_profiles()
    names = [p.get("name") for p in profiles]
    if acc_name not in names:
        profiles.append({"name": acc_name, "enabled": True, "proxy": ""})
        save_profiles(profiles)
        log(f"Đã thêm [{acc_name}] vào danh sách profiles.json.")
    setup_account(acc_name)

def interactive_menu():
    while True:
        print("\n" + "=" * 68)
        print("     POKEMON CENTER ONLINE - QUẢN LÝ & CHẠY ĐA TÀI KHOẢN")
        print("=" * 68)
        print("  1. Thêm tài khoản mới & Đăng nhập lần đầu (Lưu session)")
        print("  2. Chạy tự động tất cả các tài khoản (Run All)")
        print("  3. Chạy 1 tài khoản cụ thể")
        print("  4. Xem danh sách tài khoản hiện có")
        print("  5. Thoát")
        print("=" * 68)
        
        try:
            choice = input(">> Nhập lựa chọn (1-5): ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nĐã thoát.")
            break

        if choice == "1":
            acc_name = input(">> Nhập tên định danh cho nick (VD: Nick1, Nick2): ").strip()
            if acc_name:
                setup_flow(acc_name)
            else:
                log("Tên không được để trống!", "WARN")
        elif choice == "2":
            run_all_accounts()
        elif choice == "3":
            profiles = load_profiles()
            if not profiles:
                log("Chưa có tài khoản nào trong hệ thống!", "WARN")
                continue
            print("\nChọn tài khoản cần chạy:")
            for i, p in enumerate(profiles, 1):
                print(f"  {i}. {p.get('name')}")
            idx = input(f">> Nhập số thứ tự (1-{len(profiles)}): ").strip()
            if idx.isdigit() and 1 <= int(idx) <= len(profiles):
                target = profiles[int(idx) - 1]
                with sync_playwright() as p:
                    run_single_account(p, target)
            else:
                log("Lựa chọn không hợp lệ!", "WARN")
        elif choice == "4":
            profiles = load_profiles()
            print(f"\nDanh sách tài khoản ({len(profiles)} nick):")
            for i, p in enumerate(profiles, 1):
                en = "BẬT" if p.get("enabled", True) else "TẮT"
                px = p.get("proxy", "IP Gốc")
                print(f"  {i}. [{p.get('name')}] - Trạng thái: {en} - Proxy: {px}")
        elif choice == "5":
            print("Tạm biệt!")
            break
        else:
            print("Lựa chọn không hợp lệ, vui lòng chọn từ 1 đến 5.")

def main():
    parser = argparse.ArgumentParser(description="Multi-Account Runner cho Pokemon Center Online")
    parser.add_argument("--setup", type=str, nargs="?", const="", help="Mở Chrome để đăng nhập lần đầu (VD: --setup Nick_1)")
    parser.add_argument("--run-all", action="store_true", help="Chạy tuần tự tất cả tài khoản")
    parser.add_argument("--run", type=str, help="Chạy chỉ định 1 tài khoản (VD: --run Nick_1)")
    parser.add_argument("--list", action="store_true", help="Xem danh sách tài khoản hiện có")
    args = parser.parse_args()

    if args.list:
        profiles = load_profiles()
        print(f"\nDanh sách tài khoản ({len(profiles)} nick):")
        for i, p in enumerate(profiles, 1):
            en = "BẬT" if p.get("enabled", True) else "TẮT"
            px = p.get("proxy", "IP Gốc")
            print(f" {i}. [{p.get('name')}] - Trạng thái: {en} - Proxy: {px}")
        print()
        return

    if args.setup is not None:
        acc_name = args.setup.strip()
        if not acc_name:
            acc_name = input(">> Nhập tên định danh cho nick (VD: Nick1, Nick2): ").strip()
        if acc_name:
            setup_flow(acc_name)
        else:
            log("Tên tài khoản không được để trống!", "WARN")
        return

    if args.run:
        profiles = load_profiles()
        target = next((p for p in profiles if p.get("name") == args.run), None)
        if not target:
            target = {"name": args.run, "enabled": True, "proxy": ""}
        with sync_playwright() as p:
            run_single_account(p, target)
        return

    if args.run_all:
        run_all_accounts()
        return

    # Mặc định mở Menu tương tác trực quan
    interactive_menu()

if __name__ == "__main__":
    main()
