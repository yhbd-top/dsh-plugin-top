// 冒烟测试：模拟 DSH 浏览器 loader + mini React hook 运行时，无头跑通
// dist/client.js 的完整交互链路：模块面 → slot 注册 → 面板渲染 →
// 五榜单切换 → 安装按钮复制仓库地址并打开客户端「插件」页
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
  navigator: { clipboard: { writeText: (t) => { copiedText = t; } } },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
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
// 新版只硬依赖 slots（「插件」页走 ctx.get("layout") 可选访问）
if (JSON.stringify(face.inject) !== JSON.stringify(["slots"])) {
  console.error("FAIL: inject 名单不对"); process.exit(1);
}

// ---------------- ctx 假实现：slots + 可选 layout ----------------
let copiedText = "";
let panelSelected = null;
let captured = null;
const registrations = [];
// 模拟插件页交下来的 action（真实来源：dsh-client-ui-plugin-manager 对 plugins.item 的注入）
const dialogCalls = [];
const ctxFake = {
  get: (k) => (k === "layout" ? { selectPanel: (id) => { panelSelected = id; } } : undefined),
  slots: {
    inject: (name, fn) => {
      const reg = fn();
      registrations.push({ name, reg });
      if (name === "sidebar.footer.action") captured = { slot: name, reg };
    },
    register: (meta, Comp) => [meta, Comp],
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

// ---------------- [6] 安装 → 复制仓库地址 + 打开客户端「插件」页 ----------------
const pending = []; // 本轮无异步用例；保留尾部 Promise.all 结构
// 面板上的 action 是同步的（复制 + selectPanel），点完即可断言。
// 「打开『添加插件』并把地址填进去」走的是 DOM 通道（查 aria-haspopup="dialog" 按钮，
// 再用原生 value setter + input 事件写入），需要真实浏览器环境，沙箱里没有 document，
// 因此这里只断言一定成立的部分；DOM 那条以真实应用的诊断轨迹为准。
{
  const tree = renderOpen("top");
  const btn = walk(tree, (n) => n.p && n.p["data-yhbd-inst"] !== undefined)[0];
  const click = () => btn.p.onClick({ stopPropagation() {}, target: { closest: () => null } });

  copiedText = "";
  panelSelected = null;
  click();
  const ok = copiedText === "https://github.com/u/mem-a" && panelSelected === "plugins";
  console.log("[6] 安装 → 复制仓库地址 + 打开「插件」页:", ok ? "✓" : "✗",
    "| copied=" + JSON.stringify(copiedText) + " panel=" + JSON.stringify(panelSelected));
  if (!ok) pass = false;

  // 没有 layout 服务（或它没有 selectPanel）时：仍然复制，只是不开面板
  const ctxNoLayout = { slots: ctxFake.slots, get: () => undefined };
  face.apply(ctxNoLayout);
  const onInstallNoLayout = captured.reg[0].inject().onInstall;
  copiedText = "";
  const r2 = onInstallNoLayout({ repo: "u/mem-a" });
  const ok2 = copiedText === "https://github.com/u/mem-a" && r2.ok === true && r2.openedPluginsPanel === false;
  console.log("[6] 无 layout 时仍复制:", ok2 ? "✓" : "✗", "| copied=" + JSON.stringify(copiedText));
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

// 等异步断言（[6c] 的新会话路径）全部结算后再出总结
Promise.all(pending).then(() => {
  console.log(pass ? "SMOKE DONE · ALL PASS" : "SMOKE DONE · HAS FAILURES");
  process.exit(pass ? 0 : 1);
});
