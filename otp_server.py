"""
=============================================================================
  OTP LOCAL SERVER & ACCOUNT MANAGER - PHỤC VỤ CHROME EXTENSION TỰ ĐỘNG HÓA
=============================================================================
Máy chủ HTTP cục bộ chạy tại http://127.0.0.1:8765.
Cung cấp API:
  - GET  /ping      : Kiểm tra trạng thái server
  - GET  /accounts  : Lấy danh sách tài khoản từ accounts.json
  - POST /accounts  : Lưu/Cập nhật danh sách tài khoản vào accounts.json
  - GET  /get-otp   : Quét Gmail và lấy mã OTP Pokémon Center mới nhất
"""

import http.server
import socketserver
import json
import urllib.parse
import sys
import time
from pathlib import Path
from otp_reader import get_latest_pokemon_otp

# Cấu hình UTF-8 cho Windows Terminal
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = 8765
BASE_DIR = Path(__file__).resolve().parent
ACCOUNTS_FILE = BASE_DIR / "accounts.json"

def read_accounts():
    """Đọc danh sách tài khoản từ file accounts.json."""
    if not ACCOUNTS_FILE.exists():
        return []
    try:
        with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
            accounts = json.load(f)
            if not isinstance(accounts, list):
                return []
            for i, acc in enumerate(accounts):
                if not acc.get("id"):
                    acc["id"] = f"acc_{i+1}"
                if not acc.get("otp_email"):
                    acc["otp_email"] = acc.get("pokemon_email", "")
            return accounts
    except Exception as e:
        print(f"[LỖI ĐỌC ACCOUNTS] {e}")
        return []

def save_accounts(accounts):
    """Lưu danh sách tài khoản vào file accounts.json."""
    for i, acc in enumerate(accounts):
        if not acc.get("id"):
            acc["id"] = f"acc_{i+1}_{int(time.time())}"
        if not acc.get("otp_email"):
            acc["otp_email"] = acc.get("pokemon_email", "")
    with open(ACCOUNTS_FILE, "w", encoding="utf-8") as f:
        json.dump(accounts, f, ensure_ascii=False, indent=2)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

class OTPHandler(http.server.BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/ping":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_cors_headers()
            self.end_headers()
            resp = {"status": "OK", "message": "OTP Server đang hoạt động tốt!"}
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        if parsed.path == "/accounts":
            accounts = read_accounts()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_cors_headers()
            self.end_headers()
            resp = {"success": True, "accounts": accounts}
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        if parsed.path == "/get-otp":
            query = urllib.parse.parse_qs(parsed.query)
            account_id = query.get("account_id", [""])[0].strip()
            email_addr = query.get("email", [""])[0].strip()
            app_pwd = query.get("app_password", [""])[0].strip()
            exclude_otp = query.get("exclude_otp", [""])[0].strip()
            force = query.get("force", ["0"])[0] == "1"

            accounts = read_accounts()
            matched_acc = None

            # 1. Tìm theo account_id nếu có
            if account_id:
                matched_acc = next((a for a in accounts if a.get("id") == account_id), None)

            # 2. Tìm theo email nếu không tìm thấy theo account_id
            if not matched_acc and email_addr:
                matched_acc = next((
                    a for a in accounts 
                    if a.get("pokemon_email", "").strip().lower() == email_addr.lower() or 
                       a.get("otp_email", "").strip().lower() == email_addr.lower()
                ), None)

            # 3. Mặc định lấy tài khoản đầu tiên nếu không có chỉ định
            if not matched_acc and len(accounts) > 0 and not app_pwd:
                matched_acc = accounts[0]

            if matched_acc:
                email_addr = (matched_acc.get("otp_email") or matched_acc.get("pokemon_email", "")).strip()
                if not app_pwd:
                    app_pwd = matched_acc.get("gmail_app_password", "").strip()

            if not email_addr or not app_pwd:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_cors_headers()
                self.end_headers()
                resp = {
                    "success": False,
                    "error": "Chưa tìm thấy Gmail nhận OTP hoặc gmail_app_password cho tài khoản này!"
                }
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
                return

            print(f"\n[YÊU CẦU OTP] Đang quét OTP từ Gmail: {email_addr}...")

            res = get_latest_pokemon_otp(
                gmail_address=email_addr,
                app_password=app_pwd,
                exclude_otp=exclude_otp if not force else None,
                force=force
            )

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_cors_headers()
            self.end_headers()

            if res.get("status") == "ok":
                otp_code = res.get("otp")
                age = res.get("age", 0)
                print(f"[THÀNH CÔNG] Đã tìm thấy OTP mới [{otp_code}] (gửi cách đây {age}s) cho {email_addr}!")
                resp = {"success": True, "otp": otp_code, "age": age}
            else:
                status = res.get("status")
                err_msg = res.get("error", "Chưa có thư mới")
                print(f"[ĐANG CHỜ] {err_msg}")
                resp = {
                    "success": False,
                    "waiting": True,
                    "status": status,
                    "error": err_msg
                }

            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/accounts":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode("utf-8"))
                accounts = data if isinstance(data, list) else data.get("accounts", [])
                save_accounts(accounts)
                print(f"[CẬP NHẬT] Đã lưu thành công {len(accounts)} tài khoản vào accounts.json!")

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_cors_headers()
                self.end_headers()
                resp = {
                    "success": True, 
                    "message": "Đã lưu tài khoản vào accounts.json!", 
                    "accounts": read_accounts()
                }
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
                return
            except Exception as e:
                print(f"[LỖI POST ACCOUNTS] {e}")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_cors_headers()
                self.end_headers()
                resp = {"success": False, "error": f"Lỗi lưu accounts: {str(e)}"}
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
                return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        # Không in log http request rác
        pass

def main():
    print("=" * 72)
    print(f"  OTP LOCAL SERVER & ACCOUNT MANAGER ĐANG CHẠY TẠI http://127.0.0.1:{PORT}")
    print("  Server phục vụ Chrome Extension quản lý tài khoản và đọc Gmail OTP.")
    print("  Giữ cửa sổ này mở trong khi sử dụng trình duyệt Chrome!")
    print("=" * 72)

    try:
        with ThreadedTCPServer(("127.0.0.1", PORT), OTPHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã tắt OTP Server.")
    except Exception as e:
        print(f"\nLỗi khởi động Server: {e}")

if __name__ == "__main__":
    main()
