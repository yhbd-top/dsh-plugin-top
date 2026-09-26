// dsh-plugin-top · 浏览器端模块（CJS body，由 scripts/build-client.cjs 包裹为
// window.__ModuleLoader__.load({ id, factory }) —— 与官方 dsh-client-ui-* 产物同形）
//
// 客户场景：
//   1. 装完插件 → DSH 侧边栏出现 plugin_top 按钮 → 点开悬浮面板
//   2. 搜索框（本地即时搜）+ 分类 chips + 三个榜（今日新增/近期飙升/原生星榜）
//   3. 点行 → 新开 yhbd.top 详情页；点「安装」→ 复制该插件的 GitHub 仓库地址，并打开
//      客户端自带的「插件」页（在那里点「添加插件」把地址粘进去即可安装）
//      —— 走官方入口 ctx.layout.selectPanel("plugins")
// 数据源：DSH Web 同源 /api/plugin-top/data（由服务端反代 yhbd.top，无需 CORS）
// 客户端缓存：sessionStorage（6 小时新鲜度）

"use strict";

const React = require("react");
const h = React.createElement;
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const DATA_URL = "/api/plugin-top/data"; // 同源，server 端反代 yhbd.top
const SITE = "https://www.yhbd.top";
const CACHE_KEY = "dsh-plugin-top.micro.v1";
const CACHE_FRESH_MS = 6 * 60 * 60 * 1000;

// ---------------------------------------------------------------- css
const CSS = `
[data-yhbd-button]{cursor:pointer;color:var(--dsw-alias-label-primary,#222);background:transparent;border:none;font:inherit;outline:none;font-family:inherit}
[data-yhbd-button].yhbd-rail{display:flex;justify-content:center;align-items:center;width:100%;height:36px;padding:0}
[data-yhbd-button].yhbd-wide{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding:6px 12px;border-radius:8px;text-align:left;font-size:13px}
[data-yhbd-button]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
[data-yhbd-button] .yhbd-ico{font-size:15px;line-height:1}
[data-yhbd-panel]{position:fixed;z-index:1000;display:flex;flex-direction:column;overflow:hidden;
 background:var(--dsw-alias-float-elevated-bg,#fff);color:var(--dsw-alias-label-primary,#222);
 border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));border-radius:12px;
 box-shadow:0 8px 32px rgba(0,0,0,.2);font-size:13px;font-family:inherit;
 animation:yhbd-in 180ms cubic-bezier(.2,.7,.3,1)}
@keyframes yhbd-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
[data-yhbd-panel] *{box-sizing:border-box}
[data-yhbd-head]{padding:10px 14px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.15))}
[data-yhbd-head] .t{display:flex;align-items:center;justify-content:space-between;font-weight:600}
[data-yhbd-head] .sub{margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary,#888)}
[data-yhbd-head] .close{cursor:pointer;background:transparent;border:none;color:inherit;font-size:18px;line-height:1;padding:2px 6px;border-radius:6px}
[data-yhbd-head] .close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
[data-yhbd-tabs]{display:flex;gap:4px;padding:8px 14px 0}
[data-yhbd-tab]{padding:5px 10px;cursor:pointer;border-radius:999px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:12px;font-variant-numeric:tabular-nums}
[data-yhbd-tab]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
[data-yhbd-tab][data-active]{background:var(--dsw-alias-brand-1,#1677ff);color:#fff}
[data-yhbd-search]{padding:8px 14px 6px}
[data-yhbd-search] input{width:100%;padding:7px 10px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));border-radius:8px;background:var(--dsw-alias-input-major,rgba(127,127,127,.06));color:inherit;font:inherit;outline:none}
[data-yhbd-search] input:focus{border-color:var(--dsw-alias-brand-1,#1677ff)}
[data-yhbd-cats]{display:flex;flex-wrap:wrap;gap:4px;padding:0 14px 8px;max-height:76px;overflow:auto}
[data-yhbd-cat]{padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));cursor:pointer;font-size:11px;background:transparent;color:inherit;font-variant-numeric:tabular-nums}
[data-yhbd-cat]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
[data-yhbd-cat][data-active]{background:var(--dsw-alias-brand-1,#1677ff);color:#fff;border-color:transparent;box-shadow:0 1px 2px rgba(22,119,255,.35)}
[data-yhbd-list]{flex:1;overflow:auto;padding:4px 12px 8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(390px,1fr));column-gap:18px;align-content:start}
[data-yhbd-list]>[data-yhbd-status]{grid-column:1/-1}
[data-yhbd-row]{padding:8px 10px;border-radius:8px;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.06))}
[data-yhbd-row]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
[data-yhbd-list] [data-yhbd-row]:last-child{border-bottom:none}
[data-yhbd-row] .top{display:flex;align-items:center;gap:6px;font-weight:500}
[data-yhbd-row] .rk{color:var(--dsw-alias-label-secondary,#999);font-size:11px;flex:none;min-width:18px;text-align:right;font-variant-numeric:tabular-nums}
[data-yhbd-row] a.repo{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;text-decoration:none}
[data-yhbd-row] a.repo:hover{color:var(--dsw-alias-brand-1,#1677ff);text-decoration:underline}
[data-yhbd-row] .star{color:var(--dsw-alias-label-secondary,#888);font-size:12px;flex:none;font-variant-numeric:tabular-nums}
[data-yhbd-row] .star b{color:inherit;font-weight:600}
[data-yhbd-inst]{flex:none;cursor:pointer;font-size:11px;padding:2px 10px;border-radius:999px;border:1px solid var(--dsw-alias-brand-1,#1677ff);background:transparent;color:var(--dsw-alias-brand-1,#1677ff);font-family:inherit;line-height:1.6;transition:background 120ms,color 120ms}
[data-yhbd-inst]:hover{background:var(--dsw-alias-brand-1,#1677ff);color:#fff}
[data-yhbd-inst][data-done]{border-color:transparent;color:var(--dsw-alias-label-secondary,#888);cursor:default}
[data-yhbd-inst][data-done]:hover{background:transparent;color:var(--dsw-alias-label-secondary,#888)}
[data-yhbd-row] .meta{font-size:11px;color:var(--dsw-alias-label-secondary,#888);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-yhbd-row] .desc{font-size:12px;color:var(--dsw-alias-label-secondary,#666);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
[data-yhbd-status]{padding:24px 16px;text-align:center;color:var(--dsw-alias-label-secondary,#888)}
[data-yhbd-status] .retry{margin-top:8px;cursor:pointer;padding:5px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));background:transparent;color:inherit;font:inherit}
[data-yhbd-status] .err{color:#e5484d}
[data-yhbd-foot]{padding:6px 14px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.12));font-size:11px;color:var(--dsw-alias-label-secondary,#888);display:flex;justify-content:space-between;gap:8px;min-height:27px;align-items:center}
[data-yhbd-foot] .ok{color:#2da44e}
[data-yhbd-foot] .bad{color:#e5484d}
[data-yhbd-foot] a{color:inherit;text-decoration:none}
[data-yhbd-foot] a:hover{text-decoration:underline;color:var(--dsw-alias-brand-1,#1677ff)}
`;

function injectCss() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-yhbd-css]")) return;
  const tag = document.createElement("style");
  tag.setAttribute("data-yhbd-css", "");
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

// ---------------------------------------------------------------- cache
function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || !Array.isArray(parsed.data.plugins)) return null;
    return parsed; // { savedAt, data }
  } catch (_e) {
    return null;
  }
}

function writeCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch (_e) { /* 隐私模式等场景静默降级 */ }
}

// ---------------------------------------------------------------- search
function searchLocal(data, tokens, cat, limit) {
  const scored = [];
  for (const p of data.plugins) {
    if (cat && (p.cat || "other") !== cat) continue;
    let s = 0;
    if (tokens.length) {
      const repoL = p.repo.toLowerCase();
      const nameL = repoL.split("/")[1] || repoL;
      const descL = (p.desc || "").toLowerCase();
      const catL = (((data.cats && data.cats[p.cat || "other"]) || "") + " " + (p.cat || "")).toLowerCase();
      for (const t of tokens) {
        if (nameL === t) s += 10;
        else if (nameL.includes(t)) s += 4;
        if (repoL.includes(t) && !nameL.includes(t)) s += 2;
        if (descL.includes(t)) s += 1;
        if (catL.includes(t)) s += 2;
      }
    } else {
      s = 1;
    }
    if (s > 0) scored.push({ p, s });
  }
  scored.sort((a, b) => b.s - a.s || b.p.stars - a.p.stars);
  return scored.slice(0, limit).map((x) => x.p);
}

function detailUrl(p) {
  return SITE + "/plugins/" + encodeURIComponent(p.slug) + "/";
}

// 「安装 →」复制的是**仓库地址**：客户端「添加插件」对话框接受
// 「包名 / GitHub 仓库地址 / 本地目录路径」，粘进去即可。
function repoUrl(p) {
  return "https://github.com/" + p.repo;
}

// ---------------------------------------------------------------- component
// 顶层 tab：「全部」是全集（最上层），其后为站点同款细分榜单
// （口径与 rankings.html 对齐：native/compatible 分组隔离，2026-08-27 定调）
const TABS = [
  { id: "all", label: "全部" },
  { id: "top", label: "原生星榜" },
  { id: "rising", label: "飙升" },
  { id: "new", label: "今日新秀" },
  { id: "compat", label: "兼容工具" },
  { id: "champs", label: "分类冠军" },
];

// 分类冠军：每分类取 stars 最高的 native（与站点 rankings.html 口径一致）
function computeChampions(data) {
  const map = new Map(); // cat -> plugin
  for (const p of data.plugins) {
    if (!p.n) continue;
    const c = p.cat || "other";
    const cur = map.get(c);
    if (!cur || p.stars > cur.stars) map.set(c, p);
  }
  return Array.from(map.values()).sort((a, b) => b.stars - a.stars);
}

// 榜单计数缓存（同一份 data 只算一次，WeakMap 随数据换版自然失效）
const _countsCache = new WeakMap();
function boardCounts(data) {
  let c = _countsCache.get(data);
  if (!c) {
    let native = 0;
    for (const p of data.plugins) if (p.n) native++;
    c = { native, compat: data.plugins.length - native, champs: computeChampions(data) };
    _countsCache.set(data, c);
  }
  return c;
}

function tabSuffix(id, data) {
  const c = boardCounts(data);
  if (id === "all") return " " + data.plugins.length.toLocaleString();
  if (id === "top") return " " + c.native.toLocaleString();
  if (id === "compat") return " " + c.compat.toLocaleString();
  if (id === "champs") return " " + c.champs.length;
  if (id === "new") return data.newToday ? " +" + data.newToday : "";
  if (id === "rising") return data.risingSlugs && data.risingSlugs.length ? " " + data.risingSlugs.length : "";
  return "";
}

function YhbdTopPanel(props) {
  const { wide, onInstall, copyToClipboard } = props;
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [tab, setTab] = useState("all");
  const [pos, setPos] = useState(null);
  const [doneKey, setDoneKey] = useState("");
  const [note, setNote] = useState(null); // { kind: 'ok'|'bad', text }
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const closeTimer = useRef(null);
  const noteTimer = useRef(null);

  const loadData = useCallback((force) => {
    const cached = readCache();
    if (cached) setData(cached.data);
    const fresh = cached && !force && (Date.now() - cached.savedAt < CACHE_FRESH_MS);
    if (fresh) return null;
    setLoading(true);
    setErr("");
    const ctrl = new AbortController();
    fetch(DATA_URL, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((d) => {
        setData(d);
        writeCache(d);
      })
      .catch((e) => {
        if (e && e.name === "AbortError") return;
        setErr((e && e.message) || "网络错误");
      })
      .then(() => setLoading(false));
    return ctrl;
  }, []);

  // 打开时确保有数据（缓存新鲜则不重复拉）
  useEffect(() => {
    if (!open) return;
    const ctrl = loadData(false);
    return () => { if (ctrl) ctrl.abort(); };
  }, [open, loadData]);

  // ESC + 面板外点击关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e) => {
      const t = e.target;
      if (panelRef.current && panelRef.current.contains(t)) return;
      if (btnRef.current && btnRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // 打开后聚焦搜索框
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open, pos]);

  // 卸载时清定时器
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (noteTimer.current) clearTimeout(noteTimer.current);
  }, []);

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // 大面板：880×700 上限，随视口收缩；两栏列表吃满宽度
      const W = Math.min(880, window.innerWidth - 64);
      const H = Math.min(700, window.innerHeight - 48);
      let left = rect.right + 10; // 从侧栏按钮右侧弹出
      if (left + W > window.innerWidth - 24) left = Math.max(24, window.innerWidth - 24 - W);
      setPos({
        width: W + "px",
        height: H + "px",
        left: left + "px",
        top: Math.max(24, window.innerHeight - 24 - H) + "px",
      });
      setNote(null);
    }
    setOpen((o) => !o);
  }

  function showNote(kind, text) {
    setNote({ kind, text });
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 3200);
  }

  function handleInstall(p) {
    const res = onInstall ? onInstall(p) : { ok: false };
    if (res && res.ok) {
      setDoneKey(p.slug);
      showNote("ok", res.filledDialog
        ? "已复制仓库地址 ✓ 已打开『添加插件』并填入地址 —— 确认后点安装即可（如为空请 Ctrl+V）"
        : (res.openedPluginsPanel
          ? "已复制仓库地址 ✓ 已打开「插件」页 —— 请点『添加插件』后 Ctrl+V 粘贴"
          : "已复制仓库地址 ✓ 请打开「插件 → 添加插件」粘贴"));
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setOpen(false), 1600);
    } else {
      showNote("bad", "自动复制失败，请手动复制：" + ((res && res.copied) || ""));
    }
  }

  // 当前 tab/搜索的基础集合（分类过滤前）——分类条与列表都从它派生，保证联动
  const base = useMemo(() => {
    if (!data) return { rows: [], label: "" };
    const tokens = q.trim().toLowerCase().split(/[\s,，、]+/).filter(Boolean);
    if (tokens.length) {
      // 搜索作用于全目录（最高优先动作），分类条随之只统计命中结果的分布
      return { rows: searchLocal(data, tokens, undefined, 100), label: "搜索" };
    }
    const byStars = (a, b) => b.stars - a.stars;
    if (tab === "top") return { rows: data.plugins.filter((p) => p.n).slice().sort(byStars), label: "原生星榜" };
    if (tab === "compat") return { rows: data.plugins.filter((p) => !p.n).slice().sort(byStars), label: "兼容工具" };
    if (tab === "champs") return { rows: boardCounts(data).champs, label: "分类冠军" };
    if (tab === "new") {
      const bySlug = new Map(data.plugins.map((p) => [p.slug, p]));
      return { rows: (data.newSlugs || []).map((s) => bySlug.get(s)).filter(Boolean), label: "今日新秀" };
    }
    if (tab === "rising") {
      const bySlug = new Map(data.plugins.map((p) => [p.slug, p]));
      return {
        rows: (data.risingSlugs || [])
          .map((r) => { const p = bySlug.get(r.slug); return p ? Object.assign({}, p, { delta: r.delta }) : null; })
          .filter(Boolean),
        label: "飙升",
      };
    }
    // "全部"：全集按星排（最上层）
    return { rows: data.plugins.slice().sort(byStars), label: "全部" };
  }, [data, q, tab]);

  // 分类条：只统计当前榜单/搜索结果里的分类分布（与上面 tab 联动）
  const catRows = useMemo(() => {
    const counts = {};
    for (const p of base.rows) {
      const k = p.cat || "other";
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.keys(counts)
      .map((k) => ({ k, zh: (data && data.cats && data.cats[k]) || k, n: counts[k] }))
      .sort((a, b) => b.n - a.n);
  }, [base, data]);

  // 最终列表 = 基础集合内再按选中分类过滤（不跳回全集）
  const view = useMemo(
    () => ({ rows: cat ? base.rows.filter((p) => (p.cat || "other") === cat) : base.rows, mode: base.label }),
    [base, cat]
  );

  const searching = base.label === "搜索";

  function switchTab(t) {
    setTab(t);
    setQ("");
    setCat("");
  }

  const button = h(
    "button",
    {
      ref: btnRef,
      "data-yhbd-button": "",
      className: wide ? "yhbd-wide" : "yhbd-rail",
      type: "button",
      onClick: toggle,
      title: "yhbd.top 插件雷达",
      "aria-label": "plugin_top",
    },
    h("span", { className: "yhbd-ico", "aria-hidden": true }, "📡"),
    wide ? h("span", null, "plugin_top") : null
  );

  let body;
  if (err && !data) {
    body = h("div", { "data-yhbd-status": "" },
      h("div", { className: "err" }, "目录拉取失败：" + err),
      h("button", { className: "retry", type: "button", onClick: () => loadData(true) }, "重试")
    );
  } else if (!data) {
    body = h("div", { "data-yhbd-status": "" }, "正在加载插件目录…");
  } else {
    body = h(React.Fragment, null,
      // tabs：全部（顶层）+ 站点同款细分榜单
      h("div", { "data-yhbd-tabs": "" },
        TABS.map((t) =>
          h("button", {
            key: t.id,
            "data-yhbd-tab": "",
            "data-active": tab === t.id && !searching ? "" : undefined,
            type: "button",
            onClick: () => switchTab(t.id),
          }, t.label + tabSuffix(t.id, data))
        )
      ),
      // search
      h("div", { "data-yhbd-search": "" },
        h("input", {
          ref: inputRef,
          placeholder: "搜索：仓库名 / 关键词 / 分类",
          value: q,
          spellCheck: false,
          onChange: (e) => setQ(e.currentTarget.value),
        })
      ),
      // category chips：随当前榜单联动，计数只反映本榜单里的插件分布
      h("div", { "data-yhbd-cats": "" },
        h("button", { "data-yhbd-cat": "", "data-active": !cat ? "" : undefined, type: "button", title: "返回本榜单全部（不筛选分类）", onClick: () => setCat("") },
          "全部 " + base.rows.length),
        catRows.map((c) =>
          h("button", {
            key: c.k,
            "data-yhbd-cat": "",
            "data-active": cat === c.k ? "" : undefined,
            type: "button",
            title: c.zh + " · 本榜 " + c.n + " 个插件",
            onClick: () => setCat(cat === c.k ? "" : c.k),
          }, c.zh + " " + c.n)
        )
      ),
      // list
      h("div", { "data-yhbd-list": "" },
        loading ? h("div", { "data-yhbd-status": "", style: { padding: "8px" } }, "目录更新中…") : null,
        !loading && view.rows.length === 0 ? h("div", { "data-yhbd-status": "" }, "没有匹配的插件") : null,
        view.rows.map((p, i) =>
          h("div", {
            key: p.slug,
            "data-yhbd-row": "",
            onClick: (e) => {
              if (e.target.closest && e.target.closest("a,button")) return;
              window.open(detailUrl(p), "_blank", "noopener");
            },
          },
            h("div", { className: "top" },
              h("span", { className: "rk" }, String(i + 1)),
              h("a", { className: "repo", href: detailUrl(p), target: "_blank", rel: "noopener noreferrer", title: "查看详情：" + detailUrl(p) }, p.repo),
              h("span", { className: "star" }, "★ ", h("b", null, (p.stars || 0).toLocaleString()), p.delta ? " ▲" + p.delta : ""),
              h("button", {
                "data-yhbd-inst": "",
                "data-done": doneKey === p.slug ? "" : undefined,
                type: "button",
                title: "复制仓库地址、打开「插件」页并自动填入『添加插件』对话框",
                onClick: (e) => { e.stopPropagation(); handleInstall(p); },
              }, doneKey === p.slug ? "✓ 已写入" : "安装 →")
            ),
            h("div", { className: "meta" },
              tab === "champs"
                ? "🏆 " + ((data.cats && data.cats[p.cat || "other"]) || p.cat || "other") + " 分类冠军 · dsh plugin add " + p.repo
                : ((data.cats && data.cats[p.cat || "other"]) || p.cat || "other") + " · dsh plugin add " + p.repo),
            p.desc ? h("div", { className: "desc" }, p.desc) : null
          )
        )
      ),
      // foot
      h("div", { "data-yhbd-foot": "" },
        note
          ? h("span", { className: note.kind === "ok" ? "ok" : "bad" }, note.text)
          : h("span", null, data.total.toLocaleString() + " 个插件 · " + data.date + " 更新"),
        h("a", { href: SITE + "/", target: "_blank", rel: "noopener noreferrer" }, "yhbd.top ↗")
      )
    );
  }

  const panel = open && pos
    ? h("div", { ref: panelRef, "data-yhbd-panel": "", style: pos, role: "dialog", "aria-label": "yhbd.top 插件雷达" },
        h("div", { "data-yhbd-head": "" },
          h("div", { className: "t" },
            h("span", null, "📡 yhbd.top 插件雷达"),
            h("button", { className: "close", type: "button", title: "关闭 (Esc)", onClick: () => setOpen(false) }, "×")
          ),
          data
            ? h("div", { className: "sub" }, (function () {
                const c = boardCounts(data);
                return data.total.toLocaleString() + " 个插件 · 原生 " + c.native.toLocaleString() +
                  " · 兼容 " + c.compat.toLocaleString() +
                  (data.newToday ? " · 今日新增 +" + data.newToday : "") +
                  (loading ? " · 更新中…" : "");
              })())
            : h("div", { className: "sub" }, "正在连接 yhbd.top…")
        ),
        body
      )
    : null;

  return h(React.Fragment, null, button, panel);
}

// ---------------------------------------------------------------- module face
// 需要 ctx.sessions + ctx.conversation；ctx.uiWorkspace 为可选（走 ctx.get("uiWorkspace")）
// —— 点「安装」时优先用它新开一个会话，再把引导语写进那个会话的输入框
// ---------------------------------------------------------------- module face
// 只硬依赖 slots；「插件」页走 ctx.get("layout") 可选访问 ——
// 不再硬依赖 sessions/conversation（上一版那套"新建会话 + 写输入框"已废弃）
const inject = ["slots"];

function apply(ctx) {
  injectCss();

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_e) { /* ignore */ }
    return false;
  }

  // 注：曾试图从 plugins.item 占用者那里拿插件页的 openInstall()/editInstallSpec()。
  // 实测证明这条路不通（占用者渲染了，但 inject 入参与组件 props 里都没有那两个函数）——
  // 官方注释也写明那份注入是给「页面自己」的（"the face the tab's slot registration injects"）。
  // 因此改用界面通道：点『添加插件』按钮，再把地址写进它弹出的输入框。



  // 打开『添加插件』对话框并把仓库地址填进去。
  //
  // 实测：官方源码里那个 aria-haspopup="dialog" 并不是落在「添加插件」按钮上
  //（[aria-haspopup="dialog"] 一个都匹配不到 → no-add-button），所以改为**扫所有 button
  // 按文案匹配**，只有在文案也没命中时才退回 aria-haspopup。失败时把现场（实际有哪些
  // 按钮/输入框）写进诊断日志，一次点击即可定位。
  function fillAddDialog(url) {
    const brief = (el) => String((el.textContent || "")).replace(/\s+/g, " ").trim().slice(0, 14);
    try {
      if (typeof document === "undefined") return false;
      const allButtons = () => Array.prototype.slice.call(document.querySelectorAll("button"));
      const findAdd = () => allButtons().filter((b) => /添加插件/.test(b.textContent || ""))[0]
        || allButtons().filter((b) => /add plugin/i.test(b.textContent || ""))[0];

      // 关键：selectPanel 是异步的，面板要等下一次渲染才切过去 —— 必须**轮询等按钮出现**，
      // 不能同步扫（实测同步扫时文档里有 115 个按钮，「添加插件」还没渲染出来）。
      const waitAdd = (left) => {
        const btn = findAdd();
        if (btn) {

          btn.click();
          fillInput(25);
          return;
        }
        if (left <= 0) {
          const bs = allButtons();

          return;
        }
        // 中途兜底：直接点侧边栏那个「插件」入口，逼面板切过去
        if (left === 20) {
          const nav = allButtons().filter((b) => /^(插件|Plugins)$/.test(String(b.textContent || "").trim()))[0];
          if (nav) nav.click();
        }
        setTimeout(() => waitAdd(left - 1), 100);
      };

      const fillInput = (left) => {
        try {
          // 只认**正面证据**：官方 installSpecPlaceholder 是
          // 「例如 @deepseek-ai/dsh-subagent-codex」，全文档搜它最稳。
          // 上一版允许退化到「容器里第一个 input」，结果伪命中的容器把我自己的搜索框
          // （ph=搜索：仓库名 / 关键词 / 分类）当成目标写了进去 —— 不许再退化。
          const all = () => Array.prototype.slice.call(document.querySelectorAll("input"));
          const byPh = () => all().filter((i) => /@deepseek|subagent/i.test(i.placeholder || ""))[0];
          let target = byPh();
          if (!target) {
            // 次选：官方对话框容器（CSS module 键名 installDialog）里的第一个文本框
            const dlg = document.querySelector('[class*="installDialog"]');
            if (dlg) {
              const ins = Array.prototype.slice.call(dlg.querySelectorAll("input"))
                .filter((i) => i.type !== "search" && i.type !== "checkbox" && i.type !== "radio");
              if (ins.length) target = ins[0];
            }
          }
          if (!target) {
            if (left <= 0) {
              // 现场：全文档输入框的 占位符/类型/类名 —— 足以定位真正的那个

              return;
            }
            setTimeout(() => fillInput(left - 1), 100);
            return;
          }
          const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
          desc.set.call(target, url);
          target.dispatchEvent(new Event("input", { bubbles: true }));

          // 400ms 后回读：React 若因 store 未更新而重渲染会把值刷掉
        } catch (e) {

        }
      };

      setTimeout(() => waitAdd(30), 100);
      return true;
    } catch (e) {

      return false;
    }
  }

  // 「安装 →」：复制仓库地址 + 打开客户端自带的「插件」页 + 点开『添加插件』并填入地址。
  //
  // 打开方式取自官方实现：它自己在 sidebar.panellist 注册 id = PANEL_ID("plugins") 的面板，
  // 并用 ctx.layout.selectPanel(PANEL_ID) 打开自己。
  function onInstall(p) {
    const url = repoUrl(p);
    const copied = copyToClipboard(url);
    let opened = false;
    try {
      const layout = ctx.get && ctx.get("layout");
      if (layout && typeof layout.selectPanel === "function") {
        layout.selectPanel("plugins");
        opened = true;
      }
    } catch (_e) {
      opened = false;
    }
    const started = fillAddDialog(url);

    return { ok: copied, copied: url, openedPluginsPanel: opened, filledDialog: started };
  }

  ctx.slots.inject("sidebar.footer.action", () =>
    ctx.slots.register(
      {
        name: "sidebar.footer.action",
        id: "yhbd-top-panel",
        inject: () => ({ onInstall, copyToClipboard }),
      },
      YhbdTopPanel
    )
  );
}

module.exports = { apply, inject };
