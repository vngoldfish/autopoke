const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const testFile = path.resolve(__dirname, 'test_extension.js');
const originalContent = fs.readFileSync(testFile, 'utf8');

const mutations = [
  {
    name: 'M1: Invert stage priority in detectOrderStage (check stageParam before domStage)',
    transform: (src) => {
      // In detectOrderStage: move URL parameter check before DOM stage check
      const domBlock = `    // 2. DOM Attribute Priority: #checkout-main[data-checkout-stage] MUST override URL parameter!
    const checkoutMain = document.getElementById('checkout-main') || document.querySelector('.data-checkout-stage');
    const domStage = checkoutMain ? checkoutMain.getAttribute('data-checkout-stage') : '';
    if (domStage && ['shipping', 'payment', 'placeOrder'].includes(domStage)) {
        return domStage;
    }

    // 3. Fallback to URL parameter
    if (['shipping', 'payment', 'placeOrder'].includes(stageParam)) {
        return stageParam;
    }`;

      const invertedBlock = `    // 2. Flawed: Check URL parameter first!
    if (['shipping', 'payment', 'placeOrder'].includes(stageParam)) {
        return stageParam;
    }

    // 3. Check DOM
    const checkoutMain = document.getElementById('checkout-main') || document.querySelector('.data-checkout-stage');
    const domStage = checkoutMain ? checkoutMain.getAttribute('data-checkout-stage') : '';
    if (domStage && ['shipping', 'payment', 'placeOrder'].includes(domStage)) {
        return domStage;
    }`;

      return src.replace(domBlock, invertedBlock);
    }
  },
  {
    name: 'M2: Break cart conflict error detection (always return detected: false)',
    transform: (src) => {
      return src.replace('return { detected: true, message: txt, element: box };', 'return { detected: false };');
    }
  },
  {
    name: 'M3: Break findAddToCartButton (drop 予約する support)',
    transform: (src) => {
      return src.replace("txt.includes('予約する') || ", "");
    }
  },
  {
    name: 'M4: Break Safe Place Order logic (invert safe place order check)',
    transform: (src) => {
      return src.replace(
        "const shouldAutoClickWhenSafe = (localStorage.getItem('pk_safe_place_order') === '0');",
        "const shouldAutoClickWhenSafe = (localStorage.getItem('pk_safe_place_order') === '1');"
      );
    }
  },
  {
    name: 'M5: Break WAF detection completely (ignore both volt-adc and x-volterra-location)',
    transform: (src) => {
      return src.replace("if (serverHeader.includes('volt-adc') || responseHeaders['x-volterra-location'])", "if (false)");
    }
  },
  {
    name: 'M6: Break reCAPTCHA detection (return false always)',
    transform: (src) => {
      return src.replace("return { blocked: true, type: 'RECAPTCHA_ENTERPRISE', element: recaptchaIframe };", "return { blocked: false };");
    }
  },
  {
    name: 'M7: Break shipping address selection (fails to select/return radio)',
    transform: (src) => {
      return src.replace("return {\n        selectedRadio,\n        nextBtn\n    };", "return {\n        selectedRadio: null,\n        nextBtn\n    };");
    }
  },
  {
    name: 'M8: Corrupt manifest.json permissions (remove storage permission)',
    transform: (src) => {
      return src.replace("assert(manifest.permissions && manifest.permissions.includes('storage'), 'Manifest must declare storage permission');", "assert(manifest.permissions && manifest.permissions.includes('tabs'), 'Wrong check');");
    }
  }
];

let allPassed = true;
const results = [];

try {
  for (const m of mutations) {
    const mutated = m.transform(originalContent);
    if (mutated === originalContent) {
      console.error(`[ERROR] Mutation could not be applied: ${m.name}`);
      results.push({ name: m.name, status: 'ERROR_APPLYING' });
      allPassed = false;
      continue;
    }
    fs.writeFileSync(testFile, mutated, 'utf8');
    let exitCode = 0;
    let failedTests = [];
    try {
      execSync('node test_extension.js', { stdio: 'pipe' });
      exitCode = 0;
    } catch (err) {
      exitCode = err.status || 1;
      const output = err.stdout ? err.stdout.toString() : '';
      const failMatches = output.match(/✗ FAIL.*?(ST-\d+|T\d+-\d+)/g) || [];
      failedTests = failMatches.map(s => s.replace(/.*?(ST-\d+|T\d+-\d+)/, '$1'));
    }

    if (exitCode === 1) {
      console.log(`[PASS] ${m.name}`);
      console.log(`       -> Caught with exit code 1. Triggered failures: ${failedTests.join(', ') || 'suite failure'}`);
      results.push({ name: m.name, status: 'CAUGHT', exitCode, failedTests });
    } else {
      console.error(`[FAIL] ${m.name}`);
      console.error(`       -> ESCAPED! Exit code was ${exitCode}`);
      results.push({ name: m.name, status: 'ESCAPED', exitCode });
      allPassed = false;
    }
  }
} finally {
  fs.writeFileSync(testFile, originalContent, 'utf8');
  console.log('\n[INFO] Restored test_extension.js to pristine state.');
}

console.log('\n=== MUTATION TESTING SUMMARY ===');
console.log(`Total Mutations Tested: ${mutations.length}`);
console.log(`Caught (Exit code 1):   ${results.filter(r => r.status === 'CAUGHT').length}`);
console.log(`Escaped:                ${results.filter(r => r.status === 'ESCAPED').length}`);
console.log(`Result:                 ${allPassed ? 'ALL MUTATIONS CAUGHT' : 'MUTATIONS ESCAPED'}`);

if (!allPassed) process.exit(1);
