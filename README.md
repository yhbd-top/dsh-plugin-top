# dsh-plugin-top · DSH 插件雷达

> 侧边栏一键打开 [www.yhbd.top](https://www.yhbd.top) 插件雷达：面板**直接嵌入** yhbd.top 网页，榜单 / 搜索 / 分类 / 安装命令全部走 yhbd.top 实时同步。

## 你会得到什么

**浏览器侧**（DSH Web 装完即用）：

- 侧边栏底部出现 `📡 plugin_top` 按钮（窄栏只显图标，宽栏带文字）
- 点开悬浮面板：直接嵌入 https://www.yhbd.top/rankings.html（DSH 内置 5 个榜单：原生星榜 / 飙升榜 / 新秀榜 / 兼容工具榜 / 分类冠军）
- 在 iframe 内用 yhbd.top 原生搜索 / 分类筛选 / 安装命令；网站更新 → 插件面板实时同步，零构建
- 6 秒未连接：自动降级为「重试 + 在 yhbd.top 打开」兜底
- ESC / × / 面板外点击关闭
- 深浅色主题跟随 yhbd.top 网页（DARK/LIGHT 切换在 iframe 内自决）

**Agent 侧**（会话里直接说人话）：

| 工具 | 用途 | 示例 |
|---|---|---|
| `plugin_top_search` | 按关键词/分类/星数搜插件，返回简介+安装命令+详情页 | "帮我找个发 QQ 消息的插件" |
| `plugin_top_trending` | 当日新入库 / 近期飙升 / 原生总星榜 | "DSH 插件圈最近有什么新货" |

## 安装

```sh
# npm（推荐，预构建产物，无需构建授权）
dsh plugin --profile web add dsh-plugin-top

# 从 GitHub 源码安装（pnpm 需要构建授权：首次 add 失败后，
# 把 pnpm 打印的包键加入 profile 的 pnpm-workspace.yaml → allowBuilds，重试即可；
# 建议锁 commit：github:yhbd-top/dsh-plugin-top#<sha>）
dsh plugin --profile web add github:yhbd-top/dsh-plugin-top

# 本地 tgz
dsh plugin --profile web add ./dsh-plugin-top-0.3.0.tgz
```

装好后**重启 DSH**（`schtasks /run /tn DSHWeb` 或你的等效方式）并硬刷新页面，侧边栏即出现 `plugin_top` 按钮。

卸载：`dsh plugin --profile web remove dsh-plugin-top`

## 跨域嵌入的前置条件

`www.yhbd.top` 必须允许在 DSH Web 里被 iframe 嵌入。nginx 配置示例：

```nginx
server {
    listen 443 ssl;
    server_name www.yhbd.top;
    # 允许 DSH Web 嵌入 yhbd.top
    add_header Content-Security-Policy "frame-ancestors 'self' http://127.0.0.1:3081 https://dsh.yhbd.top" always;
}
```

DSH Web 侧的 `Access-Control-Allow-Origin` 头不需要——iframe 不走 CORS。

## 配置（Agent 侧可选）

在 profile 的 `cordis.patch.yml` 里覆盖：

```yaml
- id: plugin-top
  name: dsh-plugin-top
  config:
    baseUrl: https://www.yhbd.top   # 数据源站点（仅影响 agent 工具）
    cacheTtlHours: 24
    timeoutMs: 10000
```

浏览器侧无配置：嵌入 URL 写死在 bundle 里（v0.3.0 固定 `https://www.yhbd.top/rankings.html`）。

## 数据与隐私

- 浏览器侧无任何额外请求：面板只是 iframe，不拉自己的数据
- Agent 侧缓存：`~/.dsh-plugin-top/micro-cache.json`，断网/站点不可用时自动回级旧缓存并标注日期
- 无任何上传、遥测、凭证

## 开发

```sh
npm install
npm run typecheck
npm run build          # tsdown（服务端 ESM）+ scripts/build-client.cjs（浏览器 CJS 包裹）
node scripts\smoke-client.cjs   # 模拟 loader 冒烟
# 本机联调（不安装，用 patch overlay 临时加载）：
dsh web --patch ./cordis.local.yml
```

结构说明：

- 服务端：`src/index.ts` → `dist/index.mjs`（cordis bundle，声明 agent 工具 + 配置）
- 浏览器端：`src/client.js` → `dist/client.js`（`window.__ModuleLoader__.load` 官方同形包裹，渲染 `sidebar.footer.action` 按钮 + iframe 面板）
- `package.json` 同时声明 `dsh.bundle.patch` 与 `dsh.client`；**`exports` 必须含 `./package.json`**，否则 client-modules 的 `require.resolve('<pkg>/package.json')` 会静默跳过你的 client bundle（踩过，勿删）

## License

MIT
