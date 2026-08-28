// 冒烟测试：模拟 DSH 浏览器 loader 环境，执行 dist/client.js
// v0.3 iframe 模式：只检查模块面 + slot 注册 + 组件 props
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

let slotInfo = null;
const ctxFake = {
  slots: {
    inject: (name, fn) => {
      const reg = fn(); // [meta, Comp]
      slotInfo = { slot: name, entryId: reg[0].id };
      const props = { wide: true, ...reg[0].inject() };
      // 触发组件渲染（mock 下不会真渲染 React 树，但会跑同步逻辑）
      try { reg[1](props); } catch (e) { console.log("  render err (ok):", e.message); }
    },
    register: (meta, Comp) => [meta, Comp],
  },
};
face.apply(ctxFake);
console.log("[3] slot:", JSON.stringify(slotInfo));
console.log("SMOKE DONE");
