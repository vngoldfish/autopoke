/**
 * Pokémon Center Lottery & Checkout Bot - Popup Controller
 * Manages 3-Tab UI, persistent configuration, real-time sync with active tab,
 * and account profile switching.
 * Features: F-20, F-21, F-22
 */

document.addEventListener("DOMContentLoaded", () => {
    // =========================================================================
    // DOM REFERENCES
    // =========================================================================

    // Tabs
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");

    // Header & Status Card
    const headerConnBadge = document.getElementById("header-conn-badge");
    const badgeFsmState = document.getElementById("badge-fsm-state");
    const indicatorActiveStep = document.getElementById("indicator-active-step");
    const badgeQueueCount = document.getElementById("badge-queue-count");
    const activeAccountDisplay = document.getElementById("active-account-display");

    // Quick Command Buttons
    const btnCmdStart = document.getElementById("btn-cmd-start");
    const btnCmdPause = document.getElementById("btn-cmd-pause");
    const btnCmdSkip = document.getElementById("btn-cmd-skip");
    const btnCmdRetry = document.getElementById("btn-cmd-retry");

    // Navigation Links
    const btnLinkLottery = document.getElementById("btn-link-lottery");
    const btnLinkHistory = document.getElementById("btn-link-history");
    const btnLinkCart = document.getElementById("btn-link-cart");

    // Logs
    const recentLogBox = document.getElementById("recent-log-box");
    const btnClearLogs = document.getElementById("btn-clear-logs");

    // Config Toggles & Sliders
    const cfgAutoLogin = document.getElementById("cfg-auto-login");
    const cfgAutoScan = document.getElementById("cfg-auto-scan");
    const cfgSequentialBuy = document.getElementById("cfg-sequential-buy");
    const cfgAutoCheckout = document.getElementById("cfg-auto-checkout");
    const cfgSafePlaceOrder = document.getElementById("cfg-safe-place-order");
    const cfgPurgeCart = document.getElementById("cfg-purge-cart");
    const cfgDelayMean = document.getElementById("cfg-delay-mean");
    const valDelayMean = document.getElementById("val-delay-mean");
    const cfgDelayStddev = document.getElementById("cfg-delay-stddev");
    const valDelayStddev = document.getElementById("val-delay-stddev");
    const configToast = document.getElementById("config-toast");

    // Account Section
    const activeCardName = document.getElementById("active-card-name");
    const activeCardEmail = document.getElementById("active-card-email");
    const activeCardPwd = document.getElementById("active-card-pwd");
    const activeCardOtp = document.getElementById("active-card-otp");
    const selectAccountSwitcher = document.getElementById("select-account-switcher");
    const accTotalCount = document.getElementById("acc-total-count");
    const accountsCardList = document.getElementById("accounts-card-list");
    const btnToggleAddForm = document.getElementById("btn-toggle-add-form");
    const accountFormPanel = document.getElementById("account-form-panel");
    const formPanelTitle = document.getElementById("form-panel-title");
    const inputAccId = document.getElementById("input-acc-id");
    const inputAccName = document.getElementById("input-acc-name");
    const inputAccEmail = document.getElementById("input-acc-email");
    const inputAccPassword = document.getElementById("input-acc-password");
    const inputAccOtpEmail = document.getElementById("input-acc-otp-email");
    const inputAccAppPassword = document.getElementById("input-acc-app-password");
    const btnSaveAcc = document.getElementById("btn-save-acc");
    const btnCancelAcc = document.getElementById("btn-cancel-acc");
    const btnTogglePwds = document.querySelectorAll(".btn-toggle-pwd");

    // State Variables
    let currentAccounts = [];
    let currentActiveAccountId = null;
    let toastTimeout = null;

    const DEFAULT_ACCOUNTS = [
        {
            id: "acc_1",
            name: "tuanapplejp@gmail",
            pokemon_email: "tuanapplejp@gmail.com",
            pokemon_password: "••••••••",
            otp_email: "tuanapplejp@gmail.com",
            gmail_app_password: "•••• •••• •••• ••••",
            enabled: true
        }
    ];

    // STEP LABELS
    const STEP_NAMES = {
        1: "Bước 1/6: Đăng nhập",
        2: "Bước 2/6: Quét kết quả",
        3: "Bước 3/6: Giỏ hàng",
        4: "Bước 4/6: Địa chỉ nhận hàng",
        5: "Bước 5/6: Phương thức thanh toán",
        6: "Bước 6/6: Chốt đơn hàng"
    };

    // =========================================================================
    // 1. TAB SWITCHING
    // =========================================================================
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-tab");
            tabBtns.forEach(b => b.classList.remove("active"));
            tabPanes.forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.add("active");
            }
        });
    });

    // =========================================================================
    // 2. ACTIVE TAB COMMUNICATION HELPER
    // =========================================================================
    async function sendToActiveTab(message, callback) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) {
                if (callback) callback({ status: "NO_ACTIVE_TAB" });
                return;
            }

            chrome.tabs.sendMessage(tab.id, message, (response) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    if (callback) callback({ status: "TAB_UNREACHABLE", error: err.message });
                } else {
                    if (callback) callback(response || { status: "OK" });
                }
            });
        } catch (e) {
            if (callback) callback({ status: "ERROR", error: e.message });
        }
    }

    function showToast(msg) {
        if (!configToast) return;
        configToast.textContent = msg || "✓ Đã lưu cài đặt và đồng bộ";
        configToast.classList.remove("hidden");
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            configToast.classList.add("hidden");
        }, 2200);
    }

    // =========================================================================
    // 3. LOAD & SYNC CONFIGURATION (TAB 2)
    // =========================================================================
    const CONFIG_KEYS = [
        "pk_auto_login",
        "pk_auto_scan_lottery",
        "pk_auto_buy_queue_active",
        "pk_auto_order_steps",
        "pk_safe_place_order",
        "pk_cart_purge_on_conflict",
        "pk_delay_mean",
        "pk_delay_stddev"
    ];

    function loadConfigFromStorage() {
        chrome.storage.local.get(CONFIG_KEYS, (items) => {
            // Toggles (handle both "1"/true and "0"/false)
            cfgAutoLogin.checked = items.pk_auto_login === undefined ? true : (items.pk_auto_login === "1" || items.pk_auto_login === true);
            cfgAutoScan.checked = items.pk_auto_scan_lottery === undefined ? true : (items.pk_auto_scan_lottery === "1" || items.pk_auto_scan_lottery === true);
            cfgSequentialBuy.checked = items.pk_auto_buy_queue_active === undefined ? true : (items.pk_auto_buy_queue_active === "1" || items.pk_auto_buy_queue_active === true);
            cfgAutoCheckout.checked = items.pk_auto_order_steps === undefined ? true : (items.pk_auto_order_steps === "1" || items.pk_auto_order_steps === true);
            cfgSafePlaceOrder.checked = items.pk_safe_place_order === undefined ? true : (items.pk_safe_place_order === "1" || items.pk_safe_place_order === true);
            cfgPurgeCart.checked = items.pk_cart_purge_on_conflict === undefined ? false : (items.pk_cart_purge_on_conflict === "1" || items.pk_cart_purge_on_conflict === true);

            // Gaussian Delays
            const mean = typeof items.pk_delay_mean === "number" ? items.pk_delay_mean : 2000;
            const stddev = typeof items.pk_delay_stddev === "number" ? items.pk_delay_stddev : 500;
            cfgDelayMean.value = mean;
            valDelayMean.textContent = `${mean} ms`;
            cfgDelayStddev.value = stddev;
            valDelayStddev.textContent = `${stddev} ms`;
        });
    }

    function saveToggleConfig(key, value) {
        const payload = {};
        payload[key] = value ? "1" : "0";
        chrome.storage.local.set(payload, () => {
            sendToActiveTab({ action: "CONFIG_UPDATE", config: payload });
            showToast("✓ Đã lưu cài đặt và đồng bộ");
        });
    }

    // Bind change listeners to toggles
    cfgAutoLogin.addEventListener("change", (e) => saveToggleConfig("pk_auto_login", e.target.checked));
    cfgAutoScan.addEventListener("change", (e) => saveToggleConfig("pk_auto_scan_lottery", e.target.checked));
    cfgSequentialBuy.addEventListener("change", (e) => saveToggleConfig("pk_auto_buy_queue_active", e.target.checked));
    cfgAutoCheckout.addEventListener("change", (e) => saveToggleConfig("pk_auto_order_steps", e.target.checked));
    cfgSafePlaceOrder.addEventListener("change", (e) => saveToggleConfig("pk_safe_place_order", e.target.checked));
    cfgPurgeCart.addEventListener("change", (e) => saveToggleConfig("pk_cart_purge_on_conflict", e.target.checked));

    // Sliders
    cfgDelayMean.addEventListener("input", (e) => {
        valDelayMean.textContent = `${e.target.value} ms`;
    });
    cfgDelayMean.addEventListener("change", (e) => {
        const val = parseInt(e.target.value, 10);
        chrome.storage.local.set({ pk_delay_mean: val }, () => {
            sendToActiveTab({ action: "CONFIG_UPDATE", config: { pk_delay_mean: val } });
            showToast("✓ Đã lưu độ trễ trung bình");
        });
    });

    cfgDelayStddev.addEventListener("input", (e) => {
        valDelayStddev.textContent = `${e.target.value} ms`;
    });
    cfgDelayStddev.addEventListener("change", (e) => {
        const val = parseInt(e.target.value, 10);
        chrome.storage.local.set({ pk_delay_stddev: val }, () => {
            sendToActiveTab({ action: "CONFIG_UPDATE", config: { pk_delay_stddev: val } });
            showToast("✓ Đã lưu độ lệch chuẩn");
        });
    });

    // =========================================================================
    // 4. LIVE DASHBOARD & STATUS (TAB 1)
    // =========================================================================
    function updateFsmBadge(state) {
        if (!badgeFsmState) return;
        const normalized = (state || "STATE_IDLE").toUpperCase();
        badgeFsmState.className = "status-pill";

        if (normalized.includes("IDLE")) {
            badgeFsmState.classList.add("pill-idle");
            badgeFsmState.textContent = "IDLE (Nghỉ)";
        } else if (normalized.includes("PAUSED") || normalized.includes("ERROR_PAUSED")) {
            badgeFsmState.classList.add("pill-paused");
            badgeFsmState.textContent = "TẠM DỪNG (PAUSED)";
        } else if (normalized.includes("SECURITY") || normalized.includes("BLOCKED") || normalized.includes("WAF")) {
            badgeFsmState.classList.add("pill-danger");
            badgeFsmState.textContent = "⚠️ CHẶN BẢO MẬT";
        } else if (normalized.includes("SHIPPING") || normalized.includes("PAYMENT") || normalized.includes("PLACE_ORDER") || normalized.includes("LOGIN") || normalized.includes("SCAN")) {
            badgeFsmState.classList.add("pill-running");
            badgeFsmState.textContent = `🟢 ${normalized.replace("STATE_", "")}`;
        } else {
            badgeFsmState.classList.add("pill-running");
            badgeFsmState.textContent = normalized;
        }
    }

    function renderLogs(logs) {
        if (!recentLogBox) return;
        recentLogBox.innerHTML = "";
        if (!logs || !Array.isArray(logs) || logs.length === 0) {
            recentLogBox.innerHTML = '<div class="log-empty">Chưa có nhật ký ghi nhận...</div>';
            return;
        }

        logs.slice(-25).forEach(item => {
            const line = document.createElement("div");
            line.className = "log-row";
            const level = (item.level || "INFO").toLowerCase();
            const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "";

            const timeSpan = document.createElement("span");
            timeSpan.className = "log-time";
            timeSpan.textContent = `[${timeStr}]`;

            const tagSpan = document.createElement("span");
            tagSpan.className = `log-tag log-${level}`;
            tagSpan.textContent = (item.level || "INFO").toUpperCase();

            const msgSpan = document.createElement("span");
            msgSpan.className = "log-msg";
            msgSpan.textContent = item.message || "";

            line.appendChild(timeSpan);
            line.appendChild(document.createTextNode(" "));
            line.appendChild(tagSpan);
            line.appendChild(document.createTextNode(" "));
            line.appendChild(msgSpan);

            recentLogBox.appendChild(line);
        });

        recentLogBox.scrollTop = recentLogBox.scrollHeight;
    }

    function syncLiveStatus() {
        // First check storage
        chrome.storage.local.get([
            "pk_bot_state",
            "pk_fsm_current_state",
            "pk_current_step",
            "pk_winning_queue",
            "pk_active_account_id",
            "pk_recent_logs"
        ], (stored) => {
            if (stored.pk_bot_state) {
                updateFsmBadge(stored.pk_bot_state.state || stored.pk_fsm_current_state);
                const stepNum = stored.pk_bot_state.step || stored.pk_current_step || 1;
                indicatorActiveStep.textContent = STEP_NAMES[stepNum] || `Bước ${stepNum}/6`;
                const queue = stored.pk_bot_state.queue || stored.pk_winning_queue || [];
                badgeQueueCount.textContent = `${queue.length} sản phẩm`;
            } else if (stored.pk_fsm_current_state) {
                updateFsmBadge(stored.pk_fsm_current_state);
                const stepNum = stored.pk_current_step || 1;
                indicatorActiveStep.textContent = STEP_NAMES[stepNum] || `Bước ${stepNum}/6`;
                const queue = stored.pk_winning_queue || [];
                badgeQueueCount.textContent = `${queue.length} sản phẩm`;
            }

            if (stored.pk_recent_logs) {
                renderLogs(stored.pk_recent_logs);
            }
        });

        // Query active tab directly for real-time status
        sendToActiveTab({ action: "GET_STATUS" }, (response) => {
            if (response && response.status === "OK") {
                headerConnBadge.className = "badge badge-connected";
                headerConnBadge.textContent = "● Đã kết nối Web";

                if (response.botState) {
                    updateFsmBadge(response.botState.state);
                    const stepNum = response.botState.step || 1;
                    indicatorActiveStep.textContent = STEP_NAMES[stepNum] || `Bước ${stepNum}/6`;
                    const queue = response.botState.queue || [];
                    badgeQueueCount.textContent = `${queue.length} sản phẩm`;
                }

                if (response.logs && response.logs.length > 0) {
                    renderLogs(response.logs);
                }
            } else {
                headerConnBadge.className = "badge badge-idle";
                headerConnBadge.textContent = "● Tab chưa nạp bot";
            }
        });
    }

    // Quick Command Buttons Handlers
    function handleCommand(cmdName) {
        sendToActiveTab({ action: "COMMAND", command: cmdName }, (res) => {
            if (res && res.status === "SUCCESS") {
                showToast(`✓ Đã gửi lệnh ${cmdName}`);
            } else if (res && res.status === "TAB_UNREACHABLE") {
                showToast("⚠️ Vui lòng mở trang Pokémon Center");
            } else {
                showToast(`Đã gửi lệnh: ${cmdName}`);
            }
            setTimeout(syncLiveStatus, 400);
        });
    }

    btnCmdStart.addEventListener("click", () => handleCommand("START"));
    btnCmdPause.addEventListener("click", () => handleCommand("PAUSE"));
    btnCmdSkip.addEventListener("click", () => handleCommand("SKIP"));
    btnCmdRetry.addEventListener("click", () => handleCommand("RETRY"));

    // Quick Navigation Links
    btnLinkLottery.addEventListener("click", () => {
        chrome.tabs.create({ url: "https://www.pokemoncenter-online.com/lottery/apply.html" });
    });
    btnLinkHistory.addEventListener("click", () => {
        chrome.tabs.create({ url: "https://www.pokemoncenter-online.com/lottery-history/" });
    });
    btnLinkCart.addEventListener("click", () => {
        chrome.tabs.create({ url: "https://www.pokemoncenter-online.com/cart/" });
    });

    // Clear Logs
    btnClearLogs.addEventListener("click", () => {
        chrome.storage.local.set({ pk_recent_logs: [] }, () => {
            renderLogs([]);
            showToast("✓ Đã xóa nhật ký");
        });
    });

    // =========================================================================
    // 5. ACCOUNT PROFILE MANAGEMENT (TAB 3)
    // =========================================================================
    function maskString(str) {
        if (!str) return "••••••••";
        return "••••••••";
    }

    function renderAccountUI() {
        if (!currentAccounts || currentAccounts.length === 0) {
            currentAccounts = [...DEFAULT_ACCOUNTS];
        }

        if (!currentActiveAccountId || !currentAccounts.some(a => a.id === currentActiveAccountId)) {
            currentActiveAccountId = currentAccounts[0].id;
        }

        accTotalCount.textContent = currentAccounts.length;

        // 1. Populate Dropdown Switcher
        selectAccountSwitcher.innerHTML = "";
        currentAccounts.forEach(acc => {
            const opt = document.createElement("option");
            opt.value = acc.id;
            opt.textContent = `${acc.name} (${acc.pokemon_email})`;
            if (acc.id === currentActiveAccountId) {
                opt.selected = true;
            }
            selectAccountSwitcher.appendChild(opt);
        });

        // 2. Active Account Card
        const activeAcc = currentAccounts.find(a => a.id === currentActiveAccountId) || currentAccounts[0];
        if (activeAcc) {
            activeCardName.textContent = activeAcc.name || "Nick";
            activeCardEmail.textContent = activeAcc.pokemon_email || "-";
            activeCardPwd.textContent = maskString(activeAcc.pokemon_password);
            activeCardOtp.textContent = activeAcc.otp_email || activeAcc.pokemon_email || "-";
            if (activeAccountDisplay) {
                activeAccountDisplay.textContent = activeAcc.name || activeAcc.pokemon_email;
            }
        }

        // 3. Render Accounts List
        accountsCardList.innerHTML = "";
        currentAccounts.forEach(acc => {
            const isAct = acc.id === currentActiveAccountId;
            const item = document.createElement("div");
            item.className = `acc-item-card ${isAct ? "acc-item-active" : ""}`;

            item.innerHTML = `
                <div class="acc-item-main">
                    <div class="acc-item-title-row">
                        <strong class="acc-item-name">${acc.name || "Nick"}</strong>
                        ${isAct ? '<span class="acc-badge-active">ĐANG DÙNG</span>' : ""}
                    </div>
                    <div class="acc-item-email">${acc.pokemon_email}</div>
                    <div class="acc-item-meta">
                        <span>OTP: ${acc.otp_email || acc.pokemon_email}</span>
                        <span>Mật khẩu: ${maskString(acc.pokemon_password)}</span>
                    </div>
                </div>
                <div class="acc-item-actions">
                    ${!isAct ? `<button class="btn btn-primary btn-xs btn-set-active" data-id="${acc.id}">Chọn</button>` : ""}
                    <button class="btn btn-secondary btn-xs btn-edit-acc" data-id="${acc.id}">Sửa</button>
                    ${currentAccounts.length > 1 ? `<button class="btn btn-danger btn-xs btn-del-acc" data-id="${acc.id}">Xóa</button>` : ""}
                </div>
            `;
            accountsCardList.appendChild(item);
        });

        // Bind item actions
        accountsCardList.querySelectorAll(".btn-set-active").forEach(b => {
            b.addEventListener("click", () => switchActiveAccount(b.getAttribute("data-id")));
        });

        accountsCardList.querySelectorAll(".btn-edit-acc").forEach(b => {
            b.addEventListener("click", () => openEditAccountForm(b.getAttribute("data-id")));
        });

        accountsCardList.querySelectorAll(".btn-del-acc").forEach(b => {
            b.addEventListener("click", () => deleteAccount(b.getAttribute("data-id")));
        });
    }

    function switchActiveAccount(accId) {
        if (!accId) return;
        currentActiveAccountId = accId;
        chrome.storage.local.set({ pk_active_account_id: accId }, () => {
            sendToActiveTab({ action: "SET_ACTIVE_ACCOUNT", accountId: accId });
            renderAccountUI();
            showToast("✓ Đã chuyển tài khoản hoạt động");
        });
    }

    selectAccountSwitcher.addEventListener("change", (e) => {
        switchActiveAccount(e.target.value);
    });

    // Toggle Form visibility
    btnToggleAddForm.addEventListener("click", () => {
        formPanelTitle.textContent = "Thêm tài khoản mới";
        inputAccId.value = "";
        inputAccName.value = "";
        inputAccEmail.value = "";
        inputAccPassword.value = "";
        inputAccOtpEmail.value = "";
        inputAccAppPassword.value = "";
        accountFormPanel.classList.toggle("hidden");
    });

    btnCancelAcc.addEventListener("click", () => {
        accountFormPanel.classList.add("hidden");
    });

    // Show/Hide Password Eye toggles
    btnTogglePwds.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                if (targetInput.type === "password") {
                    targetInput.type = "text";
                    btn.textContent = "🙈";
                } else {
                    targetInput.type = "password";
                    btn.textContent = "👁";
                }
            }
        });
    });

    // Save Account Form
    btnSaveAcc.addEventListener("click", () => {
        const idVal = inputAccId.value.trim();
        const nameVal = inputAccName.value.trim() || `Nick_${currentAccounts.length + 1}`;
        const emailVal = inputAccEmail.value.trim();
        const pwdVal = inputAccPassword.value.trim();
        const otpEmailVal = inputAccOtpEmail.value.trim() || emailVal;
        const appPwdVal = inputAccAppPassword.value.trim();

        if (!emailVal) {
            alert("Vui lòng nhập Email Pokémon Center!");
            return;
        }

        if (idVal) {
            // Edit existing
            const target = currentAccounts.find(a => a.id === idVal);
            if (target) {
                target.name = nameVal;
                target.pokemon_email = emailVal;
                if (pwdVal && pwdVal !== "••••••••") target.pokemon_password = pwdVal;
                target.otp_email = otpEmailVal;
                if (appPwdVal && appPwdVal !== "•••• •••• •••• ••••") target.gmail_app_password = appPwdVal;
            }
        } else {
            // Add new
            const newAcc = {
                id: `acc_${Date.now()}`,
                name: nameVal,
                pokemon_email: emailVal,
                pokemon_password: pwdVal || "",
                otp_email: otpEmailVal,
                gmail_app_password: appPwdVal || "",
                enabled: true
            };
            currentAccounts.push(newAcc);
            if (!currentActiveAccountId) {
                currentActiveAccountId = newAcc.id;
            }
        }

        // Persist to storage
        chrome.storage.local.set({
            pk_accounts: currentAccounts,
            pk_active_account_id: currentActiveAccountId
        }, () => {
            sendToActiveTab({
                action: "CONFIG_UPDATE",
                config: {
                    pk_accounts: currentAccounts,
                    pk_active_account_id: currentActiveAccountId
                }
            });
            accountFormPanel.classList.add("hidden");
            renderAccountUI();
            showToast("✓ Đã lưu danh sách tài khoản");
        });
    });

    function openEditAccountForm(accId) {
        const acc = currentAccounts.find(a => a.id === accId);
        if (!acc) return;

        formPanelTitle.textContent = "Chỉnh sửa tài khoản";
        inputAccId.value = acc.id;
        inputAccName.value = acc.name || "";
        inputAccEmail.value = acc.pokemon_email || "";
        inputAccPassword.value = acc.pokemon_password || "";
        inputAccOtpEmail.value = acc.otp_email || "";
        inputAccAppPassword.value = acc.gmail_app_password || "";
        accountFormPanel.classList.remove("hidden");
    }

    function deleteAccount(accId) {
        if (!confirm("Bạn có chắc chắn muốn xóa tài khoản này?")) return;
        currentAccounts = currentAccounts.filter(a => a.id !== accId);
        if (currentActiveAccountId === accId && currentAccounts.length > 0) {
            currentActiveAccountId = currentAccounts[0].id;
        }

        chrome.storage.local.set({
            pk_accounts: currentAccounts,
            pk_active_account_id: currentActiveAccountId
        }, () => {
            sendToActiveTab({
                action: "CONFIG_UPDATE",
                config: {
                    pk_accounts: currentAccounts,
                    pk_active_account_id: currentActiveAccountId
                }
            });
            renderAccountUI();
            showToast("✓ Đã xóa tài khoản");
        });
    }

    function loadAccountsFromStorage() {
        chrome.storage.local.get(["pk_accounts", "pk_active_account_id"], (data) => {
            if (data.pk_accounts && Array.isArray(data.pk_accounts) && data.pk_accounts.length > 0) {
                currentAccounts = data.pk_accounts;
            } else {
                currentAccounts = [...DEFAULT_ACCOUNTS];
                chrome.storage.local.set({ pk_accounts: currentAccounts });
            }

            if (data.pk_active_account_id) {
                currentActiveAccountId = data.pk_active_account_id;
            } else if (currentAccounts.length > 0) {
                currentActiveAccountId = currentAccounts[0].id;
                chrome.storage.local.set({ pk_active_account_id: currentActiveAccountId });
            }

            renderAccountUI();
        });
    }

    // =========================================================================
    // 6. STORAGE CHANGE LISTENER (REAL-TIME POPUP UPDATES)
    // =========================================================================
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local") {
            if (changes.pk_bot_state || changes.pk_fsm_current_state || changes.pk_current_step || changes.pk_winning_queue) {
                syncLiveStatus();
            }
            if (changes.pk_recent_logs) {
                renderLogs(changes.pk_recent_logs.newValue);
            }
            if (changes.pk_accounts) {
                currentAccounts = changes.pk_accounts.newValue || [];
                renderAccountUI();
            }
            if (changes.pk_active_account_id) {
                currentActiveAccountId = changes.pk_active_account_id.newValue;
                renderAccountUI();
            }
        }
    });

    // =========================================================================
    // 7. INITIALIZE POPUP
    // =========================================================================
    loadConfigFromStorage();
    loadAccountsFromStorage();
    syncLiveStatus();
});
