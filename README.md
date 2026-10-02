# HỆ THỐNG TỰ ĐỘNG ĐĂNG KÝ BỐC THĂM POKÉMON CENTER ONLINE (MULTI-ACCOUNT)

Dự án tự động hóa đăng ký xổ số (抽選販売 - Lottery Application) tại website **Pokémon Center Online Japan** (`https://www.pokemoncenter-online.com/lottery/apply.html`), hỗ trợ:
1. **Lọc thông minh:** Tự động lọc chỉ nộp đơn cho **`【本人未認証枠】`** (bỏ qua `【本人認証済み枠】`).
2. **Chạy đa tài khoản (Multi-Account Orchestrator):** Quản lý nhiều tài khoản độc lập, mỗi nick chỉ cần đăng nhập 1 lần, tool tự động chuyển nick và nộp đơn tuần tự.
3. **Chrome Extension độc lập:** Có thể cài trực tiếp vào trình duyệt cá nhân để dùng thủ công bất kỳ lúc nào.

---

## 📁 Danh sách tệp tin chính:

| Tệp tin | Chức năng |
| :--- | :--- |
| **`them_tai_khoan_moi.bat`** | Bấm đúp để thêm tài khoản mới và đăng nhập lần đầu (nhập pass + OTP). Phiên đăng nhập sẽ được lưu vĩnh viễn. |
| **`chay_tat_ca_tai_khoan.bat`** | Bấm đúp để tự động chạy bốc thăm cho tất cả các tài khoản lần lượt từ đầu đến cuối. |
| **`profiles.json`** | Danh sách cấu hình các tài khoản (hỗ trợ gán Proxy riêng cho từng nick nếu cần). |
| **`multi_runner.py`** | Script Python điều phối đa tài khoản. |
| **`pokemon-lottery-extension/`** | Thư mục Chrome Extension đã tích hợp sẵn bộ lọc `【本人未認証枠】`. |
| **`screenshots/`** | Thư mục tự động lưu ảnh kết quả sau khi nộp đơn thành công cho từng nick. |

---

## 🚀 HƯỚNG DẪN SỬ DỤNG ĐA TÀI KHOẢN:

### Bước 1: Thêm và đăng nhập các tài khoản (Chỉ làm 1 lần duy nhất)
1. Bấm đúp vào file **`them_tai_khoan_moi.bat`**.
2. Nhập tên tài khoản (Ví dụ: `Nick_1`, `Nick_2`, `Nick_3`...).
3. Một cửa sổ Google Chrome riêng biệt sẽ mở ra (đã nạp sẵn Extension).
4. Bạn đăng nhập email, mật khẩu và nhập mã OTP SMS trên trình duyệt đó.
5. Sau khi đăng nhập thành công vào trang web, nhấn **Enter** trong cửa sổ đen hoặc đóng trình duyệt lại.
6. Lặp lại với các nick tiếp theo.

### Bước 2: Chạy tự động tất cả các nick
1. Bấm đúp vào file **`chay_tat_ca_tai_khoan.bat`**.
2. Tool sẽ tự động:
   * Mở `Nick_1` -> Chờ Extension tự nộp đơn cho khung `【本人未認証枠】` -> Chụp ảnh màn hình lưu lại -> Đóng `Nick_1`.
   * Tạm nghỉ ngẫu nhiên 4 - 8 giây (để tránh bị coi là spam).
   * Mở tiếp `Nick_2` -> Nộp đơn -> Chụp ảnh -> Đóng `Nick_2`...
   * Cứ thế chạy tuần tự cho đến hết tất cả các tài khoản và xuất bảng báo cáo tổng kết.
