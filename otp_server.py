"""
=============================================================================
  OTP LOCAL SERVER (FAST & STATELESS) - PHỤC VỤ CHROME EXTENSION ĐỌC GMAIL OTP
=============================================================================
Máy chủ HTTP cục bộ chạy tại http://127.0.0.1:8765.
Tự động kết nối Gmail, quét thư xác thực mới nhất từ Pokémon Center và gửi về
cho Chrome Extension trong ~1.2 giây mỗi lượt, hỗ trợ đăng nhập liên tục nhiều nick.
"""

import http.server
import socketserver
import json
import urllib.parse
import sys
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

def get_app_password_for_email(email_addr):
    """Tìm mật khẩu ứng dụng Gmail từ file accounts.json."""
    if not ACCOUNTS_FILE.exists():
        return None
    try:
        with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
            accounts = json.load(f)
            for acc in accounts:
                if acc.get("pokemon_email", "").strip().lower() == email_addr.strip().lower():
                    return acc.get("gmail_app_password", "").strip()
            if len(accounts) == 1 and accounts[0].get("gmail_app_password"):
                return accounts[0].get("gmail_app_password").strip()
    except Exception as e:
        print(f"[LỖI ACCOUNTS] {e}")
    return None

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

        if parsed.path == "/get-otp":
            query = urllib.parse.parse_qs(parsed.query)
            email_addr = query.get("email", [""])[0].strip()
            app_pwd = query.get("app_password", [""])[0].strip()
            exclude_otp = query.get("exclude_otp", [""])[0].strip()
            force = query.get("force", ["0"])[0] == "1"

            if not app_pwd and email_addr:
                app_pwd = get_app_password_for_email(email_addr)

            if not app_pwd:
                try:
                    with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
                        accs = json.load(f)
                        if accs and accs[0].get("gmail_app_password"):
                            app_pwd = accs[0].get("gmail_app_password")
                            if not email_addr:
                                email_addr = accs[0].get("pokemon_email")
                except Exception:
                    pass

            if not email_addr or not app_pwd:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_cors_headers()
                self.end_headers()
                resp = {
                    "success": False,
                    "error": "Chưa tìm thấy Gmail hoặc gmail_app_password trong accounts.json"
                }
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
                return

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

    def log_message(self, format, *args):
        # Không in log http request rác
        pass

def main():
    print("=" * 72)
    print(f"  OTP HELPER SERVER (FAST & STATELESS) ĐANG CHẠY TẠI http://127.0.0.1:{PORT}")
    print("  Server phục vụ Chrome Extension tự động đọc mã OTP từ Gmail.")
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
