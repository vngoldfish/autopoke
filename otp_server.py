"""
=============================================================================
  OTP LOCAL SERVER (MULTI-THREADED) - HỖ TRỢ CHROME EXTENSION ĐỌC GMAIL OTP
=============================================================================
Máy chủ HTTP cục bộ chạy tại http://127.0.0.1:8765.
Tự động kết nối Gmail, quét thư xác thực mới nhất từ Pokémon Center và gửi về
cho Chrome Extension để tự điền mã Passcode.
"""

import http.server
import socketserver
import json
import urllib.parse
import sys
from pathlib import Path
from otp_reader import fetch_pokemon_otp_from_gmail

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

# Bộ nhớ lưu các mã OTP đã dùng để tránh đọc trùng mã cũ
USED_OTPS = set()

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
        global USED_OTPS
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/ping":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_cors_headers()
            self.end_headers()
            resp = {
                "status": "OK",
                "message": "OTP Server đang hoạt động tốt!",
                "used_otps": list(USED_OTPS)
            }
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        if parsed.path == "/clear-cache":
            USED_OTPS.clear()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "Đã làm trống danh sách OTP cũ!"}).encode("utf-8"))
            return

        if parsed.path == "/get-otp":
            query = urllib.parse.parse_qs(parsed.query)
            email_addr = query.get("email", [""])[0].strip()
            app_pwd = query.get("app_password", [""])[0].strip()
            force = query.get("force", ["0"])[0] == "1"

            if force:
                USED_OTPS.clear()

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

            print(f"\n[YÊU CẦU OTP] Chrome Extension đang yêu cầu đọc OTP cho: {email_addr}")
            print(f"               (Đã bỏ qua các mã cũ: {list(USED_OTPS)})")

            otp_code = fetch_pokemon_otp_from_gmail(
                gmail_address=email_addr,
                app_password=app_pwd,
                timeout_seconds=65,
                poll_interval=2,
                ignore_otps=USED_OTPS
            )

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_cors_headers()
            self.end_headers()

            if otp_code:
                USED_OTPS.add(otp_code)
                print(f"[THÀNH CÔNG] Đã gửi mã OTP [{otp_code}] về cho Chrome Extension!")
                resp = {"success": True, "otp": otp_code}
            else:
                resp = {
                    "success": False,
                    "error": "Chưa thấy thư OTP mới từ Pokémon Center trong Gmail (quá 60s). Hãy bấm 'パスコードを再送する' trên web rồi bấm lại!"
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
    print(f"  OTP HELPER SERVER (MULTI-THREADED) ĐANG CHẠY TẠI http://127.0.0.1:{PORT}")
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
