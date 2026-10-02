"""
Module: otp_reader.py
Chức năng: Tự động kết nối Gmail qua IMAP, đọc thư mới nhất từ Pokémon Center Online và trích xuất mã OTP nhanh chóng, ổn định.
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

def fetch_pokemon_otp_from_gmail(gmail_address, app_password, timeout_seconds=60, poll_interval=2, ignore_otps=None):
    """
    Kết nối vào Gmail và chờ thư OTP mới từ Pokémon Center Online.
    
    :param gmail_address: Địa chỉ Gmail
    :param app_password: Mật khẩu ứng dụng 16 ký tự của Gmail (App Password)
    :param timeout_seconds: Thời gian tối đa chờ thư OTP (mặc định 60 giây)
    :param poll_interval: Chu kỳ kiểm tra hòm thư (2 giây)
    :param ignore_otps: Tập hợp các mã OTP đã cũ/đã sử dụng để tránh nhận lại mã cũ
    :return: Chuỗi 6 chữ số OTP hoặc None nếu hết thời gian
    """
    if ignore_otps is None:
        ignore_otps = set()

    clean_email = gmail_address.strip()
    clean_pwd = app_password.replace(" ", "").strip()
    start_time = time.time()
    
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [MAIL] Đang kết nối vào Gmail: {clean_email}...")

    mail = None
    # Thử kết nối IMAP tối đa 3 lần nếu Google bị nghẽn
    for attempt in range(1, 4):
        try:
            mail = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30)
            mail.login(clean_email, clean_pwd)
            break
        except Exception as e:
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [MAIL] Lỗi kết nối lần {attempt}: {e}")
            if attempt < 3:
                time.sleep(2)
            else:
                print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [LỖI MAIL] Không thể kết nối tới Gmail sau 3 lần thử.")
                return None

    try:
        status, count_data = mail.select("INBOX")
        if status != "OK":
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [MAIL] Lỗi mở INBOX.")
            mail.logout()
            return None
        
        initial_total = int(count_data[0]) if count_data and count_data[0] else 0
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [MAIL] Kết nối Gmail thành công. Tổng thư hiện tại: {initial_total}. Đang quét OTP...")

        while time.time() - start_time < timeout_seconds:
            try:
                # Kiểm tra lại số lượng thư trong INBOX
                res, count_res = mail.select("INBOX")
                if res != "OK":
                    time.sleep(poll_interval)
                    continue

                total_msgs = int(count_res[0])
                if total_msgs == 0:
                    time.sleep(poll_interval)
                    continue

                # Chỉ fetch tối đa 3 thư mới nhất (cực kỳ nhanh, < 1 giây)
                fetch_start = max(1, total_msgs - 2)
                seq_range = f"{fetch_start}:{total_msgs}"
                status, data = mail.fetch(seq_range, "(RFC822)")
                if status != "OK" or not data:
                    time.sleep(poll_interval)
                    continue

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

                    # Tính tuổi của email (giây)
                    email_age_seconds = None
                    try:
                        email_dt = email.utils.parsedate_to_datetime(date_str)
                        if email_dt.tzinfo is None:
                            email_dt = email_dt.replace(tzinfo=datetime.timezone.utc)
                        email_age_seconds = (now_utc - email_dt).total_seconds()
                    except Exception:
                        pass

                    # Nhận diện email từ Pokémon Center Online
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

                    # Nếu mã này đã từng được sử dụng trước đó, bỏ qua để chờ thư mới hơn
                    if code in ignore_otps:
                        continue

                    # Nếu email quá cũ (> 5 phút / 300 giây) thì không dùng vì Pokémon Center chỉ cho hạn 5 phút
                    if email_age_seconds is not None and email_age_seconds > 300:
                        continue

                    elapsed = round(time.time() - start_time, 1)
                    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [MAIL] -> TÌM THẤY MÃ OTP HỢP LỆ: [{code}] (Tìm trong {elapsed}s, Thư gửi cách đây {int(email_age_seconds or 0)}s)!")
                    try:
                        mail.logout()
                    except Exception:
                        pass
                    return code

                time.sleep(poll_interval)

            except Exception as loop_err:
                print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [MAIL] Cảnh báo vòng lặp: {loop_err}")
                time.sleep(poll_interval)

    finally:
        try:
            mail.logout()
        except Exception:
            pass

    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [MAIL] Hết thời gian chờ ({timeout_seconds}s) không có thư OTP mới.")
    return None

if __name__ == "__main__":
    if sys.platform.startswith("win"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    print("=== Test OTP Reader ===")
    import json
    try:
        acc = json.load(open("accounts.json", encoding="utf-8"))[0]
        code = fetch_pokemon_otp_from_gmail(acc["pokemon_email"], acc["gmail_app_password"], timeout_seconds=10)
        print("Kết quả:", code)
    except Exception as e:
        print("Lỗi test:", e)
