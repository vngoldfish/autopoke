/**
 * Pokemon Center Lottery Automation - Page Script (World: MAIN)
 * Tự động hóa đăng nhập, lấy OTP từ Gmail theo từng nick, và đăng ký xổ số Pokémon Center Online Japan
 */

(function () {
    console.log("[PK-BOT] Page script initialized in MAIN world.");

    const CONFIG = {
        autoRunOnLoad: false,       // Mặc định tắt để người dùng tích chọn sản phẩm trước
        autoLoginOnLoad: false,     // Tự động đăng nhập khi vào /login/
        monitorIntervalMin: 10,     // Chu kỳ tự động kiểm tra lại (phút)
    };

    // Quản lý trạng thái tài khoản
    const STATE = {
        accounts: [],
        activeAccountId: null,
        isFetchingOtp: false,
        pollTimer: null
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

    // =========================================================================
    // QUẢN LÝ TÀI KHOẢN (ACCOUNTS MANAGEMENT)
    // =========================================================================

    // Tải danh sách tài khoản từ local server hoặc localStorage
    async function loadAccounts() {
        let loaded = [];
        try {
            const res = await fetch("http://127.0.0.1:8765/accounts");
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.accounts)) {
                    loaded = data.accounts;
                    localStorage.setItem("pk_accounts", JSON.stringify(loaded));
                }
            }
        } catch (e) {
            // Server offline -> đọc từ localStorage
            const localData = localStorage.getItem("pk_accounts");
            if (localData) {
                try { loaded = JSON.parse(localData); } catch (err) {}
            }
        }

        if (loaded.length === 0) {
            loaded = [
                {
                    id: "acc_1",
                    name: "tuanapplejp@gmail",
                    pokemon_email: "tuanapplejp@gmail.com",
                    pokemon_password: "Hiro0052021@",
                    otp_email: "tuanapplejp@gmail.com",
                    gmail_app_password: "xrit ibjd ixdy bhjz",
                    enabled: true
                }
            ];
            localStorage.setItem("pk_accounts", JSON.stringify(loaded));
        }

        STATE.accounts = loaded;

        // Xác định tài khoản đang chọn
        const savedActiveId = localStorage.getItem("pk_active_account_id");
        if (savedActiveId && STATE.accounts.some(a => a.id === savedActiveId)) {
            STATE.activeAccountId = savedActiveId;
        } else {
            STATE.activeAccountId = STATE.accounts[0].id;
            localStorage.setItem("pk_active_account_id", STATE.activeAccountId);
        }

        renderAccountDropdown();
        updateActiveAccountUI();
    }

    // Lưu danh sách tài khoản lên local server và localStorage
    async function saveAccounts(accounts) {
        STATE.accounts = accounts;
        localStorage.setItem("pk_accounts", JSON.stringify(accounts));

        try {
            await fetch("http://127.0.0.1:8765/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify(accounts)
            });
            addLog("Đã đồng bộ tài khoản vào accounts.json thành công!", "success");
        } catch (e) {
            addLog("Đã lưu tạm vào trình duyệt (OTP Server đang offline, chưa ghi file).", "warn");
        }

        renderAccountDropdown();
        updateActiveAccountUI();
    }

    // Lấy tài khoản đang active
    function getActiveAccount() {
        return STATE.accounts.find(a => a.id === STATE.activeAccountId) || STATE.accounts[0] || null;
    }

    // Chuyển đổi tài khoản đang active
    function setActiveAccount(accId) {
        if (!accId || !STATE.accounts.some(a => a.id === accId)) return;
        STATE.activeAccountId = accId;
        localStorage.setItem("pk_active_account_id", accId);
        renderAccountDropdown();
        updateActiveAccountUI();

        const activeAcc = getActiveAccount();
        addLog(`Đã chuyển sang tài khoản: [${activeAcc.name || activeAcc.pokemon_email}]`, "info");

        // Nếu đang ở trang đăng nhập, tự điền ngay tài khoản mới
        const path = window.location.pathname.toLowerCase();
        if (path.includes("login") && !path.includes("mfa")) {
            fillLoginForm(activeAcc);
        }
    }

    // Cập nhật dropdown chọn tài khoản trong widget
    function renderAccountDropdown() {
        const select = document.getElementById("pk-acc-dropdown");
        if (!select) return;

        select.innerHTML = "";
        STATE.accounts.forEach(acc => {
            const opt = document.createElement("option");
            opt.value = acc.id;
            const displayName = acc.name || acc.pokemon_email;
            opt.textContent = `${displayName} (${acc.pokemon_email})`;
            if (acc.id === STATE.activeAccountId) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });

        const newOpt = document.createElement("option");
        newOpt.value = "__new__";
        newOpt.textContent = "➕ Thêm tài khoản mới...";
        select.appendChild(newOpt);
    }

    // Cập nhật các thông tin tài khoản trên giao diện Widget
    function updateActiveAccountUI() {
        const acc = getActiveAccount();
        if (!acc) return;

        // Trên trang Login
        const loginName = document.getElementById("pk-login-acc-name");
        if (loginName) loginName.textContent = acc.name || acc.pokemon_email;
        const loginEmail = document.getElementById("pk-login-acc-email");
        if (loginEmail) loginEmail.textContent = acc.pokemon_email || "--";
        const loginOtpMail = document.getElementById("pk-login-acc-otp-mail");
        if (loginOtpMail) loginOtpMail.textContent = acc.otp_email || acc.pokemon_email || "--";

        // Trên trang MFA
        const mfaName = document.getElementById("pk-mfa-acc-name");
        if (mfaName) mfaName.textContent = acc.name || acc.pokemon_email;
        const mfaOtpMail = document.getElementById("pk-mfa-acc-otp-mail");
        if (mfaOtpMail) mfaOtpMail.textContent = acc.otp_email || acc.pokemon_email || "--";

        // Trên trang Giỏ hàng
        const cartName = document.getElementById("pk-cart-acc-name");
        if (cartName) cartName.textContent = acc.name || acc.pokemon_email;

        // Trên trang Đặt hàng / Checkout
        const orderName = document.getElementById("pk-order-acc-name");
        if (orderName) orderName.textContent = acc.name || acc.pokemon_email;

        // Trên trang Sản phẩm
        const prodName = document.getElementById("pk-prod-acc-name");
        if (prodName) prodName.textContent = acc.name || acc.pokemon_email;

        // Trên trang MyPage / Lịch sử xổ số
        const mypageName = document.getElementById("pk-mypage-acc-name");
        if (mypageName) mypageName.textContent = acc.name || acc.pokemon_email;

        const queueStatusEl = document.getElementById("pk-mypage-queue-status");
        if (queueStatusEl) {
            const queueStr = localStorage.getItem("pk_winning_queue");
            const queueActive = localStorage.getItem("pk_auto_buy_queue_active") === "1";
            if (queueActive && queueStr) {
                try {
                    const queue = JSON.parse(queueStr);
                    queueStatusEl.textContent = `Đang mua (Còn ${queue.length} món)`;
                    queueStatusEl.className = "pk-status-val warn";
                } catch(e) {
                    queueStatusEl.textContent = "Đang rảnh";
                    queueStatusEl.className = "pk-status-val success";
                }
            } else {
                queueStatusEl.textContent = "Đang rảnh";
                queueStatusEl.className = "pk-status-val success";
            }
        }
    }

    // =========================================================================
    // MODAL QUẢN LÝ TÀI KHOẢN (ACCOUNT MANAGER MODAL)
    // =========================================================================

    function openAccountModal(editingId = null) {
        let overlay = document.getElementById("pk-acc-modal-overlay");
        if (overlay) overlay.remove();

        overlay = document.createElement("div");
        overlay.id = "pk-acc-modal-overlay";

        const editingAcc = editingId ? STATE.accounts.find(a => a.id === editingId) : null;

        overlay.innerHTML = `
            <div id="pk-acc-modal">
                <div id="pk-acc-modal-header">
                    <span>⚙️ QUẢN LÝ TÀI KHOẢN POKÉMON & GMAIL OTP</span>
                    <button id="pk-modal-close-btn" style="background: none; border: none; color: #fff; font-size: 18px; cursor: pointer; font-weight: bold;">✕</button>
                </div>
                <div id="pk-acc-modal-body">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; color: #ced6e0;">Danh sách nick đã lưu (${STATE.accounts.length}):</span>
                        <button id="pk-modal-add-btn" style="padding: 6px 12px; background: #2ed573; border: none; border-radius: 6px; color: #fff; font-weight: bold; cursor: pointer; font-size: 12px;">➕ Thêm nick mới</button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto;">
                        ${STATE.accounts.map(acc => `
                            <div class="pk-acc-card ${acc.id === STATE.activeAccountId ? 'active' : ''}">
                                <div class="pk-acc-info">
                                    <div class="pk-acc-name">${acc.name || acc.pokemon_email} ${acc.id === STATE.activeAccountId ? '<span style="color: #2ed573; font-size: 11px;">[Đang chọn]</span>' : ''}</div>
                                    <div class="pk-acc-email">🔑 Pokémon: <b>${acc.pokemon_email}</b></div>
                                    <div class="pk-acc-otp-mail">📩 Gmail nhận OTP: <b>${acc.otp_email || acc.pokemon_email}</b></div>
                                </div>
                                <div class="pk-acc-actions">
                                    ${acc.id !== STATE.activeAccountId ? `<button class="pk-btn-sm pk-btn-select" data-select-id="${acc.id}">Chọn</button>` : ''}
                                    <button class="pk-btn-sm pk-btn-edit" data-edit-id="${acc.id}">Sửa</button>
                                    ${STATE.accounts.length > 1 ? `<button class="pk-btn-sm pk-btn-delete" data-del-id="${acc.id}">Xóa</button>` : ''}
                                </div>
                            </div>
                        `).join("")}
                    </div>

                    <div style="border-top: 1px solid #3e4451; padding-top: 12px;">
                        <div style="font-weight: bold; color: #ffa502; margin-bottom: 8px;">
                            ${editingAcc ? `✏️ Chỉnh sửa: ${editingAcc.name || editingAcc.pokemon_email}` : `➕ Thêm tài khoản mới`}
                        </div>
                        <input type="hidden" id="pk-input-id" value="${editingAcc ? editingAcc.id : ''}">
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div class="pk-form-group">
                                <label class="pk-form-label">Tên gợi nhớ:</label>
                                <input type="text" id="pk-input-name" class="pk-form-input" placeholder="VD: Nick 1" value="${editingAcc ? (editingAcc.name || '') : ''}">
                            </div>
                            <div class="pk-form-group">
                                <label class="pk-form-label">Email Pokémon Center:</label>
                                <input type="text" id="pk-input-poke-email" class="pk-form-input" placeholder="user@gmail.com" value="${editingAcc ? (editingAcc.pokemon_email || '') : ''}">
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div class="pk-form-group">
                                <label class="pk-form-label">Mật khẩu Pokémon Center:</label>
                                <input type="password" id="pk-input-poke-pwd" class="pk-form-input" placeholder="Mật khẩu Pokémon" value="${editingAcc ? (editingAcc.pokemon_password || '') : ''}">
                            </div>
                            <div class="pk-form-group">
                                <label class="pk-form-label">Gmail nhận OTP:</label>
                                <input type="text" id="pk-input-otp-email" class="pk-form-input" placeholder="Bỏ trống nếu giống trên" value="${editingAcc ? (editingAcc.otp_email || '') : ''}">
                            </div>
                        </div>

                        <div class="pk-form-group">
                            <label class="pk-form-label">Mật khẩu ứng dụng Gmail (16 chữ cái):</label>
                            <input type="text" id="pk-input-app-pwd" class="pk-form-input" placeholder="VD: xrit ibjd ixdy bhjz" value="${editingAcc ? (editingAcc.gmail_app_password || '') : ''}">
                        </div>

                        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;">
                            ${editingAcc ? `<button id="pk-modal-cancel-edit" style="padding: 7px 14px; background: #57606f; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 12px;">Hủy sửa</button>` : ''}
                            <button id="pk-modal-save-btn" style="padding: 7px 18px; background: linear-gradient(135deg, #2ed573, #10ac84); border: none; border-radius: 6px; color: #fff; font-weight: bold; cursor: pointer; font-size: 13px;">💾 Lưu tài khoản</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Đóng modal
        document.getElementById("pk-modal-close-btn").addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // Bấm nút thêm mới
        document.getElementById("pk-modal-add-btn").addEventListener("click", () => {
            openAccountModal(null);
        });

        // Bấm hủy sửa
        const cancelBtn = document.getElementById("pk-modal-cancel-edit");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => openAccountModal(null));
        }

        // Chọn tài khoản
        overlay.querySelectorAll("[data-select-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.getAttribute("data-select-id");
                setActiveAccount(id);
                openAccountModal(null);
            });
        });

        // Sửa tài khoản
        overlay.querySelectorAll("[data-edit-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.getAttribute("data-edit-id");
                openAccountModal(id);
            });
        });

        // Xóa tài khoản
        overlay.querySelectorAll("[data-del-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.getAttribute("data-del-id");
                if (confirm("Bạn có chắc chắn muốn xóa tài khoản này khỏi danh sách?")) {
                    const newAccs = STATE.accounts.filter(a => a.id !== id);
                    if (STATE.activeAccountId === id) {
                        STATE.activeAccountId = newAccs[0].id;
                    }
                    saveAccounts(newAccs);
                    openAccountModal(null);
                }
            });
        });

        // Lưu tài khoản từ form
        document.getElementById("pk-modal-save-btn").addEventListener("click", () => {
            const accId = document.getElementById("pk-input-id").value.trim();
            const name = document.getElementById("pk-input-name").value.trim();
            const pokeEmail = document.getElementById("pk-input-poke-email").value.trim();
            const pokePwd = document.getElementById("pk-input-poke-pwd").value.trim();
            let otpEmail = document.getElementById("pk-input-otp-email").value.trim();
            const appPwd = document.getElementById("pk-input-app-pwd").value.trim();

            if (!pokeEmail) {
                alert("Vui lòng nhập Email Pokémon Center!");
                return;
            }
            if (!otpEmail) {
                otpEmail = pokeEmail;
            }

            const newAccs = [...STATE.accounts];
            if (accId) {
                // Chỉnh sửa
                const idx = newAccs.findIndex(a => a.id === accId);
                if (idx !== -1) {
                    newAccs[idx] = {
                        ...newAccs[idx],
                        name: name || pokeEmail,
                        pokemon_email: pokeEmail,
                        pokemon_password: pokePwd,
                        otp_email: otpEmail,
                        gmail_app_password: appPwd
                    };
                }
            } else {
                // Thêm mới
                const newId = `acc_${Date.now()}`;
                newAccs.push({
                    id: newId,
                    name: name || pokeEmail,
                    pokemon_email: pokeEmail,
                    pokemon_password: pokePwd,
                    otp_email: otpEmail,
                    gmail_app_password: appPwd,
                    enabled: true
                });
                STATE.activeAccountId = newId;
            }

            saveAccounts(newAccs);
            overlay.remove();
        });
    }

    // =========================================================================
    // TỰ ĐỘNG ĐĂNG NHẬP (LOGIN AUTOMATION)
    // =========================================================================

    function findLoginEmailInput() {
        return document.querySelector('#login-form-email') ||
               document.querySelector('#loginId') ||
               document.querySelector('input[name="loginID"]') ||
               document.querySelector('input[name="email"]') ||
               document.querySelector('input[type="email"]') ||
               document.querySelector('input[placeholder*="メール"]') ||
               Array.from(document.querySelectorAll('input[type="text"]')).find(i => {
                   if (i.closest('#pk-auto-bot-container') || i.name === 'q') return false;
                   const n = (i.name || i.id || '').toLowerCase();
                   return n.includes('login') || n.includes('mail') || n.includes('user');
               });
    }

    function findLoginPasswordInput() {
        return document.querySelector('#current-password') ||
               document.querySelector('#password') ||
               document.querySelector('input[name="password"]') ||
               document.querySelector('input[type="password"]') ||
               document.querySelector('input[placeholder*="パスワード"]');
    }

    function findLoginSubmitButton() {
        // Ưu tiên 1: Nút Storefront SFCC (#form1Button) hoặc nút Lottery (div.comLoginBox a.btn.loginBtn)
        const specific = document.querySelector('#form1Button') ||
                         document.querySelector('button#form1Button') ||
                         document.querySelector('form#login-form button[type="submit"]') ||
                         document.querySelector('.comLoginBox a.loginBtn') ||
                         document.querySelector('.comLoginBox .loginBtn') ||
                         document.querySelector('.comLoginBox a.btn') ||
                         document.querySelector('a.loginBtn') ||
                         document.querySelector('.btn.loginBtn') ||
                         document.querySelector('#loginBtn') ||
                         document.querySelector('.loginBtn');
        if (specific) return specific;

        // Ưu tiên 2: Tìm trong form chứa password
        const pwdInput = findLoginPasswordInput();
        if (pwdInput) {
            const form = pwdInput.closest('form') || pwdInput.closest('.comLoginBox') || pwdInput.closest('.comBox');
            if (form) {
                const btnInForm = form.querySelector('button[type="submit"], input[type="submit"], a.loginBtn, .btn');
                if (btnInForm) return btnInForm;
            }
        }

        // Ưu tiên 3: Fallback nút submit hoặc link text nhưng loại trừ header
        return document.querySelector('button[type="submit"]') ||
               document.querySelector('input[type="submit"]') ||
               document.querySelector('a.comBtn01') ||
               Array.from(document.querySelectorAll('button, input[type="submit"], a')).find(b => {
                   if (b.closest('#pk-auto-bot-container') || b.closest('header') || b.closest('#header') || b.closest('.headerBox')) return false;
                   const txt = (b.textContent || b.value || '').trim();
                   return txt.includes('ログイン') || txt.includes('Sign In');
               });
    }
    // =========================================================================
    // GIẢI LẬP HÀNH VI CON NGƯỜI (ANTI-BOT BYPASS ENGINE)
    // F5 Volterra / Shape Security theo dõi:
    //   - Keystroke dynamics (tốc độ, nhịp gõ, khoảng cách giữa các phím)
    //   - Mouse movement / hover / click patterns
    //   - Focus/blur timing
    //   - Event isTrusted flag
    // =========================================================================

    // Gaussian random: tạo delay phân bố chuẩn giống con người thật
    function gaussianRandom(mean, stddev) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return Math.max(20, Math.round(mean + z * stddev));
    }

    // Lấy mã phím chuẩn cho từng ký tự (bao gồm ký tự đặc biệt)
    function getKeyInfo(char) {
        const special = {
            '@': { code: 'Digit2', keyCode: 50, shiftKey: true },
            '.': { code: 'Period', keyCode: 190, shiftKey: false },
            ',': { code: 'Comma', keyCode: 188, shiftKey: false },
            '-': { code: 'Minus', keyCode: 189, shiftKey: false },
            '_': { code: 'Minus', keyCode: 189, shiftKey: true },
            '!': { code: 'Digit1', keyCode: 49, shiftKey: true },
            '#': { code: 'Digit3', keyCode: 51, shiftKey: true },
            '$': { code: 'Digit4', keyCode: 52, shiftKey: true },
            '%': { code: 'Digit5', keyCode: 53, shiftKey: true },
            '&': { code: 'Digit7', keyCode: 55, shiftKey: true },
            '*': { code: 'Digit8', keyCode: 56, shiftKey: true },
            '+': { code: 'Equal', keyCode: 187, shiftKey: true },
            '=': { code: 'Equal', keyCode: 187, shiftKey: false },
            ' ': { code: 'Space', keyCode: 32, shiftKey: false },
        };

        if (special[char]) {
            return { key: char, ...special[char] };
        }
        if (char >= '0' && char <= '9') {
            return { key: char, code: 'Digit' + char, keyCode: char.charCodeAt(0), shiftKey: false };
        }
        const isUpper = char === char.toUpperCase() && char !== char.toLowerCase();
        return {
            key: char,
            code: 'Key' + char.toUpperCase(),
            keyCode: char.toUpperCase().charCodeAt(0),
            shiftKey: isUpper
        };
    }

    // Tính delay giữa 2 phím dựa trên loại ký tự (giống con người)
    function getInterKeyDelay(prevChar, currentChar) {
        // Ký tự đặc biệt (@, !, #) cần tìm trên bàn phím → chậm hơn
        const specials = '@!#$%^&*()_+-=[]{}|;:\'",.<>?/`~';
        if (specials.includes(currentChar)) {
            return gaussianRandom(180, 50); // 130-230ms cho ký tự đặc biệt
        }
        // Chuyển từ chữ sang số hoặc ngược lại → hơi chậm
        const isDigit = c => c >= '0' && c <= '9';
        const isLetter = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
        if (prevChar && ((isDigit(prevChar) && isLetter(currentChar)) ||
            (isLetter(prevChar) && isDigit(currentChar)))) {
            return gaussianRandom(150, 40);
        }
        // Cùng tay (ước lượng đơn giản): các phím liền kề → nhanh hơn
        const leftHand = 'qwertasdfgzxcvb';
        const rightHand = 'yuiophjklnm';
        const pl = prevChar ? prevChar.toLowerCase() : '';
        const cl = currentChar.toLowerCase();
        if (pl && leftHand.includes(pl) && leftHand.includes(cl)) {
            return gaussianRandom(85, 25); // Cùng tay trái
        }
        if (pl && rightHand.includes(pl) && rightHand.includes(cl)) {
            return gaussianRandom(85, 25); // Cùng tay phải
        }
        // Mặc định: phím bình thường
        return gaussianRandom(95, 30); // 65-125ms (tốc độ gõ ~80 WPM)
    }

    // Giả lập di chuột vào element trước khi click/focus
    function simulateMouseApproach(el) {
        const rect = el.getBoundingClientRect();
        const targetX = rect.left + rect.width / 2 + (Math.random() * 20 - 10);
        const targetY = rect.top + rect.height / 2 + (Math.random() * 6 - 3);

        el.dispatchEvent(new MouseEvent('mouseenter', {
            clientX: targetX, clientY: targetY, bubbles: true
        }));
        el.dispatchEvent(new MouseEvent('mouseover', {
            clientX: targetX, clientY: targetY, bubbles: true
        }));
        el.dispatchEvent(new MouseEvent('mousemove', {
            clientX: targetX, clientY: targetY, bubbles: true
        }));
        el.dispatchEvent(new MouseEvent('mousedown', {
            clientX: targetX, clientY: targetY, button: 0, bubbles: true
        }));
        el.dispatchEvent(new MouseEvent('mouseup', {
            clientX: targetX, clientY: targetY, button: 0, bubbles: true
        }));
        el.dispatchEvent(new MouseEvent('click', {
            clientX: targetX, clientY: targetY, button: 0, bubbles: true
        }));
    }

    // Giả lập gõ từng ký tự giống con người thật (phiên bản nâng cao toàn diện)
    function simulateHumanType(input, text) {
        return new Promise(async (resolve) => {
            // 1. Di chuột vào ô input
            simulateMouseApproach(input);
            await new Promise(r => setTimeout(r, gaussianRandom(120, 30)));

            // 2. Focus vào ô input
            input.focus();
            input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
            input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            await new Promise(r => setTimeout(r, gaussianRandom(200, 50)));

            // 3. Xóa sạch giá trị cũ (Select All + Delete)
            if (input.value) {
                input.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: true, bubbles: true
                }));
                input.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: true, bubbles: true
                }));
                await new Promise(r => setTimeout(r, gaussianRandom(80, 20)));

                input.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Delete', code: 'Delete', keyCode: 46, bubbles: true
                }));
                input.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'Delete', code: 'Delete', keyCode: 46, bubbles: true
                }));
            }
            try {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                setter.call(input, "");
            } catch (e) {
                input.value = "";
            }
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, gaussianRandom(150, 40)));

            // 4. Gõ từng ký tự
            let burstCount = 0;
            const burstSize = 3 + Math.floor(Math.random() * 5); // Gõ liên tục 3-7 phím rồi nghỉ

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const ki = getKeyInfo(char);
                const prevChar = i > 0 ? text[i - 1] : null;

                // Nếu cần Shift (chữ hoa, ký tự đặc biệt): nhấn Shift trước
                if (ki.shiftKey) {
                    input.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Shift', code: 'ShiftLeft', keyCode: 16,
                        shiftKey: true, bubbles: true, cancelable: true
                    }));
                    await new Promise(r => setTimeout(r, gaussianRandom(40, 15)));
                }

                // keydown
                input.dispatchEvent(new KeyboardEvent('keydown', {
                    key: ki.key, code: ki.code, keyCode: ki.keyCode, which: ki.keyCode,
                    shiftKey: ki.shiftKey, bubbles: true, cancelable: true
                }));

                // keypress
                input.dispatchEvent(new KeyboardEvent('keypress', {
                    key: ki.key, code: ki.code,
                    keyCode: char.charCodeAt(0), which: char.charCodeAt(0),
                    charCode: char.charCodeAt(0),
                    shiftKey: ki.shiftKey, bubbles: true, cancelable: true
                }));

                // Cập nhật giá trị
                const currentVal = input.value + char;
                try {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    setter.call(input, currentVal);
                } catch (e) {
                    input.value = currentVal;
                }

                // input events (cả generic và InputEvent)
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new InputEvent('input', {
                    data: char, inputType: 'insertText',
                    bubbles: true, cancelable: false, composed: true
                }));

                // keyup (nhả phím, thường chậm hơn keydown 30-60ms)
                await new Promise(r => setTimeout(r, gaussianRandom(45, 15)));
                input.dispatchEvent(new KeyboardEvent('keyup', {
                    key: ki.key, code: ki.code, keyCode: ki.keyCode, which: ki.keyCode,
                    shiftKey: ki.shiftKey, bubbles: true, cancelable: true
                }));

                // Nhả Shift nếu đang giữ
                if (ki.shiftKey) {
                    await new Promise(r => setTimeout(r, gaussianRandom(30, 10)));
                    input.dispatchEvent(new KeyboardEvent('keyup', {
                        key: 'Shift', code: 'ShiftLeft', keyCode: 16,
                        shiftKey: false, bubbles: true, cancelable: true
                    }));
                }

                // Tính delay tới phím tiếp theo
                burstCount++;
                let interDelay = getInterKeyDelay(prevChar, char);

                // Nghỉ micro-pause sau mỗi burst (giống người thật dừng suy nghĩ)
                if (burstCount >= burstSize) {
                    interDelay += gaussianRandom(250, 80); // Thêm 170-330ms
                    burstCount = 0;
                }

                // Nghỉ dài hơn sau dấu chấm hoặc @ (chuyển tâm trí)
                if (char === '.' || char === '@') {
                    interDelay += gaussianRandom(100, 30);
                }

                if (i < text.length - 1) {
                    await new Promise(r => setTimeout(r, interDelay));
                }
            }

            // 5. Kết thúc: change + blur
            await new Promise(r => setTimeout(r, gaussianRandom(100, 30)));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            resolve();
        });
    }

    // Giả lập phím Tab giữa 2 ô input
    function simulateTabKey(fromInput, toInput) {
        return new Promise(async (resolve) => {
            // Blur ô hiện tại
            fromInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
            fromInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: toInput }));

            // Phím Tab
            fromInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true
            }));
            await new Promise(r => setTimeout(r, gaussianRandom(60, 20)));
            toInput.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true
            }));

            // Focus ô mới
            await new Promise(r => setTimeout(r, gaussianRandom(80, 25)));
            toInput.focus();
            toInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
            toInput.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: fromInput }));

            resolve();
        });
    }

    async function fillLoginForm(acc) {
        if (!acc) return false;
        const emailInput = findLoginEmailInput();
        const pwdInput = findLoginPasswordInput();

        if (!emailInput || !pwdInput) {
            addLog("Chưa tìm thấy form đăng nhập trên màn hình.", "warn");
            return false;
        }

        // Cuộn trang tới form login
        emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, gaussianRandom(600, 150)));

        // Gõ Email
        addLog(`⌨️ Đang nhập Email cho [${acc.name || acc.pokemon_email}]...`, "info");
        await simulateHumanType(emailInput, acc.pokemon_email || "");
        addLog(`✅ Đã nhập xong Email.`, "success");

        // Tab sang ô password (giống người dùng bấm Tab)
        await new Promise(r => setTimeout(r, gaussianRandom(400, 100)));
        await simulateTabKey(emailInput, pwdInput);
        await new Promise(r => setTimeout(r, gaussianRandom(300, 80)));

        // Gõ Password
        addLog(`⌨️ Đang nhập Mật khẩu...`, "info");
        await simulateHumanType(pwdInput, acc.pokemon_password || "");
        addLog(`✅ Đã nhập xong Mật khẩu.`, "success");

        // Trigger jQuery backup nếu có
        if (window.$) {
            try {
                window.$(emailInput).trigger('input').trigger('change');
                window.$(pwdInput).trigger('input').trigger('change');
            } catch (e) {}
        }

        // Nghỉ tự nhiên trước khi kết thúc
        await new Promise(r => setTimeout(r, gaussianRandom(400, 100)));
        addLog(`✅ Đã điền xong Email & Mật khẩu.`, "success");

        return true;
    }

    async function submitLoginForm() {
        const loginBtn = findLoginSubmitButton();
        if (!loginBtn) {
            addLog("Không tìm thấy nút đăng nhập (ログイン) trên màn hình.", "warn");
            return false;
        }

        addLog(`🖱️ Đang di chuột tới nút Đăng nhập...`, "info");
        loginBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight nút xanh nổi bật
        loginBtn.style.outline = "4px solid #2ed573";
        loginBtn.style.outlineOffset = "3px";
        loginBtn.style.boxShadow = "0 0 25px rgba(46, 213, 115, 0.7)";

        // Nghỉ tự nhiên như mắt người nhìn vào nút trước khi bấm
        await new Promise(r => setTimeout(r, gaussianRandom(350, 80)));

        // Kích hoạt chuỗi sự kiện chuột hoàn chỉnh (mouseenter -> mouseover -> mousemove -> mousedown -> mouseup -> click)
        simulateMouseApproach(loginBtn);
        loginBtn.focus();
        loginBtn.click();
        if (window.$) {
            try { window.$(loginBtn).trigger('click'); } catch (e) {}
            try {
                const form = loginBtn.closest('form');
                if (form) window.$(form).trigger('submit');
            } catch (e) {}
        }

        // Backup: Kích hoạt submit form nếu là form tiêu chuẩn
        const form = loginBtn.closest('form');
        if (form) {
            setTimeout(() => {
                if (window.location.pathname.toLowerCase().includes('login')) {
                    try {
                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    } catch (e) {}
                }
            }, 1500);
        }

        addLog(`🚀 Đã tự động kích hoạt Đăng nhập! Đang chờ website phản hồi...`, "success");
        return true;
    }

    // =========================================================================
    // HỆ THỐNG ĐÁNH GIÁ ĐIỂM TIN TƯỞNG PROFILE (ANTI-DETECT PROFILE AUDIT)
    // Phân tích toàn diện: User-Agent, Cookie, Timezone, Incognito, Webdriver, F5 WAF
    // =========================================================================

    async function evaluateProfileTrustScore() {
        try {
            const results = [];
            let totalScore = 0;

            // 1. Kiểm tra User-Agent & Version Mismatch (Tối đa 20 điểm)
            const ua = navigator.userAgent || "";
            const uad = navigator.userAgentData;
            let uaScore = 20;
            let uaStatus = "pass";
            let uaDetail = "";
            let uaTip = "";

            const matchChromeUA = ua.match(/Chrome\/([0-9]+)/i);
            const uaChromeVer = matchChromeUA ? parseInt(matchChromeUA[1], 10) : null;

            let brandsChromeVer = null;
            if (uad && uad.brands && Array.isArray(uad.brands)) {
                const cBrand = uad.brands.find(b => {
                    const name = (b.brand || "").toLowerCase();
                    return name.includes("chromium") || name.includes("chrome") || name.includes("google chrome");
                });
                if (cBrand && cBrand.version) {
                    brandsChromeVer = parseInt(cBrand.version, 10);
                }
            }

            if (ua.toLowerCase().includes("headless")) {
                uaScore = 0;
                uaStatus = "fail";
                uaDetail = "Phát hiện HeadlessChrome! Dấu hiệu chắc chắn của bot tự động.";
                uaTip = "Tắt cờ headless, mở Chrome giao diện người thật bình thường.";
            } else if (uaChromeVer && brandsChromeVer && Math.abs(uaChromeVer - brandsChromeVer) > 2) {
                uaScore = 0;
                uaStatus = "fail";
                uaDetail = `BẤT NHẤT PHIÊN BẢN: User-Agent là Chrome/${uaChromeVer} nhưng Client Hints là Chromium/${brandsChromeVer}!`;
                uaTip = "Có extension (như Urban VPN) sửa đổi User-Agent gây lệch phiên bản. Hãy gỡ extension VPN và restart Chrome.";
            } else if (uaChromeVer && uaChromeVer < 120) {
                uaScore = 6;
                uaStatus = "warn";
                uaDetail = `Phiên bản Chrome hơi cũ: v${uaChromeVer} (khuyên dùng >= v125).`;
                uaTip = "Hãy cập nhật trình duyệt Chrome lên phiên bản mới nhất.";
            } else {
                uaDetail = `User-Agent hợp lệ và nhất quán (Chrome v${uaChromeVer || "OK"}), không phát hiện giả mạo.`;
            }

            totalScore += uaScore;
            results.push({
                name: "User-Agent & Client Hints",
                icon: "🧬",
                status: uaStatus,
                score: uaScore,
                maxScore: 20,
                detail: uaDetail,
                tip: uaTip
            });

            // 2. Kiểm tra Cookie & Session WAF (Tối đa 25 điểm)
            const rawCookies = document.cookie ? document.cookie.trim() : "";
            const cookieList = rawCookies ? rawCookies.split(";").map(c => c.trim()).filter(Boolean) : [];
            let cookieScore = 0;
            let cookieStatus = "fail";
            let cookieDetail = "";
            let cookieTip = "";

            if (cookieList.length === 0) {
                cookieScore = 0;
                cookieStatus = "fail";
                cookieDetail = "Cookie hoàn toàn TRỐNG (0 cookie). F5 Volterra WAF sẽ coi đây là request không phiên và CHẶN 403 ngay!";
                cookieTip = "Hãy mở trang chủ pokemoncenter-online.com lướt xem vài sản phẩm 5-10 phút để lưu cookie trước khi đăng nhập.";
            } else if (cookieList.length < 4) {
                cookieScore = 12;
                cookieStatus = "warn";
                cookieDetail = `Đã có ${cookieList.length} cookie. Phiên duyệt web còn mới, chưa có đủ độ ấm (warmup).`;
                cookieTip = "Nên click xem 1-2 sản phẩm hoặc tin tức trên trang chủ để tích lũy thêm cookie tự nhiên.";
            } else {
                cookieScore = 25;
                cookieStatus = "pass";
                const hasGigya = cookieList.some(c => c.toLowerCase().includes("gigya") || c.toLowerCase().includes("gslb"));
                const hasAnalytics = cookieList.some(c => c.startsWith("_ga") || c.startsWith("_pk"));
                cookieDetail = `Đã có ${cookieList.length} cookie phiên. Dữ liệu duyệt web phong phú và tự nhiên.`;
                if (hasGigya || hasAnalytics) {
                    cookieDetail += " (Có đầy đủ cookie theo dõi/phiên)";
                }
            }

            totalScore += cookieScore;
            results.push({
                name: "Cookie & Session WAF",
                icon: "🍪",
                status: cookieStatus,
                score: cookieScore,
                maxScore: 25,
                detail: cookieDetail,
                tip: cookieTip
            });

            // 3. Kiểm tra Chế độ Ẩn danh (Incognito) (Tối đa 20 điểm)
            let isIncognito = false;
            let incognitoReason = "";
            try {
                if (navigator.storage && navigator.storage.estimate) {
                    const quotaPromise = navigator.storage.estimate();
                    const timeoutPromise = new Promise(r => setTimeout(() => r({ quota: 0 }), 300));
                    const { quota } = await Promise.race([quotaPromise, timeoutPromise]);
                    if (quota && quota < 2 * 1024 * 1024 * 1024 && cookieList.length === 0) {
                        isIncognito = true;
                        incognitoReason = "Storage quota nhỏ (<2GB) kèm theo 0 cookie.";
                    }
                }
            } catch (e) {}

            if (cookieList.length === 0 && (!window.localStorage || window.localStorage.length === 0)) {
                isIncognito = true;
                incognitoReason = "Không có cookie và LocalStorage hoàn toàn trắng.";
            }

            let incognitoScore = 20;
            let incognitoStatus = "pass";
            let incognitoDetail = "Đang duyệt trên Profile Chrome thông thường (lưu trữ và lịch sử bền vững).";
            let incognitoTip = "";

            if (isIncognito) {
                incognitoScore = 0;
                incognitoStatus = "fail";
                incognitoDetail = `Nghi vấn trình duyệt ẨN DANH (Incognito): ${incognitoReason || "Môi trường không lưu cookie"}.`;
                incognitoTip = "TUYỆT ĐỐI KHÔNG dùng ẩn danh để login Pokémon! Hãy tạo một Profile Chrome thường riêng (ví dụ 'Pokemon JP') để nuôi tài khoản.";
            }

            totalScore += incognitoScore;
            results.push({
                name: "Chế độ duyệt web",
                icon: "🕵️",
                status: incognitoStatus,
                score: incognitoScore,
                maxScore: 20,
                detail: incognitoDetail,
                tip: incognitoTip
            });

            // 4. Múi giờ & Ngôn ngữ (Tối đa 15 điểm)
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
            const primaryLang = navigator.language || "";
            const allLangs = navigator.languages || [primaryLang];

            let tzScore = 0;
            let tzStatus = "warn";
            let tzTip = "";

            if (tz === "Asia/Tokyo") {
                tzScore += 10;
            } else {
                tzScore += 3;
                tzTip += `Múi giờ hiện tại là "${tz}". Đối với website Nhật Bản, nên chỉnh múi giờ Windows thành "(UTC+09:00) Osaka, Sapporo, Tokyo". `;
            }

            const hasJapanese = allLangs.some(l => l.toLowerCase().startsWith("ja"));
            if (hasJapanese) {
                tzScore += 5;
            } else {
                tzScore += 1;
                tzTip += `Ngôn ngữ Chrome hiện là "${primaryLang}". Khuyên dùng: thêm tiếng Nhật (日本語) vào đầu danh sách cài đặt ngôn ngữ Chrome.`;
            }

            if (tz === "Asia/Tokyo" && hasJapanese) {
                tzStatus = "pass";
            } else {
                tzStatus = "warn";
            }

            totalScore += tzScore;
            results.push({
                name: "Múi giờ & Ngôn ngữ",
                icon: "🕐",
                status: tzStatus,
                score: tzScore,
                maxScore: 15,
                detail: `Múi giờ: ${tz} | Ngôn ngữ: ${allLangs.slice(0, 3).join(", ")}`,
                tip: tzTip
            });

            // 5. Cờ chống Bot (Webdriver & Automation) (Tối đa 10 điểm)
            let botScore = 10;
            let botStatus = "pass";
            let botDetail = "Không phát hiện cờ điều khiển tự động (Webdriver / Selenium sạch).";
            let botTip = "";

            if (navigator.webdriver) {
                botScore = 0;
                botStatus = "fail";
                botDetail = "CẢNH BÁO: Cờ navigator.webdriver = true! Trình duyệt đang bị nhận diện là công cụ tự động (Selenium/Puppeteer).";
                botTip = "Hãy mở trình duyệt Chrome bằng tay từ desktop, không mở qua script tự động hóa.";
            }

            totalScore += botScore;
            results.push({
                name: "Cờ chống Bot (Webdriver)",
                icon: "🤖",
                status: botStatus,
                score: botScore,
                maxScore: 10,
                detail: botDetail,
                tip: botTip
            });

            // 6. Cảm biến F5 WAF & Gigya (Tối đa 10 điểm)
            let f5Score = 10;
            let f5Status = "pass";
            let f5Detail = "";
            let f5Tip = "";

            const gigyaLoaded = !!(window.gigya && window.gigya.accounts);
            const recaptchaScript = !!document.querySelector('script[src*="recaptcha"]');
            const f5Active = !!(document.querySelector('script[src*="sso.htm"]') || window.gigya || document.querySelector('script[src*="gigya"]'));

            if (gigyaLoaded) {
                f5Detail = "Thư viện bảo mật Gigya & F5 sensor đã sẵn sàng xử lý yêu cầu.";
            } else if (f5Active || recaptchaScript) {
                f5Score = 7;
                f5Status = "warn";
                f5Detail = "Thư viện bảo mật đang trong quá trình tải. Hãy đợi thêm vài giây.";
                f5Tip = "Đợi 3-5 giây cho trang hoàn tất khởi tạo trước khi đăng nhập.";
            } else {
                f5Score = 3;
                f5Status = "warn";
                f5Detail = "Chưa phát hiện bộ giải mã Gigya/reCAPTCHA trên trang.";
                f5Tip = "Đảm bảo bạn đang ở đúng trang đăng nhập của Pokémon Center.";
            }

            totalScore += f5Score;
            results.push({
                name: "Cảm biến F5 WAF & Gigya",
                icon: "📡",
                status: f5Status,
                score: f5Score,
                maxScore: 10,
                detail: f5Detail,
                tip: f5Tip
            });

            // Phân loại Level & Màu sắc
            let level = "excellent";
            let levelText = "RẤT AN TOÀN";
            let color = "#2ed573";
            let summary = "Profile có độ tin cậy cao, đầy đủ cookie và thông số tự nhiên. Sẵn sàng đăng nhập an toàn!";

            if (totalScore < 60) {
                level = "danger";
                levelText = "NGUY HIỂM (DỄ BỊ 403)";
                color = "#ff4757";
                summary = "Phát hiện nhiều bất thường (thiếu cookie, ẩn danh, hoặc lệch User-Agent). KHÔNG NÊN đăng nhập lúc này kẻo bị WAF chặn!";
            } else if (totalScore < 85) {
                level = "warning";
                levelText = "TRUNG BÌNH (CẦN TỐI ƯU)";
                color = "#ffa502";
                summary = "Profile có thể đăng nhập được nhưng chưa tối ưu (thiếu cookie dày, múi giờ chưa khớp Tokyo...). Nên làm theo hướng dẫn khắc phục.";
            }

            return {
                score: totalScore,
                level,
                levelText,
                color,
                summary,
                items: results
            };
        } catch (err) {
            console.error("Lỗi khi đánh giá profile:", err);
            return {
                score: 55,
                level: "warning",
                levelText: "CẦN KIỂM TRA",
                color: "#ffa502",
                summary: "Quá trình quét gặp phản hồi chậm từ trình duyệt: " + (err.message || "Không xác định"),
                items: []
            };
        }
    }

    function logAuditSummary(auditData) {
        if (!auditData) return;
        addLog(`🛡️ KẾT QUẢ ĐÁNH GIÁ PROFILE: ${auditData.score}/100 điểm [${auditData.levelText}]`, auditData.level === "excellent" ? "success" : auditData.level === "warning" ? "warn" : "err");
        if (auditData.items && auditData.items.length > 0) {
            auditData.items.forEach(it => {
                const icon = it.status === "pass" ? "✅" : it.status === "warn" ? "⚠️" : "❌";
                const lvl = it.status === "pass" ? "info" : it.status === "warn" ? "warn" : "err";
                addLog(`   ${icon} ${it.name}: +${it.score}/${it.maxScore}đ (${it.detail})`, lvl);
                if (it.tip) {
                    addLog(`      👉 Khắc phục: ${it.tip}`, "warn");
                }
            });
        }
        if (auditData.score < 60) {
            addLog(`⚠️ CẢNH BÁO NGUY HIỂM: Điểm quá thấp. Dễ bị F5 WAF chặn 403! Vui lòng khắc phục các mục ❌ trước khi login.`, "err");
        }
    }

    function updateTrustScoreUI(auditData) {
        if (!auditData) return;

        const box = document.getElementById("pk-trust-box");
        const badge = document.getElementById("pk-trust-badge");
        const fill = document.getElementById("pk-trust-bar-fill");
        const scoreNum = document.getElementById("pk-trust-score-num");
        const brief = document.getElementById("pk-trust-brief");
        const headerBtn = document.getElementById("pk-audit-header-btn");

        if (box) {
            box.className = `pk-trust-box ${auditData.level}`;
        }
        if (badge) {
            badge.className = `pk-trust-badge ${auditData.level}`;
            badge.textContent = auditData.levelText;
        }
        if (fill) {
            fill.className = `pk-trust-bar-fill ${auditData.level}`;
            fill.style.width = `${Math.min(100, Math.max(5, auditData.score))}%`;
        }
        if (scoreNum) {
            scoreNum.textContent = `${auditData.score}/100`;
            scoreNum.style.color = auditData.color;
        }
        if (brief) {
            brief.textContent = auditData.summary;
        }
        if (headerBtn) {
            headerBtn.title = `Điểm tin tưởng Profile: ${auditData.score}/100 (${auditData.levelText})`;
        }
    }

    function openProfileAuditModal(auditData) {
        if (!auditData) return;
        const oldModal = document.getElementById("pk-audit-modal-overlay");
        if (oldModal) oldModal.remove();

        const overlay = document.createElement("div");
        overlay.id = "pk-audit-modal-overlay";
        overlay.className = "pk-modal-overlay";
        overlay.style.cssText = "position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0, 0, 0, 0.75) !important; backdrop-filter: blur(4px) !important; z-index: 10000000 !important; display: flex !important; align-items: center !important; justify-content: center !important;";

        overlay.innerHTML = `
            <div class="pk-audit-modal-content">
                <div class="pk-audit-modal-header">
                    <span style="font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                        🛡️ Báo Cáo Đánh Giá Độ Tin Tưởng Profile (Anti-Bot Check)
                    </span>
                    <button id="pk-audit-close-btn" style="background: none; border: none; color: #a4b0be; font-size: 18px; cursor: pointer;">✕</button>
                </div>
                <div class="pk-audit-modal-body">
                    <!-- Banner điểm số -->
                    <div class="pk-audit-score-banner" style="border-color: ${auditData.color}40;">
                        <div class="pk-audit-score-circle" style="border-color: ${auditData.color}; color: ${auditData.color};">
                            <span>${auditData.score}</span>
                            <span style="font-size: 10px; font-weight: 500; color: #a4b0be; margin-top: -3px;">/ 100</span>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 800; font-size: 15px; color: ${auditData.color}; margin-bottom: 3px;">
                                ${auditData.levelText}
                            </div>
                            <div style="font-size: 11.5px; color: #ced6e0; line-height: 1.4;">
                                ${auditData.summary}
                            </div>
                        </div>
                    </div>

                    <!-- Danh sách các hạng mục kiểm tra -->
                    <div style="font-weight: 700; color: #ffa502; font-size: 12px; margin-top: 2px;">
                        📋 CHI TIẾT 6 TIÊU CHÍ BẢO MẬT & CHỐNG BOT:
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${auditData.items.map(item => `
                            <div class="pk-audit-item-row ${item.status}">
                                <div class="pk-audit-item-top">
                                    <div class="pk-audit-item-name">
                                        <span>${item.icon}</span>
                                        <span>${item.name}</span>
                                    </div>
                                    <div class="pk-audit-item-score" style="color: ${item.status === 'pass' ? '#2ed573' : item.status === 'warn' ? '#ffa502' : '#ff4757'};">
                                        ${item.status === 'pass' ? '✅' : item.status === 'warn' ? '⚠️' : '❌'} +${item.score}/${item.maxScore} điểm
                                    </div>
                                </div>
                                <div class="pk-audit-item-detail">
                                    ${item.detail}
                                </div>
                                ${item.tip ? `
                                    <div class="pk-audit-item-tip">
                                        <b>💡 Cách khắc phục:</b> ${item.tip}
                                    </div>
                                ` : ''}
                            </div>
                        `).join("")}
                    </div>

                    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; padding-top: 8px; border-top: 1px solid #3e4451;">
                        <button id="pk-modal-rescan-btn" style="padding: 7px 14px; background: linear-gradient(135deg, #1e90ff, #0984e3); border: none; border-radius: 6px; color: #fff; font-weight: 600; cursor: pointer; font-size: 12px;">
                            🔄 Quét lại ngay
                        </button>
                        <button id="pk-modal-close-action" style="padding: 7px 16px; background: #57606f; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 12px;">
                            Đóng
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeBtn = document.getElementById("pk-audit-close-btn");
        if (closeBtn) closeBtn.addEventListener("click", () => overlay.remove());

        const closeAction = document.getElementById("pk-modal-close-action");
        if (closeAction) closeAction.addEventListener("click", () => overlay.remove());

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const rescanBtn = document.getElementById("pk-modal-rescan-btn");
        if (rescanBtn) {
            rescanBtn.addEventListener("click", async () => {
                rescanBtn.textContent = "⏳ Đang quét...";
                rescanBtn.disabled = true;
                const newAudit = await evaluateProfileTrustScore();
                updateTrustScoreUI(newAudit);
                openProfileAuditModal(newAudit);
            });
        }
    }

    // =========================================================================
    // XỬ LÝ NHẬP MÃ PASSCODE OTP (MFA)
    // =========================================================================

    function findOtpInput() {
        const directAuthCode = document.getElementById("authCode");
        if (directAuthCode) return directAuthCode;

        const formInput = document.querySelector('#factor2AuthForm input[name="dwfrm_factor2Auth_authCode"]') ||
                          document.querySelector('#factor2AuthForm input[type="text"]:not([readonly])');
        if (formInput) return formInput;

        const byName = document.querySelector('input[name="dwfrm_factor2Auth_authCode"], input[name*="authCode"], input[name*="passcode"]');
        if (byName) return byName;

        const candidateInputs = Array.from(document.querySelectorAll('input')).filter(input => {
            if (input.closest('#pk-auto-bot-container')) return false;
            if (input.closest('form[role="search"]') || input.name === 'q' || input.classList.contains('search-field')) return false;
            const type = (input.type || 'text').toLowerCase();
            return !['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(type);
        });

        return candidateInputs[0] || null;
    }

    function findAuthButton() {
        const directBtn = document.getElementById("authBtn");
        if (directBtn) return directBtn;

        const formBtn = document.querySelector('#factor2AuthForm a#authBtn, #factor2AuthForm a');
        if (formBtn) return formBtn;

        const candidateButtons = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn, a.comBtn, a')).filter(btn => {
            if (btn.closest('#pk-auto-bot-container')) return false;
            const txt = (btn.textContent || btn.value || '').trim();
            return txt.includes('認証') || txt.includes('送信') || txt.includes('次へ');
        });

        return candidateButtons[0] || null;
    }

    function hookResendButton() {
        const resendBtn = document.getElementById("resendBtn");
        if (resendBtn && !resendBtn.__pkHooked) {
            resendBtn.__pkHooked = true;
            resendBtn.addEventListener("click", () => {
                addLog("⚡ Bạn vừa bấm 'パスコードを再送する' trên web. Bot sẽ quét lại Gmail sau 3.5 giây...", "info");
                if (STATE.pollTimer) clearTimeout(STATE.pollTimer);
                STATE.isFetchingOtp = false;
                setTimeout(() => {
                    fetchOtpFromLocalServer(0, false);
                }, 3500);
            });
        }
    }

    function fillAndSubmitOtp(code) {
        if (!code) return;
        code = code.trim();
        addLog(`Đang tìm đúng ô Passcode và điền mã OTP [${code}]...`, "info");

        const manualInput = document.getElementById("pk-manual-otp");
        if (manualInput) manualInput.value = code;

        const targetInput = findOtpInput();
        if (!targetInput) {
            addLog("Không tìm thấy ô nhập Passcode (#authCode) trên trang web!", "err");
            return;
        }

        addLog(`Đã xác định đúng ô Passcode: <${targetInput.tagName.toLowerCase()} id="${targetInput.id || ''}" name="${targetInput.name || ''}">`, "info");

        targetInput.focus();

        try {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(targetInput, code);
        } catch (e) {
            targetInput.value = code;
        }
        targetInput.value = code;

        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        targetInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: code[code.length - 1] }));

        if (window.$) {
            try {
                window.$(targetInput).val(code).trigger('input').trigger('change');
            } catch (e) {}
        }

        addLog("Đã điền mã OTP vào #authCode thành công! Đang bấm nút '認証する'...", "success");

        setTimeout(() => {
            const authBtn = findAuthButton();
            if (authBtn) {
                addLog(`Đang bấm nút xác thực: "${(authBtn.textContent || '').trim()}"...`, "info");
                authBtn.focus();
                authBtn.click();
                if (window.$) {
                    try { window.$(authBtn).trigger('click'); } catch (e) {}
                }
                addLog("Đã gửi yêu cầu xác thực! Đang chờ chuyển hướng vào trang bốc thăm...", "success");
            } else {
                addLog("Đã điền xong OTP! Vui lòng bấm nút '認証する' trên trang.", "warn");
            }
        }, 800);
    }

    async function fetchOtpFromLocalServer(retryCount = 0, force = false) {
        if (retryCount === 0) {
            if (STATE.pollTimer) clearTimeout(STATE.pollTimer);
            STATE.isFetchingOtp = false;
        }

        const btnFetchOtp = document.getElementById("pk-btn-fetch-otp");
        STATE.isFetchingOtp = true;
        if (btnFetchOtp) {
            btnFetchOtp.disabled = true;
            btnFetchOtp.textContent = force ? "⏳ ĐANG LẤY MÃ GẦN NHẤT..." : `⏳ ĐANG QUÉT GMAIL... (${retryCount + 1}/25)`;
        }

        const activeAcc = getActiveAccount();
        const accountId = activeAcc ? activeAcc.id : "";
        const emailAddr = activeAcc ? (activeAcc.otp_email || activeAcc.pokemon_email) : "";
        const lastOtp = force ? "" : (localStorage.getItem("pk_last_used_otp") || "");

        try {
            const url = `http://127.0.0.1:8765/get-otp?account_id=${encodeURIComponent(accountId)}&email=${encodeURIComponent(emailAddr)}&exclude_otp=${encodeURIComponent(lastOtp)}${force ? "&force=1" : ""}`;
            const res = await fetch(url);
            if (!res.ok) {
                let errText = res.statusText;
                try {
                    const errJson = await res.json();
                    errText = errJson.error || errText;
                } catch (e) {}
                addLog(`Lỗi từ OTP Server: ${errText}`, "err");
                STATE.isFetchingOtp = false;
                if (btnFetchOtp) {
                    btnFetchOtp.disabled = false;
                    btnFetchOtp.textContent = "📩 ĐỌC OTP GMAIL & TỰ ĐIỀN";
                }
                return;
            }

            const data = await res.json();

            if (data.success && data.otp) {
                addLog(`-> TÌM THẤY MÃ OTP MỚI: [${data.otp}] (Thư gửi cách đây ${data.age || 0}s)!`, "success");
                localStorage.setItem("pk_last_used_otp", data.otp);
                STATE.isFetchingOtp = false;
                if (btnFetchOtp) {
                    btnFetchOtp.disabled = false;
                    btnFetchOtp.textContent = "📩 ĐỌC OTP GMAIL & TỰ ĐIỀN";
                }
                fillAndSubmitOtp(data.otp);
                return;
            }

            if (data.waiting) {
                if (retryCount < 25) {
                    addLog(`[Chờ Gmail] ${data.error} (Lần ${retryCount + 1}/25, thử lại sau 2.5s)...`, "info");
                    clearTimeout(STATE.pollTimer);
                    STATE.pollTimer = setTimeout(() => {
                        fetchOtpFromLocalServer(retryCount + 1, force);
                    }, 2500);
                } else {
                    addLog("Quá 60 giây chưa có thư mới. Hãy bấm 'パスコードを再送する' trên web hoặc bấm 'Lấy mã gần nhất ngay'!", "warn");
                    STATE.isFetchingOtp = false;
                    if (btnFetchOtp) {
                        btnFetchOtp.disabled = false;
                        btnFetchOtp.textContent = "📩 ĐỌC OTP GMAIL & TỰ ĐIỀN";
                    }
                }
                return;
            }

            addLog(`Phản hồi: ${JSON.stringify(data)}`, "warn");
            STATE.isFetchingOtp = false;
            if (btnFetchOtp) {
                btnFetchOtp.disabled = false;
                btnFetchOtp.textContent = "📩 ĐỌC OTP GMAIL & TỰ ĐIỀN";
            }

        } catch (e) {
            addLog("Không thể kết nối tới OTP Server! Hãy chắc chắn file 'chay_otp_server.bat' đang mở.", "err");
            STATE.isFetchingOtp = false;
            if (btnFetchOtp) {
                btnFetchOtp.disabled = false;
                btnFetchOtp.textContent = "📩 ĐỌC OTP GMAIL & TỰ ĐIỀN";
            }
        }
    }

    // =========================================================================
    // XỬ LÝ QUÉT & ĐĂNG KÝ XỔ SỐ (LOTTERY PROCESS)
    // =========================================================================

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

    function formatJstDate(dateStr) {
        if (!dateStr) return "";
        try {
            const d = new Date(dateStr);
            return d.toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
            }) + " JST";
        } catch (e) {
            return dateStr;
        }
    }

    // =========================================================================
    // QUÉT & KIỂM TRA DANH SÁCH SẢN PHẨM ĐANG CHUUSEN (XỔ SỐ)
    // =========================================================================

    async function checkActiveLotteryList() {
        const checkBtn = document.getElementById("pk-btn-check-only");
        if (checkBtn) checkBtn.disabled = true;

        addLog("🔍 Đang kết nối kiểm tra danh sách chuusen từ Pokémon Center...", "info");

        try {
            const gigyaReady = await waitForGigya();
            if (!gigyaReady) {
                addLog("Chưa thể kết nối tới Gigya Auth. Hãy đợi trang tải xong.", "err");
                if (checkBtn) checkBtn.disabled = false;
                return;
            }

            let jwtData;
            try {
                jwtData = await getJwtToken();
            } catch (err) {
                addLog("Bạn chưa đăng nhập hoặc phiên đã hết hạn. Hãy đăng nhập trước.", "err");
                if (checkBtn) checkBtn.disabled = false;
                return;
            }

            const jwt = jwtData.token;
            try {
                const payload = JSON.parse(atob(jwt.split(".")[1]));
                const emailSpan = document.getElementById("pk-user-email");
                if (emailSpan && payload.email) {
                    emailSpan.textContent = payload.email;
                }
            } catch (e) {}

            const listUrl = (window.ajaxUrl && window.ajaxUrl.getLotteryListUrl) ?
                window.ajaxUrl.getLotteryListUrl : "/a/ltr/api/lottery/v1/get-lottery-list";

            const listRes = await fetch(listUrl, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Authorization": "Bearer " + jwt,
                    "x-requested-with": "XMLHttpRequest"
                }
            });

            if (!listRes.ok) {
                addLog(`Lỗi tải danh sách: HTTP ${listRes.status}`, "err");
                if (checkBtn) checkBtn.disabled = false;
                return;
            }

            const json = await listRes.json();
            const items = json.data || [];

            addLog(`==================================================`, "info");
            addLog(`🔍 KẾT QUẢ KIỂM TRA TOÀN BỘ TRANG (TỔNG ${items.length} GIẢI)`, "info");
            addLog(`==================================================`, "info");

            const needApplyList = [];      // Đang mở mà chưa nộp
            const alreadyAppliedList = []; // Đang mở mà đã nộp rồi
            const upcomingList = [];       // Sắp mở
            const endedList = [];          // Đã hết hạn

            let unverifiedTotal = 0;
            let unverifiedApplied = 0;
            let verifiedTotal = 0;
            let verifiedApplied = 0;

            for (const grp of items) {
                const groupTitle = grp.lotteryTitle || grp.lotteryGroupTitle || "Không rõ tên";
                const isUnverified = groupTitle.includes("【本人未認証枠】") || groupTitle.includes("本人未認証枠");
                const isVerified = groupTitle.includes("【本人認証済み枠】") || groupTitle.includes("本人認証済み枠");
                const frameName = isUnverified ? "本人未認証枠 (Chưa xác minh)" : (isVerified ? "本人認証済み枠 (Đã xác minh)" : "Khung khác");

                const grpStatus = String(grp.applicationStatus || grp.status || "");
                const applicationItems = grp.applicationItems || grp.itemPrizeList || [];
                const isSelected = grpStatus === "40" || applicationItems.some(it => it.applicationSelectedFlg === "1");

                const timeRange = `${formatJstDate(grp.applicationStartDatetime)} ~ ${formatJstDate(grp.applicationEndDatetime)}`;
                const itemDetails = applicationItems.map(it => {
                    const price = it.price ? ` (${Number(it.price).toLocaleString()}円)` : "";
                    return `${it.itemPrizeName || ""}${price}`;
                }).join(", ");

                const itemObj = {
                    title: groupTitle,
                    items: itemDetails,
                    timeRange: timeRange,
                    frame: frameName,
                    isUnverified: isUnverified,
                    isVerified: isVerified,
                    status: grpStatus,
                    isSelected: isSelected
                };

                // Đang mở nhận đơn trên website ("30" = chưa nộp, "40" = đã nộp)
                if (grpStatus === "30" || grpStatus === "40") {
                    if (isUnverified) {
                        unverifiedTotal++;
                        if (isSelected) unverifiedApplied++;
                    } else if (isVerified) {
                        verifiedTotal++;
                        if (isSelected) verifiedApplied++;
                    }

                    if (isSelected) {
                        alreadyAppliedList.push(itemObj);
                    } else {
                        needApplyList.push(itemObj);
                    }
                } else if (grpStatus === "20") {
                    upcomingList.push(itemObj);
                } else if (grpStatus === "50") {
                    endedList.push(itemObj);
                }
            }

            // 1. CÁC GIẢI ĐANG MỞ CHƯA NỘP (CẦN CHỊU / CẦN NỘP)
            if (needApplyList.length > 0) {
                addLog(`🟢 1. CÁC GIẢI ĐANG MỞ CHỜ NỘP ĐƠN (CHƯA CHỊU - ${needApplyList.length} giải):`, "warn");
                needApplyList.forEach((it, idx) => {
                    addLog(`  👉 [${idx + 1}] ${it.title}`, "warn");
                    if (it.items) addLog(`     📦 Tên SP & Giá: ${it.items}`, "info");
                    addLog(`     🏷️ Phân loại khung: ${it.frame}`, "info");
                    addLog(`     ⏰ Hạn chót nộp đơn: ${it.timeRange}`, "info");
                    addLog(`     📌 Kết quả / Trạng thái: ⏳ CHƯA NỘP (Sẵn sàng nộp đơn)`, "warn");
                });
            } else {
                addLog(`🟢 1. CÁC GIẢI ĐANG MỞ CHỜ NỘP ĐƠN: 0 giải (Không có giải nào đang mở mà chưa nộp)`, "info");
            }

            // 2. CÁC GIẢI ĐANG MỞ MÀ ĐÃ NỘP RỒI (ĐANG CHO PHÉP CHỊU MÀ ĐÃ CHỊU RỒI)
            if (alreadyAppliedList.length > 0) {
                addLog(`--------------------------------------------------`, "info");
                addLog(`🔵 2. CÁC GIẢI ĐANG CHO PHÉP CHỊU MÀ BẠN ĐÃ CHỊU RỒI (${alreadyAppliedList.length} giải):`, "success");
                alreadyAppliedList.forEach((it, idx) => {
                    addLog(`  ✔ [${idx + 1}] ${it.title}`, "success");
                    if (it.items) addLog(`     📦 Tên SP & Giá: ${it.items}`, "info");
                    addLog(`     🏷️ Phân loại khung: ${it.frame}`, "info");
                    addLog(`     ⏰ Hạn chót nộp đơn: ${it.timeRange}`, "info");
                    addLog(`     📌 Kết quả / Trạng thái: ✅ ĐÃ NỘP ĐƠN THÀNH CÔNG (受付完了)`, "success");
                });
            }

            // 3. CÁC GIẢI SẮP MỞ
            if (upcomingList.length > 0) {
                addLog(`--------------------------------------------------`, "info");
                addLog(`⏳ 3. CÁC GIẢI SẮP MỞ BỐC THĂM (受付前 - ${upcomingList.length} giải):`, "info");
                upcomingList.forEach((it, idx) => {
                    addLog(`  ⏱ [${idx + 1}] ${it.title}`, "info");
                    if (it.items) addLog(`     📦 Sản phẩm: ${it.items}`, "info");
                    addLog(`     ⏰ Ngày mở: ${it.timeRange}`, "info");
                });
            }

            // 4. THỐNG KÊ CÁC GIẢI ĐÃ HẾT HẠN
            addLog(`--------------------------------------------------`, "info");
            addLog(`⚪ 4. THỐNG KÊ CÁC GIẢI ĐÃ HẾT HẠN (受付終了 - Tổng: ${endedList.length} giải):`, "info");
            const sampleEnded = endedList.slice(0, 6);
            sampleEnded.forEach((it) => {
                const appliedTag = it.isSelected ? " [Đã từng nộp]" : " [Không nộp]";
                addLog(`  • ${it.title}${appliedTag} (Hết hạn: ${it.timeRange})`, "info");
            });
            if (endedList.length > 6) {
                addLog(`  ... và ${endedList.length - 6} giải cũ khác đã kết thúc trước đó.`, "info");
            }

            // 5. BẢNG TỔNG HỢP TOÀN TRANG
            const totalActive = needApplyList.length + alreadyAppliedList.length;
            addLog(`==================================================`, "info");
            addLog(`📊 BẢNG TỔNG HỢP TOÀN TRANG:`, "info");
            addLog(`• Tổng cộng: ${items.length} giải trên toàn hệ thống`, "info");
            addLog(`• Đang mở chuusen: ${totalActive} giải (Chưa nộp: ${needApplyList.length} | Đã nộp: ${alreadyAppliedList.length})`, "info");
            addLog(`   👉 [本人未認証枠] (Chưa xác minh): ${unverifiedTotal} giải đang mở (Bạn đã nộp: ${unverifiedApplied}/${unverifiedTotal})`, unverifiedApplied === unverifiedTotal ? "success" : "warn");
            addLog(`   👉 [本人認証済み枠] (Đã xác minh): ${verifiedTotal} giải đang mở (Bạn đã nộp: ${verifiedApplied}/${verifiedTotal})`, "info");
            addLog(`• Sắp mở đợt mới: ${upcomingList.length} giải`, "info");
            addLog(`• Đã hết hạn (kết thúc): ${endedList.length} giải`, "info");
            addLog(`==================================================`, "info");

            // Cập nhật số đếm theo bộ lọc đang chọn (mặc định 'all' - hiển thị tất cả)
            let filterMode = localStorage.getItem("pk_filter_mode") || "all";
            if (filterMode === "unverified_only" && !localStorage.getItem("pk_filter_migrated_v2")) {
                filterMode = "all";
                localStorage.setItem("pk_filter_mode", "all");
                localStorage.setItem("pk_filter_migrated_v2", "1");
            }
            let filterRemain = 0;
            let filterDone = 0;
            if (filterMode === "unverified_only") {
                filterRemain = unverifiedTotal - unverifiedApplied;
                filterDone = unverifiedApplied;
            } else if (filterMode === "verified_only") {
                filterRemain = verifiedTotal - verifiedApplied;
                filterDone = verifiedApplied;
            } else {
                filterRemain = needApplyList.length;
                filterDone = alreadyAppliedList.length;
            }

            const openSpan = document.getElementById("pk-open-count");
            const appliedSpan = document.getElementById("pk-applied-count");
            if (openSpan) openSpan.textContent = filterRemain;
            if (appliedSpan) appliedSpan.textContent = filterDone;

        } catch (err) {
            addLog(`Lỗi kiểm tra danh sách chuusen: ${err.message}`, "err");
        } finally {
            if (checkBtn) checkBtn.disabled = false;
        }
    }

    // =========================================================================
    // TẢI & HIỂN THỊ DANH SÁCH SẢN PHẨM CÓ CHECKBOX ĐỂ CHỌN
    // =========================================================================

    let CURRENT_SCANNED_ITEMS = [];

    async function loadAndRenderProducts() {
        const listContainer = document.getElementById("pk-product-list-container");
        if (!listContainer) return;

        try {
            const gigyaReady = await waitForGigya();
            if (!gigyaReady) {
                listContainer.innerHTML = `<div style="color: #ff4757; padding: 8px; font-size: 11px;">Chưa kết nối được Gigya Auth. Hãy đợi trang tải xong.</div>`;
                return;
            }

            let jwtData;
            try {
                jwtData = await getJwtToken();
            } catch (e) {
                listContainer.innerHTML = `<div style="color: #ffa502; padding: 8px; font-size: 11px;">Chưa đăng nhập. Hãy đăng nhập tài khoản trước.</div>`;
                return;
            }

            const jwt = jwtData.token;
            try {
                const payload = JSON.parse(atob(jwt.split(".")[1]));
                const emailSpan = document.getElementById("pk-user-email");
                if (emailSpan && payload.email) {
                    emailSpan.textContent = payload.email;
                }
            } catch (e) {}

            const listUrl = (window.ajaxUrl && window.ajaxUrl.getLotteryListUrl) ?
                window.ajaxUrl.getLotteryListUrl : "/a/ltr/api/lottery/v1/get-lottery-list";

            const listRes = await fetch(listUrl, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Authorization": "Bearer " + jwt,
                    "x-requested-with": "XMLHttpRequest"
                }
            });

            if (!listRes.ok) {
                listContainer.innerHTML = `<div style="color: #ff4757; padding: 8px; font-size: 11px;">Lỗi tải dữ liệu: HTTP ${listRes.status}</div>`;
                return;
            }

            const json = await listRes.json();
            CURRENT_SCANNED_ITEMS = json.data || [];
            renderProductChecklist();

        } catch (err) {
            if (listContainer) {
                listContainer.innerHTML = `<div style="color: #ff4757; padding: 8px; font-size: 11px;">Lỗi quét sản phẩm: ${err.message}</div>`;
            }
        }
    }

    function renderProductChecklist() {
        const listContainer = document.getElementById("pk-product-list-container");
        if (!listContainer) return;

        let filterMode = localStorage.getItem("pk_filter_mode") || "all";
        if (filterMode === "unverified_only" && !localStorage.getItem("pk_filter_migrated_v2")) {
            filterMode = "all";
            localStorage.setItem("pk_filter_mode", "all");
            localStorage.setItem("pk_filter_migrated_v2", "1");
        }
        const items = CURRENT_SCANNED_ITEMS;

        const activeGroups = [];
        let totalAppliedInFilter = 0;
        let totalOpenInFilter = 0;

        for (const grp of items) {
            const groupTitle = grp.lotteryTitle || grp.lotteryGroupTitle || "Không rõ tên";
            const isUnverified = groupTitle.includes("【本人未認証枠】") || groupTitle.includes("本人未認証枠");
            const isVerified = groupTitle.includes("【本人認証済み枠】") || groupTitle.includes("本人認証済み枠");

            if (filterMode === "unverified_only" && !isUnverified) continue;
            if (filterMode === "verified_only" && !isVerified) continue;

            const grpStatus = String(grp.applicationStatus || grp.status || "");
            const applicationItems = grp.applicationItems || grp.itemPrizeList || [];
            const isApplied = grpStatus === "40" || applicationItems.some(it => it.applicationSelectedFlg === "1");

            // Chỉ hiển thị các đợt đang mở nhận đơn ("30" hoặc "40")
            if (grpStatus === "30" || grpStatus === "40") {
                if (isApplied) totalAppliedInFilter++;
                else totalOpenInFilter++;

                activeGroups.push({
                    groupId: grp.lotteryGroupId,
                    title: groupTitle,
                    isApplied: isApplied,
                    frame: isUnverified ? "本人未認証枠" : (isVerified ? "本人認証済み枠" : "Khung chung"),
                    frameClass: isUnverified ? "badge-frame-unverified" : (isVerified ? "badge-frame-verified" : "badge-frame"),
                    items: applicationItems,
                    endDate: formatJstDate(grp.applicationEndDatetime)
                });
            }
        }

        const openSpan = document.getElementById("pk-open-count");
        const appliedSpan = document.getElementById("pk-applied-count");
        if (openSpan) openSpan.textContent = totalOpenInFilter;
        if (appliedSpan) appliedSpan.textContent = totalAppliedInFilter;

        if (activeGroups.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; color: #ffa502; padding: 12px 6px; font-size: 11.5px;">
                    Không có sản phẩm nào đang mở nhận đơn.<br>
                    <span style="font-size: 10.5px; color: #a4b0be;">(Hãy kiểm tra lại danh sách hoặc thử đổi bộ lọc)</span>
                </div>
            `;
            updateExecuteButtonCount();
            return;
        }

        let html = "";
        for (const grp of activeGroups) {
            for (const it of grp.items) {
                const prizeId = it.itemPrizeId || it.prizeId;
                const prizeName = it.itemPrizeName || grp.title;
                const priceStr = it.price ? `${Number(it.price).toLocaleString()}円` : "";
                const isItemApplied = grp.isApplied || it.applicationSelectedFlg === "1";

                if (isItemApplied) {
                    html += `
                        <div class="pk-item-check-row applied">
                            <span class="pk-item-badge badge-applied">✅ Đã nộp</span>
                            <div class="pk-item-info">
                                <div class="pk-item-title">${prizeName}</div>
                                <div class="pk-item-meta">
                                    <span class="pk-item-badge ${grp.frameClass}">${grp.frame}</span>
                                    ${priceStr ? `<span>💰 ${priceStr}</span>` : ""}
                                    <span>⏰ Hạn: ${grp.endDate}</span>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <label class="pk-item-check-row selected" id="row-${grp.groupId}-${prizeId}">
                            <input type="checkbox" class="pk-item-checkbox" 
                                value="${prizeId}" 
                                data-group="${grp.groupId}" 
                                data-title="${grp.title} - ${prizeName}" 
                                data-frame="${grp.frame}"
                                checked>
                            <div class="pk-item-info">
                                <div class="pk-item-title">${prizeName}</div>
                                <div class="pk-item-meta">
                                    <span class="pk-item-badge badge-open">🟢 Đang mở</span>
                                    <span class="pk-item-badge ${grp.frameClass}">${grp.frame}</span>
                                    ${priceStr ? `<span>💰 ${priceStr}</span>` : ""}
                                    <span>⏰ Hạn: ${grp.endDate}</span>
                                </div>
                            </div>
                        </label>
                    `;
                }
            }
        }

        listContainer.innerHTML = html;

        listContainer.querySelectorAll(".pk-item-checkbox").forEach(chk => {
            chk.addEventListener("change", (e) => {
                const row = e.target.closest(".pk-item-check-row");
                if (row) {
                    if (e.target.checked) row.classList.add("selected");
                    else row.classList.remove("selected");
                }
                updateExecuteButtonCount();
            });
        });

        updateExecuteButtonCount();
    }

    function updateExecuteButtonCount() {
        const runBtn = document.getElementById("pk-btn-execute");
        if (!runBtn) return;

        const checkedBoxes = document.querySelectorAll(".pk-item-checkbox:checked");
        const count = checkedBoxes.length;

        if (count > 0) {
            runBtn.disabled = false;
            runBtn.innerHTML = `🚀 NỘP ĐƠN CHO ${count} SẢN PHẨM ĐÃ CHỌN`;
            runBtn.style.background = "linear-gradient(135deg, #2ed573, #10ac84)";
            runBtn.style.cursor = "pointer";
        } else {
            runBtn.disabled = true;
            runBtn.innerHTML = `🚀 CHƯA CHỌN SẢN PHẨM NÀO`;
            runBtn.style.background = "#57606f";
            runBtn.style.cursor = "not-allowed";
        }
    }

    async function runBotProcess() {
        const checkedBoxes = Array.from(document.querySelectorAll(".pk-item-checkbox:checked"));
        if (checkedBoxes.length === 0) {
            addLog("⚠️ Bạn chưa tích chọn sản phẩm nào để nộp đơn!", "warn");
            addLog("👉 Hãy tích vào ô vuông trước sản phẩm bạn muốn bốc thăm ở danh sách phía trên.", "info");
            return;
        }

        const runBtn = document.getElementById("pk-btn-execute");
        if (runBtn) runBtn.disabled = true;

        const toApplyList = checkedBoxes.map(chk => ({
            groupId: chk.dataset.group,
            prizeId: chk.value,
            title: chk.dataset.title || "Sản phẩm"
        }));

        addLog(`Bắt đầu quy trình nộp đơn cho ${toApplyList.length} sản phẩm bạn đã chọn...`, "info");

        try {
            const gigyaReady = await waitForGigya();
            if (!gigyaReady) {
                addLog("Chưa thể kết nối tới Gigya Auth. Hãy đợi trang tải xong.", "err");
                if (runBtn) runBtn.disabled = false;
                return;
            }

            addLog("Đang lấy phiên đăng nhập (JWT Token)...", "info");
            let jwtData;
            try {
                jwtData = await getJwtToken();
            } catch (err) {
                addLog("Phiên đăng nhập đã hết hạn hoặc bạn chưa đăng nhập!", "err");
                addLog("Vui lòng đăng nhập lại tài khoản.", "warn");
                if (runBtn) runBtn.disabled = false;
                return;
            }

            const jwt = jwtData.token;
            addLog("Đã lấy Bearer Token thành công.", "success");

            addLog(`Đang gửi đơn đăng ký cho ${toApplyList.length} sản phẩm...`, "info");
            const applyUrl = (window.ajaxUrl && window.ajaxUrl.applyLotteryUrl) ?
                window.ajaxUrl.applyLotteryUrl : "/a/ltr/api/lottery/v1/apply-lottery";

            let successCount = 0;
            const justAppliedList = [];
            for (let i = 0; i < toApplyList.length; i++) {
                const target = toApplyList[i];
                addLog(`[${i + 1}/${toApplyList.length}] Đang gửi đơn: ${target.title}...`, "info");

                try {
                    let postRes;
                    if (typeof window.apiRequest === "function") {
                        postRes = await window.apiRequest(applyUrl, 'POST', {
                            lotteryGroupId: target.groupId,
                            itemPrizeId: target.prizeId
                        }, 'json', {
                            "Authorization": "Bearer " + jwt,
                            "content-type": "application/json;charset=UTF-8"
                        });
                    } else {
                        postRes = await fetch(applyUrl, {
                            method: "POST",
                            credentials: "include",
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
                    }

                    if (postRes && (postRes.ok || postRes.status === 200)) {
                        addLog(`-> THÀNH CÔNG: Đã đăng ký thành công cho ${target.title}!`, "success");
                        successCount++;
                        justAppliedList.push(target.title);
                    } else {
                        let errText = "";
                        try {
                            if (postRes.text) errText = await postRes.text();
                        } catch (e) {}
                        addLog(`-> THẤT BẠI (Mã lỗi ${postRes ? postRes.status : 'unknown'}): ${errText}`, "err");
                    }
                } catch (applyErr) {
                    addLog(`-> Lỗi kết nối khi đăng ký: ${applyErr.message || applyErr}`, "err");
                }

                await new Promise(r => setTimeout(r, 1500));
            }

            addLog(`--------------------------------------------------`, "info");
            addLog(`🎉 HOÀN THÀNH: Đã đăng ký thành công ${successCount}/${toApplyList.length} giải bạn đã chọn!`, "success");

            if (justAppliedList.length > 0) {
                addLog(`📋 KẾT QUẢ VỪA NỘP THÀNH CÔNG:`, "success");
                justAppliedList.forEach((name, idx) => {
                    addLog(`  ✅ [${idx + 1}] ${name}`, "success");
                });
            }

            // Tự động tải lại danh sách checklist để hiển thị badge 'Đã nộp'
            await loadAndRenderProducts();

        } catch (err) {
            addLog(`Lỗi xử lý: ${err.message}`, "err");
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }

    // =========================================================================
    // HỆ THỐNG TỰ ĐỘNG ĐẶT HÀNG & THANH TOÁN (AUTO CHECKOUT & ORDER ENGINE)
    // =========================================================================

    // 1. Tìm nút Tiến hành đặt hàng trong trang Giỏ hàng (/cart/)
    function findCartCheckoutButton() {
        const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], div[role="button"]')).filter(b => {
            if (b.closest('#pk-auto-bot-container') || b.closest('header') || b.closest('#header')) return false;
            return true;
        });

        // 1. Ưu tiên hàng đầu: Nút "レジに進む" (Chuẩn trang giỏ hàng Pokémon Center Online)
        const rejiBtn = candidates.find(b => {
            const txt = (b.textContent || b.value || '').trim();
            return txt.includes('レジに進む') || txt.includes('レジへ進む') || txt.includes('レジへ');
        });
        if (rejiBtn) return rejiBtn;

        // 2. Tìm nút "ご注文手続きへ" hoặc "購入手続きへ"
        const orderBtn = candidates.find(b => {
            const txt = (b.textContent || b.value || '').trim();
            return txt.includes('ご注文手続きへ') || txt.includes('注文手続きへ') || txt.includes('購入手続きへ');
        });
        if (orderBtn) return orderBtn;

        // 3. Fallback theo class / href
        return document.querySelector('.checkout-btn, a.checkout-btn, button.checkout-btn, a[href*="/order/"], a[href*="stage="]');
    }

    // 2. Chuyển từ giỏ hàng sang bước đặt hàng
    async function proceedCartToCheckout() {
        const btn = findCartCheckoutButton();
        if (!btn) {
            addLog("⚠️ Không tìm thấy nút đặt hàng (ご注文手続きへ) hoặc giỏ hàng đang trống.", "warn");
            return false;
        }

        addLog("🛒 Đang di chuột tới nút 'Tiến hành đặt hàng'...", "info");
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.style.outline = "4px solid #00cec9";
        btn.style.outlineOffset = "3px";
        btn.style.boxShadow = "0 0 25px rgba(0, 206, 201, 0.7)";

        await new Promise(r => setTimeout(r, gaussianRandom(500, 100)));
        simulateMouseApproach(btn);
        btn.focus();
        btn.click();
        if (window.$) {
            try { window.$(btn).trigger('click'); } catch (e) {}
        }

        // Nếu là thẻ <a> có href chuyển hướng
        if (btn.tagName === 'A' && btn.getAttribute('href') && !btn.getAttribute('href').startsWith('#') && !btn.getAttribute('href').startsWith('javascript:')) {
            window.location.href = btn.href;
        }

        addLog("🚀 Đã kích hoạt chuyển sang trang Đặt hàng / Thanh toán!", "success");
        return true;
    }

    // 3. Nhận diện giai đoạn đặt hàng hiện tại (/order/)
    function detectOrderStage() {
        const urlParams = new URLSearchParams(window.location.search);
        const stageParam = urlParams.get('stage') || '';

        if (stageParam === 'placeOrder' || document.querySelector('button.place-order, .place-order') || Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('注文を確定する'))) {
            return 'placeOrder';
        }
        if (stageParam === 'payment' || document.querySelector('button.submit-payment, .submit-payment') || Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('ご注文内容の確認へ') || b.textContent.includes('確認画面へ'))) {
            return 'payment';
        }
        if (stageParam === 'shipping' || document.querySelector('button.submit-shipping, .submit-shipping') || Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('お支払い方法の選択へ') || b.textContent.includes('配送先を決定'))) {
            return 'shipping';
        }
        if (document.querySelector('.order-confirmation, .receipt, .order-thank-you-msg') || Array.from(document.querySelectorAll('h1, h2, h3, p')).some(el => el.textContent.includes('ご注文ありがとうございました'))) {
            return 'complete';
        }
        return stageParam || 'unknown';
    }

    // 4. Tìm nút xác nhận địa chỉ giao hàng (Stage: Shipping)
    function findShippingNextButton() {
        return document.querySelector('button.submit-shipping') ||
               document.querySelector('button[name="submit"][value="shipping"]') ||
               document.querySelector('.submit-shipping') ||
               Array.from(document.querySelectorAll('button, a')).find(b => {
                   if (b.closest('#pk-auto-bot-container')) return false;
                   const txt = (b.textContent || b.value || '').trim();
                   return txt.includes('お支払い方法の選択へ') || txt.includes('お支払い方法へ') || txt.includes('配送先を決定') || txt.includes('次へ進む');
               });
    }

    // 5. Tìm nút xác nhận thanh toán (Stage: Payment)
    function findPaymentNextButton() {
        return document.querySelector('button.submit-payment') ||
               document.querySelector('button[name="submit"][value="payment"]') ||
               document.querySelector('.submit-payment') ||
               Array.from(document.querySelectorAll('button, a')).find(b => {
                   if (b.closest('#pk-auto-bot-container')) return false;
                   const txt = (b.textContent || b.value || '').trim();
                   return txt.includes('ご注文内容の確認へ') || txt.includes('注文内容の確認へ') || txt.includes('確認画面へ');
               });
    }

    // 6. Tìm nút Chốt đơn cuối cùng (Stage: Place Order)
    function findPlaceOrderButton() {
        return document.querySelector('button.place-order') ||
               document.querySelector('button[name="submit"][value="place-order"]') ||
               document.querySelector('.place-order') ||
               document.querySelector('button.placeOrderBtn') ||
               Array.from(document.querySelectorAll('button')).find(b => {
                   if (b.closest('#pk-auto-bot-container')) return false;
                   const txt = (b.textContent || b.value || '').trim();
                   return txt.includes('注文を確定する') || txt.includes('購入を確定する') || txt.includes('注文完了');
               });
    }

    // 7. Tìm nút Đặt trước (予約する) hoặc Thêm vào giỏ (カートに入れる) trên trang sản phẩm
    function findAddToCartButton() {
        const candidates = Array.from(document.querySelectorAll('button, a.btn, a[class*="btn"], input[type="submit"], input[type="button"], div[role="button"]')).filter(b => {
            if (b.closest('#pk-auto-bot-container') || b.closest('header') || b.closest('#header')) return false;
            return true;
        });

        // 1. Ưu tiên nút "予約する" (Các sản phẩm trúng bốc thăm luôn ở dạng Pre-order / Đặt trước)
        const reserveBtn = candidates.find(b => {
            const txt = (b.textContent || b.value || '').trim();
            return txt.includes('予約する') || txt.includes('予約購入');
        });
        if (reserveBtn) return reserveBtn;

        // 2. Tìm nút "カートに入れる" (Thêm vào giỏ hàng thông thường)
        const cartBtn = candidates.find(b => {
            const txt = (b.textContent || b.value || '').trim();
            return txt.includes('カートに入れる') || txt.includes('カートへ入れる');
        });
        if (cartBtn) return cartBtn;

        // 3. Fallback theo selector chuẩn Demandware
        return document.querySelector('button.add-to-cart, button.reserve-btn, .add-to-cart, .reserve-btn, #add-to-cart');
    }

    // 8. Tự động xử lý từng bước của quá trình đặt hàng (/order/)
    async function processOrderStep(force = false) {
        const stage = detectOrderStage();

        if (stage === 'shipping') {
            addLog("🚚 Đang ở bước: Xác nhận Địa chỉ nhận hàng (stage=shipping)...", "info");
            const nextBtn = findShippingNextButton();
            if (!nextBtn) {
                addLog("⚠️ Chưa thấy nút chuyển bước thanh toán (submit-shipping).", "warn");
                return false;
            }

            nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nextBtn.style.outline = "4px solid #1e90ff";
            await new Promise(r => setTimeout(r, gaussianRandom(600, 120)));
            simulateMouseApproach(nextBtn);
            nextBtn.focus();
            nextBtn.click();
            if (window.$) try { window.$(nextBtn).trigger('click'); } catch (e) {}
            addLog("✅ Đã xác nhận Địa chỉ! Đang chuyển sang bước Phương thức thanh toán...", "success");
            return true;
        }

        if (stage === 'payment') {
            addLog("💳 Đang ở bước: Phương thức thanh toán (stage=payment)...", "info");
            const nextBtn = findPaymentNextButton();
            if (!nextBtn) {
                addLog("⚠️ Chưa thấy nút chuyển sang xem lại đơn hàng (submit-payment).", "warn");
                return false;
            }

            nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nextBtn.style.outline = "4px solid #1e90ff";
            await new Promise(r => setTimeout(r, gaussianRandom(600, 120)));
            simulateMouseApproach(nextBtn);
            nextBtn.focus();
            nextBtn.click();
            if (window.$) try { window.$(nextBtn).trigger('click'); } catch (e) {}
            addLog("✅ Đã xác nhận Thanh toán! Đang chuyển sang bước Xem lại & Chốt đơn...", "success");
            return true;
        }

        if (stage === 'placeOrder') {
            addLog("📦 Đang ở bước cuối: Xác nhận & Chốt đơn hàng (stage=placeOrder)...", "warn");

            // Tự động tích chọn checkbox đồng ý điều khoản mua sắm (nếu có)
            document.querySelectorAll('input[type="checkbox"]').forEach(chk => {
                if (chk.closest('#pk-auto-bot-container')) return;
                const parentText = chk.closest('label')?.textContent || chk.parentElement?.textContent || '';
                if (parentText.includes('同意') || parentText.includes('規約') || (chk.name && chk.name.includes('agree'))) {
                    if (!chk.checked) {
                        chk.checked = true;
                        chk.dispatchEvent(new Event('change', { bubbles: true }));
                        addLog("☑️ Đã tự động tích chọn đồng ý điều khoản đặt hàng.", "info");
                    }
                }
            });

            const placeBtn = findPlaceOrderButton();
            if (!placeBtn) {
                addLog("⚠️ Chưa tìm thấy nút [注文を確定する] trên trang.", "warn");
                return false;
            }

            placeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            placeBtn.style.outline = "4px solid #fdcb6e";
            placeBtn.style.outlineOffset = "3px";
            placeBtn.style.boxShadow = "0 0 25px rgba(253, 203, 110, 0.9)";

            const autoPlace = localStorage.getItem("pk_auto_place_order") === "1";
            if (autoPlace || force) {
                addLog("⚡ Đang chuẩn bị chốt đơn tự động theo cài đặt...", "warn");
                await new Promise(r => setTimeout(r, gaussianRandom(1500, 300)));
                simulateMouseApproach(placeBtn);
                placeBtn.focus();
                placeBtn.click();
                if (window.$) try { window.$(placeBtn).trigger('click'); } catch (e) {}
                addLog("🚀 ĐÃ TỰ ĐỘNG BẤM [注文を確定する] ĐỂ CHỐT ĐƠN HÀNG! Đang chờ website xác nhận...", "success");
                return true;
            } else {
                addLog("✨ ĐÃ TỚI BƯỚC CUỐI CÙNG (stage=placeOrder)!", "success");
                addLog("👉 Chế độ an toàn đang BẬT: Hãy kiểm tra lại tổng tiền trên web rồi bấm nút [注文を確定する] (hoặc bấm nút màu cam trên Widget) để chốt đơn!", "warn");
                return true;
            }
        }

        if (stage === 'complete') {
            addLog("🎉🎉 ĐẶT HÀNG THÀNH CÔNG! Đơn hàng đã được xác nhận!", "success");
            const orderNumEl = document.querySelector('.order-number, .orderNumber, .receipt-number, .order-thank-you-msg');
            if (orderNumEl) {
                addLog(`📦 Chi tiết đơn hàng: ${orderNumEl.textContent.trim().replace(/\s+/g, ' ')}`, "success");
            }

            // Kiểm tra hàng đợi mua tự động (Winner Sequential Purchase Queue)
            const queueStr = localStorage.getItem("pk_winning_queue");
            const queueActive = localStorage.getItem("pk_auto_buy_queue_active") === "1";
            if (queueActive && queueStr) {
                try {
                    let queue = JSON.parse(queueStr);
                    if (Array.isArray(queue) && queue.length > 0) {
                        const finishedItem = queue.shift(); // Xóa món vừa hoàn tất đặt mua
                        localStorage.setItem("pk_winning_queue", JSON.stringify(queue));
                        addLog(`✅ Đã hoàn tất đặt mua món trúng: [${finishedItem.title || 'Món #' + finishedItem.id}]!`, "success");

                        if (queue.length > 0) {
                            const nextItem = queue[0];
                            addLog(`⏳ HÀNG ĐỢI: Còn lại ${queue.length} sản phẩm trúng thưởng cần mua tiếp!`, "warn");
                            addLog(`🚀 Tự động chuyển sang mua sản phẩm tiếp theo: [${nextItem.title}] sau 4 giây...`, "warn");
                            setTimeout(() => {
                                if (nextItem.url) {
                                    window.location.href = nextItem.url;
                                } else {
                                    window.location.href = "https://www.pokemoncenter-online.com/lottery-history/";
                                }
                            }, 4000);
                        } else {
                            localStorage.removeItem("pk_winning_queue");
                            localStorage.removeItem("pk_auto_buy_queue_active");
                            addLog(`🏆🏆 CHÚC MỪNG BẠN! TOÀN BỘ CÁC SẢN PHẨM TRÚNG ĐÃ ĐƯỢC MUA THÀNH CÔNG!`, "success");
                        }
                    }
                } catch (e) {
                    console.error("Lỗi xử lý hàng đợi trúng thưởng:", e);
                }
            }
            return true;
        }

        addLog(`Chưa nhận diện được nút thao tác cho bước hiện tại (${stage}).`, "info");
        return false;
    }

    // 9. Bấm nút Đặt trước (予約する) hoặc Thêm vào giỏ (カートに入れる) và sang Giỏ hàng (/cart/)
    async function addToCartAndCheckout() {
        const addBtn = findAddToCartButton();
        if (!addBtn) {
            addLog("❌ Không tìm thấy nút '予約する' hoặc 'カートに入れる' (Có thể đã hết hạn hoặc hết hàng).", "err");
            return false;
        }

        const btnTxt = (addBtn.textContent || addBtn.value || '予約する').trim();
        addLog(`🛒 Đang di chuột tới nút [${btnTxt}]...`, "info");
        addBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        addBtn.style.outline = "4px solid #e84393";
        await new Promise(r => setTimeout(r, gaussianRandom(400, 80)));
        simulateMouseApproach(addBtn);
        addBtn.focus();
        addBtn.click();
        if (window.$) try { window.$(addBtn).trigger('click'); } catch (e) {}

        addLog(`✅ Đã bấm [${btnTxt}]! Đang chuyển hướng tới Giỏ hàng (/cart/)...`, "success");

        // Sau 2.2 giây nếu chưa chuyển sang giỏ hàng thì chủ động hỗ trợ chuyển tiếp
        setTimeout(() => {
            const modalCartBtn = Array.from(document.querySelectorAll('a, button')).find(b => {
                if (b.closest('#pk-auto-bot-container')) return false;
                const txt = (b.textContent || '').trim();
                return txt.includes('カートを見る') || txt.includes('レジに進む') || txt.includes('カートへ');
            });
            if (modalCartBtn) {
                modalCartBtn.click();
            } else if (!window.location.pathname.includes('/cart')) {
                window.location.href = "https://www.pokemoncenter-online.com/cart/";
            }
        }, 2200);
        return true;
    }

    // =========================================================================
    // QUÉT KẾT QUẢ XỔ SỐ & HÀNG ĐỢI TỰ ĐỘNG MUA TỪNG MÓN (WINNER AUTO-BUY QUEUE)
    // =========================================================================

    // 10. Tìm các sản phẩm trúng thưởng ĐANG TRONG THỜI HẠN MUA (Có nút "注文へ進む")
    function findWinningItemsOnPage() {
        const winners = [];

        // Tìm tất cả các nút hoặc liên kết có chữ "注文へ進む" hoặc "購入手続きへ"
        // (Đây là tiêu chuẩn duy nhất xác định sản phẩm trúng thưởng ĐANG ĐƯỢC PHÉP MUA, loại trừ các đợt cũ)
        const actionBtns = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')).filter(b => {
            if (b.closest('#pk-auto-bot-container')) return false;
            const txt = (b.textContent || b.value || '').trim();
            return txt.includes('注文へ進む') || txt.includes('購入手続きへ') || txt.includes('予約へ進む');
        });

        actionBtns.forEach((orderBtn, idx) => {
            const container = orderBtn.closest('.comBox, .history-item, .lottery-item, .card, tr, li, .item, .c-box, div[class*="lottery"], div[class*="item"]') ||
                              orderBtn.parentElement?.parentElement || orderBtn.parentElement;
            if (!container) return;

            // Tránh trùng lặp
            if (winners.some(w => w.orderBtn === orderBtn || (w.container === container && w.orderBtn))) return;

            // Tìm tên sản phẩm
            let title = '';
            const titleEl = container.querySelector('.title, .name, .item-name, h2, h3, h4, strong, a[href*="product"], a[href*=".html"]');
            if (titleEl) {
                title = titleEl.textContent.trim().replace(/\s+/g, ' ');
            } else {
                const lines = container.textContent.split('\n').map(s => s.trim()).filter(s => s.length > 5 && !s.includes('注文へ進む') && !s.includes('当選'));
                title = lines[0] || `Sản phẩm trúng #${idx + 1}`;
            }

            // Lấy URL đặt hàng trực tiếp từ nút hoặc liên kết
            let orderUrl = '';
            if (orderBtn.tagName === 'A' && orderBtn.href && !orderBtn.href.startsWith('javascript:')) {
                orderUrl = orderBtn.href;
            } else if (orderBtn.getAttribute('data-href') || orderBtn.getAttribute('data-url')) {
                orderUrl = orderBtn.getAttribute('data-href') || orderBtn.getAttribute('data-url');
            } else if (orderBtn.getAttribute('onclick')) {
                const m = orderBtn.getAttribute('onclick').match(/['"](https?:\/\/[^'"]+|\/[^'"]+)['"]/);
                if (m) orderUrl = m[1];
            }

            // Nếu nút là JS click nội bộ, tìm thẻ link sản phẩm trong thẻ card
            if (!orderUrl) {
                const productLink = container.querySelector('a[href*="/product/"], a[href*="p_cd="], a[href*=".html"]');
                if (productLink && productLink.href && !productLink.href.includes('mypage') && !productLink.href.includes('guide')) {
                    orderUrl = productLink.href;
                }
            }

            // Tìm hạn thanh toán / mua hàng (支払い期限)
            let deadline = '';
            const textAll = container.textContent;
            const deadlineMatch = textAll.match(/(?:支払|購入|注文)期限[：:\s]*([0-9\/\-\s:年月日時分]+)/);
            if (deadlineMatch) {
                deadline = deadlineMatch[1].trim();
            }

            winners.push({
                id: idx + 1,
                title: title,
                orderUrl: orderUrl,
                orderBtn: orderBtn,
                deadline: deadline,
                container: container
            });
        });

        return winners;
    }

    // 11. Quét kết quả xổ số (Xử lý trang /lottery-history/)
    function scanLotteryResults(autoStartBuy = false) {
        const path = window.location.pathname.toLowerCase();

        // Nếu người dùng đang ở /mypage/ mà chưa vào /lottery-history/
        if (!path.includes('lottery-history')) {
            addLog("⚠️ Kết quả bốc thăm nằm ở trang: /lottery-history/", "warn");
            addLog("🚀 Đang tự động chuyển hướng tới: https://www.pokemoncenter-online.com/lottery-history/ sau 1.5 giây...", "info");
            setTimeout(() => {
                window.location.href = "https://www.pokemoncenter-online.com/lottery-history/";
            }, 1500);
            return [];
        }

        addLog("🔍 Đang quét các sản phẩm trúng thưởng được phép mua (có nút [注文へ進む])...", "info");

        // Tìm các sản phẩm CÓ NÚT "注文へ進む"
        const activeWinners = findWinningItemsOnPage();

        // Đếm tổng số huy hiệu 当選 trên trang (bao gồm cả đợt cũ)
        const totalWinBadges = Array.from(document.querySelectorAll('*')).filter(el => {
            if (el.closest('#pk-auto-bot-container')) return false;
            const txt = (el.textContent || '').trim();
            return (txt === '当選' || txt.startsWith('当選') || txt.includes('【当選】')) && el.children.length === 0;
        }).length;

        // Đếm các mục 落選 (Không trúng)
        const lostCount = Array.from(document.querySelectorAll('*')).filter(el => {
            if (el.closest('#pk-auto-bot-container')) return false;
            const txt = (el.textContent || '').trim();
            return (txt === '落選' || txt.includes('【落選】')) && el.children.length === 0;
        }).length;

        if (activeWinners.length > 0) {
            addLog(`🎉🎉 PHÁT HIỆN ${activeWinners.length} SẢN PHẨM TRÚNG ĐANG TRONG HẠN MUA (Có nút [注文へ進む])!`, "success");
            
            const pastCount = totalWinBadges - activeWinners.length;
            if (pastCount > 0) {
                addLog(`📋 (Đã tự động loại trừ ${pastCount} kết quả trúng đợt trước do đã mua hoặc hết hạn).`, "info");
            }

            activeWinners.forEach((w, i) => {
                const deadlineTxt = w.deadline ? ` (Hạn chót: ${w.deadline})` : '';
                addLog(`🏆 ${i + 1}. ${w.title}${deadlineTxt}`, "success");
                if (w.orderBtn) {
                    w.orderBtn.style.outline = "4px solid #2ed573";
                    w.orderBtn.style.boxShadow = "0 0 20px rgba(46, 213, 115, 0.9)";
                }
            });

            // Cập nhật lên UI
            const winnerCountEl = document.getElementById("pk-mypage-win-count");
            if (winnerCountEl) winnerCountEl.textContent = `${activeWinners.length} món (Được phép mua)`;

            if (autoStartBuy) {
                addLog("⚡ Chế độ tự động mua đang BẬT. Bắt đầu quy trình mua tuần tự từng món...", "warn");
                startSequentialAutoBuy(activeWinners);
            } else {
                addLog("💡 Bấm nút '⚡ BẮT ĐẦU TỰ ĐỘNG MUA LẦN LƯỢT TỪNG MÓN' để bot tự đặt mua.", "info");
            }
        } else {
            if (totalWinBadges > 0) {
                addLog(`📋 Tìm thấy ${totalWinBadges} mục '当選', nhưng tất cả đều KHÔNG có nút [注文へ進む] (Đã hết hạn thanh toán hoặc đã mua đợt trước).`, "warn");
            } else {
                addLog(`📋 Không tìm thấy sản phẩm trúng thưởng nào có nút [注文へ進む]. (${lostCount} đơn 落選)`, "info");
            }
        }

        return activeWinners;
    }

    // 12. Bắt đầu Hàng đợi tự động mua lần lượt từng món
    function startSequentialAutoBuy(winningItems) {
        if (!winningItems || winningItems.length === 0) {
            winningItems = findWinningItemsOnPage();
        }

        if (!winningItems || winningItems.length === 0) {
            addLog("❌ Không tìm thấy sản phẩm trúng thưởng nào có nút '注文へ進む' để mua!", "err");
            return false;
        }

        const queue = winningItems.map((item, idx) => ({
            id: idx + 1,
            title: item.title,
            url: item.orderUrl,
            deadline: item.deadline
        }));

        localStorage.setItem("pk_winning_queue", JSON.stringify(queue));
        localStorage.setItem("pk_auto_buy_queue_active", "1");
        localStorage.setItem("pk_auto_checkout", "1"); // Tự động ở /cart/
        localStorage.setItem("pk_auto_order_steps", "1"); // Tự động duyệt qua shipping, payment

        addLog(`🚀 ĐÃ KÍCH HOẠT HÀNG ĐỢI TỰ ĐỘNG MUA ${queue.length} SẢN PHẨM TRÚNG THƯỞNG!`, "warn");
        addLog(`📦 ĐANG MUA MÓN ĐẦU TIÊN (1/${queue.length}): [${queue[0].title}]...`, "info");

        const queueStatusEl = document.getElementById("pk-mypage-queue-status");
        if (queueStatusEl) {
            queueStatusEl.textContent = `Đang mua (Còn ${queue.length} món)`;
            queueStatusEl.className = "pk-status-val warn";
        }

        const firstItem = winningItems[0];
        if (firstItem.orderBtn) {
            firstItem.orderBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstItem.orderBtn.style.outline = "4px solid #2ed573";
            setTimeout(async () => {
                simulateMouseApproach(firstItem.orderBtn);
                firstItem.orderBtn.focus();
                firstItem.orderBtn.click();
                if (window.$) try { window.$(firstItem.orderBtn).trigger('click'); } catch (e) {}
                if (firstItem.orderUrl) {
                    setTimeout(() => {
                        window.location.href = firstItem.orderUrl;
                    }, 800);
                }
            }, 1000);
        } else if (firstItem.orderUrl) {
            setTimeout(() => {
                window.location.href = firstItem.orderUrl;
            }, 1000);
        } else {
            addLog("⚠️ Sản phẩm #1 không có link trực tiếp. Hãy bấm nút '注文へ進む' trên trang web.", "warn");
        }
        return true;
    }

    // 13. Dừng hàng đợi mua tự động
    function stopSequentialAutoBuy() {
        localStorage.removeItem("pk_winning_queue");
        localStorage.removeItem("pk_auto_buy_queue_active");
        addLog("🛑 Đã dừng hàng đợi tự động mua hàng trúng thưởng.", "warn");
        const queueStatusEl = document.getElementById("pk-mypage-queue-status");
        if (queueStatusEl) {
            queueStatusEl.textContent = "Đã dừng";
            queueStatusEl.className = "pk-status-val info";
        }
    }

    // 14. Chuyển tới trang Lịch sử xổ số (/lottery-history/)
    function goToLotteryHistoryPage() {
        addLog("🚀 Đang chuyển hướng tới trang Lịch sử xổ số: https://www.pokemoncenter-online.com/lottery-history/...", "info");
        window.location.href = "https://www.pokemoncenter-online.com/lottery-history/";
    }

    // =========================================================================
    // KHỞI TẠO FLOATING WIDGET GIAO DIỆN
    // =========================================================================

    function createWidget() {
        if (document.getElementById("pk-auto-bot-container")) return;

        const path = window.location.pathname.toLowerCase();
        const isMfaPage = path.includes("mfa") || path.includes("passcode");
        const isLoginPage = (path.includes("login") || path.endsWith("/login/")) && !isMfaPage;
        const isCartPage = path.includes("/cart") || path.endsWith("/cart/");
        const isOrderPage = path.includes("/order") || window.location.search.includes("stage=");
        const isProductPage = path.includes("/product") || window.location.search.includes("p_cd=") || /\/\d{10,14}\.html/.test(path);
        const isMyPage = path.includes("/mypage") || path.includes("history") || path.includes("lottery-history");

        const container = document.createElement("div");
        container.id = "pk-auto-bot-container";

        container.innerHTML = `
            <div id="pk-bot-header">
                <div class="pk-title">
                    <span>⚡ PKM Auto Lottery</span>
                </div>
                <div class="pk-controls">
                    <button class="pk-btn-icon" id="pk-audit-header-btn" title="Chấm điểm Profile (Anti-Bot Check)">🛡️</button>
                    <button class="pk-btn-icon" id="pk-expand-btn" title="Phóng to / Thu nhỏ giao diện">⛶</button>
                    <button class="pk-btn-icon" id="pk-toggle-btn" title="Thu nhỏ/Mở rộng">−</button>
                </div>
            </div>
            <div id="pk-bot-body">
                <!-- KHỐI CHỌN TÀI KHOẢN (LUÔN XUẤT HIỆN) -->
                <div class="pk-acc-selector-box">
                    <div class="pk-acc-row">
                        <span style="font-weight: 600; color: #a4b0be; font-size: 11px;">👤 Chọn tài khoản:</span>
                        <button class="pk-btn-manage" id="pk-btn-open-modal">⚙️ Quản lý nick</button>
                    </div>
                    <div class="pk-acc-row" style="margin-top: 2px;">
                        <select id="pk-acc-dropdown" class="pk-acc-select"></select>
                    </div>
                </div>

                ${isMfaPage ? `
                    <!-- GIAO DIỆN TRANG NHẬP PASSCODE OTP -->
                    <div class="pk-status-box">
                        <div style="color: #2ed573; font-weight: bold; margin-bottom: 4px;">📩 BƯỚC NHẬP PASSCODE OTP</div>
                        <div class="pk-status-item">
                            <span>Nick đang chọn:</span>
                            <span class="pk-status-val info" id="pk-mfa-acc-name">--</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Gmail đọc OTP:</span>
                            <span class="pk-status-val success" id="pk-mfa-acc-otp-mail">--</span>
                        </div>
                    </div>
                    <button class="pk-btn-run" id="pk-btn-fetch-otp" style="background: linear-gradient(135deg, #ff4757, #ee1515);">
                        📩 ĐỌC OTP GMAIL & TỰ ĐIỀN
                    </button>
                    <div style="display: flex; justify-content: flex-end; margin-top: 3px; margin-bottom: 3px;">
                        <a href="javascript:void(0)" id="pk-btn-force-otp" style="color: #ffa502; font-size: 11px; text-decoration: underline; cursor: pointer;">Lấy mã gần nhất ngay (Bỏ qua kiểm tra)</a>
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                        <input type="text" id="pk-manual-otp" placeholder="Hoặc dán 6 số OTP vào đây" style="flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid #57606f; background: #2f3542; color: #fff; font-size: 12px; outline: none;">
                        <button id="pk-btn-fill-otp" style="padding: 6px 12px; background: #2ed573; border: none; border-radius: 6px; color: #fff; font-weight: bold; cursor: pointer; font-size: 12px;">Điền</button>
                    </div>
                    <div class="pk-logs-header">
                        <span class="pk-logs-title">📋 KẾT QUẢ & NHẬT KÝ</span>
                        <div class="pk-logs-actions">
                            <button type="button" class="pk-logs-btn pk-btn-clear-logs" title="Xóa màn hình kết quả">🗑️ Xóa</button>
                            <button type="button" class="pk-logs-btn pk-btn-expand-logs" title="Phóng to / Thu nhỏ ô kết quả">⛶ Phóng to</button>
                        </div>
                    </div>
                    <div id="pk-bot-logs"></div>
                ` : isLoginPage ? `
                    <!-- GIAO DIỆN TRANG ĐĂNG NHẬP -->
                    <div class="pk-status-box">
                        <div style="color: #ffa502; font-weight: bold; margin-bottom: 6px;">🔑 ĐĂNG NHẬP POKÉMON CENTER</div>
                        <div class="pk-status-item">
                            <span>Nick đang chọn:</span>
                            <span class="pk-status-val info" id="pk-login-acc-name">--</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Email đăng nhập:</span>
                            <span class="pk-status-val warn" id="pk-login-acc-email">--</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Gmail nhận OTP:</span>
                            <span class="pk-status-val success" id="pk-login-acc-otp-mail">--</span>
                        </div>
                    </div>

                    <!-- KHỐI CHẤM ĐIỂM ĐỘ TIN TƯỞNG PROFILE -->
                    <div id="pk-trust-box" class="pk-trust-box">
                        <div class="pk-trust-header">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 14px;">🛡️</span>
                                <span style="font-weight: bold; color: #f1f2f6; font-size: 11.5px;">ĐỘ TIN TƯỞNG PROFILE:</span>
                            </div>
                            <span id="pk-trust-badge" class="pk-trust-badge loading">Đang kiểm tra...</span>
                        </div>
                        <div class="pk-trust-meter-container">
                            <div class="pk-trust-bar-bg">
                                <div id="pk-trust-bar-fill" class="pk-trust-bar-fill"></div>
                            </div>
                            <span id="pk-trust-score-num" class="pk-trust-score-num">--/100</span>
                        </div>
                        <div id="pk-trust-brief" class="pk-trust-brief">Đang phân tích User-Agent, Cookie, Timezone, Ẩn danh...</div>
                        <div style="display: flex; gap: 6px; margin-top: 2px;">
                            <button type="button" id="pk-btn-open-audit" class="pk-btn-audit">🩺 Xem Chi Tiết Báo Cáo</button>
                            <button type="button" id="pk-btn-rescan-trust" class="pk-btn-audit" style="flex: 0.45; background: #3e4451;">🔄 Quét lại</button>
                        </div>
                    </div>

                    <div class="pk-row" style="padding: 2px 0;">
                        <span class="pk-switch-label" style="font-size: 11px;">Tự đăng nhập khi mở trang:</span>
                        <label class="pk-switch">
                            <input type="checkbox" id="pk-auto-login-toggle">
                            <span class="pk-slider"></span>
                        </label>
                    </div>
                    <button class="pk-btn-run" id="pk-btn-do-login" style="background: linear-gradient(135deg, #ffa502, #ff7f50);">
                        🔑 TỰ ĐIỀN & BẤM ĐĂNG NHẬP
                    </button>
                    <div class="pk-logs-header">
                        <span class="pk-logs-title">📋 KẾT QUẢ & NHẬT KÝ</span>
                        <div class="pk-logs-actions">
                            <button type="button" class="pk-logs-btn pk-btn-clear-logs" title="Xóa màn hình kết quả">🗑️ Xóa</button>
                            <button type="button" class="pk-logs-btn pk-btn-expand-logs" title="Phóng to / Thu nhỏ ô kết quả">⛶ Phóng to</button>
                        </div>
                    </div>
                    <div id="pk-bot-logs"></div>
                ` : isCartPage ? `
                    <!-- GIAO DIỆN TRANG GIỎ HÀNG -->
                    <div class="pk-status-box">
                        <div style="color: #00cec9; font-weight: bold; margin-bottom: 6px;">🛒 GIỎ HÀNG POKÉMON CENTER</div>
                        <div class="pk-status-item">
                            <span>Nick đang chọn:</span>
                            <span class="pk-status-val info" id="pk-cart-acc-name">--</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Trạng thái:</span>
                            <span class="pk-status-val success" id="pk-cart-status">Sẵn sàng đặt hàng</span>
                        </div>
                    </div>

                    <div class="pk-row" style="padding: 2px 0;">
                        <span class="pk-switch-label" style="font-size: 11px;">Tự động tiến hành đặt hàng:</span>
                        <label class="pk-switch">
                            <input type="checkbox" id="pk-auto-checkout-toggle">
                            <span class="pk-slider"></span>
                        </label>
                    </div>

                    <button class="pk-btn-run" id="pk-btn-do-checkout" style="background: linear-gradient(135deg, #00cec9, #0984e3);">
                        🛒 TIẾN HÀNH ĐẶT HÀNG (CHECKOUT)
                    </button>

                    <div class="pk-logs-header">
                        <span class="pk-logs-title">📋 KẾT QUẢ & NHẬT KÝ</span>
                        <div class="pk-logs-actions">
                            <button type="button" class="pk-logs-btn pk-btn-clear-logs" title="Xóa màn hình kết quả">🗑️ Xóa</button>
                            <button type="button" class="pk-logs-btn pk-btn-expand-logs" title="Phóng to / Thu nhỏ ô kết quả">⛶ Phóng to</button>
                        </div>
                    </div>
                    <div id="pk-bot-logs"></div>
                ` : isOrderPage ? `
                    <!-- GIAO DIỆN TRANG ĐẶT HÀNG / CHECKOUT -->
                    <div class="pk-status-box">
                        <div style="color: #fdcb6e; font-weight: bold; margin-bottom: 6px;">📦 TIẾN HÀNH ĐẶT HÀNG (CHECKOUT)</div>
                        <div class="pk-status-item">
                            <span>Bước hiện tại:</span>
                            <span class="pk-status-val warn" id="pk-order-current-stage">Đang kiểm tra...</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Nick đang chọn:</span>
                            <span class="pk-status-val info" id="pk-order-acc-name">--</span>
                        </div>
                    </div>

                    <div class="pk-row" style="padding: 2px 0;">
                        <span class="pk-switch-label" style="font-size: 11px;">Tự động duyệt qua các bước:</span>
                        <label class="pk-switch">
                            <input type="checkbox" id="pk-auto-order-steps-toggle" checked>
                            <span class="pk-slider"></span>
                        </label>
                    </div>

                    <div class="pk-row" style="padding: 2px 0;">
                        <span class="pk-switch-label" style="font-size: 11px;">⚡ Tự bấm nút Chốt đơn cuối:</span>
                        <label class="pk-switch">
                            <input type="checkbox" id="pk-auto-place-order-toggle">
                            <span class="pk-slider"></span>
                        </label>
                    </div>

                    <button class="pk-btn-run" id="pk-btn-do-order-step" style="background: linear-gradient(135deg, #fdcb6e, #e17055);">
                        ⚡ BƯỚC TIẾP THEO / CHỐT ĐƠN
                    </button>

                    <div class="pk-logs-header">
                        <span class="pk-logs-title">📋 KẾT QUẢ & NHẬT KÝ</span>
                        <div class="pk-logs-actions">
                            <button type="button" class="pk-logs-btn pk-btn-clear-logs" title="Xóa màn hình kết quả">🗑️ Xóa</button>
                            <button type="button" class="pk-logs-btn pk-btn-expand-logs" title="Phóng to / Thu nhỏ ô kết quả">⛶ Phóng to</button>
                        </div>
                    </div>
                    <div id="pk-bot-logs"></div>
                ` : isProductPage ? `
                    <!-- GIAO DIỆN TRANG SẢN PHẨM -->
                    <div class="pk-status-box">
                        <div style="color: #e84393; font-weight: bold; margin-bottom: 6px;">🛍️ TRANG SẢN PHẨM</div>
                        <div class="pk-status-item">
                            <span>Nick đang chọn:</span>
                            <span class="pk-status-val info" id="pk-prod-acc-name">--</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Thao tác:</span>
                            <span class="pk-status-val success">Đặt hàng nhanh</span>
                        </div>
                    </div>

                    <button class="pk-btn-run" id="pk-btn-quick-buy" style="background: linear-gradient(135deg, #e84393, #d63031);">
                        ⚡ THÊM VÀO GIỎ & ĐẶT HÀNG NGAY
                    </button>

                    <div class="pk-logs-header">
                        <span class="pk-logs-title">📋 KẾT QUẢ & NHẬT KÝ</span>
                        <div class="pk-logs-actions">
                            <button type="button" class="pk-logs-btn pk-btn-clear-logs" title="Xóa màn hình kết quả">🗑️ Xóa</button>
                            <button type="button" class="pk-logs-btn pk-btn-expand-logs" title="Phóng to / Thu nhỏ ô kết quả">⛶ Phóng to</button>
                        </div>
                    </div>
                    <div id="pk-bot-logs"></div>
                ` : isMyPage ? `
                    <!-- GIAO DIỆN TRANG MYPAGE / LỊCH SỬ XỔ SỐ -->
                    <div class="pk-status-box">
                        <div style="color: #2ed573; font-weight: bold; margin-bottom: 6px;">🏆 KẾT QUẢ XỔ SỐ & TỰ ĐỘNG MUA (MYPAGE)</div>
                        <div class="pk-status-item">
                            <span>Nick đang chọn:</span>
                            <span class="pk-status-val info" id="pk-mypage-acc-name">--</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Số món trúng (当選):</span>
                            <span class="pk-status-val success" id="pk-mypage-win-count">Chưa quét</span>
                        </div>
                        <div class="pk-status-item">
                            <span>Hàng đợi mua tự động:</span>
                            <span class="pk-status-val warn" id="pk-mypage-queue-status">Đang rảnh</span>
                        </div>
                    </div>

                    <div class="pk-row" style="padding: 2px 0;">
                        <span class="pk-switch-label" style="font-size: 11px;">Tự mua ngay khi quét thấy trúng:</span>
                        <label class="pk-switch">
                            <input type="checkbox" id="pk-auto-buy-on-win-toggle">
                            <span class="pk-slider"></span>
                        </label>
                    </div>

                    <div class="pk-row" style="padding: 2px 0;">
                        <span class="pk-switch-label" style="font-size: 11px;">⚡ Tự bấm nút Chốt đơn cuối:</span>
                        <label class="pk-switch">
                            <input type="checkbox" id="pk-mypage-auto-place-toggle">
                            <span class="pk-slider"></span>
                        </label>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
                        <button class="pk-btn-run" id="pk-btn-scan-lottery" style="background: linear-gradient(135deg, #1e90ff, #0984e3);">
                            🔍 QUÉT KẾT QUẢ TRÚNG THƯỞNG (SCAN WINNERS)
                        </button>
                        <button class="pk-btn-run" id="pk-btn-start-queue-buy" style="background: linear-gradient(135deg, #2ed573, #10ac84);">
                            ⚡ BẮT ĐẦU TỰ ĐỘNG MUA LẦN LƯỢT TỪNG MÓN
                        </button>
                        <div style="display: flex; gap: 6px;">
                            <button type="button" id="pk-btn-goto-history" class="pk-btn-audit" style="flex: 1; background: #3e4451;">
                                📂 Đến trang /lottery-history/
                            </button>
                            <button type="button" id="pk-btn-stop-queue" class="pk-btn-audit" style="flex: 0.6; background: #eb4d4b;">
                                🛑 Dừng mua
                            </button>
                        </div>
                    </div>

                    <div class="pk-logs-header">
                        <span class="pk-logs-title">📋 KẾT QUẢ & NHẬT KÝ</span>
                        <div class="pk-logs-actions">
                            <button type="button" class="pk-logs-btn pk-btn-clear-logs" title="Xóa màn hình kết quả">🗑️ Xóa</button>
                            <button type="button" class="pk-logs-btn pk-btn-expand-logs" title="Phóng to / Thu nhỏ ô kết quả">⛶ Phóng to</button>
                        </div>
                    </div>
                    <div id="pk-bot-logs"></div>
                ` : `
                    <!-- GIAO DIỆN TRANG XỔ SỐ APPLY.HTML -->
                    <div class="pk-col-main">
                        <div class="pk-row">
                            <span class="pk-switch-label">Tự động nộp khi mở trang:</span>
                            <label class="pk-switch">
                                <input type="checkbox" id="pk-auto-toggle" ${CONFIG.autoRunOnLoad ? "checked" : ""}>
                                <span class="pk-slider"></span>
                            </label>
                        </div>

                        <div class="pk-row" style="margin-top: 2px;">
                            <span class="pk-switch-label">Hiển thị danh sách:</span>
                            <select id="pk-filter-mode" style="background: #2f3542; color: #2ed573; font-weight: bold; border: 1px solid #57606f; border-radius: 6px; padding: 4px 6px; font-size: 11px; outline: none; cursor: pointer; max-width: 170px;">
                                <option value="all" selected>Tất cả sản phẩm (Toàn bộ)</option>
                                <option value="unverified_only">Chỉ [本人未認証枠]</option>
                                <option value="verified_only">Chỉ [本人認証済み枠]</option>
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

                        <!-- KHỐI CHỌN SẢN PHẨM CẦN NỘP -->
                        <div id="pk-product-selection-box">
                            <div class="pk-selection-header">
                                <span class="pk-selection-title">📦 CHỌN SẢN PHẨM CẦN NỘP:</span>
                                <div style="display: flex; gap: 4px;">
                                    <button type="button" id="pk-btn-select-all" class="pk-logs-btn">Chọn hết</button>
                                    <button type="button" id="pk-btn-deselect-all" class="pk-logs-btn">Bỏ chọn</button>
                                </div>
                            </div>
                            <div id="pk-product-list-container">
                                <div style="text-align: center; color: #a4b0be; padding: 12px; font-size: 11px;">
                                    ⏳ Đang quét danh sách sản phẩm...
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
                            <button class="pk-btn-run" id="pk-btn-execute" style="background: linear-gradient(135deg, #2ed573, #10ac84);">
                                🚀 NỘP ĐƠN CHO CÁC SẢN PHẨM ĐÃ CHỌN
                            </button>
                            <button class="pk-btn-run" id="pk-btn-check-only" style="background: linear-gradient(135deg, #1e90ff, #0984e3); box-shadow: 0 4px 12px rgba(30, 144, 255, 0.3); font-size: 12px; padding: 8px;">
                                🔍 KIỂM TRA TOÀN BỘ TRANG (CHI TIẾT)
                            </button>
                        </div>
                        <div style="margin-top: 6px; display: flex; justify-content: space-between; font-size: 11px; padding: 0 4px;">
                            <a href="https://www.pokemoncenter-online.com/mypage/" style="color: #2ed573; text-decoration: underline; font-weight: 600;">🏆 Xem kết quả bốc thăm (MyPage)</a>
                            <a href="https://www.pokemoncenter-online.com/login/" style="color: #a4b0be; text-decoration: underline;">Đăng xuất / Chuyển nick</a>
                        </div>
                    </div>

                    <div class="pk-col-logs">
                        <div class="pk-logs-header">
                            <span class="pk-logs-title">📋 KẾT QUẢ & NHẬT KÝ</span>
                            <div class="pk-logs-actions">
                                <button type="button" class="pk-logs-btn pk-btn-clear-logs" title="Xóa màn hình kết quả">🗑️ Xóa</button>
                                <button type="button" class="pk-logs-btn pk-btn-expand-logs" title="Phóng to toàn màn hình / Thu nhỏ">⛶ Phóng to</button>
                            </div>
                        </div>
                        <div id="pk-bot-logs"></div>
                    </div>
                `}
            </div>
        `;

        document.body.appendChild(container);

        // Nút thu nhỏ widget thành thanh nổi
        const toggleBtn = document.getElementById("pk-toggle-btn");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                container.classList.remove("pk-fullscreen");
                container.classList.toggle("minimized");
                const isMin = container.classList.contains("minimized");
                toggleBtn.textContent = isMin ? "+" : "−";
                toggleBtn.title = isMin ? "Mở rộng giao diện" : "Thu nhỏ giao diện";
            });
        }

        // Click vào thanh header khi đang thu nhỏ sẽ tự mở lại; double click để phóng to/thu nhỏ
        const headerBar = document.getElementById("pk-bot-header");
        if (headerBar) {
            headerBar.addEventListener("click", () => {
                if (container.classList.contains("minimized")) {
                    container.classList.remove("minimized");
                    if (toggleBtn) toggleBtn.textContent = "−";
                }
            });
            headerBar.addEventListener("dblclick", () => {
                toggleFullscreen();
            });
        }

        // Nút phóng to toàn màn hình / thu nhỏ lại kích thước chuẩn
        function toggleFullscreen() {
            if (container.classList.contains("minimized")) {
                container.classList.remove("minimized");
                if (toggleBtn) toggleBtn.textContent = "−";
            }
            container.classList.toggle("pk-fullscreen");
            const isFull = container.classList.contains("pk-fullscreen");
            const expandHeaderBtn = document.getElementById("pk-expand-btn");
            if (expandHeaderBtn) {
                expandHeaderBtn.textContent = isFull ? "🗗" : "⛶";
                expandHeaderBtn.title = isFull ? "Thu nhỏ về kích thước chuẩn" : "Phóng to toàn màn hình";
            }
            document.querySelectorAll(".pk-btn-expand-logs").forEach(b => {
                b.textContent = isFull ? "🗗 Thu nhỏ" : "⛶ Phóng to";
                b.title = isFull ? "Thu nhỏ về kích thước chuẩn" : "Phóng to toàn màn hình";
            });
        }

        const expandBtn = document.getElementById("pk-expand-btn");
        if (expandBtn) {
            expandBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleFullscreen();
            });
        }

        document.querySelectorAll(".pk-btn-expand-logs").forEach(b => {
            b.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleFullscreen();
            });
        });

        document.querySelectorAll(".pk-btn-clear-logs").forEach(b => {
            b.addEventListener("click", () => {
                const logBox = document.getElementById("pk-bot-logs");
                if (logBox) logBox.innerHTML = "";
            });
        });

        // Dropdown chọn nick
        const accDropdown = document.getElementById("pk-acc-dropdown");
        if (accDropdown) {
            accDropdown.addEventListener("change", (e) => {
                if (e.target.value === "__new__") {
                    openAccountModal(null);
                    renderAccountDropdown();
                } else {
                    setActiveAccount(e.target.value);
                }
            });
        }

        // Nút mở modal quản lý nick
        const btnOpenModal = document.getElementById("pk-btn-open-modal");
        if (btnOpenModal) {
            btnOpenModal.addEventListener("click", () => {
                openAccountModal(null);
            });
        }

        // Nút đánh giá Profile trên thanh Header
        const headerAuditBtn = document.getElementById("pk-audit-header-btn");
        if (headerAuditBtn) {
            headerAuditBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                addLog("🩺 Đang phân tích độ tin tưởng Profile hiện tại...", "info");
                const auditData = await evaluateProfileTrustScore();
                updateTrustScoreUI(auditData);
                logAuditSummary(auditData);
                openProfileAuditModal(auditData);
            });
        }

        // Nút mở báo cáo chi tiết & nút quét lại Profile
        const btnOpenAudit = document.getElementById("pk-btn-open-audit");
        if (btnOpenAudit) {
            btnOpenAudit.addEventListener("click", async () => {
                addLog("🩺 Đang phân tích độ tin tưởng Profile hiện tại...", "info");
                const auditData = await evaluateProfileTrustScore();
                updateTrustScoreUI(auditData);
                logAuditSummary(auditData);
                openProfileAuditModal(auditData);
            });
        }

        const btnRescanTrust = document.getElementById("pk-btn-rescan-trust");
        if (btnRescanTrust) {
            btnRescanTrust.addEventListener("click", async () => {
                btnRescanTrust.textContent = "⏳...";
                const auditData = await evaluateProfileTrustScore();
                updateTrustScoreUI(auditData);
                btnRescanTrust.textContent = "🔄 Quét lại";
                logAuditSummary(auditData);
            });
        }

        // Xử lý trang Đăng nhập
        const btnDoLogin = document.getElementById("pk-btn-do-login");
        if (btnDoLogin) {
            btnDoLogin.addEventListener("click", async () => {
                const acc = getActiveAccount();

                // Đánh giá nhanh điểm trước khi bắt đầu
                const audit = await evaluateProfileTrustScore();
                updateTrustScoreUI(audit);
                if (audit.score < 60) {
                    addLog(`⚠️ CẢNH BÁO NGUY CƠ CAO: Profile chỉ đạt ${audit.score}/100 điểm!`, "err");
                    addLog(`⚠️ Dễ bị F5 WAF chặn 403. Bạn nên bấm [🩺 Xem Chi Tiết Báo Cáo] để khắc phục trước.`, "warn");
                }

                btnDoLogin.disabled = true;
                btnDoLogin.textContent = "⌨️ Đang gõ phím...";
                const filled = await fillLoginForm(acc);
                if (filled) {
                    btnDoLogin.textContent = "🖱️ Đang bấm Đăng nhập...";
                    await new Promise(r => setTimeout(r, gaussianRandom(500, 100)));
                    await submitLoginForm();
                }
                btnDoLogin.disabled = false;
                btnDoLogin.textContent = "🔑 TỰ ĐIỀN & BẤM ĐĂNG NHẬP";
            });
        }
        const autoLoginToggle = document.getElementById("pk-auto-login-toggle");
        if (autoLoginToggle) {
            const savedAutoLogin = localStorage.getItem("pk_auto_login") === "1";
            autoLoginToggle.checked = savedAutoLogin;
            autoLoginToggle.addEventListener("change", (e) => {
                localStorage.setItem("pk_auto_login", e.target.checked ? "1" : "0");
                addLog(`Đã ${e.target.checked ? "BẬT" : "TẮT"} tự động đăng nhập khi vào trang.`, "info");
            });
        }

        // Xử lý trang MFA OTP
        const btnFetchOtp = document.getElementById("pk-btn-fetch-otp");
        if (btnFetchOtp) {
            btnFetchOtp.addEventListener("click", () => {
                fetchOtpFromLocalServer(0, false);
            });
        }
        const btnForceOtp = document.getElementById("pk-btn-force-otp");
        if (btnForceOtp) {
            btnForceOtp.addEventListener("click", () => {
                addLog("Đang ép đọc mã mới nhất bất kể lượt trước...", "info");
                fetchOtpFromLocalServer(0, true);
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

        // Xử lý trang Giỏ hàng (/cart/)
        const autoCheckoutToggle = document.getElementById("pk-auto-checkout-toggle");
        if (autoCheckoutToggle) {
            autoCheckoutToggle.checked = localStorage.getItem("pk_auto_checkout") === "1";
            autoCheckoutToggle.addEventListener("change", (e) => {
                localStorage.setItem("pk_auto_checkout", e.target.checked ? "1" : "0");
                addLog(`Đã ${e.target.checked ? "BẬT" : "TẮT"} tự động tiến hành đặt hàng.`, "info");
            });
        }
        const btnDoCheckout = document.getElementById("pk-btn-do-checkout");
        if (btnDoCheckout) {
            btnDoCheckout.addEventListener("click", () => {
                proceedCartToCheckout();
            });
        }

        // Xử lý trang Đặt hàng / Checkout (/order/ hoặc stage=...)
        const autoOrderStepsToggle = document.getElementById("pk-auto-order-steps-toggle");
        if (autoOrderStepsToggle) {
            autoOrderStepsToggle.checked = localStorage.getItem("pk_auto_order_steps") !== "0";
            autoOrderStepsToggle.addEventListener("change", (e) => {
                localStorage.setItem("pk_auto_order_steps", e.target.checked ? "1" : "0");
                addLog(`Đã ${e.target.checked ? "BẬT" : "TẮT"} tự động duyệt các bước đặt hàng.`, "info");
            });
        }
        const autoPlaceOrderToggle = document.getElementById("pk-auto-place-order-toggle");
        if (autoPlaceOrderToggle) {
            autoPlaceOrderToggle.checked = localStorage.getItem("pk_auto_place_order") === "1";
            autoPlaceOrderToggle.addEventListener("change", (e) => {
                localStorage.setItem("pk_auto_place_order", e.target.checked ? "1" : "0");
                addLog(`Đã ${e.target.checked ? "BẬT" : "TẮT"} tự động chốt đơn cuối cùng (注文を確定する).`, e.target.checked ? "warn" : "info");
            });
        }
        const btnDoOrderStep = document.getElementById("pk-btn-do-order-step");
        if (btnDoOrderStep) {
            btnDoOrderStep.addEventListener("click", () => {
                processOrderStep(true);
            });
        }

        // Xử lý trang Sản phẩm (/product/ hoặc p_cd=)
        const btnQuickBuy = document.getElementById("pk-btn-quick-buy");
        if (btnQuickBuy) {
            btnQuickBuy.addEventListener("click", () => {
                addToCartAndCheckout();
            });
        }

        // Xử lý trang MyPage / Lịch sử xổ số
        const autoBuyOnWinToggle = document.getElementById("pk-auto-buy-on-win-toggle");
        if (autoBuyOnWinToggle) {
            autoBuyOnWinToggle.checked = localStorage.getItem("pk_auto_buy_on_win") === "1";
            autoBuyOnWinToggle.addEventListener("change", (e) => {
                localStorage.setItem("pk_auto_buy_on_win", e.target.checked ? "1" : "0");
                addLog(`Đã ${e.target.checked ? "BẬT" : "TẮT"} tự động mua ngay khi quét thấy trúng.`, "info");
            });
        }
        const mypageAutoPlaceToggle = document.getElementById("pk-mypage-auto-place-toggle");
        if (mypageAutoPlaceToggle) {
            mypageAutoPlaceToggle.checked = localStorage.getItem("pk_auto_place_order") === "1";
            mypageAutoPlaceToggle.addEventListener("change", (e) => {
                localStorage.setItem("pk_auto_place_order", e.target.checked ? "1" : "0");
                addLog(`Đã ${e.target.checked ? "BẬT" : "TẮT"} tự động chốt đơn cuối cùng (注文を確定する).`, e.target.checked ? "warn" : "info");
            });
        }
        const btnScanLottery = document.getElementById("pk-btn-scan-lottery");
        if (btnScanLottery) {
            btnScanLottery.addEventListener("click", () => {
                const autoBuy = localStorage.getItem("pk_auto_buy_on_win") === "1";
                scanLotteryResults(autoBuy);
            });
        }
        const btnStartQueueBuy = document.getElementById("pk-btn-start-queue-buy");
        if (btnStartQueueBuy) {
            btnStartQueueBuy.addEventListener("click", () => {
                startSequentialAutoBuy();
            });
        }
        const btnGotoHistory = document.getElementById("pk-btn-goto-history");
        if (btnGotoHistory) {
            btnGotoHistory.addEventListener("click", () => {
                goToLotteryHistoryPage();
            });
        }
        const btnStopQueue = document.getElementById("pk-btn-stop-queue");
        if (btnStopQueue) {
            btnStopQueue.addEventListener("click", () => {
                stopSequentialAutoBuy();
            });
        }

        // Xử lý trang xổ số
        const autoToggle = document.getElementById("pk-auto-toggle");
        if (autoToggle) {
            autoToggle.addEventListener("change", (e) => {
                CONFIG.autoRunOnLoad = e.target.checked;
                localStorage.setItem("pk_auto_run", e.target.checked ? "1" : "0");
                addLog(`Đã ${e.target.checked ? "BẬT" : "TẮT"} chế độ tự động nộp khi vào trang.`, "info");
            });
            const savedPref = localStorage.getItem("pk_auto_run");
            if (savedPref !== null) {
                autoToggle.checked = savedPref === "1";
                CONFIG.autoRunOnLoad = savedPref === "1";
            }
        }

        const filterSelect = document.getElementById("pk-filter-mode");
        if (filterSelect) {
            let savedFilter = localStorage.getItem("pk_filter_mode") || "all";
            if (savedFilter === "unverified_only" && !localStorage.getItem("pk_filter_migrated_v2")) {
                savedFilter = "all";
                localStorage.setItem("pk_filter_mode", "all");
                localStorage.setItem("pk_filter_migrated_v2", "1");
            }
            filterSelect.value = savedFilter;
            filterSelect.addEventListener("change", (e) => {
                localStorage.setItem("pk_filter_mode", e.target.value);
                addLog(`Đã đổi chế độ hiển thị: ${e.target.options[e.target.selectedIndex].text}`, "info");
                if (CURRENT_SCANNED_ITEMS && CURRENT_SCANNED_ITEMS.length > 0) {
                    renderProductChecklist();
                } else {
                    loadAndRenderProducts();
                }
            });
        }

        // Nút Chọn hết / Bỏ chọn sản phẩm
        const selectAllBtn = document.getElementById("pk-btn-select-all");
        if (selectAllBtn) {
            selectAllBtn.addEventListener("click", () => {
                document.querySelectorAll(".pk-item-checkbox").forEach(chk => {
                    chk.checked = true;
                    const row = chk.closest(".pk-item-check-row");
                    if (row) row.classList.add("selected");
                });
                updateExecuteButtonCount();
            });
        }

        const deselectAllBtn = document.getElementById("pk-btn-deselect-all");
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener("click", () => {
                document.querySelectorAll(".pk-item-checkbox").forEach(chk => {
                    chk.checked = false;
                    const row = chk.closest(".pk-item-check-row");
                    if (row) row.classList.remove("selected");
                });
                updateExecuteButtonCount();
            });
        }

        const checkBtn = document.getElementById("pk-btn-check-only");
        if (checkBtn) {
            checkBtn.addEventListener("click", () => {
                checkActiveLotteryList();
            });
        }

        const runBtn = document.getElementById("pk-btn-execute");
        if (runBtn) {
            runBtn.addEventListener("click", () => {
                runBotProcess();
            });
        }

        hookResendButton();
    }

    // =========================================================================
    // KHỞI ĐỘNG HỆ THỐNG
    // =========================================================================

    async function init() {
        createWidget();
        await loadAccounts();

        const path = window.location.pathname.toLowerCase();

        // 1. Nếu đang ở trang đăng nhập
        if (path.includes("login") && !path.includes("mfa")) {
            const activeAcc = getActiveAccount();
            const shouldAutoLogin = localStorage.getItem("pk_auto_login") === "1";
            const hasRurl = window.location.search.includes('rurl=') || window.location.search.includes('redirect=');

            if (hasRurl) {
                addLog("🔄 Phát hiện đăng nhập từ trang Đặt hàng (Checkout). Sau khi đăng nhập website sẽ tự động quay lại đơn hàng.", "info");
            }

            // Tự động kiểm tra và chấm điểm Profile sau 1.2 giây
            setTimeout(async () => {
                const audit = await evaluateProfileTrustScore();
                updateTrustScoreUI(audit);
                logAuditSummary(audit);
            }, 1200);

            if (shouldAutoLogin && activeAcc) {
                // Đợi 3.5 giây cho F5 WAF & Gigya telemetry scripts khởi tạo xong
                addLog("⏳ Đợi 3.5 giây cho trang tải hoàn tất trước khi tự động đăng nhập...", "info");
                setTimeout(async () => {
                    const filled = await fillLoginForm(activeAcc);
                    if (filled) {
                        await new Promise(r => setTimeout(r, gaussianRandom(600, 150)));
                        await submitLoginForm();
                    }
                }, 3500);
            } else if (activeAcc) {
                addLog("Đã tải tài khoản. Bấm nút '🔑 TỰ ĐIỀN & BẤM ĐĂNG NHẬP' khi bạn sẵn sàng.", "info");
            }
        }
        // 2. Nếu đang ở trang nhập mã OTP
        else if (path.includes("mfa") || path.includes("passcode")) {
            hookResendButton();
            addLog("Đang ở trang xác thực OTP. Đang thử kết nối Gmail lấy mã sau 3 giây...", "info");
            setTimeout(() => {
                fetchOtpFromLocalServer(0, false);
            }, 3000);
        }
        // 3. Nếu đang ở trang Giỏ hàng (/cart/)
        else if (path.includes("/cart") || path.endsWith("/cart/")) {
            const shouldAutoCheckout = localStorage.getItem("pk_auto_checkout") === "1";
            if (shouldAutoCheckout) {
                addLog("⚡ Tự động đặt hàng đang BẬT. Sẽ tiến hành sang bước Checkout sau 2 giây...", "info");
                setTimeout(() => {
                    proceedCartToCheckout();
                }, 2000);
            } else {
                addLog("🛒 Đang ở trang Giỏ hàng. Bấm nút '🛒 TIẾN HÀNH ĐẶT HÀNG' khi sẵn sàng.", "info");
            }
        }
        // 4. Nếu đang ở trang Đặt hàng / Checkout (/order/ hoặc stage=...)
        else if (path.includes("/order") || window.location.search.includes("stage=")) {
            const stage = detectOrderStage();
            const stageLabels = {
                'shipping': '🚚 Bước 1: Địa chỉ giao hàng',
                'payment': '💳 Bước 2: Phương thức thanh toán',
                'placeOrder': '📦 Bước 3: Xác nhận & Chốt đơn',
                'complete': '🎉 Bước 4: Đặt hàng thành công',
                'unknown': 'Đang kiểm tra'
            };
            const stageEl = document.getElementById("pk-order-current-stage");
            if (stageEl) stageEl.textContent = stageLabels[stage] || stage;

            const shouldAutoSteps = localStorage.getItem("pk_auto_order_steps") !== "0"; // Mặc định bật
            if (stage === 'complete') {
                processOrderStep();
            } else if (shouldAutoSteps) {
                addLog(`⚡ Tự động xử lý [${stageLabels[stage] || stage}] sau 2 giây...`, "info");
                setTimeout(() => {
                    processOrderStep();
                }, 2000);
            } else {
                addLog(`Đang ở ${stageLabels[stage] || stage}. Bấm nút trên bảng bot để tiếp tục.`, "info");
            }
        }
        // 5. Nếu đang ở trang chi tiết sản phẩm (/product/ hoặc p_cd= hoặc kết thúc bằng mã số 10-14 chữ số .html)
        else if (path.includes("/product") || window.location.search.includes("p_cd=") || /\/\d{10,14}\.html/.test(path)) {
            const queueStr = localStorage.getItem("pk_winning_queue");
            const queueActive = localStorage.getItem("pk_auto_buy_queue_active") === "1";
            if (queueActive && queueStr) {
                try {
                    const queue = JSON.parse(queueStr);
                    const currentItem = queue[0] || {};
                    addLog(`⚡ HÀNG ĐỢI TỰ ĐỘNG MUA ĐANG CHẠY: [${currentItem.title || 'Sản phẩm trúng'}] (Còn ${queue.length} món)`, "warn");
                    addLog("🛒 Tự động bấm 'カートに入れる' (Thêm vào giỏ) sau 2.5 giây...", "info");
                    setTimeout(() => {
                        addToCartAndCheckout();
                    }, 2500);
                } catch(e) {
                    addLog("🛍️ Đang ở trang sản phẩm. Bấm 'THÊM VÀO GIỎ & ĐẶT HÀNG NGAY' để checkout nhanh.", "info");
                }
            } else {
                addLog("🛍️ Đang ở trang sản phẩm. Bấm 'THÊM VÀO GIỎ & ĐẶT HÀNG NGAY' để checkout nhanh.", "info");
            }
        }
        // 6. Nếu đang ở trang Lịch sử xổ số (/lottery-history/) hoặc MyPage (/mypage/)
        else if (path.includes("lottery-history") || path.includes("/mypage") || path.includes("history")) {
            const isLotteryHistory = path.includes("lottery-history");
            if (isLotteryHistory) {
                addLog("🏆 Đang ở trang Lịch sử xổ số (/lottery-history/).", "info");
            } else {
                addLog("👤 Đang ở trang MyPage. Bấm nút [📂 Đến trang /lottery-history/] để quét kết quả trúng.", "info");
            }
            updateActiveAccountUI();

            const queueStr = localStorage.getItem("pk_winning_queue");
            const queueActive = localStorage.getItem("pk_auto_buy_queue_active") === "1";

            if (isLotteryHistory) {
                if (queueActive && queueStr) {
                    try {
                        const queue = JSON.parse(queueStr);
                        if (queue.length > 0) {
                            addLog(`⚡ HÀNG ĐỢI TỰ MUA ĐANG CHẠY: Còn ${queue.length} sản phẩm cần mua!`, "warn");
                            addLog(`🚀 Tự động quét và bấm mua sản phẩm tiếp theo sau 2.5 giây...`, "info");
                            setTimeout(() => {
                                const winners = findWinningItemsOnPage();
                                if (winners.length > 0) {
                                    startSequentialAutoBuy(winners);
                                } else {
                                    addLog("⚠️ Không tìm thấy nút '注文へ進む' nào nữa. Có thể tất cả sản phẩm trúng đã được mua xong.", "info");
                                    localStorage.removeItem("pk_winning_queue");
                                    localStorage.removeItem("pk_auto_buy_queue_active");
                                }
                            }, 2500);
                            return;
                        }
                    } catch(e) {}
                }

                const autoBuy = localStorage.getItem("pk_auto_buy_on_win") === "1";
                // Tự động quét kết quả sau 2 giây khi mở lottery-history
                setTimeout(() => {
                    scanLotteryResults(autoBuy);
                }, 2000);
            }
        }
        // 7. Nếu đang ở trang nộp đơn xổ số
        else if (path.includes("lottery/apply.html")) {
            // Tải và hiển thị danh sách sản phẩm có checkbox để chọn ngay khi mở trang
            loadAndRenderProducts();

            const savedPref = localStorage.getItem("pk_auto_run");
            const shouldAutoRun = (savedPref === "1"); // Mặc định tắt để người dùng tích chọn trước

            if (shouldAutoRun) {
                addLog("Chế độ tự động đang BẬT. Bot sẽ tự nộp cho các mục đã chọn sau 3 giây...", "info");
                setTimeout(() => {
                    runBotProcess();
                }, 3000);
            } else {
                addLog("✨ Đã tải danh sách. Hãy tích chọn sản phẩm bạn muốn nộp đơn rồi bấm nút Nộp đơn.", "info");
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
