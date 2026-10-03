/**
 * Pokemon Center Lottery Automation - Content Script (World: ISOLATED)
 * Cross-World Storage Bridge & Popup Communication Relay
 * Features: F-17 (Main-to-Isolated Bridge), F-18 (Storage Synchronization)
 */

(function () {
    console.log("[PK-BOT-BRIDGE] Isolated world content script loaded.");

    // Memory buffer for state & logs
    let currentBotState = {
        state: "STATE_IDLE",
        step: 1,
        queue: [],
        activeAccount: null,
        timestamp: Date.now()
    };
    const logBuffer = [];
    let logSaveTimeout = null;

    // Helper: Debounced saving of recent logs to chrome.storage.local
    function scheduleSaveLogs() {
        if (logSaveTimeout) clearTimeout(logSaveTimeout);
        logSaveTimeout = setTimeout(() => {
            try {
                if (chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({
                        pk_recent_logs: logBuffer.slice(-50)
                    }, () => {
                        if (chrome.runtime.lastError) {
                            // ignore storage write errors
                        }
                    });
                }
            } catch (err) {
                console.warn("[PK-BOT-BRIDGE] Failed to save logs to storage:", err);
            }
        }, 500);
    }

    // =========================================================================
    // 1. CROSS-WORLD BRIDGE: LISTEN FOR MESSAGES FROM PAGE_SCRIPT.JS (MAIN WORLD)
    // =========================================================================
    window.addEventListener("message", (event) => {
        // Accept messages from the current window
        if (!event || event.source !== window || !event.data || typeof event.data !== "object") {
            return;
        }

        const { type, payload } = event.data;
        if (!type || typeof type !== "string" || !type.startsWith("PK_BOT_")) {
            return;
        }

        switch (type) {
            case "PK_BOT_STORAGE_SET": {
                // Save key/value pairs to chrome.storage.local
                if (payload) {
                    let toSet = {};
                    if (typeof payload.key === "string") {
                        toSet[payload.key] = payload.value;
                    } else if (typeof payload === "object") {
                        toSet = { ...payload };
                    }

                    if (Object.keys(toSet).length > 0) {
                        try {
                            chrome.storage.local.set(toSet, () => {
                                if (chrome.runtime.lastError) {
                                    console.error("[PK-BOT-BRIDGE] chrome.storage.local.set error:", chrome.runtime.lastError);
                                }
                            });
                        } catch (err) {
                            console.error("[PK-BOT-BRIDGE] Failed writing to chrome.storage.local:", err);
                        }
                    }
                }
                break;
            }

            case "PK_BOT_STORAGE_GET": {
                // Read from chrome.storage.local and post back PK_BOT_STORAGE_DATA
                if (payload && payload.key) {
                    const reqKey = payload.key;
                    try {
                        chrome.storage.local.get([reqKey], (result) => {
                            const val = (result && result[reqKey] !== undefined) ? result[reqKey] : null;
                            window.postMessage({
                                type: "PK_BOT_STORAGE_DATA",
                                payload: {
                                    key: reqKey,
                                    value: val,
                                    requestId: payload.requestId || null
                                }
                            }, "*");
                        });
                    } catch (err) {
                        console.error("[PK-BOT-BRIDGE] Failed reading from chrome.storage.local:", err);
                    }
                }
                break;
            }

            case "PK_BOT_STATE_UPDATE": {
                // Save state to chrome.storage.local
                if (payload && typeof payload === "object") {
                    currentBotState = {
                        state: payload.state || currentBotState.state,
                        step: typeof payload.step === "number" ? payload.step : currentBotState.step,
                        queue: Array.isArray(payload.queue) ? payload.queue : currentBotState.queue,
                        activeAccount: payload.activeAccount !== undefined ? payload.activeAccount : currentBotState.activeAccount,
                        timestamp: Date.now()
                    };

                    const storagePayload = {
                        pk_bot_state: currentBotState,
                        pk_fsm_current_state: currentBotState.state,
                        pk_current_step: currentBotState.step,
                        pk_winning_queue: currentBotState.queue,
                        pk_active_account_id: currentBotState.activeAccount,
                        pk_last_state_update: Date.now()
                    };

                    try {
                        chrome.storage.local.set(storagePayload, () => {
                            if (chrome.runtime.lastError) {
                                console.error("[PK-BOT-BRIDGE] Failed updating state in storage:", chrome.runtime.lastError);
                            }
                        });
                    } catch (err) {
                        console.error("[PK-BOT-BRIDGE] State update storage exception:", err);
                    }
                }
                break;
            }

            case "PK_BOT_LOG": {
                // Relay or buffer logs
                if (payload && typeof payload === "object") {
                    const logEntry = {
                        level: (payload.level || "INFO").toUpperCase(),
                        message: payload.message || "",
                        timestamp: payload.timestamp || Date.now()
                    };
                    logBuffer.push(logEntry);
                    if (logBuffer.length > 100) {
                        logBuffer.shift();
                    }
                    scheduleSaveLogs();
                }
                break;
            }

            default:
                break;
        }
    });

    // =========================================================================
    // 2. POPUP COMMUNICATION: LISTEN FOR MESSAGES FROM POPUP.JS
    // =========================================================================
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!request || typeof request !== "object") {
            return;
        }

        const action = request.action || request.type;

        // Legacy trigger
        if (action === "TRIGGER_RUN") {
            const btn = document.getElementById("pk-btn-execute");
            if (btn) {
                btn.click();
            }
            window.postMessage({
                type: "PK_BOT_COMMAND",
                payload: { command: "START" }
            }, "*");
            sendResponse({ status: "STARTED" });
            return;
        }

        // Direct command dispatch (START, PAUSE, RESUME, SKIP, RETRY, RESET)
        if (action === "COMMAND" && request.command) {
            const cmd = request.command.toUpperCase();
            if (cmd === "START") {
                const btn = document.getElementById("pk-btn-execute");
                if (btn) btn.click();
            }
            window.postMessage({
                type: "PK_BOT_COMMAND",
                payload: { command: cmd }
            }, "*");
            sendResponse({ status: "SUCCESS", command: cmd });
            return;
        }

        // Config update from Popup
        if (action === "CONFIG_UPDATE" && request.config) {
            try {
                chrome.storage.local.set(request.config, () => {
                    window.postMessage({
                        type: "PK_BOT_CONFIG_UPDATE",
                        payload: { config: request.config }
                    }, "*");
                    sendResponse({ status: "SUCCESS" });
                });
            } catch (err) {
                sendResponse({ status: "ERROR", error: err.message });
            }
            return true; // Keep message channel open for async response
        }

        // Active account switcher
        if (action === "SET_ACTIVE_ACCOUNT" && request.accountId) {
            try {
                chrome.storage.local.set({ pk_active_account_id: request.accountId }, () => {
                    window.postMessage({
                        type: "PK_BOT_COMMAND",
                        payload: { command: "SWITCH_ACCOUNT", accountId: request.accountId }
                    }, "*");
                    window.postMessage({
                        type: "PK_BOT_CONFIG_UPDATE",
                        payload: { config: { pk_active_account_id: request.accountId } }
                    }, "*");
                    sendResponse({ status: "SUCCESS", accountId: request.accountId });
                });
            } catch (err) {
                sendResponse({ status: "ERROR", error: err.message });
            }
            return true;
        }

        // Get status and live logs
        if (action === "GET_STATUS") {
            sendResponse({
                status: "OK",
                botState: currentBotState,
                logs: logBuffer.slice(-30),
                url: window.location.href,
                title: document.title
            });
            return;
        }
    });

    // =========================================================================
    // 3. STORAGE CHANGE OBSERVER: SYNC POPUP CHANGES TO MAIN WORLD IN REAL TIME
    // =========================================================================
    try {
        if (chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName === "local") {
                    const updated = {};
                    for (const [key, { newValue }] of Object.entries(changes)) {
                        updated[key] = newValue;
                    }
                    if (Object.keys(updated).length > 0) {
                        window.postMessage({
                            type: "PK_BOT_CONFIG_UPDATE",
                            payload: { config: updated }
                        }, "*");
                    }
                }
            });
        }
    } catch (e) {
        console.warn("[PK-BOT-BRIDGE] chrome.storage.onChanged not available:", e);
    }

    // =========================================================================
    // 4. INITIALIZATION: SYNC STORED CONFIG TO PAGE_SCRIPT.JS ON LOAD
    // =========================================================================
    try {
        if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(null, (items) => {
                if (items && Object.keys(items).length > 0) {
                    window.postMessage({
                        type: "PK_BOT_CONFIG_UPDATE",
                        payload: { config: items }
                    }, "*");
                    if (items.pk_bot_state) {
                        currentBotState = { ...currentBotState, ...items.pk_bot_state };
                    }
                }
                // Notify that the bridge is ready
                window.postMessage({
                    type: "PK_BOT_BRIDGE_READY",
                    payload: { timestamp: Date.now() }
                }, "*");
            });
        }
    } catch (e) {
        console.warn("[PK-BOT-BRIDGE] Failed initial storage sync:", e);
    }
})();
