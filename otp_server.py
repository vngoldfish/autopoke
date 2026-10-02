"""
=============================================================================
  OTP LOCAL SERVER - HỖ TRỢ CHROME EXTENSION ĐỌC OTP TỪ GMAIL TỰ ĐỘNG
=============================================================================
Chạy một máy chủ HTTP nhẹ nhàng trên cổng 8765 (127.0.0.1:8765) bằng thư viện
chuẩn của Python (không cần cài thêm bất kỳ thư viện ngoài nào).

Khi bạn ở trang nhập mã OTP (login-mfa.html) trên Google Chrome, Chrome Extension
sẽ gọi tới server này:
  GET http://127.0.0.1:8765/get-otp?email=xxx@gmail.com
Server này sẽ vào Gmail đọc mã 6 số mới nhất từ Pokemon Center và trả về
để Extension tự động điền vào màn hình cho bạn!
"""

import http.server
import socketserver
import json
import urllib.parse
import sys
from pathlib import Path
from otp_reader import fetch_pokemon_otp_from_gmail

# Đảm bảo UTF-8 cho Windows CMD
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
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
            # Nếu chỉ có 1 tài khoản thì dùng luôn
            if len(accounts) == 1 and accounts[0].get("gmail_app_password"):
                return accounts[0].get("gmail_app_password").strip()
    except Exception as e:
        print(f"[LỖI ĐỌC ACCOUNTS] {e}")
    return None

class OTPHandler(http.server.BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        if parsed.path == "/ping":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "OK", "message": "OTP Server đang chạy tốt!"}).encode("utf-8"))
            return

        if parsed.path == "/get-otp":
            query = urllib.parse.parse_qs(parsed.query)
            email_addr = query.get("email", [""])[0].strip()
            app_pwd = query.get("app_password", [""])[0].strip()

            if not app_pwd and email_addr:
                app_pwd = get_app_password_for_email(email_addr)

            # Nếu vẫn không có app_pwd, thử đọc nick đầu tiên trong accounts.json
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
                self.send_header("Content-Type", "application/json")
                self.send_cors_headers()
                self.end_headers()
                resp = {
                    "success": False, 
                    "error": "Thiếu địa chỉ Gmail hoặc chưa cài đặt gmail_app_password trong accounts.json"
                }
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
                return

            print(f"\n[YÊU CẦU OTP] Nhận yêu cầu lấy OTP từ Chrome cho: {email_addr}")
            otp_code = fetch_pokemon_otp_from_gmail(email_addr, app_pwd, timeout_seconds=75)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()

            if otp_code:
                print(f"[THÀNH CÔNG] Đã gửi mã OTP [{otp_code}] về cho Chrome Extension!")
                resp = {"success": True, "otp": otp_code}
            else:
                resp = {"success": False, "error": "Không tìm thấy thư OTP mới từ Pokémon Center trong Gmail!"}

            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        # Giảm bớt log rác http
        pass

def main():
    print("=" * 70)
    print(f"  OTP HELPER SERVER ĐANG CHẠY TẠI http://127.0.0.1:{PORT}")
    print("  Server này sẽ phục vụ Chrome Extension lấy mã OTP Gmail tự động.")
    print("  Hãy để cửa sổ này mở trong khi sử dụng Chrome!")
    print("=" * 70)
    
    with socketserver.TCPServer(("127.0.0.1", PORT), OTPHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nĐã tắt OTP Server.")

if __name__ == "__main__":
    main()
