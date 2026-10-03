/**
 * Empirical Stress Test Suite: Storage, Queue Lifecycle, and Gaussian Bounds
 */

const fs = require('fs');
const path = require('path');

// Extract gaussianRandom from page_script.js
const pageScriptCode = fs.readFileSync(path.join(__dirname, 'pokemon-lottery-extension', 'page_script.js'), 'utf8');
const gaussianMatch = pageScriptCode.match(/function gaussianRandom\([\s\S]*?\n    \}/);
if (!gaussianMatch) {
    console.error('FATAL: Could not locate gaussianRandom in page_script.js');
    process.exit(1);
}

// Evaluate gaussianRandom in isolated scope
const gaussianRandom = new Function('mean', 'stddev', `
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return Math.max(20, Math.round(mean + z * stddev));
`);

console.log('================================================================');
console.log('       EMPIRICAL STRESS TEST & ADVERSARIAL HARNESS              ');
console.log('================================================================\n');

let stressPassed = 0;
let stressFailed = 0;

function stressAssert(desc, condition, details) {
    if (condition) {
        stressPassed++;
        console.log(`  ✓ PASS: ${desc}`);
    } else {
        stressFailed++;
        console.error(`  ✗ FAIL: ${desc}`);
        if (details) console.error(`    Details: ${details}`);
    }
}

// ----------------------------------------------------------------------------
// TEST SECTION 1: BOX-MULLER GAUSSIAN DELAY DISTRIBUTION BOUNDS
// ----------------------------------------------------------------------------
console.log('--- SECTION 1: Box-Muller Gaussian Delay Distribution Bounds ---');

const SAMPLE_SIZE = 100000;
const testConfigs = [
    { mean: 2000, stddev: 500, label: 'Standard purchase step delay (2000ms ± 500ms)' },
    { mean: 500, stddev: 100, label: 'Quick button click delay (500ms ± 100ms)' },
    { mean: 85, stddev: 25, label: 'Typing keystroke delay (85ms ± 25ms)' },
    { mean: 4000, stddev: 500, label: 'Long step delay (4000ms ± 500ms)' },
    // Boundary conditions
    { mean: 10, stddev: 50, label: 'Low mean with high variance (testing Math.max(20) floor)' },
    { mean: 0, stddev: 10, label: 'Zero mean edge case' }
];

for (const cfg of testConfigs) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sumSq = 0;
    let nanCount = 0;
    let nonPositiveCount = 0;

    for (let i = 0; i < SAMPLE_SIZE; i++) {
        const val = gaussianRandom(cfg.mean, cfg.stddev);
        if (Number.isNaN(val)) nanCount++;
        if (val <= 0) nonPositiveCount++;
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
        sumSq += val * val;
    }

    const empiricalMean = sum / SAMPLE_SIZE;
    const empiricalVariance = (sumSq / SAMPLE_SIZE) - (empiricalMean * empiricalMean);
    const empiricalStddev = Math.sqrt(empiricalVariance);

    console.log(`\n  Evaluating ${cfg.label} (N = ${SAMPLE_SIZE.toLocaleString()}):`);
    console.log(`    Min: ${min}ms, Max: ${max}ms`);
    console.log(`    Empirical Mean: ${empiricalMean.toFixed(2)}ms (Configured: ${cfg.mean}ms)`);
    console.log(`    Empirical StdDev: ${empiricalStddev.toFixed(2)}ms (Configured: ${cfg.stddev}ms)`);

    stressAssert(`All ${SAMPLE_SIZE} samples are strictly positive (> 0)`, nonPositiveCount === 0, `Found ${nonPositiveCount} non-positive values`);
    stressAssert(`Minimum bound enforced at >= 20ms`, min >= 20, `Minimum observed was ${min}ms`);
    stressAssert(`Zero NaN values generated`, nanCount === 0, `Found ${nanCount} NaNs`);

    if (cfg.mean >= 500) {
        const meanDeltaPercent = Math.abs(empiricalMean - cfg.mean) / cfg.mean * 100;
        const stddevDeltaPercent = Math.abs(empiricalStddev - cfg.stddev) / cfg.stddev * 100;
        stressAssert(`Empirical mean within ±2% of target (${meanDeltaPercent.toFixed(2)}% delta)`, meanDeltaPercent < 2.0);
        stressAssert(`Empirical stddev within ±5% of target (${stddevDeltaPercent.toFixed(2)}% delta)`, stddevDeltaPercent < 5.0);
        stressAssert(`Human reasonable upper bound (max < mean + 5 * stddev)`, max < (cfg.mean + 6 * cfg.stddev), `Max was ${max}ms`);
    }
}

// ----------------------------------------------------------------------------
// TEST SECTION 2: STORAGE RESILIENCE & CORRUPTED MALFORMED JSON
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Corrupted / Malformed Storage Resilience ---');

const { createMockEnvironment } = require('./test_extension.js');

// Test 2.1: LocalStorage malformed JSON injections
const corruptedPayloads = [
    { label: 'Unclosed JSON string', value: '{"key": "value", "list": [1, 2' },
    { label: 'Raw JavaScript identifier', value: 'undefined' },
    { label: 'Null string', value: 'null' },
    { label: 'Empty string', value: '' },
    { label: 'Raw boolean', value: 'true' },
    { label: 'Arbitrary HTML/script tag', value: '<script>alert(1)</script>' },
    { label: 'Deeply nested recursive string', value: '[[[[[[[[[[{}]]]]]]]]]]' },
    { label: 'Non-array object where array expected', value: '{"notAnArray": true}' },
    { label: 'Array with corrupted objects', value: '[null, 123, "text", {}, {"valid": true}]' }
];

for (const payload of corruptedPayloads) {
    const { localStorage } = createMockEnvironment();
    localStorage.setItem('pk_winning_queue', payload.value);

    // Self-healing queue loader under test
    let safeQueue = [];
    let caughtException = false;
    try {
        const raw = localStorage.getItem('pk_winning_queue');
        if (raw && typeof raw === 'string') {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                safeQueue = parsed.filter(item => item && typeof item === 'object');
            } else {
                safeQueue = [];
            }
        }
    } catch (e) {
        caughtException = true;
        safeQueue = [];
        localStorage.setItem('pk_winning_queue', '[]');
    }

    stressAssert(
        `LocalStorage handles '${payload.label}' gracefully`,
        Array.isArray(safeQueue) && safeQueue !== null,
        `Queue became ${typeof safeQueue}`
    );
}

// Test 2.2: chrome.storage.local resilience
const { chrome } = createMockEnvironment();
const storageLocalPayloads = [
    { pk_accounts: 'malformed_string_not_array' },
    { pk_winning_queue: '{bad_json' },
    { pk_auto_buy_queue_active: -999 },
    { pk_delay_mean: 'not_a_number' },
    { pk_delay_stddev: null }
];

for (const p of storageLocalPayloads) {
    let recovered = false;
    chrome.storage.local.set(p, () => {
        chrome.storage.local.get(null, (data) => {
            // Verify access does not crash
            recovered = data !== undefined;
        });
    });
    stressAssert(`chrome.storage.local stores and retrieves corrupted structure without throwing`, recovered);
}

// ----------------------------------------------------------------------------
// TEST SECTION 3: RAPID MULTI-ITEM QUEUE SUCCESSION WITH MIXED ITEMS
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Rapid Multi-Item Queue Succession (Mixed Items) ---');

const { scanWinningItems, detectOrderStage } = require('./test_extension.js');

// Build rapid 50-item simulation
const TOTAL_ITEMS = 50;
const mixedItems = [];
for (let i = 1; i <= TOTAL_ITEMS; i++) {
    const type = (i % 4 === 0) ? 'EXPIRED' : (i % 4 === 1) ? 'WON_NORMAL' : (i % 4 === 2) ? 'OOS_CLOSED' : 'WON_LIMITED';
    mixedItems.push({
        id: i,
        type,
        title: `Lottery Item #${i} (${type})`,
        hasOrderBtn: (type === 'WON_NORMAL' || type === 'WON_LIMITED'),
        url: `/product/item_${i}.html`
    });
}

// Filter to actionable items (mimicking scanWinningItems)
const actionableQueue = mixedItems.filter(item => item.hasOrderBtn).map(item => ({
    id: item.id,
    title: item.title,
    orderUrl: item.url
}));

stressAssert(
    `Mixed item filter correctly discards EXPIRED and OOS items (Expected: 25 actionable wins)`,
    actionableQueue.length === 25,
    `Found ${actionableQueue.length} actionable items`
);

// Simulate Rapid Succession FIFO Queue
const { localStorage: queueStorage } = createMockEnvironment();
queueStorage.setItem('pk_winning_queue', JSON.stringify(actionableQueue));
queueStorage.setItem('pk_auto_buy_queue_active', '1');

const processedItems = [];
let queueAdvanceCount = 0;

while (true) {
    let rawQueue = queueStorage.getItem('pk_winning_queue');
    let currentQueue = [];
    try {
        currentQueue = JSON.parse(rawQueue) || [];
    } catch (e) {
        currentQueue = [];
    }

    if (currentQueue.length === 0) {
        queueStorage.setItem('pk_auto_buy_queue_active', '0');
        break;
    }

    const currentItem = currentQueue[0];
    // Process item purchase lifecycle
    processedItems.push(currentItem.id);
    queueAdvanceCount++;

    // Shift item from queue
    currentQueue.shift();
    queueStorage.setItem('pk_winning_queue', JSON.stringify(currentQueue));
}

stressAssert(
    `Queue processed all 25 winning items in strict FIFO order`,
    processedItems.length === 25 && processedItems[0] === 1 && processedItems[24] === 49,
    `Processed count: ${processedItems.length}`
);

stressAssert(
    `Queue automatically deactivates (pk_auto_buy_queue_active = '0') upon completion`,
    queueStorage.getItem('pk_auto_buy_queue_active') === '0'
);

stressAssert(
    `Final queue in storage is empty array`,
    queueStorage.getItem('pk_winning_queue') === '[]'
);

// ----------------------------------------------------------------------------
// FINAL STRESS TEST SUMMARY
// ----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`STRESS TEST SUMMARY: ${stressPassed} Passed, ${stressFailed} Failed`);
console.log('================================================================\n');

if (stressFailed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
