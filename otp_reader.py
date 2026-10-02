"""
Module: otp_reader.py
Chức năng: Tự động kết nối Gmail qua giao thức IMAP, đọc thư mới nhất từ Pokemon Center Online và trích xuất mã OTP.
"""

import imaplib
import email
from email.header import decode_header
import re
import time
from datetime import datetime

def decode_mime_words(s):
    """Giải mã tiêu đề email tiếng Nhật/UTF-8."""
    if not s:
        return ""
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

def get_email_body(msg):
    """Trích xuất nội dung văn bản từ email (hỗ trợ cả plain text và html)."""
    body = ""
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
    return body

def fetch_pokemon_otp_from_gmail(gmail_address, app_password, timeout_seconds=90, poll_interval=3):
    """
    Kết nối vào Gmail và chờ thư OTP mới từ Pokémon Center Online.
    
    :param gmail_address: Địa chỉ Gmail (VD: user@gmail.com)
    :param app_password: Mật khẩu ứng dụng 16 ký tự của Gmail (App Password)
    :param timeout_seconds: Thời gian tối đa chờ thư OTP (mặc định 90 giây)
    :param poll_interval: Khoảng thời gian kiểm tra lại hòm thư (mặc định 3 giây)
    :return: Chuỗi 6 chữ số OTP hoặc None nếu quá thời gian
    """
    start_time = time.time()
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [MAIL] Đang kết nối vào hòm thư Gmail: {gmail_address}...")

    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(gmail_address.strip(), app_password.replace(" ", "").strip())
        mail.select("INBOX")
    except Exception as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [LỖI MAIL] Không thể đăng nhập Gmail: {e}")
        print(">> Chú ý: Hãy chắc chắn bạn dùng 'Mật khẩu ứng dụng' (App Password 16 chữ cái) của Gmail.")
        return None

    print(f"[{datetime.now().strftime('%H:%M:%S')}] [MAIL] Đã kết nối Gmail thành công. Đang chờ thư xác thực OTP từ Pokémon Center...")

    last_checked_id = None

    while time.time() - start_time < timeout_seconds:
        try:
            # Làm mới hòm thư
            mail.noop()
            status, messages = mail.search(None, 'ALL')
            if status != "OK":
                time.sleep(poll_interval)
                continue

            mail_ids = messages[0].split()
            if not mail_ids:
                time.sleep(poll_interval)
                continue

            # Lấy 5 email gần nhất
            recent_ids = mail_ids[-5:]
            recent_ids.reverse()

            for m_id in recent_ids:
                status, data = mail.fetch(m_id, "(RFC822)")
                if status != "OK":
                    continue

                raw_email = data[0][1]
                msg = email.message_from_bytes(raw_email)

                subject = decode_mime_words(msg.get("Subject", ""))
                from_sender = decode_mime_words(msg.get("From", ""))
                body = get_email_body(msg)

                # Kiểm tra xem có phải thư từ Pokemon Center không
                is_pokemon = (
                    "pokemoncenter" in from_sender.lower() or 
                    "pokemon" in subject.lower() or 
                    "認証コード" in subject or 
                    "パスコード" in subject or 
                    "認証コード" in body or
                    "パスコード" in body or
                    "pokemoncenter-online" in body.lower()
                )

                if is_pokemon:
                    # Tìm mã OTP 6 chữ số trong tiêu đề hoặc nội dung
                    # Thông thường có dạng: 認証コード: 123456 hoặc パスコード: 123456 hoặc 【123456】
                    patterns = [
                        r"認証コード[：:\s]*([0-9]{6})",
                        r"パスコード[：:\s]*([0-9]{6})",
                        r"【([0-9]{6})】",
                        r"\b([0-9]{6})\b"
                    ]

                    full_text = f"{subject}\n{body}"
                    for pat in patterns:
                        match = re.search(pat, full_text)
                        if match:
                            otp_code = match.group(1)
                            elapsed = int(time.time() - start_time)
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] [MAIL] -> TÌM THẤY MÃ OTP: {otp_code} (Sau {elapsed}s)!")
                            mail.logout()
                            return otp_code

            time.sleep(poll_interval)

        except Exception as e:
            # Gặp lỗi tạm thời thì thử lại
            time.sleep(poll_interval)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] [MAIL] Quá thời gian ({timeout_seconds}s) không tìm thấy thư OTP mới.")
    try:
        mail.logout()
    except Exception:
        pass
    return None

if __name__ == "__main__":
    # Test thử trực tiếp
    print("Test module đọc OTP Gmail")
    email_test = input("Nhập địa chỉ Gmail: ").strip()
    pass_test = input("Nhập mật khẩu ứng dụng Gmail (App Password): ").strip()
    code = fetch_pokemon_otp_from_gmail(email_test, pass_test, timeout_seconds=30)
    print("Kết quả mã OTP:", code)
