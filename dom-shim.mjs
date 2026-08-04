/**
 * dom-shim.mjs — крошечная реализация DOM, достаточная для наших компонентов.
 * Не претендует на полноту; поддерживает только используемые в проекте API.
 */
class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  _sync() { this.node._className = [...this.set].join(' '); }
  add(...cs) { cs.forEach((c) => c && this.set.add(c)); this._sync(); }
  remove(...cs) { cs.forEach((c) => this.set.delete(c)); this._sync(); }
  toggle(c, force) {
    const has = this.set.has(c);
    const on = force === undefined ? !has : force;
    if (on) this.set.add(c); else this.set.delete(c);
    this._sync(); return on;
  }
  contains(c) { return this.set.has(c); }
}

class MockNode {
  constructor(tag) {
    this.tagName = (tag || '').toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.classList = new ClassList(this);
    this._className = '';
    this.dataset = {};
    this.style = makeStyle();
    this.attrs = {};
    this._listeners = {};
    this._text = '';
    this.clientWidth = 800;
    this.clientHeight = 200;
    this.scrollTop = 0;
    this.scrollHeight = 0;
  }
  get className() { return this._className; }
  set className(v) {
    this._className = v || '';
    this.classList.set = new Set(String(v || '').split(/\s+/).filter(Boolean));
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join('');
    return this._text;
  }
  set textContent(v) { this.children = []; this._text = String(v); }
  set innerHTML(v) { this.children = []; this._text = String(v).replace(/<[^>]*>/g, ''); }
  get innerHTML() { return this._text; }
  get firstChild() { return this.children[0] || null; }
  get value() { return this.attrs.value ?? ''; }
  set value(v) { this.attrs.value = v; }
  get checked() { return !!this.attrs.checked; }
  set checked(v) { this.attrs.checked = !!v; }
  get disabled() { return !!this.attrs.disabled; }
  set disabled(v) { this.attrs.disabled = !!v; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  append(...nodes) {
    for (const n of nodes) {
      const node = (n && n.nodeType) ? n : txt(String(n));
      node.parentNode = this;
      this.children.push(node);
    }
  }
  appendChild(n) { this.append(n); return n; }
  removeChild(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) { this.children.splice(i, 1); n.parentNode = null; }
    return n;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    if (this._listeners[type]) this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
  }
  contains(node) {
    let n = node;
    while (n) { if (n === this) return true; n = n.parentNode; }
    return false;
  }
  closest(sel) {
    let n = this;
    while (n) { if (matches(n, sel)) return n; n = n.parentNode; }
    return null;
  }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  // Тестовый помощник: диспатч события.
  _fire(type, event = {}) {
    event.target ||= this;
    (this._listeners[type] || []).forEach((fn) => fn(event));
  }
  focus() {}
  blur() {}
}

function makeStyle() {
  const props = {};
  return {
    setProperty(k, v) { props[k] = v; },
    getPropertyValue(k) { return props[k] ?? ''; },
    removeProperty(k) { delete props[k]; },
  };
}

function txt(s) { const n = new MockNode('#text'); n.nodeType = 3; n._text = s; return n; }

function matches(node, sel) {
  if (node.nodeType !== 1) return false;
  if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
  if (sel.startsWith('#')) return node.id === sel.slice(1);
  if (sel.startsWith('[')) {
    const m = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (!m) return false;
    const key = m[1].replace(/^data-/, '');
    const val = m[2];
    const actual = m[1].startsWith('data-') ? node.dataset[camel(key)] : node.attrs[m[1]];
    return val === undefined ? actual !== undefined : String(actual) === val;
  }
  return node.tagName === sel.toUpperCase();
}
function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

function queryAll(root, sel) {
  const out = [];
  const walk = (node) => {
    for (const c of node.children) {
      if (c.nodeType === 1) { if (matches(c, sel)) out.push(c); walk(c); }
    }
  };
  walk(root);
  return out;
}

export function installDom() {
  const document = {
    createElement: (t) => new MockNode(t),
    createTextNode: (s) => txt(s),
    body: new MockNode('body'),
    _roots: [],
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) { return queryAll(document.body, sel)[0] || null; },
    querySelectorAll(sel) { return queryAll(document.body, sel); },
  };
  globalThis.document = document;
  globalThis.window = { AudioContext: undefined, webkitAudioContext: undefined };
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: async () => {} } },
      configurable: true, writable: true,
    });
  } catch (_) { /* navigator уже определён окружением — ок */ }
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 0; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return { document, MockNode, queryAll };
}
