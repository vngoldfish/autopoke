"""
=============================================================================
  TOOL TỰ ĐỘNG ĐĂNG KÝ XỔ SỐ / ĐẶT MUA POKEMON CENTER ONLINE JAPAN
=============================================================================
Dự án: pokemoncenter-online.com (Lottery Apply Automation)
Được phát triển dựa trên phân tích file HAR thực tế.
"""

import sys
import os
import time
import json
import argparse
from datetime import datetime
from pathlib import Path

# Đảm bảo in tiếng Việt chuẩn trên Windows Command Prompt / PowerShell
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from playwright.sync_api import sync_playwright

# URL trang bốc thăm xổ số
LOTTERY_APPLY_URL = "https://www.pokemoncenter-online.com/lottery/apply.html"

# Trạng thái bốc thăm
STATUS_NAMES = {
    "20": "Chưa mở tiếp nhận (受付前)",
    "30": "ĐANG MỞ ĐĂNG KÝ (受付中)",
    "40": "ĐÃ ĐĂNG KÝ XONG (受付完了)",
    "50": "Đã kết thúc (受付終了)",
}

def log(msg, level="INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    prefix = {
        "INFO": "[INFO]",
        "SUCCESS": "[OK]",
        "WARN": "[WARN]",
        "ERROR": "[ERR]",
    }.get(level, "[INFO]")
    print(f"[{timestamp}] {prefix} {msg}")

def ensure_logged_in(page):
    """Kiểm tra xem người dùng đã đăng nhập chưa, nếu chưa thì đợi đăng nhập."""
    log("Đang kiểm tra trạng thái đăng nhập...")
    page.goto(LOTTERY_APPLY_URL, wait_until="domcontentloaded")
    time.sleep(3)

    # Nếu bị chuyển hướng sang login
    if "login" in page.url.lower():
        log("Tài khoản chưa đăng nhập hoặc phiên đã hết hạn!", "WARN")
        log(">>> VUI LÒNG ĐĂNG NHẬP TRÊN CỬA SỔ CHROME VỪA MỞ <<<", "WARN")
        log(">>> (Nhập tài khoản, mật khẩu và mã OTP nếu có) <<<", "WARN")
        
        # Chờ người dùng đăng nhập và quay lại trang lottery/apply.html
        while True:
            time.sleep(3)
            current_url = page.url
            if "lottery/apply.html" in current_url:
                log("Phát hiện đã đăng nhập thành công!", "SUCCESS")
                time.sleep(3)
                break
    else:
        log("Đã phát hiện phiên đăng nhập sẵn sàng.", "SUCCESS")

def get_lottery_data(page):
    """
    Gọi trực tiếp API lấy danh sách bốc thăm xổ số từ ngữ cảnh trang web
    để đảm bảo token Gigya và cookies đều hợp lệ.
    """
    log("Đang tải danh sách các sản phẩm xổ số (get-lottery-list)...")
    
    script = """
    async () => {
        try {
            // Chờ Gigya sẵn sàng nếu chưa
            if (!window.gigya || !window.gigya.accounts) {
                return { success: false, error: 'Chưa tải xong thư viện Gigya Auth' };
            }
            
            // Lấy JWT Bearer token
            const jwt = await new Promise((resolve, reject) => {
                window.gigya.accounts.getJWT({
                    fields: "UID,email,data.memberID,data.isPhoneNumberVerified",
                    callback: (res) => {
                        if (res.errorCode === 0) resolve(res.id_token);
                        else reject(new Error('Lỗi lấy JWT: ' + JSON.stringify(res)));
                    }
                });
            });

            // Gọi API get-lottery-list
            const res = await fetch('/a/ltr/api/lottery/v1/get-lottery-list', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + jwt,
                    'x-requested-with': 'XMLHttpRequest'
                }
            });

            if (!res.ok) {
                return { success: false, error: 'HTTP ' + res.status + ': ' + await res.text() };
            }

            const data = await res.json();
            return {
                success: true,
                jwt: jwt,
                data: data.data || []
            };
        } catch(e) {
            return { success: false, error: String(e) };
        }
    }
    """
    result = page.evaluate(script)
    return result

def apply_lottery(page, jwt, lottery_group_id, item_prize_id, title):
    """Gửi yêu cầu đăng ký sản phẩm xổ số qua API từ trong ngữ cảnh trình duyệt."""
    log(f"Đang gửi yêu cầu đăng ký: {title} (GroupID: {lottery_group_id}, PrizeID: {item_prize_id})...")
    
    script = """
    async ({ jwt, groupId, prizeId }) => {
        try {
            const res = await fetch('/a/ltr/api/lottery/v1/apply-lottery', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + jwt,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'x-requested-with': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    lotteryGroupId: groupId,
                    itemPrizeId: prizeId
                })
            });

            const status = res.status;
            let body = '';
            try {
                body = await res.json();
            } catch(e) {
                body = await res.text();
            }

            return {
                ok: res.ok,
                status: status,
                body: body
            };
        } catch(e) {
            return { ok: false, error: String(e) };
        }
    }
    """
    res = page.evaluate(script, {"jwt": jwt, "groupId": lottery_group_id, "prizeId": item_prize_id})
    return res

def process_lotteries(page, screenshot_dir):
    """Quét và xử lý toàn bộ các sản phẩm mở bán."""
    data_res = get_lottery_data(page)
    if not data_res.get("success"):
        log(f"Không thể lấy danh sách sản phẩm: {data_res.get('error')}", "ERROR")
        return False

    jwt = data_res.get("jwt")
    lottery_list = data_res.get("data", [])
    log(f"Tìm thấy tổng cộng {len(lottery_list)} mục xổ số trong hệ thống.")

    to_apply = []
    already_applied = []
    closed = []

    print("\n" + "=" * 80)
    print(f"{'MÃ NHÓM':<15} | {'TRẠNG THÁI':<22} | {'TÊN SẢN PHẨM'}")
    print("-" * 80)

    for item in lottery_list:
        gid = item.get("lotteryGroupId", "")
        status = str(item.get("applicationStatus", ""))
        title = item.get("lotteryTitle", "").strip()
        status_text = STATUS_NAMES.get(status, f"Mã trạng thái {status}")

        print(f"{gid:<15} | {status_text:<22} | {title[:40]}")

        if status == "30":  # Đang mở đăng ký
            # Mặc định chỉ nộp cho 【本人未認証枠】
            if "本人認証済み枠" in title:
                log(f"Bỏ qua (Do là [本人認証済み枠]): {title}", "WARN")
                continue

            items = item.get("applicationItems", [])
            prize_id = items[0].get("itemPrizeId") if items else None
            to_apply.append({
                "groupId": gid,
                "prizeId": prize_id,
                "title": title
            })
        elif status == "40":
            already_applied.append(title)
        else:
            closed.append(title)

    print("=" * 80 + "\n")
    log(f"Thống kê: Đang mở đăng ký: {len(to_apply)} | Đã đăng ký: {len(already_applied)} | Đã đóng: {len(closed)}")

    if not to_apply:
        log("Hiện tại KHÔNG CÓ sản phẩm nào ở trạng thái 'ĐANG MỞ ĐĂNG KÝ (受付中)' cần xử lý.", "INFO")
        return True

    success_count = 0
    for task in to_apply:
        gid = task["groupId"]
        pid = task["prizeId"]
        title = task["title"]

        if not pid:
            log(f"Bỏ qua {gid} vì không tìm thấy mã itemPrizeId", "WARN")
            continue

        res = apply_lottery(page, jwt, gid, pid, title)
        if res.get("ok"):
            log(f"-> THÀNH CÔNG: Đã đăng ký thành công cho: {title}!", "SUCCESS")
            success_count += 1
        else:
            log(f"-> THẤT BẠI: {title} - Kết quả: {res}", "ERROR")

        time.sleep(1)

    log(f"Đã hoàn thành đăng ký: {success_count}/{len(to_apply)} sản phẩm thành công.", "SUCCESS")

    # Tải lại trang và chụp ảnh xác nhận
    log("Đang tải lại trang để kiểm tra và lưu ảnh chụp màn hình xác nhận...")
    page.reload(wait_until="domcontentloaded")
    time.sleep(4)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    screenshot_path = screenshot_dir / f"lottery_result_{timestamp}.png"
    page.screenshot(path=str(screenshot_path), full_page=True)
    log(f"Đã lưu ảnh xác nhận kết quả tại: {screenshot_path}", "SUCCESS")
    return True

def main():
    parser = argparse.ArgumentParser(description="Tool tự động đăng ký bốc thăm Pokemon Center Online")
    parser.add_argument("--port", type=int, default=None, help="Cổng CDP Chrome (ví dụ 9222 nếu kết nối Chrome đang mở)")
    parser.add_argument("--monitor", type=int, default=0, help="Số phút tự động kiểm tra định kỳ (0 = chạy 1 lần)")
    args = parser.parse_args()

    project_dir = Path(__file__).resolve().parent
    user_data_dir = project_dir / "chrome_profile"
    screenshot_dir = project_dir / "screenshots"
    screenshot_dir.mkdir(exist_ok=True)

    log("=== KHỞI ĐỘNG TOOL TỰ ĐỘNG ĐẶT HÀNG / XỔ SỐ POKEMON CENTER ===")

    with sync_playwright() as p:
        if args.port:
            log(f"Đang kết nối vào Chrome có sẵn qua cổng CDP http://localhost:{args.port}...")
            browser = p.chromium.connect_over_cdp(f"http://localhost:{args.port}")
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = context.pages[0] if context.pages else context.new_page()
        else:
            log(f"Khởi chạy trình duyệt Chrome với profile: {user_data_dir}...")
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(user_data_dir),
                channel="chrome",
                headless=False,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--start-maximized"
                ],
                no_viewport=True
            )
            page = context.pages[0] if context.pages else context.new_page()

        # Kiểm tra đăng nhập
        ensure_logged_in(page)

        if args.monitor > 0:
            log(f"Chế độ theo dõi tự động: Tool sẽ quét định kỳ mỗi {args.monitor} phút.")
            while True:
                try:
                    process_lotteries(page, screenshot_dir)
                except Exception as e:
                    log(f"Lỗi khi xử lý: {e}", "ERROR")
                log(f"Đang chờ {args.monitor} phút trước lần quét tiếp theo (Nhấn Ctrl+C để dừng)...")
                time.sleep(args.monitor * 60)
                page.reload(wait_until="domcontentloaded")
                time.sleep(3)
        else:
            process_lotteries(page, screenshot_dir)
            log("Hoàn tất phiên chạy. Bạn có thể đóng cửa sổ trình duyệt.", "SUCCESS")
            input("\nNhấn phím [ENTER] trên bàn phím để kết thúc chương trình...")

if __name__ == "__main__":
    main()
