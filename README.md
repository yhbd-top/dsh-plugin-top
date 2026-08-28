# dsh-plugin-top · DSH 插件雷达

> 在 DSH 会话里直接搜索 [www.yhbd.top](https://www.yhbd.top) 收录的数千个 DeepSeek Harness 插件——"有没有能做 X 的插件"从此有标准答案。

Agent 获得两个工具（纯只读、零凭证、零遥测）：

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
dsh plugin --profile web add ./dsh-plugin-top-0.1.0.tgz
```

卸载：`dsh plugin --profile web remove dsh-plugin-top`

装好后在会话里直接说人话即可（"搜一下有没有浏览器自动化插件"），Agent 会自动调用工具。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖（全部可选）：

```yaml
- id: plugin-top
  name: dsh-plugin-top
  config:
    baseUrl: https://www.yhbd.top   # 数据源站点，可指向镜像
    cacheTtlHours: 24               # 目录索引缓存时长
    timeoutMs: 10000                # 拉取超时
```

## 数据与隐私

- 唯一网络行为：GET `<baseUrl>/data/plugins.micro.json`（插件专用精简索引，约 400KB）
- 本地仅持久化一份索引缓存：`~/.dsh-plugin-top/micro-cache.json`
- 断网/站点不可用时自动回退旧缓存并在结果中标注缓存日期
- 无任何上传、遥测、凭证

## 开发

```sh
npm install
npm run typecheck
npm run build
# 本机联调（不安装，用 patch overlay 临时加载）：
dsh web --patch ./cordis.local.yml
```

目录结构遵循官方 [打包与安装](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish) 的 bundle 标准：`package.json(dsh.bundle)` + `cordis.patch.yml` + `dist/`。

## License

MIT
