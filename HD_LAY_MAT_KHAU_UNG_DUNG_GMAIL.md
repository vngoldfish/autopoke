# CÁCH LẤY "MẬT KHẨU ỨNG DỤNG GMAIL" (APP PASSWORD) TRONG 1 PHÚT

Để bot có thể tự động vào hòm thư Gmail và bóc tách mã OTP 6 số từ Pokémon Center gửi về mà không bị Google chặn bảo mật, bạn cần tạo **1 Mật khẩu ứng dụng 16 ký tự** của Gmail.

---

### 3 BƯỚC THỰC HIỆN:

1. **Bước 1:** Bật xác minh 2 bước cho tài khoản Google (nếu đã bật thì bỏ qua bước này):
   * Truy cập: [https://myaccount.google.com/security](https://myaccount.google.com/security)
   * Bật **"Xác minh 2 bước" (2-Step Verification)** bằng số điện thoại của bạn.

2. **Bước 2:** Vào trang tạo Mật khẩu ứng dụng:
   * Truy cập thẳng vào link: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   * Nhập mật khẩu tài khoản Google nếu được yêu cầu.

3. **Bước 3:** Tạo mật khẩu cho bot:
   * Tại ô **Tên ứng dụng (App name)**: Nhập `PokemonBot` (hoặc tên bất kỳ).
   * Bấm nút **Tạo (Create)**.
   * Google sẽ hiện ra một chuỗi mật khẩu gồm 16 chữ cái (Ví dụ: `abcd efgh ijkl mnop`).

---

### CÁCH ĐIỀN VÀO FILE `accounts.json`:

Bạn mở file `accounts.json` và điền chuỗi 16 chữ cái đó vào mục `gmail_app_password`:

```json
[
  {
    "name": "Nick_1",
    "enabled": true,
    "pokemon_email": "diachi_gmail_cua_ban@gmail.com",
    "pokemon_password": "MatKhauPokemonCenterCuaBan",
    "gmail_app_password": "abcd efgh ijkl mnop",
    "proxy": ""
  }
]
```

🎉 **Xong!** Bây giờ mỗi khi chạy, bot sẽ tự động điền Email, Password, tự vào Gmail lấy mã OTP điền vào trang web và nộp đơn bốc thăm hoàn toàn tự động!
