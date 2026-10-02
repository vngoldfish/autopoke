document.addEventListener("DOMContentLoaded", () => {
    const btnOpen = document.getElementById("btn-open-page");
    const btnRun = document.getElementById("btn-run-now");
    const statusMsg = document.getElementById("status-msg");

    const LOTTERY_URL = "https://www.pokemoncenter-online.com/lottery/apply.html";

    // Nút mở trang xổ số
    btnOpen.addEventListener("click", () => {
        chrome.tabs.create({ url: LOTTERY_URL });
    });

    // Nút kích hoạt quét ngay
    btnRun.addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url || !tab.url.includes("pokemoncenter-online.com/lottery")) {
            statusMsg.style.color = "#ffa502";
            statusMsg.textContent = "Vui lòng mở trang xổ số Pokemon trước!";
            return;
        }

        chrome.tabs.sendMessage(tab.id, { action: "TRIGGER_RUN" }, (response) => {
            if (chrome.runtime.lastError) {
                statusMsg.style.color = "#ff4757";
                statusMsg.textContent = "Hãy tải lại trang Pokemon để bot sẵn sàng.";
            } else {
                statusMsg.style.color = "#2ed573";
                statusMsg.textContent = "Đã gửi lệnh kích hoạt bot thành công!";
            }
        });
    });
});
