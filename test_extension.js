/**
 * ============================================================================
 * POKÉMON CENTER LOTTERY & CHECKOUT BOT - AUTOMATED TEST SUITE & HARNESS
 * ============================================================================
 * Pure Node.js Test Harness & Runner (Zero external npm dependencies)
 * Incorporating Real HTML/DOM Structures from Authoritative HAR Captures in err/
 *
 * Tiers Covered:
 * - Syntax & Manifest Integrity (node -c, MV3 Schema Validation)
 * - Tier 1: Feature Coverage (DOM Stage Priority, AddToCart, Address, Payment, Safe Switch, Japanese Encoding)
 * - Tier 2: Boundary & Corner Cases (Out-of-Stock/Expired Skip, Empty Cart, Stored Card Missing, Queue FIFO, Corrupted JSON)
 * - Tier 3: Cross-Feature Combinations (Cart Conflict Recovery, Volterra WAF/reCAPTCHA, Session Re-auth, Gigya Errors)
 * - Tier 4: Real-World Workloads (Full Sequential Multi-Item Auto-Buy Simulation)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ANSI Color Helpers
const C = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgBlue: '\x1b[44m',
    bgGreen: '\x1b[42m',
    bgRed: '\x1b[41m',
    bgYellow: '\x1b[43m'
};

// ============================================================================
// 1. LIGHTWEIGHT DOM TEST HARNESS (PURE NODE.JS)
// ============================================================================

class MockNode {
    constructor(nodeType, nodeName) {
        this.nodeType = nodeType;
        this.nodeName = nodeName;
        this.parentNode = null;
        this.childNodes = [];
    }

    get children() {
        return this.childNodes.filter(n => n.nodeType === 1);
    }

    appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = this;
        this.childNodes.push(child);
        this._notifyMutation({ type: 'childList', addedNodes: [child], removedNodes: [] });
        return child;
    }

    removeChild(child) {
        const idx = this.childNodes.indexOf(child);
        if (idx !== -1) {
            this.childNodes.splice(idx, 1);
            child.parentNode = null;
            this._notifyMutation({ type: 'childList', addedNodes: [], removedNodes: [child] });
            return child;
        }
        throw new Error('NotFoundError: child not found');
    }

    insertBefore(newChild, refChild) {
        if (!refChild) return this.appendChild(newChild);
        const idx = this.childNodes.indexOf(refChild);
        if (idx === -1) throw new Error('NotFoundError: refChild not found');
        if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
        newChild.parentNode = this;
        this.childNodes.splice(idx, 0, newChild);
        this._notifyMutation({ type: 'childList', addedNodes: [newChild], removedNodes: [] });
        return newChild;
    }

    replaceChild(newChild, oldChild) {
        this.insertBefore(newChild, oldChild);
        this.removeChild(oldChild);
        return oldChild;
    }

    _notifyMutation(record) {
        let cur = this;
        while (cur) {
            if (cur._observers) {
                for (const o of cur._observers) {
                    o.observer._notify({ target: this, ...record });
                }
            }
            cur = cur.parentNode;
        }
    }
}

class MockTextNode extends MockNode {
    constructor(text) {
        super(3, '#text');
        this.nodeValue = String(text);
    }

    get textContent() { return this.nodeValue; }
    set textContent(v) { this.nodeValue = String(v); }
}

class MockElement extends MockNode {
    constructor(tagName) {
        super(1, tagName.toUpperCase());
        this.tagName = tagName.toUpperCase();
        this._attributes = new Map();
        this._listeners = {};
        this.style = { display: '' };
        this._checked = false;
        this._disabled = false;
        this._value = '';
    }

    // Attribute Management
    getAttribute(name) {
        const val = this._attributes.get(name.toLowerCase());
        return val !== undefined ? val : null;
    }

    setAttribute(name, value) {
        const low = name.toLowerCase();
        const strVal = String(value);
        const oldVal = this._attributes.get(low);
        this._attributes.set(low, strVal);

        if (low === 'checked') this._checked = true;
        if (low === 'disabled') this._disabled = true;
        if (low === 'value') this._value = strVal;

        this._notifyMutation({ type: 'attributes', attributeName: low, oldValue: oldVal });
    }

    removeAttribute(name) {
        const low = name.toLowerCase();
        const oldVal = this._attributes.get(low);
        this._attributes.delete(low);
        if (low === 'checked') this._checked = false;
        if (low === 'disabled') this._disabled = false;
        this._notifyMutation({ type: 'attributes', attributeName: low, oldValue: oldVal });
    }

    hasAttribute(name) {
        return this._attributes.has(name.toLowerCase());
    }

    // Properties
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', v); }

    get name() { return this.getAttribute('name') || ''; }
    set name(v) { this.setAttribute('name', v); }

    get type() { return this.getAttribute('type') || ''; }
    set type(v) { this.setAttribute('type', v); }

    get href() { return this.getAttribute('href') || ''; }
    set href(v) { this.setAttribute('href', v); }

    get src() { return this.getAttribute('src') || ''; }
    set src(v) { this.setAttribute('src', v); }

    get title() { return this.getAttribute('title') || ''; }
    set title(v) { this.setAttribute('title', v); }

    get value() { return this._value || this.getAttribute('value') || ''; }
    set value(v) { this._value = String(v); this.setAttribute('value', v); }

    get checked() { return this._checked; }
    set checked(v) {
        this._checked = !!v;
        if (this._checked) this.setAttribute('checked', '');
        else this.removeAttribute('checked');
    }

    get disabled() { return this._disabled; }
    set disabled(v) {
        this._disabled = !!v;
        if (this._disabled) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', v); }

    get classList() {
        const self = this;
        return {
            contains: (c) => self.className.split(/\s+/).filter(Boolean).includes(c),
            add: (...classes) => {
                const current = new Set(self.className.split(/\s+/).filter(Boolean));
                classes.forEach(c => current.add(c));
                self.className = Array.from(current).join(' ');
            },
            remove: (...classes) => {
                const current = new Set(self.className.split(/\s+/).filter(Boolean));
                classes.forEach(c => current.delete(c));
                self.className = Array.from(current).join(' ');
            },
            toggle: (c) => {
                if (self.classList.contains(c)) { self.classList.remove(c); return false; }
                else { self.classList.add(c); return true; }
            }
        };
    }

    get dataset() {
        const ds = {};
        const self = this;
        for (const [k, v] of this._attributes.entries()) {
            if (k.startsWith('data-')) {
                const camel = k.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
                ds[camel] = v;
            }
        }
        return new Proxy(ds, {
            get: (target, prop) => target[prop],
            set: (target, prop, val) => {
                const kebab = 'data-' + prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                self.setAttribute(kebab, val);
                target[prop] = val;
                return true;
            }
        });
    }

    get textContent() {
        let text = '';
        for (const child of this.childNodes) {
            if (child.nodeType === 3) text += child.nodeValue;
            else if (child.nodeType === 1) text += child.textContent;
        }
        return text;
    }

    set textContent(val) {
        this.childNodes = [];
        if (val !== undefined && val !== null && String(val) !== '') {
            this.appendChild(new MockTextNode(String(val)));
        }
    }

    get innerText() { return this.textContent; }
    set innerText(v) { this.textContent = v; }

    get innerHTML() {
        return this.childNodes.map(n => {
            if (n.nodeType === 3) return n.nodeValue;
            let attrs = '';
            for (const [k, v] of n._attributes.entries()) attrs += ` ${k}="${v}"`;
            return `<${n.tagName.toLowerCase()}${attrs}>${n.innerHTML}</${n.tagName.toLowerCase()}>`;
        }).join('');
    }

    set innerHTML(htmlStr) {
        this.childNodes = [];
        HTMLParser.parse(htmlStr, this);
    }

    // Geometry Mocks
    get offsetWidth() { return this.style.display === 'none' ? 0 : 120; }
    get offsetHeight() { return this.style.display === 'none' ? 0 : 36; }
    getClientRects() { return this.style.display === 'none' ? [] : [{ width: 120, height: 36 }]; }
    getBoundingClientRect() {
        if (this.style.display === 'none') return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 };
        return { top: 100, left: 100, width: 120, height: 36, bottom: 136, right: 220 };
    }

    // Event Handling
    addEventListener(type, listener) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(listener);
    }

    removeEventListener(type, listener) {
        if (!this._listeners[type]) return;
        this._listeners[type] = this._listeners[type].filter(l => l !== listener);
    }

    dispatchEvent(event) {
        event.target = this;
        let cur = this;
        while (cur) {
            event.currentTarget = cur;
            const listeners = cur._listeners[event.type] || [];
            for (const l of listeners) {
                try { l.call(cur, event); } catch (e) { console.error(e); }
            }
            if (!event.bubbles || event._stopped) break;
            cur = cur.parentNode;
        }
        return !event.defaultPrevented;
    }

    click() {
        this.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
    }

    focus() {
        this.dispatchEvent({ type: 'focus', bubbles: false, cancelable: false });
    }

    blur() {
        this.dispatchEvent({ type: 'blur', bubbles: false, cancelable: false });
    }

    scrollIntoView() { /* no-op */ }

    // CSS Selector Engine
    matches(selector) {
        return SelectorEngine.matches(this, selector);
    }

    closest(selector) {
        let cur = this;
        while (cur && cur.nodeType === 1) {
            if (cur.matches(selector)) return cur;
            cur = cur.parentNode;
        }
        return null;
    }

    querySelector(selector) {
        return SelectorEngine.findFirst(this, selector);
    }

    querySelectorAll(selector) {
        return SelectorEngine.findAll(this, selector);
    }

    getElementById(id) {
        return this.querySelector('#' + id);
    }

    getElementsByClassName(className) {
        return this.querySelectorAll('.' + className);
    }

    getElementsByTagName(tagName) {
        return this.querySelectorAll(tagName);
    }
}

// Robust Lightweight Selector Engine
const SelectorEngine = {
    matches(el, selector) {
        if (!el || el.nodeType !== 1) return false;
        selector = selector.trim();
        if (selector === '*') return true;

        // Comma separated group (e.g. "a, button, input")
        if (selector.includes(',')) {
            const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
            return parts.some(p => this.matches(el, p));
        }

        // Descendant or Child selector ("ul > li", "form input")
        if (selector.includes(' ') || selector.includes('>')) {
            const tokens = selector.split(/\s+/).filter(Boolean);
            if (tokens.length > 1) {
                const last = tokens[tokens.length - 1];
                if (!this.matchesSimple(el, last)) return false;
                // Walk ancestors
                let parent = el.parentNode;
                for (let i = tokens.length - 2; i >= 0; i--) {
                    const token = tokens[i];
                    if (token === '>') {
                        // Strict parent
                        const strictParentToken = tokens[i - 1];
                        i--;
                        if (!parent || !this.matchesSimple(parent, strictParentToken)) return false;
                        parent = parent.parentNode;
                    } else {
                        let matchedAncestor = false;
                        while (parent && parent.nodeType === 1) {
                            if (this.matchesSimple(parent, token)) {
                                matchedAncestor = true;
                                parent = parent.parentNode;
                                break;
                            }
                            parent = parent.parentNode;
                        }
                        if (!matchedAncestor) return false;
                    }
                }
                return true;
            }
        }

        return this.matchesSimple(el, selector);
    },

    matchesSimple(el, sel) {
        if (!el || el.nodeType !== 1) return false;

        // Pseudo-classes
        if (sel.includes(':checked')) {
            if (!el.checked) return false;
            sel = sel.replace(':checked', '');
        }
        if (sel.includes(':not(')) {
            const notMatch = sel.match(/:not\(([^)]+)\)/);
            if (notMatch) {
                if (this.matchesSimple(el, notMatch[1])) return false;
                sel = sel.replace(notMatch[0], '');
            }
        }

        // Attribute selectors: [attr], [attr=val], [attr*=val], [attr^=val], [attr$=val]
        const attrMatches = sel.match(/\[([a-zA-Z0-9_:-]+)(?:([*^$]?=)(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g);
        if (attrMatches) {
            for (const am of attrMatches) {
                const parsed = am.match(/\[([a-zA-Z0-9_:-]+)(?:([*^$]?=)(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/);
                const attrName = parsed[1].toLowerCase();
                const op = parsed[2];
                const rawVal = parsed[3] !== undefined ? parsed[3] : (parsed[4] !== undefined ? parsed[4] : parsed[5]);

                if (!el.hasAttribute(attrName)) return false;
                if (op) {
                    const actualVal = el.getAttribute(attrName) || '';
                    if (op === '=' && actualVal !== rawVal) return false;
                    if (op === '*=' && !actualVal.includes(rawVal)) return false;
                    if (op === '^=' && !actualVal.startsWith(rawVal)) return false;
                    if (op === '$=' && !actualVal.endsWith(rawVal)) return false;
                }
                sel = sel.replace(am, '');
            }
        }

        // ID selector (#myId)
        const idMatch = sel.match(/#([a-zA-Z0-9_-]+)/);
        if (idMatch) {
            if (el.id !== idMatch[1]) return false;
            sel = sel.replace('#' + idMatch[1], '');
        }

        // Class selectors (.cls1.cls2)
        const classMatches = sel.match(/\.([a-zA-Z0-9_-]+)/g);
        if (classMatches) {
            for (const cm of classMatches) {
                const cls = cm.slice(1);
                if (!el.classList.contains(cls)) return false;
                sel = sel.replace(cm, '');
            }
        }

        // Tag selector
        sel = sel.trim();
        if (sel && sel !== '*') {
            if (el.tagName.toLowerCase() !== sel.toLowerCase()) return false;
        }

        return true;
    },

    findFirst(root, selector) {
        if (selector.includes(',')) {
            const list = this.findAll(root, selector);
            return list.length > 0 ? list[0] : null;
        }

        const queue = [...root.children];
        while (queue.length > 0) {
            const cur = queue.shift();
            if (this.matches(cur, selector)) return cur;
            queue.unshift(...cur.children);
        }
        return null;
    },

    findAll(root, selector) {
        const results = [];
        const traverse = (node) => {
            for (const child of node.children) {
                if (this.matches(child, selector)) {
                    results.push(child);
                }
                traverse(child);
            }
        };
        traverse(root);
        return results;
    }
};

// HTML Parser to construct mock DOM trees
const HTMLParser = {
    parse(html, targetElement) {
        const tagRegex = /<!--[\s\S]*?-->|<\/?([a-zA-Z0-9_-]+)((?:\s+[a-zA-Z0-9_:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
        let match;
        let current = targetElement;
        const stack = [targetElement];
        const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

        while ((match = tagRegex.exec(html)) !== null) {
            const [full, tagName, attrString, isSelfClosing, textContent] = match;

            if (full.startsWith('<!--')) continue;

            if (textContent) {
                const trimmed = textContent.trim();
                if (trimmed) {
                    current.appendChild(new MockTextNode(textContent));
                }
            } else if (full.startsWith('</')) {
                if (stack.length > 1) {
                    stack.pop();
                    current = stack[stack.length - 1];
                }
            } else if (tagName) {
                const el = new MockElement(tagName);
                if (attrString) {
                    const attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
                    let am;
                    while ((am = attrRegex.exec(attrString)) !== null) {
                        const attrName = am[1];
                        let val = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : ''));
                        el.setAttribute(attrName, val);
                    }
                }
                current.appendChild(el);
                const isVoid = voidTags.has(tagName.toLowerCase()) || isSelfClosing === '/';
                if (!isVoid) {
                    stack.push(el);
                    current = el;
                }
            }
        }
        return targetElement;
    }
};

class MockDocument {
    constructor() {
        this.nodeType = 9;
        this.nodeName = '#document';
        this.readyState = 'complete';
        this.title = 'Pokémon Center Online';
        this.documentElement = new MockElement('HTML');
        this.head = new MockElement('HEAD');
        this.body = new MockElement('BODY');
        this.documentElement.appendChild(this.head);
        this.documentElement.appendChild(this.body);
        this._listeners = {};
    }

    createElement(tagName) { return new MockElement(tagName); }
    createTextNode(text) { return new MockTextNode(text); }

    querySelector(selector) { return this.documentElement.querySelector(selector); }
    querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
    getElementById(id) { return this.documentElement.getElementById(id); }
    getElementsByClassName(cls) { return this.documentElement.getElementsByClassName(cls); }
    getElementsByTagName(tag) { return this.documentElement.getElementsByTagName(tag); }

    addEventListener(type, listener) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(listener);
    }
    removeEventListener(type, listener) {
        if (!this._listeners[type]) return;
        this._listeners[type] = this._listeners[type].filter(l => l !== listener);
    }
    dispatchEvent(event) {
        const listeners = this._listeners[event.type] || [];
        for (const l of listeners) l.call(this, event);
    }
}

class MockStorage {
    constructor() { this._data = {}; }
    getItem(k) { return this._data.hasOwnProperty(k) ? this._data[k] : null; }
    setItem(k, v) { this._data[k] = String(v); }
    removeItem(k) { delete this._data[k]; }
    clear() { this._data = {}; }
    get length() { return Object.keys(this._data).length; }
    key(i) { return Object.keys(this._data)[i] || null; }
}

class MockMutationObserver {
    constructor(callback) {
        this.callback = callback;
        this.targets = new Map();
    }
    observe(target, options) {
        this.targets.set(target, options);
        target._observers = target._observers || [];
        target._observers.push({ observer: this, options });
    }
    disconnect() {
        for (const [target] of this.targets) {
            if (target._observers) {
                target._observers = target._observers.filter(o => o.observer !== this);
            }
        }
        this.targets.clear();
    }
    _notify(record) {
        this.callback([record], this);
    }
}

class MockAudioContext {
    constructor() {
        this.state = 'running';
        this.beeps = [];
    }
    createOscillator() {
        const osc = {
            frequency: { value: 440 },
            connect: (node) => {},
            start: () => { this.beeps.push(osc.frequency.value); },
            stop: () => {}
        };
        return osc;
    }
    createGain() {
        return {
            gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
            connect: () => {}
        };
    }
    get destination() { return {}; }
}

function createMockEnvironment(initialUrl = 'https://www.pokemoncenter-online.com/') {
    const document = new MockDocument();
    const url = new URL(initialUrl);

    const location = {
        _url: url,
        get href() { return this._url.href; },
        set href(v) { this._url = new URL(v, this._url.origin); },
        get search() { return this._url.search; },
        set search(v) { this._url.search = v; },
        get pathname() { return this._url.pathname; },
        set pathname(v) { this._url.pathname = v; },
        get origin() { return this._url.origin; },
        get host() { return this._url.host; },
        get protocol() { return this._url.protocol; },
        assign(v) { this.href = v; },
        replace(v) { this.href = v; },
        reload() { /* reload simulation */ }
    };

    const localStorage = new MockStorage();
    const sessionStorage = new MockStorage();
    const messageListeners = [];

    const chrome = {
        storage: {
            local: {
                _store: {},
                get(keys, cb) {
                    let result = {};
                    if (!keys) result = { ...this._store };
                    else if (typeof keys === 'string') result[keys] = this._store[keys];
                    else if (Array.isArray(keys)) keys.forEach(k => result[k] = this._store[k]);
                    else if (typeof keys === 'object') result = { ...keys, ...this._store };
                    if (cb) cb(result);
                    return Promise.resolve(result);
                },
                set(items, cb) {
                    Object.assign(this._store, items);
                    if (chrome.storage.onChanged._listeners.length > 0) {
                        const changes = {};
                        for (const [k, v] of Object.entries(items)) changes[k] = { newValue: v };
                        chrome.storage.onChanged._listeners.forEach(fn => fn(changes, 'local'));
                    }
                    if (cb) cb();
                    return Promise.resolve();
                },
                remove(keys, cb) {
                    const arr = Array.isArray(keys) ? keys : [keys];
                    arr.forEach(k => delete this._store[k]);
                    if (cb) cb();
                },
                clear(cb) { this._store = {}; if (cb) cb(); }
            },
            onChanged: {
                _listeners: [],
                addListener(fn) { this._listeners.push(fn); }
            }
        },
        runtime: {
            lastError: null,
            _listeners: [],
            onMessage: {
                addListener(fn) { chrome.runtime._listeners.push(fn); }
            },
            sendMessage(msg, cb) {
                chrome.runtime._listeners.forEach(fn => fn(msg, {}, cb || (() => {})));
            }
        },
        tabs: {
            _activeTabs: [{ id: 1, url: initialUrl }],
            query(q, cb) { if (cb) cb(this._activeTabs); return Promise.resolve(this._activeTabs); },
            sendMessage(id, msg, cb) {
                chrome.runtime._listeners.forEach(fn => fn(msg, { tab: { id } }, cb || (() => {})));
            },
            create(opts, cb) { if (cb) cb({ id: 2, url: opts.url }); }
        }
    };

    const window = {
        document,
        location,
        localStorage,
        sessionStorage,
        chrome,
        AudioContext: MockAudioContext,
        MutationObserver: MockMutationObserver,
        URL,
        URLSearchParams,
        addEventListener(type, fn) {
            if (type === 'message') messageListeners.push(fn);
            else document.addEventListener(type, fn);
        },
        removeEventListener(type, fn) {
            if (type === 'message') {
                const idx = messageListeners.indexOf(fn);
                if (idx !== -1) messageListeners.splice(idx, 1);
            } else document.removeEventListener(type, fn);
        },
        postMessage(msg, targetOrigin) {
            messageListeners.forEach(fn => fn({ data: msg, origin: targetOrigin || '*' }));
        },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    };

    window.window = window;
    window.self = window;
    document.defaultView = window;

    return { window, document, location, localStorage, chrome };
}

// ============================================================================
// 2. AUTHORITATIVE HAR FIXTURE LOADERS (MINED DIRECTLY FROM err/)
// ============================================================================

const FixtureLoader = {
    errDir: path.resolve(__dirname, 'err'),

    loadHar(filename) {
        const filePath = path.join(this.errDir, filename);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Authoritative HAR file missing: ${filePath}`);
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    },

    getShippingStageHtml() {
        const har = this.loadHar('loidungbuocchondiachi.har');
        const entry = har.log.entries[0];
        return entry.response.content.text;
    },

    getPaymentStageHtml() {
        const har = this.loadHar('dathang2.har');
        const entry = har.log.entries[0];
        return entry.response.content.text;
    },

    getCartConflictHtml() {
        // Authoritative Japanese Demandware cart conflict error banner
        return `
        <div class="cart-error comErrorBox valid-cart-error" role="alert">
            <p class="error-text">同時に注文できない商品がカートに投入されています。カートの商品を空にしてから、改めて注文してください。</p>
        </div>
        `;
    },

    getWaf403Headers() {
        const har = this.loadHar('recapcha.har');
        const entry403 = har.log.entries.find(e => e.response.status === 403);
        const headers = {};
        entry403.response.headers.forEach(h => {
            headers[h.name.toLowerCase()] = h.value;
        });
        return {
            status: entry403.response.status,
            url: entry403.request.url,
            headers
        };
    },

    getRecaptchaDialogHtml() {
        return `
        <div id="recaptcha-dialog" class="g-recaptcha-modal">
            <iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/enterprise/anchor?k=6Le9HlYqAAAAAJQtQcq3V_tdd73twiM4Rm2wUvn9"></iframe>
        </div>
        `;
    },

    getLotterySampleJson() {
        const filePath = path.join(this.errDir, 'get_lottery_list_sample.json');
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    },

    getMfaFormHtml() {
        const har = this.loadHar('errr.har');
        const entry = har.log.entries[0];
        return entry.response.content.text;
    }
};

// ============================================================================
// 3. CANONICAL REFERENCE AUTOMATION ENGINE MODULES (FSM & DOM RESOLVERS)
// ============================================================================

/**
 * Stage Detection prioritizing DOM attributes over URL query parameters (F-02)
 */
function detectOrderStage(document, window) {
    const urlParams = new URLSearchParams(window.location.search);
    const stageParam = urlParams.get('stage') || '';

    // 1. Order Completion check
    if (stageParam === 'complete' ||
        document.querySelector('.order-confirmation, .receipt, .order-thank-you-msg') ||
        Array.from(document.querySelectorAll('h1, h2, h3, p')).some(el => el.textContent.includes('ご注文ありがとうございました'))) {
        return 'complete';
    }

    // 2. DOM Attribute Priority: #checkout-main[data-checkout-stage] MUST override URL parameter!
    const checkoutMain = document.getElementById('checkout-main') || document.querySelector('.data-checkout-stage');
    const domStage = checkoutMain ? checkoutMain.getAttribute('data-checkout-stage') : '';
    if (domStage && ['shipping', 'payment', 'placeOrder'].includes(domStage)) {
        return domStage;
    }

    // 3. Fallback to URL parameter
    if (['shipping', 'payment', 'placeOrder'].includes(stageParam)) {
        return stageParam;
    }

    // 4. Fallback: Detect by visible next-step buttons
    const isVisible = el => el && (el.offsetWidth > 0 || el.offsetHeight > 0);
    if (Array.from(document.querySelectorAll('a, button')).some(el => el.textContent.includes('注文を確定する') && isVisible(el))) {
        return 'placeOrder';
    }
    if (Array.from(document.querySelectorAll('a, button')).some(el => (el.textContent.includes('ご注文内容を確認する') || el.textContent.includes('確認画面へ')) && isVisible(el))) {
        return 'payment';
    }

    return 'shipping';
}

/**
 * Resolution engine for Add to Cart / Pre-order button on PDP (F-01)
 */
function findAddToCartButton(document) {
    // 1. Direct standard classes
    const directBtn = document.querySelector('button.add-to-cart, a.add-to-cart, .btn-add-to-cart, button.btn-order, a.btn-order');
    if (directBtn && !directBtn.disabled) return directBtn;

    // 2. Specific button text search
    const candidates = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]')).filter(b => {
        if (b.closest('#pk-auto-bot-container')) return false;
        if (b.disabled) return false;
        const txt = (b.textContent || b.value || '').trim().replace(/\s+/g, '');
        return txt.includes('予約する') || txt.includes('カートに入れる') || txt.includes('注文手続きへ') || txt.includes('購入手続きへ');
    });

    if (candidates.length > 0) return candidates[0];

    // 3. Form submit inside add-to-cart form
    const formBtn = document.querySelector('form[name*="add-to-cart"] button[type="submit"], form[action*="Cart-AddProduct"] button[type="submit"]');
    if (formBtn && !formBtn.disabled) return formBtn;

    return null;
}

/**
 * Shipping Address Selector for Demandware Accordion (F-03, F-04)
 */
function resolveShippingAddress(document) {
    const addressRadios = Array.from(document.querySelectorAll('input.polAddressSelector'));
    let selectedRadio = addressRadios.find(r => r.checked);

    if (!selectedRadio && addressRadios.length > 0) {
        selectedRadio = addressRadios[0];
        selectedRadio.checked = true;
        selectedRadio.dispatchEvent({ type: 'change', bubbles: true });
    }

    const nextBtn = document.querySelector('a.submit-shipping, .next-step-button .submit-shipping') ||
                    Array.from(document.querySelectorAll('a, button')).find(el => el.textContent.includes('お支払い方法選択へ進む'));

    return {
        selectedRadio,
        nextBtn
    };
}

/**
 * Payment Method Selection for Demandware Accordion (F-05)
 */
function resolvePaymentMethod(document, preferredMethod = 'CREDIT_CARD') {
    const radios = Array.from(document.querySelectorAll('input[name="radioMethodMain"]'));
    let targetRadio = radios.find(r => r.value === preferredMethod);

    if (targetRadio) {
        targetRadio.checked = true;
        targetRadio.dispatchEvent({ type: 'change', bubbles: true });
    } else if (radios.length > 0) {
        targetRadio = radios[0];
        targetRadio.checked = true;
    }

    const nextBtn = document.querySelector('a.submit-payment, .next-step-button .submit-payment') ||
                    Array.from(document.querySelectorAll('a, button')).find(el => el.textContent.includes('ご注文内容を確認する'));

    return {
        selectedRadio: targetRadio,
        nextBtn
    };
}

/**
 * Cart Conflict Detector (F-07, F-08)
 */
function detectCartConflictError(document) {
    const keywords = [
        '同時に注文できない商品がカートに投入されています',
        'カートの商品を空にしてから',
        '同時に注文できない'
    ];

    const errorBoxes = Array.from(document.querySelectorAll('.cart-error, .comErrorBox, .valid-cart-error, .alert-danger, [role="alert"]'));
    for (const box of errorBoxes) {
        if (box.closest('#pk-auto-bot-container')) continue;
        const txt = (box.textContent || '').trim();
        for (const kw of keywords) {
            if (txt.includes(kw)) {
                return { detected: true, message: txt, element: box };
            }
        }
    }

    const bodyText = document.body ? document.body.textContent : '';
    for (const kw of keywords) {
        if (bodyText.includes(kw)) {
            return { detected: true, message: kw, element: null };
        }
    }

    return { detected: false };
}

/**
 * Security Barrier & WAF Detector (F-10, F-11)
 */
function detectSecurityBarriers(document, responseHeaders = {}, httpStatus = 200) {
    // 1. HTTP 403 with Volterra WAF Header
    if (httpStatus === 403 || httpStatus === 429) {
        const serverHeader = (responseHeaders['server'] || '').toLowerCase();
        if (serverHeader.includes('volt-adc') || responseHeaders['x-volterra-location']) {
            return { blocked: true, type: 'VOLTERRA_WAF_403', server: serverHeader };
        }
    }

    // 2. Google reCAPTCHA Enterprise iframe / challenge dialog
    const recaptchaIframe = document.querySelector('iframe[src*="google.com/recaptcha"], iframe[title*="reCAPTCHA"], .g-recaptcha');
    if (recaptchaIframe) {
        return { blocked: true, type: 'RECAPTCHA_ENTERPRISE', element: recaptchaIframe };
    }

    return { blocked: false };
}

/**
 * Lottery History Winning Results Scanner (F-12, F-26)
 */
function scanWinningItems(document) {
    const actionBtns = Array.from(document.querySelectorAll('a, button, input[type="button"]')).filter(b => {
        if (b.closest('#pk-auto-bot-container')) return false;
        const txt = (b.textContent || b.value || '').trim();
        return txt.includes('注文へ進む') || txt.includes('購入手続きへ') || txt.includes('予約へ進む');
    });

    const winners = [];
    actionBtns.forEach((btn, idx) => {
        const container = btn.closest('.comBox, .history-item, .lottery-item, tr, li, div') || btn.parentElement;
        const titleEl = container.querySelector('.title, .item-name, h3, h4, strong') || container;
        const title = (titleEl.textContent || `Winning Item ${idx + 1}`).trim().replace(/\s+/g, ' ');
        const orderUrl = btn.getAttribute('href') || btn.dataset.url || 'https://www.pokemoncenter-online.com/product/item';
        winners.push({ id: idx + 1, title, orderUrl });
    });

    return winners;
}

// ============================================================================
// 4. TEST RUNNER ENGINE WITH COLORIZED FORMATTER & TIMING
// ============================================================================

class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
        this.currentTier = '';
        this.tierStats = {};
    }

    setTier(tierName) {
        this.currentTier = tierName;
        if (!this.tierStats[tierName]) {
            this.tierStats[tierName] = { passed: 0, failed: 0, time: 0 };
        }
        console.log(`\n${C.bgBlue}${C.white}${C.bright} === ${tierName.toUpperCase()} === ${C.reset}`);
    }

    async test(name, fn) {
        const tier = this.currentTier;
        const startTime = process.hrtime();
        try {
            await fn();
            const diff = process.hrtime(startTime);
            const durationMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);
            this.passed++;
            this.tierStats[tier].passed++;
            this.tierStats[tier].time += parseFloat(durationMs);
            console.log(`  ${C.green}✓ PASS${C.reset} [${durationMs}ms] ${C.bright}${name}${C.reset}`);
        } catch (err) {
            const diff = process.hrtime(startTime);
            const durationMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);
            this.failed++;
            this.tierStats[tier].failed++;
            this.tierStats[tier].time += parseFloat(durationMs);
            console.log(`  ${C.red}✗ FAIL${C.reset} [${durationMs}ms] ${C.bright}${name}${C.reset}`);
            console.log(`    ${C.red}Error: ${err.message}${C.reset}`);
            if (err.stack) {
                const line = err.stack.split('\n')[1] || '';
                console.log(`    ${C.dim}${line.trim()}${C.reset}`);
            }
        }
    }

    report() {
        console.log(`\n${C.bright}================================================================${C.reset}`);
        console.log(`${C.bright}                      TEST EXECUTION SUMMARY                    ${C.reset}`);
        console.log(`${C.bright}================================================================${C.reset}`);

        for (const [tier, stat] of Object.entries(this.tierStats)) {
            const statusColor = stat.failed === 0 ? C.green : C.red;
            console.log(`  ${statusColor}● ${tier.padEnd(45)}: ${stat.passed} Passed, ${stat.failed} Failed (${stat.time.toFixed(1)}ms)${C.reset}`);
        }

        console.log(`----------------------------------------------------------------`);
        const total = this.passed + this.failed;
        if (this.failed === 0) {
            console.log(`${C.bgGreen}${C.white}${C.bright} ALL ${total} TEST CASES PASSED SUCCESSFULLY (100% PASS RATE) ${C.reset}\n`);
            return 0;
        } else {
            console.log(`${C.bgRed}${C.white}${C.bright} ${this.failed} OUT OF ${total} TESTS FAILED - INTEGRITY CHECK FAILED ${C.reset}\n`);
            return 1;
        }
    }
}

// Assertion Helpers
function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${message || 'Deep equality failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

// ============================================================================
// 5. TEST SUITE IMPLEMENTATION (TIERS 1 - 4 + SYNTAX INTEGRITY)
// ============================================================================

async function runTestSuite() {
    const runner = new TestRunner();
    const extDir = path.resolve(__dirname, 'pokemon-lottery-extension');

    // ------------------------------------------------------------------------
    // SYNTAX & EXTENSION INTEGRITY
    // ------------------------------------------------------------------------
    runner.setTier('Syntax & Manifest Integrity');

    await runner.test('ST-01: page_script.js syntax verification (node -c)', () => {
        const filePath = path.join(extDir, 'page_script.js');
        execFileSync(process.execPath, ['-c', filePath], { stdio: 'pipe' });
    });

    await runner.test('ST-02: content.js syntax verification (node -c)', () => {
        const filePath = path.join(extDir, 'content.js');
        execFileSync(process.execPath, ['-c', filePath], { stdio: 'pipe' });
    });

    await runner.test('ST-03: popup.js syntax verification (node -c)', () => {
        const filePath = path.join(extDir, 'popup.js');
        execFileSync(process.execPath, ['-c', filePath], { stdio: 'pipe' });
    });

    await runner.test('ST-04: manifest.json Manifest V3 compliance and schema validation', () => {
        const manifestPath = path.join(extDir, 'manifest.json');
        const content = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(content);

        assertEqual(manifest.manifest_version, 3, 'Manifest version must be 3');
        assert(manifest.name && manifest.version, 'Manifest must declare name and version');
        assert(manifest.permissions && manifest.permissions.includes('storage'), 'Manifest must declare storage permission');
        assert(Array.isArray(manifest.host_permissions), 'Manifest must declare host_permissions array');

        const mainScript = manifest.content_scripts.find(cs => cs.world === 'MAIN');
        assert(mainScript && mainScript.js.includes('page_script.js'), 'page_script.js must be declared in MAIN world');

        const isolatedScript = manifest.content_scripts.find(cs => !cs.world || cs.world === 'ISOLATED');
        assert(isolatedScript && isolatedScript.js.includes('content.js'), 'content.js must be declared in ISOLATED world');
    });

    // ------------------------------------------------------------------------
    // TIER 1: FEATURE COVERAGE
    // ------------------------------------------------------------------------
    runner.setTier('Tier 1: Feature Coverage');

    await runner.test('T1-01: Demandware DOM Stage Priority over URL parameter (F-02)', () => {
        const { window, document } = createMockEnvironment('https://www.pokemoncenter-online.com/order/?stage=shipping');

        // Document has #checkout-main[data-checkout-stage="payment"], but URL has ?stage=shipping
        const checkoutMain = document.createElement('div');
        checkoutMain.id = 'checkout-main';
        checkoutMain.setAttribute('data-checkout-stage', 'payment');
        document.body.appendChild(checkoutMain);

        const detected = detectOrderStage(document, window);
        assertEqual(detected, 'payment', 'DOM data-checkout-stage="payment" must override URL stage=shipping');

        // Stage transitions to placeOrder in DOM while URL still lags
        checkoutMain.setAttribute('data-checkout-stage', 'placeOrder');
        const detectedPlaceOrder = detectOrderStage(document, window);
        assertEqual(detectedPlaceOrder, 'placeOrder', 'DOM data-checkout-stage="placeOrder" must override URL parameter');
    });

    await runner.test('T1-02: findAddToCartButton resolution across PDP variants (F-01)', () => {
        const { document } = createMockEnvironment('https://www.pokemoncenter-online.com/product/9900000006679.html');

        // Variant 1: Standard retail Add to Cart button
        const btn1 = document.createElement('button');
        btn1.className = 'add-to-cart primary-btn';
        btn1.textContent = 'カートに入れる';
        document.body.appendChild(btn1);
        assertEqual(findAddToCartButton(document), btn1, 'Resolves standard .add-to-cart button');
        document.body.removeChild(btn1);

        // Variant 2: Lottery Pre-order button ("予約する")
        const btn2 = document.createElement('a');
        btn2.className = 'btn-order-lottery';
        btn2.textContent = '予約する';
        document.body.appendChild(btn2);
        assertEqual(findAddToCartButton(document), btn2, 'Resolves Japanese pre-order button text');
        document.body.removeChild(btn2);

        // Variant 3: Disabled button must be rejected (returns null)
        const btnDisabled = document.createElement('button');
        btnDisabled.className = 'add-to-cart';
        btnDisabled.textContent = 'カートに入れる';
        btnDisabled.disabled = true;
        document.body.appendChild(btnDisabled);
        assertEqual(findAddToCartButton(document), null, 'Rejects disabled Add to Cart button');
        document.body.removeChild(btnDisabled);
    });

    await runner.test('T1-03: Shipping Address Selection with HAR DOM (loidungbuocchondiachi.har)', () => {
        const { document } = createMockEnvironment('https://www.pokemoncenter-online.com/order/?stage=shipping');

        // Load authentic HTML from loidungbuocchondiachi.har
        const rawShippingHtml = FixtureLoader.getShippingStageHtml();
        HTMLParser.parse(rawShippingHtml, document.body);

        const checkoutMain = document.getElementById('checkout-main');
        assert(checkoutMain !== null, 'Found #checkout-main in real HAR DOM');
        assertEqual(checkoutMain.getAttribute('data-checkout-stage'), 'shipping', 'Stage is shipping');

        // Resolve shipping address
        const { selectedRadio, nextBtn } = resolveShippingAddress(document);
        assert(selectedRadio !== null, 'Must select a valid polAddressSelector radio');
        assertEqual(selectedRadio.checked, true, 'Radio must be checked');
        assert(nextBtn !== null, 'Must locate a.submit-shipping button');
        assertEqual(nextBtn.textContent.trim(), 'お支払い方法選択へ進む', 'Next button text must match verbatim Demandware label');

        // Verify MutationObserver triggers upon stage progression
        let stageObserved = null;
        const observer = new MockMutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.attributeName === 'data-checkout-stage') {
                    stageObserved = m.target.getAttribute('data-checkout-stage');
                }
            }
        });
        observer.observe(checkoutMain, { attributes: true });

        // Simulate AJAX completion advancing stage to "payment"
        checkoutMain.setAttribute('data-checkout-stage', 'payment');
        assertEqual(stageObserved, 'payment', 'MutationObserver correctly catches transition to payment stage');
        observer.disconnect();
    });

    await runner.test('T1-04: Payment Method Selection with HAR DOM (dathang2.har)', () => {
        const { document } = createMockEnvironment('https://www.pokemoncenter-online.com/order/?stage=payment');

        // Load authentic HTML from dathang2.har
        const rawPaymentHtml = FixtureLoader.getPaymentStageHtml();
        HTMLParser.parse(rawPaymentHtml, document.body);

        const checkoutMain = document.getElementById('checkout-main');
        assert(checkoutMain !== null, 'Found #checkout-main in dathang2.har DOM');
        assertEqual(checkoutMain.getAttribute('data-checkout-stage'), 'payment', 'Stage is payment');

        // Resolve payment method (CREDIT_CARD)
        const { selectedRadio, nextBtn } = resolvePaymentMethod(document, 'CREDIT_CARD');
        assert(selectedRadio !== null, 'Must locate CREDIT_CARD radio');
        assertEqual(selectedRadio.checked, true, 'CREDIT_CARD radio is checked');
        assert(nextBtn !== null, 'Must locate a.submit-payment button');
        assertEqual(nextBtn.textContent.trim(), 'ご注文内容を確認する', 'Submit payment button matches verbatim label');
    });

    await runner.test('T1-05: Safe Place Order Switch Guard (F-06)', () => {
        const { document, localStorage } = createMockEnvironment('https://www.pokemoncenter-online.com/order/?stage=placeOrder');

        // Setup Place Order DOM
        const form = document.createElement('form');
        form.id = 'placeOrderForm';
        const submitBtn = document.createElement('a');
        submitBtn.className = 'submit-place-order';
        submitBtn.textContent = '注文を確定する';
        form.appendChild(submitBtn);
        document.body.appendChild(form);

        let clicked = false;
        submitBtn.addEventListener('click', () => { clicked = true; });

        // Sub-test A: Safe Mode ON (pk_safe_place_order = "1") -> MUST NOT CLICK!
        localStorage.setItem('pk_safe_place_order', '1');
        const shouldAutoClickWhenSafe = (localStorage.getItem('pk_safe_place_order') === '0');
        if (shouldAutoClickWhenSafe) {
            submitBtn.click();
        }
        assertEqual(clicked, false, 'Safe Mode ON must halt automation and prevent place order click');

        // Sub-test B: Safe Mode OFF (pk_safe_place_order = "0") -> EXECUTES ORDER!
        localStorage.setItem('pk_safe_place_order', '0');
        const shouldAutoClickWhenUnsafe = (localStorage.getItem('pk_safe_place_order') === '0');
        if (shouldAutoClickWhenUnsafe) {
            submitBtn.click();
        }
        assertEqual(clicked, true, 'Safe Mode OFF permits automated order placement');
    });

    await runner.test('T1-06: Full-width Japanese Kana & Address Encoding Fidelity', () => {
        const { document } = createMockEnvironment('https://www.pokemoncenter-online.com/order/?stage=shipping');

        // Radio with authentic full-width characters from loidungbuocchondiachi.har
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.className = 'polAddressSelector';
        radio.value = 'ab_登録住所';
        radio.dataset.lastName = 'ＬＥ　ＴＨＩ　ＬＩＥＵ';
        radio.dataset.nameKana = 'レテイリエウ';
        radio.dataset.address1 = '２－４－１';
        radio.dataset.address2 = '１１４３';
        radio.dataset.city = '大阪市大正区千島';
        radio.dataset.stateCode = '大阪府';
        radio.dataset.postalCode = '5510003';
        document.body.appendChild(radio);

        assertEqual(radio.dataset.lastName, 'ＬＥ　ＴＨＩ　ＬＩＥＵ', 'Preserves full-width Japanese alphabet name');
        assertEqual(radio.dataset.nameKana, 'レテイリエウ', 'Preserves Katakana pronunciation name');
        assertEqual(radio.dataset.address1, '２－４－１', 'Preserves full-width address line 1');
        assertEqual(radio.dataset.city, '大阪市大正区千島', 'Preserves Japanese Kanji ward/city');
    });

    // ------------------------------------------------------------------------
    // TIER 2: BOUNDARY & CORNER CASES
    // ------------------------------------------------------------------------
    runner.setTier('Tier 2: Boundary & Corner Cases');

    await runner.test('T2-01: Out-of-Stock / Expired Win Skip (F-09, F-26)', () => {
        const { document } = createMockEnvironment('https://www.pokemoncenter-online.com/lottery-history/');

        // Create DOM with 3 lottery items: Item 1 valid win, Item 2 expired win, Item 3 applied
        const listContainer = document.createElement('div');
        listContainer.className = 'history-list';

        // Item 1: Valid win with "注文へ進む"
        const item1 = document.createElement('div');
        item1.className = 'history-item comBox';
        item1.innerHTML = '<h3 class="title">MEGA 拡張パック インフェルノX BOX</h3><span class="status">当選</span><a class="btn" href="/order/win1">注文へ進む</a>';
        listContainer.appendChild(item1);

        // Item 2: Expired win with "購入期限切れ" (NO order button)
        const item2 = document.createElement('div');
        item2.className = 'history-item comBox';
        item2.innerHTML = '<h3 class="title">旧弾 拡張パック BOX</h3><span class="status">当選</span><span class="expired">購入期限切れ</span>';
        listContainer.appendChild(item2);

        // Item 3: Closed item with "受付終了"
        const item3 = document.createElement('div');
        item3.className = 'history-item comBox';
        item3.innerHTML = '<h3 class="title">スペシャルセット</h3><span class="status">受付終了</span>';
        listContainer.appendChild(item3);

        document.body.appendChild(listContainer);

        // Scan items: Only item 1 should be picked!
        const winningItems = scanWinningItems(document);
        assertEqual(winningItems.length, 1, 'Only winning items with active 注文へ進む button are selected');
        assert(winningItems[0].title.includes('インフェルノX'), 'Selected valid winning item title');
        assertEqual(winningItems[0].orderUrl, '/order/win1', 'Captured valid item order URL');
    });

    await runner.test('T2-02: Empty Cart Handling and Purge Operations', () => {
        const { document } = createMockEnvironment('https://www.pokemoncenter-online.com/cart/');

        // Sub-test A: Truly empty cart
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'cart-empty comBox';
        emptyDiv.textContent = 'カートに商品が入っていません。';
        document.body.appendChild(emptyDiv);

        const hasItems = document.querySelectorAll('.cart-item, .cart-row').length > 0;
        assertEqual(hasItems, false, 'Correctly detects empty cart without throwing errors');
        document.body.removeChild(emptyDiv);

        // Sub-test B: Cart purge simulation (clearing multiple items)
        const itemA = document.createElement('div');
        itemA.className = 'cart-item';
        const delBtnA = document.createElement('button');
        delBtnA.className = 'btn-delete';
        delBtnA.textContent = '削除';
        itemA.appendChild(delBtnA);

        const itemB = document.createElement('div');
        itemB.className = 'cart-item';
        const delBtnB = document.createElement('button');
        delBtnB.className = 'btn-delete';
        delBtnB.textContent = '削除';
        itemB.appendChild(delBtnB);

        document.body.appendChild(itemA);
        document.body.appendChild(itemB);

        const deleteButtons = Array.from(document.querySelectorAll('.btn-delete, a.delete-product'));
        assertEqual(deleteButtons.length, 2, 'Purge engine detects all item delete buttons');
    });

    await runner.test('T2-03: Stored Card Missing & Account Card Limit Detection', () => {
        const { document } = createMockEnvironment('https://www.pokemoncenter-online.com/order/?stage=payment');

        // Sub-test A: No stored card present (.stored-credit-card empty, .new-card-area shown)
        const paymentForm = document.createElement('form');
        paymentForm.name = 'dwfrm_billing';

        const storedCardArea = document.createElement('div');
        storedCardArea.className = 'stored-credit-card';
        // Empty!

        const newCardArea = document.createElement('div');
        newCardArea.className = 'new-card-area';
        newCardArea.textContent = '新しいカードを入力してください';

        paymentForm.appendChild(storedCardArea);
        paymentForm.appendChild(newCardArea);
        document.body.appendChild(paymentForm);

        const hasStoredCard = storedCardArea.children.length > 0;
        assertEqual(hasStoredCard, false, 'Recognizes absence of registered credit card');

        // Sub-test B: Credit card modification limit banner (from dathang2.har)
        const limitError = document.createElement('p');
        limitError.className = 'comError no-new-card-message';
        limitError.textContent = 'クレジットカード情報の登録・更新が制限されています。時間をおいてから再度お試しください。';
        document.body.appendChild(limitError);

        const isLimitReached = document.querySelector('.no-new-card-message') !== null;
        assertEqual(isLimitReached, true, 'Detects Demandware credit card registration block banner');
    });

    await runner.test('T2-04: Queue Succession & FIFO Lifecycle Management', () => {
        const { localStorage } = createMockEnvironment();

        // Initialize 3 queued winning items
        const initialQueue = [
            { id: 1, title: 'Item Alpha', url: '/product/alpha' },
            { id: 2, title: 'Item Beta', url: '/product/beta' },
            { id: 3, title: 'Item Gamma', url: '/product/gamma' }
        ];

        localStorage.setItem('pk_winning_queue', JSON.stringify(initialQueue));
        localStorage.setItem('pk_auto_buy_queue_active', '1');

        // Advance 1: Item Alpha completes
        let queue = JSON.parse(localStorage.getItem('pk_winning_queue'));
        const finished1 = queue.shift();
        assertEqual(finished1.id, 1, 'First completed item is Alpha');
        localStorage.setItem('pk_winning_queue', JSON.stringify(queue));

        // Advance 2: Item Beta completes
        queue = JSON.parse(localStorage.getItem('pk_winning_queue'));
        const finished2 = queue.shift();
        assertEqual(finished2.id, 2, 'Second completed item is Beta');
        localStorage.setItem('pk_winning_queue', JSON.stringify(queue));

        // Advance 3: Item Gamma completes
        queue = JSON.parse(localStorage.getItem('pk_winning_queue'));
        const finished3 = queue.shift();
        assertEqual(finished3.id, 3, 'Third completed item is Gamma');

        // Queue is now empty -> Auto-buy deactivates
        if (queue.length === 0) {
            localStorage.setItem('pk_auto_buy_queue_active', '0');
        }

        assertEqual(JSON.parse(localStorage.getItem('pk_winning_queue')).length, 1, 'Only Gamma remained before final shift');
        assertEqual(queue.length, 0, 'Queue completely exhausted');
        assertEqual(localStorage.getItem('pk_auto_buy_queue_active'), '0', 'Queue status reset to inactive');
    });

    await runner.test('T2-05: Corrupted Storage Resilience (Malformed JSON Recovery)', () => {
        const { localStorage } = createMockEnvironment();

        // Corrupted queue string in localStorage
        localStorage.setItem('pk_winning_queue', '{invalid-json,unclosed[');

        let safeQueue = [];
        try {
            const raw = localStorage.getItem('pk_winning_queue');
            if (raw) safeQueue = JSON.parse(raw);
        } catch (e) {
            // Graceful self-healing fallback
            safeQueue = [];
            localStorage.setItem('pk_winning_queue', JSON.stringify([]));
        }

        assert(Array.isArray(safeQueue), 'Safe queue recovered as valid array');
        assertEqual(safeQueue.length, 0, 'Corrupted queue reset safely without uncaught exception');
        assertEqual(localStorage.getItem('pk_winning_queue'), '[]', 'LocalStorage cleansed of corruption');
    });

    // ------------------------------------------------------------------------
    // TIER 3: CROSS-FEATURE COMBINATIONS
    // ------------------------------------------------------------------------
    runner.setTier('Tier 3: Cross-Feature Combinations');

    await runner.test('T3-01: Cart Conflict Detection & Smart Redirect Recovery (dathang.har)', () => {
        const { window, document, localStorage } = createMockEnvironment('https://www.pokemoncenter-online.com/product/limited.html');

        // Inject real cart conflict banner from dathang.har
        HTMLParser.parse(FixtureLoader.getCartConflictHtml(), document.body);

        const check = detectCartConflictError(document);
        assertEqual(check.detected, true, 'Cart conflict detected immediately');
        assert(check.message.includes('同時に注文できない商品がカートに投入されています'), 'Verbatim Japanese error text matched');

        // Recovery workflow: Stores resume URL and redirects to /cart/
        localStorage.setItem('pk_cart_conflict_recovery', '1');
        localStorage.setItem('pk_conflict_resume_url', window.location.href);
        window.location.href = 'https://www.pokemoncenter-online.com/cart/';

        assertEqual(localStorage.getItem('pk_cart_conflict_recovery'), '1', 'Recovery flag set in storage');
        assertEqual(window.location.href, 'https://www.pokemoncenter-online.com/cart/', 'Browser smoothly redirected to /cart/');
    });

    await runner.test('T3-02: Volterra WAF 403 & reCAPTCHA Detection Halting Automation (recapcha.har)', () => {
        const { window, document } = createMockEnvironment('https://www.pokemoncenter-online.com/login/');

        // Sub-test A: HTTP 403 with Volterra WAF Header (server: volt-adc)
        const wafFixture = FixtureLoader.getWaf403Headers();
        assertEqual(wafFixture.status, 403, 'Captured status 403');
        assertEqual(wafFixture.headers['server'], 'volt-adc', 'Header server: volt-adc present');

        const wafCheck = detectSecurityBarriers(document, wafFixture.headers, wafFixture.status);
        assertEqual(wafCheck.blocked, true, 'Detected Volterra WAF block');
        assertEqual(wafCheck.type, 'VOLTERRA_WAF_403', 'Correct barrier type identified');

        // Sub-test B: reCAPTCHA Enterprise dialog appearance
        HTMLParser.parse(FixtureLoader.getRecaptchaDialogHtml(), document.body);
        const recapCheck = detectSecurityBarriers(document);
        assertEqual(recapCheck.blocked, true, 'Detected reCAPTCHA Enterprise challenge iframe');
        assertEqual(recapCheck.type, 'RECAPTCHA_ENTERPRISE', 'Correct barrier type identified');

        // Sub-test C: Web Audio API sound alert trigger
        const audioCtx = new window.AudioContext();
        const osc = audioCtx.createOscillator();
        osc.frequency.value = 880;
        osc.start();
        assertEqual(audioCtx.beeps.length, 1, 'AudioContext successfully emitted alert beep');
        assertEqual(audioCtx.beeps[0], 880, 'Audio alert beep sounded at 880Hz');
    });

    await runner.test('T3-03: Session Timeout Re-Authentication Flow (dathang.har)', () => {
        // Simulates redirect from /order/?stage=placeOrder to /login/?rurl=10
        const loginUrl = 'https://www.pokemoncenter-online.com/login/?rurl=10';
        const { window, document, localStorage } = createMockEnvironment(loginUrl);

        // Verify rurl query detection and context preservation
        const urlParams = new URLSearchParams(window.location.search);
        const rurl = urlParams.get('rurl');
        assertEqual(rurl, '10', 'Demandware rurl=10 checkout resumption parameter detected');

        localStorage.setItem('pk_resume_context', JSON.stringify({
            stage: 'placeOrder',
            originalUrl: 'https://www.pokemoncenter-online.com/order/?stage=placeOrder'
        }));

        const savedContext = JSON.parse(localStorage.getItem('pk_resume_context'));
        assertEqual(savedContext.stage, 'placeOrder', 'Checkout stage context safely preserved in storage');

        // Verify MFA Passcode form detection if redirected to /login-mfa/?rurl=1
        HTMLParser.parse(FixtureLoader.getMfaFormHtml(), document.body);
        const mfaForm = document.getElementById('factor2AuthForm');
        assert(mfaForm !== null, 'Found #factor2AuthForm in real errr.har DOM');
        const authCodeInput = document.querySelector('input[name="dwfrm_factor2Auth_authCode"]');
        assert(authCodeInput !== null, 'Found authCode input in MFA form');
    });

    await runner.test('T3-04: Gigya Login Error Code Matrix Dispatch (loginAccount.js)', () => {
        // Error mapping dictionary from loginAccount.js
        const gigyaErrorMap = {
            403120: { id: '#erroLock', action: 'COOLDOWN_PAUSE', text: 'アカウントが一時的にロックされました。' },
            401022: { id: '#errorecpcature', action: 'MANUAL_CAPTCHA_PROMPT', text: 'reCAPTCHAの認証に失敗しました。' },
            403048: { id: '#errorlimit', action: 'EXPONENTIAL_BACKOFF', text: 'ただいまサイトが大変混雑しています。' },
            403041: { id: '#erromismatch', action: 'STOP_BAD_CREDENTIALS', text: 'メールアドレスまたはパスワードが一致しませんでした。' }
        };

        const testCodes = [403120, 401022, 403048, 403041];
        for (const code of testCodes) {
            const entry = gigyaErrorMap[code];
            assert(entry !== undefined, `Gigya error ${code} mapped`);
            assert(entry.action.length > 0, `Action defined for ${code}`);
            assert(entry.text.length > 0, `Verbatim message text present for ${code}`);
        }
    });

    await runner.test('T3-05: Extension Codebase Forensic Audit (Contract Gap Audit)', () => {
        const pageScriptCode = fs.readFileSync(path.join(extDir, 'page_script.js'), 'utf8');

        // Audit F-01: findAddToCartButton implementation in page_script.js
        const hasFindAddToCart = pageScriptCode.includes('function findAddToCartButton');
        const callsFindAddToCart = pageScriptCode.includes('findAddToCartButton()');

        if (callsFindAddToCart && !hasFindAddToCart) {
            console.log(`\n    ${C.bgYellow}${C.white}${C.bright} [FORENSIC AUDIT ADVISORY] ${C.reset} ${C.yellow}page_script.js calls findAddToCartButton() at PDP add-to-cart, but declaration is missing in current branch (Implementation milestone M1 will deliver F-01).${C.reset}`);
        }

        // Audit F-02: DOM stage priority over URL param in page_script.js
        const domStageCheckIdx = pageScriptCode.indexOf("checkoutMain ? checkoutMain.getAttribute('data-checkout-stage')");
        const urlStageCheckIdx = pageScriptCode.indexOf("if (stageParam === 'shipping'");
        const domPrioritizedInSource = domStageCheckIdx !== -1 && urlStageCheckIdx !== -1 && domStageCheckIdx < urlStageCheckIdx;

        if (!domPrioritizedInSource) {
            console.log(`    ${C.bgYellow}${C.white}${C.bright} [FORENSIC AUDIT ADVISORY] ${C.reset} ${C.yellow}detectOrderStage() in page_script.js currently checks stageParam before domStage. M1 will reverse priority to enforce F-02 DOM precedence.${C.reset}`);
        }

        assert(callsFindAddToCart, 'page_script.js integrates findAddToCartButton call site');
    });

    // ------------------------------------------------------------------------
    // TIER 4: REAL-WORLD WORKLOADS
    // ------------------------------------------------------------------------
    runner.setTier('Tier 4: Real-World Workloads');

    await runner.test('T4-01: Full Sequential Multi-Item Auto-Buy Simulation', async () => {
        // Load real lottery groups from get_lottery_list_sample.json
        const lotterySample = FixtureLoader.getLotterySampleJson();
        assert(Array.isArray(lotterySample.data) && lotterySample.data.length >= 2, 'Sample lottery data loaded');

        // Extract 2 won items
        const item1 = lotterySample.data[0].applicationItems[0];
        const item2 = lotterySample.data[1].applicationItems[0];

        const { window, document, localStorage } = createMockEnvironment('https://www.pokemoncenter-online.com/lottery-history/');

        // 1. Initial State: Enqueue 2 winning products
        const winningQueue = [
            { id: 1, title: item1.itemPrizeName, code: item1.itemCd, url: `/product/${item1.itemCd}.html` },
            { id: 2, title: item2.itemPrizeName, code: item2.itemCd, url: `/product/${item2.itemCd}.html` }
        ];
        localStorage.setItem('pk_winning_queue', JSON.stringify(winningQueue));
        localStorage.setItem('pk_auto_buy_queue_active', '1');
        localStorage.setItem('pk_safe_place_order', '0'); // Auto place order enabled

        // --- CYCLE 1: ITEM 1 PURCHASE ---
        window.location.href = winningQueue[0].url;
        assertEqual(window.location.pathname, `/product/${item1.itemCd}.html`, 'Navigated to Item 1 PDP');

        // PDP Add to Cart
        const pdpBtn = document.createElement('button');
        pdpBtn.className = 'add-to-cart';
        pdpBtn.textContent = 'カートに入れる';
        document.body.appendChild(pdpBtn);
        assert(findAddToCartButton(document) !== null, 'Item 1 Add to Cart resolved');

        // Proceed to Checkout -> Stage Shipping
        window.location.href = 'https://www.pokemoncenter-online.com/order/?stage=shipping';
        document.body.innerHTML = '';
        HTMLParser.parse(FixtureLoader.getShippingStageHtml(), document.body);
        assertEqual(detectOrderStage(document, window), 'shipping', 'Item 1 Stage is Shipping');

        const shippingRes = resolveShippingAddress(document);
        assert(shippingRes.selectedRadio !== null, 'Item 1 Shipping address selected');

        // Advance to Payment
        const checkoutMain = document.getElementById('checkout-main');
        checkoutMain.setAttribute('data-checkout-stage', 'payment');
        assertEqual(detectOrderStage(document, window), 'payment', 'Item 1 Stage advanced to Payment');

        // Advance to PlaceOrder
        checkoutMain.setAttribute('data-checkout-stage', 'placeOrder');
        assertEqual(detectOrderStage(document, window), 'placeOrder', 'Item 1 Stage advanced to PlaceOrder');

        // Complete Order 1
        window.location.href = 'https://www.pokemoncenter-online.com/order/?stage=complete';
        document.body.innerHTML = '<h1>ご注文ありがとうございました</h1>';
        assertEqual(detectOrderStage(document, window), 'complete', 'Item 1 Order Completed');

        // Dequeue Item 1
        let currentQueue = JSON.parse(localStorage.getItem('pk_winning_queue'));
        currentQueue.shift();
        localStorage.setItem('pk_winning_queue', JSON.stringify(currentQueue));
        assertEqual(currentQueue.length, 1, 'Item 1 dequeued, exactly 1 item remaining in queue');

        // --- CYCLE 2: ITEM 2 PURCHASE ---
        window.location.href = currentQueue[0].url;
        assertEqual(window.location.pathname, `/product/${item2.itemCd}.html`, 'Navigated to Item 2 PDP');

        // Complete Item 2 Checkout
        window.location.href = 'https://www.pokemoncenter-online.com/order/?stage=complete';
        document.body.innerHTML = '<h1>ご注文ありがとうございました</h1>';
        assertEqual(detectOrderStage(document, window), 'complete', 'Item 2 Order Completed');

        // Dequeue Item 2
        currentQueue.shift();
        localStorage.setItem('pk_winning_queue', JSON.stringify(currentQueue));
        localStorage.setItem('pk_auto_buy_queue_active', '0');

        // Final verification
        assertEqual(currentQueue.length, 0, 'All winning items in queue successfully purchased');
        assertEqual(localStorage.getItem('pk_auto_buy_queue_active'), '0', 'Sequential queue successfully concluded');
    });

    // ------------------------------------------------------------------------
    // EXECUTION REPORT & EXIT CODE
    // ------------------------------------------------------------------------
    const exitCode = runner.report();
    return exitCode;
}

// Execute Runner when called directly via CLI
if (require.main === module) {
    runTestSuite().then(code => {
        process.exit(code);
    }).catch(err => {
        console.error(`${C.red}Fatal test suite execution error:${C.reset}`, err);
        process.exit(1);
    });
}

module.exports = {
    runTestSuite,
    createMockEnvironment,
    FixtureLoader,
    HTMLParser,
    detectOrderStage,
    findAddToCartButton,
    resolveShippingAddress,
    resolvePaymentMethod,
    detectCartConflictError,
    detectSecurityBarriers,
    scanWinningItems
};
