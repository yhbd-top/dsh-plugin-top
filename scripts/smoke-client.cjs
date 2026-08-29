// 冒烟测试：模拟 DSH 浏览器 loader + mini React hook 运行时，无头跑通
// dist/client.js 的完整交互链路：模块面 → slot 注册 → 面板渲染 →
// 五榜单切换 → 安装按钮写入会话输入框（draft 捕获断言）
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const code = fs.readFileSync(path.join(__dirname, "..", "dist", "client.js"), "utf8");

// ---------------- mini React：hook 槽位跨 render() 持久 ----------------
let slots = [];
let slotI = 0;
const refSlots = [];
let refI = 0;
function resetHooks() { slotI = 0; refI = 0; }

const React = {
  createElement: (t, p, ...c) => ({ t, p: p || {}, c: c.flat(Infinity).filter(Boolean) }),
  Fragment: "F",
  useState: (init) => {
    const i = slotI++;
    if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init;
    return [slots[i], (v) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }];
  },
  useEffect: () => {},
  useRef: (init) => { const i = refI++; if (!(i in refSlots)) refSlots[i] = { current: init === undefined ? null : init }; return refSlots[i]; },
  useCallback: (f) => f,
  useMemo: (fn) => fn(),
};

// ---------------- 浏览器环境沙箱 ----------------
const sandbox = {
  window: {
    __ModuleLoader__: { load: (reg) => { sandbox.__reg = reg; } },
    innerWidth: 1600,
    innerHeight: 900,
    open: () => {},
  },
  document: {
    querySelector: () => ({}),
    createElement: () => ({ setAttribute() {}, textContent: "" }),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
  },
  navigator: {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  console,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
console.log("[1] __ModuleLoader__.load fired:", sandbox.__reg ? "dsh-plugin-top" : "MISSING");

const face = sandbox.__reg.factory((spec) => {
  if (spec === "react") return React;
  throw new Error("unexpected require: " + spec);
});
const faceKeys = Object.keys(face).sort().join(",");
console.log("[2] module face:", faceKeys, "| inject:", JSON.stringify(face.inject));
if (faceKeys !== "apply,inject") { console.error("FAIL: module face"); process.exit(1); }
if (JSON.stringify(face.inject) !== JSON.stringify(["slots", "sessions", "conversation"])) {
  console.error("FAIL: inject 名单不对"); process.exit(1);
}

// ---------------- ctx 假实现：slots + sessions + conversation ----------------
let draft = "";
let captured = null;
const ctxFake = {
  slots: {
    inject: (name, fn) => { captured = { slot: name, reg: fn() }; },
    register: (meta, Comp) => [meta, Comp],
  },
  sessions: {
    list: { getSnapshot: () => ({ current: "session-smoke" }) },
    scope: (id) => ({ id }),
  },
  conversation: {
    input: {
      for: () => ({
        state: { getSnapshot: () => ({ draft }) },
        setDraft: (t) => { draft = t; },
      }),
    },
  },
};
face.apply(ctxFake);
console.log("[3] slot:", JSON.stringify({ slot: captured.slot, entryId: captured.reg[0].id }));
if (captured.slot !== "sidebar.footer.action" || captured.reg[0].id !== "yhbd-top-panel") {
  console.error("FAIL: slot 注册不对"); process.exit(1);
}

// ---------------- 假数据 fixture（含 native/兼容/飙升/新秀/双分类） ----------------
const fixture = {
  total: 7, date: "2026-08-28", newToday: 2,
  cats: { "memory-knowledge": "记忆与知识", "vision-media": "视觉与多媒体", other: "其它" },
  newSlugs: ["mem-a", "vis-b"],
  risingSlugs: [{ slug: "mem-a", delta: 5 }, { slug: "cmp-z", delta: 2 }],
  plugins: [
    { slug: "mem-a", repo: "u/mem-a", desc: "记忆管理", stars: 300, cat: "memory-knowledge", kind: "plugin", n: 1 },
    { slug: "vis-b", repo: "u/vis-b", desc: "视觉生成", stars: 200, cat: "vision-media", kind: "plugin", n: 1 },
    { slug: "mem-c", repo: "u/mem-c", desc: "记忆二", stars: 100, cat: "memory-knowledge", kind: "plugin", n: 1 },
    { slug: "vis-d", repo: "u/vis-d", desc: "视觉二", stars: 90, cat: "vision-media", kind: "plugin", n: 1 },
    { slug: "cmp-x", repo: "u/cmp-x", desc: "通用工具X", stars: 5000, cat: "other", kind: "client", n: 0 },
    { slug: "cmp-y", repo: "u/cmp-y", desc: "通用工具Y", stars: 4000, cat: "other", kind: "client", n: 0 },
    { slug: "cmp-z", repo: "u/cmp-z", desc: "通用工具Z", stars: 10, cat: "other", kind: "client", n: 0 },
  ],
};

const props = { wide: true, ...captured.reg[0].inject() };
const Comp = captured.reg[1];

function walk(node, pred, out) {
  out = out || [];
  if (!node || typeof node !== "object") return out;
  if (pred(node)) out.push(node);
  (node.c || []).forEach((k) => walk(k, pred, out));
  return out;
}

function renderOpen(tabId) {
  slots = []; // 重置 hook 状态
  // 第一次渲染初始化 hooks（open=false），再手动置 open+data 重渲染
  resetHooks(); Comp(props);
  slots[0] = true;             // open
  slots[1] = fixture;          // data
  slots[6] = tabId;            // tab
  slots[7] = { width: "880px", height: "700px", left: "60px", top: "24px" }; // pos
  resetHooks();
  return Comp(props);
}

// ---------------- [4] 面板渲染 + 榜单数量（全部/原生/飙升/新秀/兼容/冠军） ----------------
const POS = { width: "880px", height: "700px", left: "60px", top: "24px" };
const expect = { all: 7, top: 4, rising: 2, new: 2, compat: 3, champs: 2 };
let pass = true;
for (const [tabId, want] of Object.entries(expect)) {
  const tree = renderOpen(tabId);
  const panel = walk(tree, (n) => n.p && n.p["data-yhbd-panel"] !== undefined);
  const rows = walk(tree, (n) => n.p && n.p["data-yhbd-row"] !== undefined);
  const tabs = walk(tree, (n) => n.p && n.p["data-yhbd-tab"] !== undefined);
  const ok = panel.length === 1 && rows.length === want && tabs.length === 6;
  console.log("[4:" + tabId + "] panel=" + panel.length + " rows=" + rows.length + "/want " + want + " tabs=" + tabs.length + (ok ? " ✓" : " ✗"));
  if (!ok) pass = false;
}

// ---------------- [4b] 分类条联动：选中榜单后分类只统计榜内插件 ----------------
{
  // 今日新秀榜只有 mem-a(memory) + vis-b(vision) → 分类条应只有这 2 类，各 1，不含 other/兼容
  function chipText(n) {
    const out = [];
    (function grab(x) {
      if (typeof x === "string") out.push(x);
      else if (Array.isArray(x)) x.forEach(grab);
    }(n.c));
    return out.join("");
  }
  const tree = renderOpen("new");
  const chips = walk(tree, (n) => n.p && n.p["data-yhbd-cat"] !== undefined);
  const texts = chips.map(chipText);
  const hasMemory = texts.some((t) => t.includes("记忆与知识 1"));
  const hasVision = texts.some((t) => t.includes("视觉与多媒体 1"));
  const hasOther = texts.some((t) => /其它 [23]/.test(t)); // 不该出现全站其它计数
  const ok = hasMemory && hasVision && !hasOther && chips.length === 3; // 全部 + 2 分类
  console.log("[4b] 新秀榜分类联动:", "chips=" + chips.length, JSON.stringify(texts), ok ? "✓" : "✗");
  if (!ok) pass = false;
}

// ---------------- [4c] 榜单内按分类过滤（不跳回全集） ----------------
{
  // 全部榜(7) 选 memory-knowledge → 只剩 mem-a、mem-c 两条 native
  slots = []; resetHooks(); Comp(props);
  slots[0] = true; slots[1] = fixture; slots[5] = "memory-knowledge"; slots[7] = POS; // cat
  resetHooks();
  const tree = Comp(props);
  const rows = walk(tree, (n) => n.p && n.p["data-yhbd-row"] !== undefined);
  const ok = rows.length === 2;
  console.log("[4c] 全部榜内选分类:", rows.length, "/want 2", ok ? "✓" : "✗");
  if (!ok) pass = false;
  // 关键：在新秀榜内选 memory，应只剩 mem-a（1 条），不是全站的 2 条 memory
  slots = []; resetHooks(); Comp(props);
  slots[0] = true; slots[1] = fixture; slots[6] = "new"; slots[5] = "memory-knowledge"; slots[7] = POS;
  resetHooks();
  const rows2 = walk(Comp(props), (n) => n.p && n.p["data-yhbd-row"] !== undefined);
  const ok2 = rows2.length === 1;
  console.log("[4c] 新秀榜内选分类:", rows2.length, "/want 1（榜内过滤）", ok2 ? "✓" : "✗");
  if (!ok2) pass = false;
}

// ---------------- [5] champs 行含 🏆、rising 行含 ▲ ----------------
{
  const tree = renderOpen("champs");
  const metas = walk(tree, (n) => n.p && n.p["data-yhbd-row"] !== undefined);
  const flat = JSON.stringify(metas);
  const ok = flat.includes("🏆");
  console.log("[5] champs 带 🏆 徽章:", ok ? "✓" : "✗");
  if (!ok) pass = false;
  const tree2 = renderOpen("rising");
  const ok2 = JSON.stringify(walk(tree2, (n) => n.p && n.p["data-yhbd-row"] !== undefined)).includes("▲5");
  console.log("[5] rising 带 ▲delta:", ok2 ? "✓" : "✗");
  if (!ok2) pass = false;
}

// ---------------- [6] 安装 → 会话输入框 draft ----------------
{
  const tree = renderOpen("top");
  const btn = walk(tree, (n) => n.p && n.p["data-yhbd-inst"] !== undefined)[0];
  btn.p.onClick({ stopPropagation() {}, target: { closest: () => null } });
  const ok = draft.includes("dsh plugin add u/mem-a") && draft.includes("帮我安装");
  console.log("[6] 安装写入 draft:", ok ? "✓" : "✗", "| draft=" + JSON.stringify(draft.slice(0, 60)) + "…");
  if (!ok) pass = false;
  // 已有草稿时换行追加不覆盖
  draft = "旧内容";
  btn.p.onClick({ stopPropagation() {}, target: { closest: () => null } });
  const ok2 = draft.startsWith("旧内容\n") && draft.includes("u/mem-a");
  console.log("[6] 追加不覆盖:", ok2 ? "✓" : "✗");
  if (!ok2) pass = false;
}

// ---------------- [7] 搜索 + 分类过滤 ----------------
{
  slots = []; resetHooks(); Comp(props);
  slots[0] = true; slots[1] = fixture; slots[4] = "记忆"; slots[7] = POS; // q
  resetHooks();
  const tree = Comp(props);
  const rows = walk(tree, (n) => n.p && n.p["data-yhbd-row"] !== undefined);
  const ok = rows.length === 2;
  console.log("[7] 搜索“记忆”命中:", rows.length, "/want 2", ok ? "✓" : "✗");
  if (!ok) pass = false;
  // 只选分类 chip：全量该分类，不截断
  slots = []; resetHooks(); Comp(props);
  slots[0] = true; slots[1] = fixture; slots[5] = "other"; slots[7] = POS; // cat
  resetHooks();
  const tree2 = Comp(props);
  const rows2 = walk(tree2, (n) => n.p && n.p["data-yhbd-row"] !== undefined);
  const ok2 = rows2.length === 3;
  console.log("[7] 分类 other 全量:", rows2.length, "/want 3", ok2 ? "✓" : "✗");
  if (!ok2) pass = false;
}

console.log(pass ? "SMOKE DONE · ALL PASS" : "SMOKE DONE · HAS FAILURES");
process.exit(pass ? 0 : 1);
