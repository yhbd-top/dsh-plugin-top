// dsh-plugin-top · 浏览器端模块（CJS body，由 scripts/build-client.cjs 包裹为
// window.__ModuleLoader__.load({ id, factory }) —— 与官方 dsh-client-ui-* 产物同形）
//
// 客户场景：DSH 侧边栏 plugin_top 按钮 → 点开悬浮面板直接嵌入 yhbd.top 网页。
// 数据实时同步；榜单 / 搜索 / 分类 / 安装命令全部走 yhbd.top 原页面。
// 站点侧由 nginx 配置 frame-ancestors 允许 DSH Web 嵌入。

"use strict";

const React = require("react");
const h = React.createElement;
const { useState, useEffect, useRef, useCallback } = React;

const EMBED_URL = "https://www.yhbd.top/rankings.html"; // 后续可换首页 / 详情页
const EMBED_TITLE = "📡 yhbd.top 插件雷达";
const LOAD_TIMEOUT_MS = 6000;

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
[data-yhbd-head]{padding:10px 14px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.15));display:flex;align-items:center;justify-content:space-between;gap:8px}
[data-yhbd-head] .t{font-weight:600}
[data-yhbd-head] .sub{font-size:11px;color:var(--dsw-alias-label-secondary,#888);margin-top:2px}
[data-yhbd-head] .close{cursor:pointer;background:transparent;border:none;color:inherit;font-size:18px;line-height:1;padding:2px 6px;border-radius:6px}
[data-yhbd-head] .close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
[data-yhbd-frame]{flex:1;width:100%;border:0;background:#fff}
[data-yhbd-status]{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;text-align:center;color:var(--dsw-alias-label-secondary,#888);gap:10px}
[data-yhbd-status] .retry{cursor:pointer;padding:6px 16px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));background:transparent;color:inherit;font:inherit}
[data-yhbd-status] .retry:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
[data-yhbd-status] .ext{font-size:12px;color:var(--dsw-alias-brand-1,#1677ff);text-decoration:none}
[data-yhbd-status] .err{color:#e5484d;font-size:12px;max-width:360px}
[data-yhbd-status] .spin{width:18px;height:18px;border:2px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));border-top-color:var(--dsw-alias-brand-1,#1677ff);border-radius:50%;animation:yhbd-spin 800ms linear infinite}
@keyframes yhbd-spin{to{transform:rotate(360deg)}}
[data-yhbd-foot]{padding:6px 14px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.12));font-size:11px;color:var(--dsw-alias-label-secondary,#888);display:flex;justify-content:space-between;gap:8px;min-height:27px;align-items:center}
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

// ---------------------------------------------------------------- component
function YhbdTopPanel(props) {
  const wide = !!props.wide;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [iframeKey, setIframeKey] = useState(0); // 重载触发
  const [phase, setPhase] = useState("loading"); // loading | loaded | error
  const [loadMs, setLoadMs] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const loadStartRef = useRef(0);
  const timeoutRef = useRef(null);

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const W = Math.min(520, window.innerWidth - 32);
      const H = Math.min(560, window.innerHeight - 32);
      let left = rect.left;
      if (left + W > window.innerWidth - 16) left = Math.max(16, window.innerWidth - 16 - W);
      const style = { width: W + "px", height: H + "px" };
      if (rect.top >= H + 24) style.bottom = (window.innerHeight - rect.top + 8) + "px";
      else style.top = (rect.bottom + 8) + "px";
      style.left = left + "px";
      setPos(style);
      setPhase("loading");
      setLoadMs(0);
      setErrMsg("");
    }
    setOpen((o) => !o);
  }

  // 外部点击 / ESC 关闭
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

  // 卸载时清掉超时定时器
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  // 打开 / 重载时启动加载计时
  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    loadStartRef.current = Date.now();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (loadStartRef.current && Date.now() - loadStartRef.current >= LOAD_TIMEOUT_MS) {
        setPhase("error");
        setErrMsg("加载超过 " + Math.round(LOAD_TIMEOUT_MS / 1000) + " 秒未响应（可能被网络拦截或浏览器拦截了第三方 cookie）");
      }
    }, LOAD_TIMEOUT_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [open, iframeKey]);

  const handleLoad = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoadMs(Date.now() - loadStartRef.current);
    setPhase("loaded");
  }, []);

  const handleError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPhase("error");
    setErrMsg("无法连接 www.yhbd.top（可能未联网 / 站点正在维护 / 浏览器拦截了跨域 cookie）");
  }, []);

  function retry() {
    setIframeKey((k) => k + 1);
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

  if (!open || !pos) return button;

  let body;
  if (phase === "loading") {
    body = h("div", { "data-yhbd-status": "" },
      h("div", { className: "spin", "aria-hidden": true }),
      h("div", null, "正在连接 www.yhbd.top…"),
      h("a", { className: "ext", href: EMBED_URL, target: "_blank", rel: "noopener noreferrer" }, "在 yhbd.top 打开 ↗")
    );
  } else if (phase === "error") {
    body = h("div", { "data-yhbd-status": "" },
      h("div", { className: "err" }, errMsg || "加载失败"),
      h("button", { className: "retry", type: "button", onClick: retry }, "重试"),
      h("a", { className: "ext", href: EMBED_URL, target: "_blank", rel: "noopener noreferrer" }, "或在新标签打开 yhbd.top ↗")
    );
  } else {
    body = h("iframe", {
      key: iframeKey,
      "data-yhbd-frame": "",
      src: EMBED_URL,
      title: EMBED_TITLE,
      referrerPolicy: "no-referrer",
      // sandbox 关闭最危险的能力：不开 top-navigation、popups-to-escape-sandbox
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
      onLoad: handleLoad,
      onError: handleError,
    });
  }

  const panel = h("div",
    {
      ref: panelRef,
      "data-yhbd-panel": "",
      style: pos,
      role: "dialog",
      "aria-label": EMBED_TITLE,
    },
    h("div", { "data-yhbd-head": "" },
      h("div", null,
        h("div", { className: "t" }, EMBED_TITLE),
        h("div", { className: "sub" }, phase === "loaded" ? ("已连接 · 加载用时 " + loadMs + "ms") : (phase === "loading" ? "正在加载…" : "连接失败"))
      ),
      h("button", { className: "close", type: "button", title: "关闭 (Esc)", onClick: () => setOpen(false) }, "×")
    ),
    body,
    h("div", { "data-yhbd-foot": "" },
      h("span", null, "数据由 yhbd.top 实时同步"),
      h("a", { href: EMBED_URL, target: "_blank", rel: "noopener noreferrer" }, "在 yhbd.top 打开 ↗")
    )
  );

  return h(React.Fragment, null, button, panel);
}

// ---------------------------------------------------------------- module face
const inject = ["slots"];

function apply(ctx) {
  injectCss();
  ctx.slots.inject("sidebar.footer.action", () =>
    ctx.slots.register(
      {
        name: "sidebar.footer.action",
        id: "yhbd-top-panel",
        inject: () => ({}),
      },
      YhbdTopPanel
    )
  );
}

module.exports = { apply, inject };
