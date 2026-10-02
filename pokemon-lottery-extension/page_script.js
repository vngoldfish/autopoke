/**
 * Pokemon Center Lottery Automation - Page Script (World: MAIN)
 * Chạy trực tiếp trong ngữ cảnh trang web, có quyền truy cập trực tiếp window.gigya, window.apiRequest
 */

(function () {
    console.log("[PK-BOT] Page script initialized in MAIN world.");

    const CONFIG = {
        autoRunOnLoad: true,        // Tự động chạy khi vào trang apply.html
        monitorIntervalMin: 10,     // Chu kỳ tự động kiểm tra lại (phút)
    };

    // Helper ghi log lên widget
    function addLog(text, type = "info") {
        const time = new Date().toLocaleTimeString();
        console.log(`[PK-BOT] [${time}] [${type}] ${text}`);
        const logBox = document.getElementById("pk-bot-logs");
        if (logBox) {
            const div = document.createElement("div");
            div.className = `pk-log-line pk-log-${type}`;
            div.innerHTML = `<span class="pk-log-time">[${time}]</span> ${text}`;
            logBox.appendChild(div);
            logBox.scrollTop = logBox.scrollHeight;
        }
    }

    // Tạo Floating Widget trên giao diện
    function createWidget() {
        if (document.getElementById("pk-auto-bot-container")) return;

        const path = window.location.pathname.toLowerCase();
        const isMfaPage = path.includes("mfa") || path.includes("passcode");
        const isLoginPage = (path.includes("login") || path.endsWith("/login/")) && !isMfaPage;

        const container = document.createElement("div");
        container.id = "pk-auto-bot-container";

        container.innerHTML = `
            <div id="pk-bot-header">
                <div class="pk-title">
                    <span>⚡ PKM Auto Lottery</span>
                </div>
                <div class="pk-controls">
                    <button class="pk-btn-icon" id="pk-toggle-btn" title="Thu nhỏ/Mở rộng">−</button>
                </div>
            </div>
            <div id="pk-bot-body">
                ${isMfaPage ? `
                    <div class="pk-status-box">
                        <div style="color: #2ed573; font-weight: bold; margin-bottom: 6px;">📩 BƯỚC NHẬP MÃ OTP GMAIL</div>
                        <div style="font-size: 11px; line-height: 1.4;">Pokémon Center đã gửi mã OTP về Gmail. Bấm nút bên dưới để bot tự động đọc và điền mã OTP!</div>
                    </div>
                    <button class="pk-btn-run" id="pk-btn-fetch-otp" style="background: linear-gradient(135deg, #ff4757, #ee1515);">
                        📩 ĐỌC OTP GMAIL & TỰ ĐIỀN
                    </button>
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                        <input type="text" id="pk-manual-otp" placeholder="Hoặc dán 6 số OTP vào đây" style="flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid #57606f; background: #2f3542; color: #fff; font-size: 12px; outline: none;">
                        <button id="pk-btn-fill-otp" style="padding: 6px 12px; background: #2ed573; border: none; border-radius: 6px; color: #fff; font-weight: bold; cursor: pointer; font-size: 12px;">Điền</button>
                    </div>
                    <div id="pk-bot-logs"></div>
                ` : isLoginPage ? `
                    <div class="pk-status-box">
                        <div style="color: #ffa502; font-weight: bold; margin-bottom: 6px;">🔑 TRANG ĐĂNG NHẬP</div>
                        <div style="font-size: 11px; line-height: 1.4;">Vui lòng đăng nhập tài khoản. Ngay sau khi bấm đăng nhập, bot sẽ tự động đọc mã OTP từ Gmail ở bước tiếp theo!</div>
                    </div>
                    <div id="pk-bot-logs"></div>
                ` : `
                    <div class="pk-row">
                        <span class="pk-switch-label">Tự động nộp khi mở trang:</span>
                        <label class="pk-switch">
                            <input type="checkbox" id="pk-auto-toggle" ${CONFIG.autoRunOnLoad ? "checked" : ""}>
                            <span class="pk-slider"></span>
                        </label>
                    </div>

                    <div class="pk-row" style="margin-top: 2px;">
                        <span class="pk-switch-label">Loại khung đăng ký:</span>
                        <select id="pk-filter-mode" style="background: #2f3542; color: #2ed573; font-weight: bold; border: 1px solid #57606f; border-radius: 6px; padding: 4px 6px; font-size: 11px; outline: none; cursor: pointer; max-width: 170px;">
                            <option value="unverified_only" selected>Chỉ [本人未認証枠]</option>
                            <option value="verified_only">Chỉ [本人認証済み枠]</option>
                            <option value="all">Tất cả các khung</option>
                        </select>
                    </div>

                    <div class="pk-status-box">
                        <div class="pk-status-item">
                            <span>Tài khoản:</span>
                            <span class="pk-status-val info" id="pk-user-email">Đang kiểm tra...</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Cần nộp đơn:</span>
                            <span class="pk-status-val warn" id="pk-open-count">0</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Đã hoàn thành:</span>
                            <span class="pk-status-val success" id="pk-applied-count">0</span>
                        </div>
                    </div>

                    <button class="pk-btn-run" id="pk-btn-execute">🚀 QUÉT & NỘP ĐƠN NGAY</button>
                    <div id="pk-bot-logs"></div>
                `}
            </div>
        `;

        document.body.appendChild(container);

        // Nút thu nhỏ
        const toggleBtn = document.getElementById("pk-toggle-btn");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => {
                container.classList.toggle("minimized");
                toggleBtn.textContent = container.classList.contains("minimized") ? "+" : "−";
            });
        }

        // Xử lý trang MFA OTP
        const btnFetchOtp = document.getElementById("pk-btn-fetch-otp");
        if (btnFetchOtp) {
            btnFetchOtp.addEventListener("click", () => {
                fetchOtpFromLocalServer();
            });
        }
        const btnFillManual = document.getElementById("pk-btn-fill-otp");
        if (btnFillManual) {
            btnFillManual.addEventListener("click", () => {
                const manualCode = document.getElementById("pk-manual-otp").value.trim();
                if (manualCode) {
                    fillAndSubmitOtp(manualCode);
                } else {
                    addLog("Vui lòng nhập mã OTP 6 số!", "warn");
                }
            });
        }

        // Checkbox tự động
        const autoToggle = document.getElementById("pk-auto-toggle");
        if (autoToggle) {
            autoToggle.addEventListener("change", (e) => {
                CONFIG.autoRunOnLoad = e.target.checked;
                localStorage.setItem("pk_auto_run", e.target.checked ? "1" : "0");
                addLog(`Đã ${e.target.checked ? "BẬT" : "TẮT"} chế độ tự động chạy khi vào trang.`, "info");
            });
            const savedPref = localStorage.getItem("pk_auto_run");
            if (savedPref !== null) {
                autoToggle.checked = savedPref === "1";
                CONFIG.autoRunOnLoad = savedPref === "1";
            }
        }

        // Dropdown chọn loại khung (Mặc định: Chỉ 本人未認証枠)
        const filterSelect = document.getElementById("pk-filter-mode");
        if (filterSelect) {
            const savedFilter = localStorage.getItem("pk_filter_mode") || "unverified_only";
            filterSelect.value = savedFilter;
            filterSelect.addEventListener("change", (e) => {
                localStorage.setItem("pk_filter_mode", e.target.value);
                addLog(`Đã đổi bộ lọc: ${e.target.options[e.target.selectedIndex].text}`, "info");
            });
        }

        // Nút bấm chạy thủ công
        const runBtn = document.getElementById("pk-btn-execute");
        if (runBtn) {
            runBtn.addEventListener("click", () => {
                runBotProcess();
            });
        }
    }

    // Điền và xác thực mã OTP
    function fillAndSubmitOtp(code) {
        if (!code) return;
        code = code.trim();
        addLog(`Đang tìm ô Passcode và điền mã OTP [${code}]...`, "info");

        // Cập nhật lên ô input dự phòng của widget để người dùng nhìn thấy
        const manualInput = document.getElementById("pk-manual-otp");
        if (manualInput) manualInput.value = code;

        // Tìm tất cả các ô input trên trang LOẠI TRỪ container của Bot
        const candidateInputs = Array.from(document.querySelectorAll('input')).filter(input => {
            if (input.closest('#pk-auto-bot-container')) return false;
            const type = (input.type || 'text').toLowerCase();
            return !['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(type);
        });

        if (candidateInputs.length === 0) {
            addLog("Không tìm thấy ô nhập Passcode trên trang web!", "err");
            return;
        }

        // Trường hợp 1: Có 6 ô nhập 1 chữ số (digit-by-digit)
        const digitInputs = candidateInputs.filter(i => i.maxLength === 1 || i.size === 1);
        if (digitInputs.length === 6 && code.length === 6) {
            addLog("Phát hiện 6 ô nhập từng chữ số OTP...", "info");
            for (let idx = 0; idx < 6; idx++) {
                const inp = digitInputs[idx];
                const char = code[idx];
                inp.focus();
                try {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    setter.call(inp, char);
                } catch(e) {
                    inp.value = char;
                }
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
            }
        } else {
            // Trường hợp 2: Ô nhập chuỗi 6 ký tự
            let targetInput = candidateInputs.find(i => 
                (i.name && i.name.toLowerCase().includes("passcode")) ||
                (i.id && i.id.toLowerCase().includes("passcode")) ||
                (i.placeholder && i.placeholder.includes("パスコード")) ||
                (i.name && i.name.toLowerCase().includes("code"))
            ) || candidateInputs[0];

            addLog(`Đã xác định ô nhập Passcode: <${targetInput.tagName.toLowerCase()} name="${targetInput.name || ''}" id="${targetInput.id || ''}">`, "info");

            targetInput.focus();
            try {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(targetInput, code);
            } catch (e) {
                targetInput.value = code;
            }

            // Kích hoạt toàn bộ sự kiện giả lập gõ phím
            targetInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            targetInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

            if (window.$) {
                try {
                    window.$(targetInput).val(code).trigger('input').trigger('change');
                } catch (e) {}
            }
        }

        addLog("Đã điền mã OTP thành công. Đang chờ hệ thống kiểm tra và bấm nút...", "success");

        // Chờ 1 giây để form validation cập nhật
        setTimeout(() => {
            const candidateButtons = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn, a.comBtn, a')).filter(btn => {
                if (btn.closest('#pk-auto-bot-container')) return false;
                const txt = (btn.textContent || btn.value || '').trim();
                return txt.includes('認証') || txt.includes('送信') || txt.includes('次へ') || 
                       btn.id === 'authBtn' || btn.id === 'verifyBtn';
            });

            if (candidateButtons.length > 0) {
                const targetBtn = candidateButtons[0];
                addLog(`Đang bấm nút xác thực: "${(targetBtn.textContent || targetBtn.value || '').trim()}"...`, "info");
                targetBtn.focus();
                targetBtn.click();
                if (window.$) {
                    try { window.$(targetBtn).trigger('click'); } catch (e) {}
                }
                addLog("Đã gửi xác thực! Đang chờ chuyển hướng...", "success");
            } else {
                addLog("Đã điền xong OTP! Vui lòng bấm nút '認証' trên màn hình nếu bot chưa tự click.", "warn");
            }
        }, 1000);
    }

    // Kết nối tới OTP Server cục bộ (127.0.0.1:8765) để lấy mã từ Gmail
    let isFetchingOtp = false;
    async function fetchOtpFromLocalServer() {
        if (isFetchingOtp) {
            addLog("Đang trong quá trình quét Gmail, vui lòng đợi...", "warn");
            return;
        }

        const btnFetchOtp = document.getElementById("pk-btn-fetch-otp");
        isFetchingOtp = true;
        if (btnFetchOtp) {
            btnFetchOtp.disabled = true;
            btnFetchOtp.textContent = "⏳ ĐANG QUÉT GMAIL CHỜ MÃ...";
        }

        addLog("Đang kết nối tới OTP Server (127.0.0.1:8765) để đọc Gmail...", "info");
        try {
            const res = await fetch("http://127.0.0.1:8765/get-otp");
            if (!res.ok) {
                let errText = res.statusText;
                try {
                    const errJson = await res.json();
                    errText = errJson.error || errText;
                } catch(e) {}
                addLog(`Lỗi từ OTP Server: ${errText}`, "err");
                return;
            }
            const data = await res.json();
            if (data.success && data.otp) {
                addLog(`-> TÌM THẤY MÃ OTP: ${data.otp}!`, "success");
                fillAndSubmitOtp(data.otp);
            } else {
                addLog(`Chưa nhận được OTP: ${data.error || 'Hãy thử lại sau ít giây'}`, "warn");
            }
        } catch(e) {
            addLog("Không thể kết nối tới OTP Server! Hãy chắc chắn file 'chay_otp_server.bat' đang mở.", "err");
        } finally {
            isFetchingOtp = false;
            if (btnFetchOtp) {
                btnFetchOtp.disabled = false;
                btnFetchOtp.textContent = "📩 ĐỌC OTP GMAIL & TỰ ĐIỀN";
            }
        }
    }

    // Chờ Gigya Auth sẵn sàng
    function waitForGigya() {
        return new Promise((resolve) => {
            if (window.gigya && window.gigya.accounts && window.gigya.accounts.getJWT) {
                return resolve(true);
            }
            let count = 0;
            const interval = setInterval(() => {
                count++;
                if (window.gigya && window.gigya.accounts && window.gigya.accounts.getJWT) {
                    clearInterval(interval);
                    resolve(true);
                } else if (count > 30) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, 500);
        });
    }

    // Lấy JWT Bearer Token từ Gigya
    function getJwtToken() {
        return new Promise((resolve, reject) => {
            if (!window.gigya || !window.gigya.accounts || !window.gigya.accounts.getJWT) {
                return reject(new Error("Gigya SDK chưa sẵn sàng"));
            }
            window.gigya.accounts.getJWT({
                fields: "UID,email,data.memberID,data.isPhoneNumberVerified",
                callback: (res) => {
                    if (res && res.errorCode === 0) {
                        resolve({
                            token: res.id_token,
                            user: res
                        });
                    } else {
                        reject(new Error(res ? res.errorMessage : "Không thể lấy JWT"));
                    }
                }
            });
        });
    }

    // Toàn bộ quy trình Quét & Nộp đơn
    async function runBotProcess() {
        const runBtn = document.getElementById("pk-btn-execute");
        if (runBtn) runBtn.disabled = true;

        addLog("Bắt đầu quy trình kiểm tra và đăng ký...", "info");

        try {
            const gigyaReady = await waitForGigya();
            if (!gigyaReady) {
                addLog("Chưa thể kết nối tới hệ thống xác thực Gigya. Hãy đợi trang tải xong.", "err");
                if (runBtn) runBtn.disabled = false;
                return;
            }

            addLog("Đang lấy phiên đăng nhập (JWT Token)...", "info");
            let jwtData;
            try {
                jwtData = await getJwtToken();
            } catch (err) {
                addLog("Phiên đăng nhập đã hết hạn hoặc bạn chưa đăng nhập!", "err");
                addLog("Vui lòng tải lại trang hoặc đăng nhập lại.", "warn");
                if (runBtn) runBtn.disabled = false;
                return;
            }

            const jwt = jwtData.token;
            addLog("Đã lấy Bearer Token thành công.", "success");

            // Cập nhật thông tin email lên widget nếu có
            try {
                const payload = JSON.parse(atob(jwt.split(".")[1]));
                const emailSpan = document.getElementById("pk-user-email");
                if (emailSpan && payload.email) {
                    emailSpan.textContent = payload.email;
                }
            } catch (e) {}

            // Gọi API lấy danh sách xổ số
            addLog("Đang tải danh sách các sản phẩm xổ số...", "info");
            const listUrl = (window.ajaxUrl && window.ajaxUrl.getLotteryListUrl) ?
                window.ajaxUrl.getLotteryListUrl : "/a/ltr/api/lottery/v1/get-lottery-list";

            const listRes = await fetch(listUrl, {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + jwt,
                    "x-requested-with": "XMLHttpRequest"
                }
            });

            if (!listRes.ok) {
                addLog(`Lỗi tải danh sách: HTTP ${listRes.status}`, "err");
                if (runBtn) runBtn.disabled = false;
                return;
            }

            const json = await listRes.json();
            const items = json.data || [];
            addLog(`Hệ thống tìm thấy ${items.length} bộ sản phẩm bốc thăm.`, "info");

            const toApplyList = [];
            let appliedCount = 0;

            const filterMode = localStorage.getItem("pk_filter_mode") || "unverified_only";
            addLog(`Bộ lọc đang chọn: ${filterMode === "unverified_only" ? "Chỉ [本人未認証枠]" : (filterMode === "verified_only" ? "Chỉ [本人認証済み枠]" : "Tất cả các khung")}`, "info");

            items.forEach((lottery) => {
                const status = String(lottery.applicationStatus);
                const title = lottery.lotteryTitle || lottery.lotteryGroupId;

                if (status === "30") { // 受付中 - Đang mở
                    const isVerified = title.includes("本人認証済み枠");
                    const isUnverified = title.includes("本人未認証枠");

                    // Chỉ nộp cho 本人未認証枠 (Mặc định)
                    if (filterMode === "unverified_only" && isVerified) {
                        addLog(`[BỎ QUA - Khung認証済み]: ${title}`, "warn");
                        return;
                    }
                    if (filterMode === "verified_only" && isUnverified) {
                        addLog(`[BỎ QUA - Khung未認証]: ${title}`, "warn");
                        return;
                    }

                    const prize = (lottery.applicationItems && lottery.applicationItems.length > 0) ?
                        lottery.applicationItems[0].itemPrizeId : null;
                    toApplyList.push({
                        groupId: lottery.lotteryGroupId,
                        prizeId: prize,
                        title: title
                    });
                } else if (status === "40") {
                    appliedCount++;
                }
            });

            const openCountSpan = document.getElementById("pk-open-count");
            const appliedCountSpan = document.getElementById("pk-applied-count");
            if (openCountSpan) openCountSpan.textContent = toApplyList.length;
            if (appliedCountSpan) appliedCountSpan.textContent = appliedCount;

            if (toApplyList.length === 0) {
                addLog("Hiện KHÔNG CÓ sản phẩm nào ở trạng thái 'ĐANG MỞ ĐĂNG KÝ (受付中)' cần nộp đơn.", "warn");
                if (runBtn) runBtn.disabled = false;
                return;
            }

            addLog(`Phát hiện ${toApplyList.length} sản phẩm ĐANG MỞ ĐĂNG KÝ. Bắt đầu gửi đơn...`, "success");

            const applyUrl = (window.ajaxUrl && window.ajaxUrl.applyLotteryUrl) ?
                window.ajaxUrl.applyLotteryUrl : "/a/ltr/api/lottery/v1/apply-lottery";

            let successCount = 0;
            for (let i = 0; i < toApplyList.length; i++) {
                const target = toApplyList[i];
                addLog(`[${i + 1}/${toApplyList.length}] Đang gửi đơn: ${target.title}...`, "info");

                try {
                    const postRes = await fetch(applyUrl, {
                        method: "POST",
                        headers: {
                            "Authorization": "Bearer " + jwt,
                            "Content-Type": "application/json;charset=UTF-8",
                            "x-requested-with": "XMLHttpRequest"
                        },
                        body: JSON.stringify({
                            lotteryGroupId: target.groupId,
                            itemPrizeId: target.prizeId
                        })
                    });

                    if (postRes.ok) {
                        addLog(`-> THÀNH CÔNG: Đã đăng ký thành công cho ${target.title}!`, "success");
                        successCount++;
                    } else {
                        const errText = await postRes.text();
                        addLog(`-> THẤT BẠI (Mã lỗi ${postRes.status}): ${errText}`, "err");
                    }
                } catch (applyErr) {
                    addLog(`-> Lỗi kết nối khi đăng ký: ${applyErr.message}`, "err");
                }

                // Chờ 1.5 giây giữa các lượt nộp để tránh dồn dập
                await new Promise(r => setTimeout(r, 1500));
            }

            addLog(`🎉 HOÀN THÀNH: Đã đăng ký thành công ${successCount}/${toApplyList.length} sản phẩm!`, "success");
            addLog("Trang web sẽ tự động tải lại sau 4 giây để cập nhật trạng thái...", "info");

            setTimeout(() => {
                window.location.reload();
            }, 4000);

        } catch (err) {
            addLog(`Lỗi xử lý: ${err.message}`, "err");
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }

    // Khởi tạo khi DOM sẵn sàng
    function init() {
        createWidget();

        // Nếu đang ở trang apply.html và được bật tự động
        const path = window.location.pathname.toLowerCase();
        if (path.includes("lottery/apply.html")) {
            const savedPref = localStorage.getItem("pk_auto_run");
            const shouldAutoRun = (savedPref === null) ? true : (savedPref === "1");

            if (shouldAutoRun) {
                addLog("Chế độ tự động đang BẬT. Bot sẽ bắt đầu chạy sau 2.5 giây...", "info");
                setTimeout(() => {
                    runBotProcess();
                }, 2500);
            } else {
                addLog("Chế độ tự động đang TẮT. Bạn có thể bấm nút màu xanh để chạy bất cứ lúc nào.", "info");
            }
        } else if (path.includes("mfa") || path.includes("passcode")) {
            addLog("Đang ở trang xác thực OTP. Đang thử kết nối Gmail lấy mã sau 3 giây...", "info");
            setTimeout(() => {
                fetchOtpFromLocalServer();
            }, 3000);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
