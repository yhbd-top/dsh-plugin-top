// 冒烟测试：模拟 DSH 浏览器 loader 环境，执行 dist/client.js 全链路
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const code = fs.readFileSync(path.join(__dirname, "..", "dist", "client.js"), "utf8");

const React = {
  createElement: (t, p, ...c) => ({ t, p, c }),
  Fragment: "F",
  useState: (v) => [v, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useMemo: (f) => f(),
  useCallback: (f) => f,
};

const calls = [];
const sandbox = {
  window: {
    __ModuleLoader__: { load: (reg) => { calls.push(reg.id); sandbox.__reg = reg; } },
    innerWidth: 1400,
    innerHeight: 900,
  },
  document: {
    querySelector: () => ({}),
    createElement: () => ({ setAttribute() {} }),
    head: { appendChild() {} },
  },
  sessionStorage: { getItem: () => null, setItem() {} },
  navigator: {},
  console,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
console.log("[1] __ModuleLoader__.load fired:", JSON.stringify(calls));

const face = sandbox.__reg.factory((spec) => {
  if (spec === "react") return React;
  throw new Error("unexpected require: " + spec);
});
console.log("[2] module face:", Object.keys(face).join(","), "| inject:", JSON.stringify(face.inject));

// slot 注册链路
let draftWritten = null;
let slotInfo = null;
let componentRendered = null;
const ctxFake = {
  sessions: {
    list: { getSnapshot: () => ({ current: "sess-1" }) },
    scope: (id) => ({ scoped: id }),
  },
  conversation: {
    input: {
      for: (actx) => ({
        state: { getSnapshot: () => ({ draft: "已有内容  " }) },
        setDraft: (t) => { draftWritten = t; },
      }),
    },
  },
  slots: {
    inject: (name, fn) => {
      const reg = fn();
      slotInfo = { slot: name, entryId: reg[0].id };
      // 渲染组件拿到 props（onInstall 应经 inject 面传入）
      const props = { wide: true, ...reg[0].inject() };
      componentRendered = typeof props.onInstall === "function" ? "onInstall-ok" : "onInstall-MISSING";
      reg[1](props); // 组件函数执行一遍（React 被 mock，只走同步路径）
    },
    register: (meta, Comp) => [meta, Comp],
  },
};
ctxFake.slots.register = (meta, Comp) => [meta, Comp];
face.apply(ctxFake);
console.log("[3] slot:", JSON.stringify(slotInfo), "|", componentRendered);

// onInstall 直调：验证写入会话输入框 + 追加语义
let injected = null;
ctxFake.slots = {
  inject: (name, fn) => { injected = fn()[0].inject(); },
  register: (meta, Comp) => [meta, Comp],
};
face.apply(ctxFake);
const ok = injected && typeof injected.onInstall === "function";
console.log("[5] inject face has onInstall fn:", ok);
if (ok) {
  const r = injected.onInstall({ slug: "a-b-c", repo: "a/b-c" });
  console.log("[6] onInstall result:", JSON.stringify(r));
  console.log("[7] draft written:", JSON.stringify(draftWritten));
}
