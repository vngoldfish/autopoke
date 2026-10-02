/**
 * Pokemon Center Lottery Automation - Content Script
 */

console.log("[PK-BOT] Content script loaded.");

// Lắng nghe message từ Popup Extension nếu người dùng bấm từ thanh công cụ
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "TRIGGER_RUN") {
        const btn = document.getElementById("pk-btn-execute");
        if (btn) {
            btn.click();
            sendResponse({ status: "STARTED" });
        } else {
            sendResponse({ status: "NOT_FOUND" });
        }
    }
});
