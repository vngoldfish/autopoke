"""
Module: otp_reader.py
Chức năng: Tự động kết nối Gmail qua IMAP, đọc thư mới nhất từ Pokémon Center Online và trích xuất mã OTP.
Thiết kế: Fast, stateless, đóng mở kết nối dứt khoát trong ~1.2s, không bao giờ treo socket.
"""

import imaplib
import email
from email.header import decode_header
import email.utils
import datetime
import re
import time
import sys

def decode_mime_words(s):
    """Giải mã tiêu đề email tiếng Nhật/UTF-8."""
    if not s:
        return ""
    try:
        decoded_fragments = decode_header(s)
        header_text = []
        for fragment, encoding in decoded_fragments:
            if isinstance(fragment, bytes):
                try:
                    header_text.append(fragment.decode(encoding or "utf-8", errors="ignore"))
                except Exception:
                    header_text.append(fragment.decode("utf-8", errors="ignore"))
            else:
                header_text.append(str(fragment))
        return "".join(header_text)
    except Exception:
        return str(s)

def get_email_body(msg):
    """Trích xuất nội dung văn bản plain text/html từ email."""
    body = ""
    try:
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition"))
                if content_type in ["text/plain", "text/html"] and "attachment" not in content_disposition:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        try:
                            body += payload.decode(charset, errors="ignore") + "\n"
                        except Exception:
                            body += payload.decode("utf-8", errors="ignore") + "\n"
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                try:
                    body = payload.decode(charset, errors="ignore")
                except Exception:
                    body = payload.decode("utf-8", errors="ignore")
    except Exception:
        pass
    return body

def extract_otp_code(text):
    """Tìm mã OTP 6 chữ số trong văn bản email Pokémon Center."""
    if not text:
        return None
    patterns = [
        r"【パスコード】\s*([0-9]{6})",
        r"パスコード[：:\s]*([0-9]{6})",
        r"認証コード[：:\s]*([0-9]{6})",
        r"【([0-9]{6})】",
        r"\b([0-9]{6})\b"
    ]
    for pat in patterns:
        match = re.search(pat, text)
        if match:
            return match.group(1)
    return None

def get_latest_pokemon_otp(gmail_address, app_password, exclude_otp=None, force=False, max_age_seconds=420):
    """
    Kiểm tra nhanh hòm thư Gmail và lấy mã OTP mới nhất từ Pokémon Center.
    Thời gian thực thi: ~1.2 giây.
    
    :param gmail_address: Email Gmail
    :param app_password: Mật khẩu ứng dụng 16 ký tự của Gmail
    :param exclude_otp: Mã OTP đã dùng ở lần đăng nhập trước (nếu trùng mã này thì coi như thư mới chưa tới)
    :param force: Bỏ qua kiểm tra exclude_otp và tuổi thư, lấy luôn mã tìm thấy
    :param max_age_seconds: Thời gian tối đa của thư hợp lệ (mặc định 420s = 7 phút)
    :return: dict {"status": "ok"|"waiting_new"|"expired"|"none"|"error", "otp": "...", "age": ...}
    """
    clean_email = gmail_address.strip()
    clean_pwd = app_password.replace(" ", "").strip()
    t0 = time.time()

    mail = None
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=15)
        mail.login(clean_email, clean_pwd)
        status, count_data = mail.select("INBOX")
        if status != "OK" or not count_data:
            return {"status": "error", "error": "Không thể mở INBOX"}

        total_msgs = int(count_data[0])
        if total_msgs == 0:
            return {"status": "none", "error": "Hòm thư đang trống"}

        # Lấy tối đa 3 thư mới nhất (cực nhanh, chỉ ~0.2s)
        fetch_start = max(1, total_msgs - 2)
        seq_range = f"{fetch_start}:{total_msgs}"
        status, data = mail.fetch(seq_range, "(RFC822)")
        if status != "OK" or not data:
            return {"status": "none", "error": "Không thể đọc dữ liệu email"}

        now_utc = datetime.datetime.now(datetime.timezone.utc)

        # Duyệt từ thư mới nhất trở về trước
        for item in reversed(data):
            if not isinstance(item, tuple) or len(item) < 2:
                continue

            raw_email = item[1]
            msg = email.message_from_bytes(raw_email)

            subject = decode_mime_words(msg.get("Subject", ""))
            from_sender = decode_mime_words(msg.get("From", ""))
            date_str = msg.get("Date", "")

            # Kiểm tra xem có phải email xác thực từ Pokémon Center không
            is_pokemon = (
                "pokemoncenter" in from_sender.lower() or
                "pokemon" in subject.lower() or
                "パスコード" in subject or
                "認証コード" in subject
            )

            if not is_pokemon:
                continue

            body = get_email_body(msg)
            full_text = f"{subject}\n{body}"
            code = extract_otp_code(full_text)

            if not code:
                continue

            # Tính tuổi email
            email_age_seconds = 0
            try:
                email_dt = email.utils.parsedate_to_datetime(date_str)
                if email_dt.tzinfo is None:
                    email_dt = email_dt.replace(tzinfo=datetime.timezone.utc)
                email_age_seconds = (now_utc - email_dt).total_seconds()
            except Exception:
                pass

            # Nếu force=True: lấy luôn không cần kiểm tra thêm
            if force:
                return {
                    "status": "ok",
                    "otp": code,
                    "age": int(email_age_seconds),
                    "elapsed": round(time.time() - t0, 2)
                }

            # Nếu mã này chính là mã đã dùng ở lượt đăng nhập trước -> Thư mới chưa tới
            if exclude_otp and code.strip() == str(exclude_otp).strip():
                return {
                    "status": "waiting_new",
                    "error": f"Mã gần nhất ({code}) là mã của lượt trước. Đang chờ Pokémon Center gửi mã mới...",
                    "age": int(email_age_seconds),
                    "elapsed": round(time.time() - t0, 2)
                }

            # Nếu thư quá hạn (> max_age_seconds)
            if email_age_seconds > max_age_seconds:
                return {
                    "status": "expired",
                    "error": f"Thư OTP gần nhất đã quá hạn ({int(email_age_seconds)}s trước). Đang chờ thư mới...",
                    "age": int(email_age_seconds),
                    "elapsed": round(time.time() - t0, 2)
                }

            # Hợp lệ!
            return {
                "status": "ok",
                "otp": code,
                "age": int(email_age_seconds),
                "elapsed": round(time.time() - t0, 2)
            }

        return {"status": "none", "error": "Chưa thấy thư xác thực từ Pokémon Center"}

    except Exception as e:
        return {"status": "error", "error": f"Lỗi kết nối Gmail: {str(e)}"}
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass

if __name__ == "__main__":
    import json
    sys.stdout.reconfigure(encoding="utf-8")
    acc = json.load(open("accounts.json", encoding="utf-8"))[0]
    res = get_latest_pokemon_otp(acc["pokemon_email"], acc["gmail_app_password"])
    print("Kết quả kiểm tra:", res)
