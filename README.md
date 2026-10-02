# HƯỚNG DẪN SỬ DỤNG TOOL TỰ ĐỘNG ĐẶT HÀNG / XỔ SỐ POKEMON CENTER ONLINE

Dự án này tự động hóa quy trình đăng ký mua bốc thăm xổ số (抽選販売 - Lottery Application) tại website **Pokémon Center Online Japan** (`https://www.pokemoncenter-online.com/lottery/apply.html`), tái hiện chính xác toàn bộ thao tác trong file HAR của bạn.

---

## 📁 Danh sách tệp tin trong dự án:

1. [auto_lottery.py](file:///c:/Users/Admin/Desktop/pokemon/auto_lottery.py): Script Python chính thực hiện tự động hóa.
2. [run_tool.bat](file:///c:/Users/Admin/Desktop/pokemon/run_tool.bat): File bấm đúp để chạy kiểm tra và đăng ký 1 lần ngay lập tức.
3. [run_monitor_10m.bat](file:///c:/Users/Admin/Desktop/pokemon/run_monitor_10m.bat): File bấm đúp để chạy chế độ canh định kỳ (10 phút quét 1 lần).
4. `screenshots/`: Thư mục tự động lưu ảnh chụp màn hình kết quả sau khi đăng ký thành công.
5. `chrome_profile/`: Thư mục lưu phiên đăng nhập của Google Chrome (giúp bạn không cần đăng nhập lại ở những lần chạy sau).

---

## 🚀 Cách sử dụng:

### Cách 1: Chạy 1 lần (Đăng ký ngay các sản phẩm đang mở)
1. Bấm đúp vào file [run_tool.bat](file:///c:/Users/Admin/Desktop/pokemon/run_tool.bat).
2. Trình duyệt Chrome sẽ tự động bật lên.
3. **Lần đầu tiên chạy:** Nếu chưa đăng nhập, tool sẽ nhắc bạn đăng nhập tài khoản trên cửa sổ Chrome đó (nhập email, pass và mã OTP nếu có).
4. Sau khi đăng nhập, tool sẽ:
   - Tự động quét toàn bộ danh sách sản phẩm.
   - Tìm các mục có trạng thái **ĐANG MỞ ĐĂNG KÝ (受付中)**.
   - Tự động tích chọn sản phẩm, tích đồng ý điều khoản và gửi lệnh đăng ký (`apply-lottery`).
   - Tải lại trang và chụp ảnh xác nhận lưu vào thư mục `screenshots/`.

### Cách 2: Chế độ tự động canh đợt mở bán mới (Monitor)
* Bấm đúp vào file [run_monitor_10m.bat](file:///c:/Users/Admin/Desktop/pokemon/run_monitor_10m.bat). Tool sẽ tự động kiểm tra định kỳ mỗi 10 phút. Hễ có sản phẩm mới mở đăng ký, tool sẽ nộp đơn ngay lập tức.

---

## 🔒 An toàn & Bảo mật:
- Tool sử dụng trình duyệt Chrome thật, kế thừa 100% IP, cookie và vân tay trình duyệt của bạn nên **vượt qua an toàn hệ thống chống bot ZeroNaught WAF** và **Google reCAPTCHA Enterprise**.
- Không lưu mật khẩu của bạn vào code (đăng nhập trực tiếp trên trình duyệt chính thống).
