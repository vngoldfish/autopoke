/**
 * Pokemon Center Lottery Automation - Page Script (World: MAIN)
 * Tự động hóa đăng nhập, lấy OTP từ Gmail theo từng nick, và đăng ký xổ số Pokémon Center Online Japan
 */

(function () {
    console.log("[PK-BOT] Page script initialized in MAIN world.");

    const CONFIG = {
        autoRunOnLoad: true,        // Tự động nộp đơn khi vào apply.html
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
        return document.querySelector('#loginId') ||
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
        return document.querySelector('#password') ||
               document.querySelector('input[name="password"]') ||
               document.querySelector('input[type="password"]') ||
               document.querySelector('input[placeholder*="パスワード"]');
    }

    function findLoginSubmitButton() {
        return document.querySelector('#loginBtn') ||
               document.querySelector('.loginBtn') ||
               document.querySelector('button[type="submit"]') ||
               document.querySelector('input[type="submit"]') ||
               document.querySelector('a.comBtn01') ||
               Array.from(document.querySelectorAll('button, input[type="submit"], a')).find(b => {
                   if (b.closest('#pk-auto-bot-container')) return false;
                   const txt = (b.textContent || b.value || '').trim();
                   return txt.includes('ログイン') || txt.includes('Sign In');
               });
    }

    function fillLoginForm(acc) {
        if (!acc) return false;
        const emailInput = findLoginEmailInput();
        const pwdInput = findLoginPasswordInput();

        if (!emailInput || !pwdInput) {
            addLog("Chưa tìm thấy form đăng nhập trên màn hình.", "warn");
            return false;
        }

        addLog(`Đang tự điền Email và Mật khẩu cho [${acc.name || acc.pokemon_email}]...`, "info");

        // Điền email
        emailInput.focus();
        try {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            setter.call(emailInput, acc.pokemon_email || "");
        } catch (e) {
            emailInput.value = acc.pokemon_email || "";
        }
        emailInput.value = acc.pokemon_email || "";
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Điền password
        pwdInput.focus();
        try {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            setter.call(pwdInput, acc.pokemon_password || "");
        } catch (e) {
            pwdInput.value = acc.pokemon_password || "";
        }
        pwdInput.value = acc.pokemon_password || "";
        pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
        pwdInput.dispatchEvent(new Event('change', { bubbles: true }));

        if (window.$) {
            try {
                window.$(emailInput).val(acc.pokemon_email || "").trigger('input').trigger('change');
                window.$(pwdInput).val(acc.pokemon_password || "").trigger('input').trigger('change');
            } catch (e) {}
        }

        addLog(`Đã điền xong Email & Mật khẩu của [${acc.name || acc.pokemon_email}]!`, "success");
        return true;
    }

    function submitLoginForm() {
        const btn = findLoginSubmitButton();
        if (btn) {
            addLog(`Đang tự động bấm nút Đăng nhập: "${(btn.textContent || btn.value || '').trim()}"...`, "info");
            btn.focus();
            btn.click();
            if (window.$) {
                try { window.$(btn).trigger('click'); } catch (e) {}
            }
            addLog("Đã gửi yêu cầu đăng nhập! Đang chờ chuyển hướng...", "success");
        } else {
            addLog("Đã điền xong! Vui lòng bấm nút 'ログイン' trên màn hình.", "warn");
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

    async function runBotProcess() {
        const runBtn = document.getElementById("pk-btn-execute");
        if (runBtn) runBtn.disabled = true;

        addLog("Bắt đầu quy trình kiểm tra và đăng ký xổ số...", "info");

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

            try {
                const payload = JSON.parse(atob(jwt.split(".")[1]));
                const emailSpan = document.getElementById("pk-user-email");
                if (emailSpan && payload.email) {
                    emailSpan.textContent = payload.email;
                }
            } catch (e) {}

            addLog("Đang tải danh sách các sản phẩm xổ số...", "info");
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
                if (runBtn) runBtn.disabled = false;
                return;
            }

            const json = await listRes.json();
            const items = json.data || [];
            addLog(`Hệ thống tìm thấy ${items.length} bộ sản phẩm bốc thăm.`, "info");

            const toApplyList = [];
            let appliedCount = 0;
            const alreadyAppliedList = [];
            let endedCount = 0;
            let notStartedCount = 0;

            const filterMode = localStorage.getItem("pk_filter_mode") || "unverified_only";
            addLog(`Bộ lọc đang chọn: ${filterMode === "unverified_only" ? "Chỉ [本人未認証枠]" : (filterMode === "verified_only" ? "Chỉ [本人認証済み枠]" : "Tất cả các khung")}`, "info");

            for (const grp of items) {
                const groupTitle = grp.lotteryTitle || grp.lotteryGroupTitle || "Không rõ tên";
                const isUnverifiedFrame = groupTitle.includes("【本人未認証枠】") || groupTitle.includes("本人未認証枠");
                const isVerifiedFrame = groupTitle.includes("【本人認証済み枠】") || groupTitle.includes("本人認証済み枠");

                if (filterMode === "unverified_only" && !isUnverifiedFrame) {
                    continue;
                } else if (filterMode === "verified_only" && !isVerifiedFrame) {
                    continue;
                }

                // Trạng thái theo API Pokémon Center:
                // "20": 受付前 (chưa mở)
                // "30": 受付中 (đang mở đăng ký)
                // "40": 受付完了 (đã nộp đơn thành công trước đó)
                // "50": 受付終了 (đã hết hạn)
                const grpStatus = String(grp.applicationStatus || grp.status || "");
                const applicationItems = grp.applicationItems || grp.itemPrizeList || [];

                // Kiểm tra xem nhóm sản phẩm này đã được nộp chưa
                const isAlreadyApplied = grpStatus === "40" || applicationItems.some(it => it.applicationSelectedFlg === "1");

                if (isAlreadyApplied) {
                    appliedCount++;
                    alreadyAppliedList.push(groupTitle);
                    addLog(`[Đã nộp trước đó]: ${groupTitle}`, "info");
                } else if (grpStatus === "30") {
                    // Đang mở và chưa nộp
                    for (const item of applicationItems) {
                        const prizeId = item.itemPrizeId || item.prizeId;
                        const prizeName = item.itemPrizeName || "";
                        const fullTitle = `${groupTitle}${prizeName ? ' - ' + prizeName : ''}`;
                        toApplyList.push({
                            groupId: grp.lotteryGroupId,
                            prizeId: prizeId,
                            title: fullTitle
                        });
                        addLog(`[Sẵn sàng nộp]: ${fullTitle}`, "info");
                    }
                } else if (grpStatus === "20") {
                    notStartedCount++;
                } else if (grpStatus === "50") {
                    endedCount++;
                }
            }

            const openSpan = document.getElementById("pk-open-count");
            const appliedSpan = document.getElementById("pk-applied-count");
            if (openSpan) openSpan.textContent = toApplyList.length;
            if (appliedSpan) appliedSpan.textContent = appliedCount;

            if (toApplyList.length === 0) {
                if (appliedCount > 0) {
                    addLog(`Tài khoản này ĐÃ ĐĂNG KÝ XONG ${appliedCount} giải phù hợp trước đó! Không còn giải nào chưa nộp. Hoàn thành!`, "success");
                    if (alreadyAppliedList.length > 0) {
                        addLog(`📋 DANH SÁCH GIẢI ĐÃ NỘP TRƯỚC ĐÓ:`, "info");
                        alreadyAppliedList.forEach((name, idx) => {
                            addLog(`  ✔ [${idx + 1}] ${name}`, "info");
                        });
                    }
                } else {
                    addLog(`Không tìm thấy sản phẩm nào đang mở nhận đơn (受付中) phù hợp với bộ lọc. Hoàn thành!`, "warn");
                }
                if (runBtn) runBtn.disabled = false;
                return;
            }

            addLog(`Đang bắt đầu nộp đơn cho ${toApplyList.length} sản phẩm hợp lệ...`, "info");
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

            // Cập nhật số đếm trên giao diện ngay lập tức
            const finalApplied = appliedCount + successCount;
            const finalRemain = Math.max(0, toApplyList.length - successCount);
            if (openSpan) openSpan.textContent = finalRemain;
            if (appliedSpan) appliedSpan.textContent = finalApplied;

            addLog(`--------------------------------------------------`, "info");
            addLog(`🎉 HOÀN THÀNH: Đã đăng ký thành công ${successCount}/${toApplyList.length} giải vừa nộp!`, "success");

            if (justAppliedList.length > 0) {
                addLog(`📋 KẾT QUẢ VỪA NỘP THÀNH CÔNG (${justAppliedList.length} giải):`, "success");
                justAppliedList.forEach((name, idx) => {
                    addLog(`  ✅ [${idx + 1}] ${name}`, "success");
                });
            }

            if (alreadyAppliedList.length > 0) {
                addLog(`ℹ️ CÁC GIẢI ĐÃ NỘP TRƯỚC ĐÓ (${alreadyAppliedList.length} giải):`, "info");
                alreadyAppliedList.forEach((name, idx) => {
                    addLog(`  ✔ [${idx + 1}] ${name}`, "info");
                });
            }
            addLog(`✨ Đã nộp xong toàn bộ. Không tải lại trang để bạn kiểm tra kết quả!`, "success");

        } catch (err) {
            addLog(`Lỗi xử lý: ${err.message}`, "err");
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }

    // =========================================================================
    // KHỞI TẠO FLOATING WIDGET GIAO DIỆN
    // =========================================================================

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
                    <div id="pk-bot-logs"></div>
                ` : `
                    <!-- GIAO DIỆN TRANG XỔ SỐ APPLY.HTML -->
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
                    <div style="margin-top: 4px;">
                        <a href="https://www.pokemoncenter-online.com/login/" style="display: block; text-align: center; font-size: 11px; color: #a4b0be; text-decoration: underline;">Đăng xuất / Chuyển tài khoản khác</a>
                    </div>
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

        // Xử lý trang Đăng nhập
        const btnDoLogin = document.getElementById("pk-btn-do-login");
        if (btnDoLogin) {
            btnDoLogin.addEventListener("click", () => {
                const acc = getActiveAccount();
                if (fillLoginForm(acc)) {
                    setTimeout(() => {
                        submitLoginForm();
                    }, 500);
                }
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
            const savedFilter = localStorage.getItem("pk_filter_mode") || "unverified_only";
            filterSelect.value = savedFilter;
            filterSelect.addEventListener("change", (e) => {
                localStorage.setItem("pk_filter_mode", e.target.value);
                addLog(`Đã đổi bộ lọc: ${e.target.options[e.target.selectedIndex].text}`, "info");
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

            setTimeout(() => {
                if (fillLoginForm(activeAcc) && shouldAutoLogin) {
                    addLog("Tự động đăng nhập sau 1.5 giây...", "info");
                    setTimeout(() => {
                        submitLoginForm();
                    }, 1500);
                }
            }, 800);
        }
        // 2. Nếu đang ở trang nhập mã OTP
        else if (path.includes("mfa") || path.includes("passcode")) {
            hookResendButton();
            addLog("Đang ở trang xác thực OTP. Đang thử kết nối Gmail lấy mã sau 3 giây...", "info");
            setTimeout(() => {
                fetchOtpFromLocalServer(0, false);
            }, 3000);
        }
        // 3. Nếu đang ở trang nộp đơn xổ số
        else if (path.includes("lottery/apply.html")) {
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
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
