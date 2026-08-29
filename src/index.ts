import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'

export const name = 'plugin-top'
export const inject = ['tools', 'webServer']

export interface Config {
  baseUrl: string
  cacheTtlHours: number
  timeoutMs: number
}
export const Config = Schema.object({
  baseUrl: Schema.string().default('https://www.yhbd.top'),
  cacheTtlHours: Schema.number().default(24),
  timeoutMs: Schema.number().default(10000),
})

// ---------- 数据模型（对应站端 /data/plugins.micro.json） ----------
interface MicroPlugin {
  slug: string
  repo: string
  desc?: string
  stars: number
  cat?: string
  kind?: string
  n?: number // 1 = native
}
interface RisingEntry { slug: string; delta: number }
interface MicroData {
  total: number
  date: string
  newToday?: number
  cats?: Record<string, string>
  newSlugs?: string[]
  risingSlugs?: RisingEntry[]
  plugins: MicroPlugin[]
}

const CACHE_DIR = path.join(os.homedir(), '.dsh-plugin-top')
const CACHE_FILE = path.join(CACHE_DIR, 'micro-cache.json')

let mem: { data: MicroData; fetchedAt: number } | null = null

async function fetchFresh(baseUrl: string, timeoutMs: number): Promise<MicroData> {
  const url = `${baseUrl.replace(/\/+$/, '')}/data/plugins.micro.json`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'dsh-plugin-top/1.0 (agent tool)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const data = (await res.json()) as MicroData
  if (!data || !Array.isArray(data.plugins)) throw new Error('micro.json 结构不识别')
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {}
  return data
}

function readDiskCache(): { data: MicroData; savedAt: number } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    if (raw && raw.data && Array.isArray(raw.data.plugins)) return raw
  } catch {}
  return null
}

async function loadIndex(config: Config): Promise<{ data: MicroData; note: string }> {
  const ttl = config.cacheTtlHours * 3600_000
  if (mem && Date.now() - mem.fetchedAt < ttl) return { data: mem.data, note: '' }
  try {
    const data = await fetchFresh(config.baseUrl, config.timeoutMs)
    mem = { data, fetchedAt: Date.now() }
    return { data, note: '' }
  } catch (err: any) {
    const disk = readDiskCache()
    if (disk) {
      mem = { data: disk.data, fetchedAt: Date.now() } // 失败后 TTL 内不反复打站点
      const d = new Date(disk.savedAt).toISOString().slice(0, 10)
      return { data: disk.data, note: `（目录更新失败：${err?.message ?? err}，使用 ${d} 缓存）` }
    }
    throw new Error(`无法获取插件目录（${config.baseUrl}）：${err?.message ?? err}。首次使用需要网络。`)
  }
}

// ---------- 本地检索：token 加权 contains，3700 条毫秒级 ----------
function search(data: MicroData, q: string, cat: string | undefined, native: boolean | undefined, minStars: number, limit: number): MicroPlugin[] {
  const tokens = (q || '').toLowerCase().split(/[\s,，、]+/).filter(Boolean)
  const scored: { p: MicroPlugin; s: number }[] = []
  for (const p of data.plugins) {
    if (minStars && p.stars < minStars) continue
    if (native && !p.n) continue
    if (cat && p.cat !== cat) continue
    let s = 0
    if (tokens.length) {
      const repoL = p.repo.toLowerCase()
      const nameL = repoL.split('/')[1] || repoL
      const descL = (p.desc || '').toLowerCase()
      const catL = ((data.cats?.[p.cat || ''] || '') + ' ' + (p.cat || '')).toLowerCase()
      for (const t of tokens) {
        if (nameL === t) s += 10
        else if (nameL.includes(t)) s += 4
        if (repoL.includes(t) && !nameL.includes(t)) s += 2
        if (descL.includes(t)) s += 1
        if (catL.includes(t)) s += 2
      }
    } else {
      s = 1
    }
    if (s > 0) scored.push({ p, s })
  }
  scored.sort((a, b) => b.s - a.s || b.p.stars - a.p.stars)
  return scored.slice(0, limit).map((x) => x.p)
}

function bySlug(data: MicroData, slug: string): MicroPlugin | undefined {
  return data.plugins.find((p) => p.slug === slug)
}

function fmtRows(data: MicroData, list: MicroPlugin[], startIdx = 1): string {
  return list
    .map((p, i) => {
      const catZh = (p.cat && data.cats?.[p.cat]) || p.cat || 'other'
      const tag = p.n ? '' : '（兼容工具）'
      const desc = (p.desc || '').slice(0, 110)
      return `${startIdx + i}. ${p.repo}  ★${p.stars}${tag}  [${catZh}]\n   ${desc}\n   安装: dsh plugin add ${p.repo}  |  https://www.yhbd.top/plugins/${encodeURIComponent(p.slug)}/`
    })
    .join('\n')
}

// ---------- 插件入口 ----------
export function apply(ctx: Context, config: Config) {
  ctx.tools.register(
    defineTool({
      name: 'plugin_top_search',
      description:
        '在 yhbd.top 收录的 DeepSeek Harness 插件目录（数千个仓库）中搜索插件。用户问"有没有能做 X 的 DSH 插件/有什么推荐插件"时使用。返回按相关度排序的插件列表，含星数、分类、简介、安装命令与详情链接。',
      parameters: {
        query: { type: 'string', required: true, description: '搜索关键词（中英文均可，空格分词），如 "qq 通知" 或 "memory"' },
        category: { type: 'string', description: '限定功能分类 key，如 memory-knowledge / vision-media / client-launcher / pet-fun 等 22 类' },
        native_only: { type: 'boolean', description: '只看 DSH 原生插件（排除兼容工具）' },
        min_stars: { type: 'number', description: '最低星数，默认 0' },
        limit: { type: 'number', description: '最多返回条数，默认 8，上限 20' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        const { data, note } = await loadIndex(config)
        const limit = Math.min(Math.max(args.limit ?? 8, 1), 20)
        const hits = search(data, args.query, args.category, args.native_only, args.min_stars ?? 0, limit)
        if (!hits.length) return `目录共 ${data.total} 个插件（${data.date}）${note}，没有找到与"${args.query}"匹配的。可换关键词，或按分类浏览 https://www.yhbd.top`
        return `plugin-top · 命中 ${hits.length} 个（目录共 ${data.total}，${data.date}）${note}\n\n${fmtRows(data, hits)}`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'plugin_top_trending',
      description:
        '查看 yhbd.top 插件生态动态。mode=new 当日新入库插件；mode=rising 近期星数飙升榜；mode=top 全站星标总榜。用户想了解"DSH 插件圈最近有什么新东西/什么最火"时使用。',
      parameters: {
        mode: { type: 'string', required: true, description: 'new | rising | top' },
        limit: { type: 'number', description: '条数，默认 10，上限 30' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        const { data, note } = await loadIndex(config)
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 30)
        const mode = args.mode
        if (mode === 'new') {
          const list = (data.newSlugs || []).map((s) => bySlug(data, s)).filter(Boolean) as MicroPlugin[]
          if (!list.length) return `今日暂无新入库记录（${data.date}）${note}`
          return `当日新入库 +${data.newToday ?? list.length}（${data.date}）${note}\n\n${fmtRows(data, list.slice(0, limit))}`
        }
        if (mode === 'rising') {
          const rows = (data.risingSlugs || []).slice(0, limit)
          const list = rows.map((r) => bySlug(data, r.slug)).filter(Boolean) as MicroPlugin[]
          if (!list.length) return `飙升榜暂无数据（需 ≥2 份每日快照）${note}`
          const body = list
            .map((p, i) => {
              const d = rows[i].delta
              return `${i + 1}. ${p.repo}  ▲${d} → ★${p.stars}  ${(p.desc || '').slice(0, 80)}\n   https://www.yhbd.top/plugins/${encodeURIComponent(p.slug)}/`
            })
            .join('\n')
          return `近期飙升榜（目录 ${data.date}）${note}\n\n${body}`
        }
        const top = data.plugins
          .filter((p) => p.n)
          .sort((a, b) => b.stars - a.stars)
          .slice(0, limit)
        return `原生插件总星榜 top${limit}（目录共 ${data.total}，${data.date}）${note}\n\n${fmtRows(data, top)}`
      },
    }),
  )

  // ---------- 浏览器侧反向代理：把 https://www.yhbd.top/data/plugins.micro.json
  //            暴露成同源 /api/plugin-top/data —— 客户端 fetch 不走跨域、
  //            不依赖 nginx reload、不依赖 yhbd.top 加 CORS 头 ----------
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  ctx.effect(() => {
    const dispose = (ctx as any).webServer.register({
      kind: 'exact',
      path: '/api/plugin-top/data',
      handler: async (req: any, res: any) => {
        // 仅 GET / HEAD
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { 'Content-Type': 'text/plain' })
          res.end('Method Not Allowed')
          return
        }
        const upstreamUrl = `${baseUrl}/data/plugins.micro.json`
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), config.timeoutMs)
        try {
          const r = await fetch(upstreamUrl, {
            signal: ctrl.signal,
            headers: { 'user-agent': 'dsh-plugin-top/1.0 (server proxy)' },
          })
          clearTimeout(t)
          const buf = Buffer.from(await r.arrayBuffer())
          // 不透传 Content-Encoding：
          //   Node 18+ fetch 默认不解 gzip，body 已经是 plain JSON；
          //   上游 nginx 仍会带 Content-Encoding: gzip，如果透传，
          //   浏览器会按 gzip 头再次解压导致 "unsupported compression method" 报错。
          res.writeHead(r.status, {
            'Content-Type': r.headers.get('content-type') || 'application/json',
            'Cache-Control': 'public, max-age=300',
          })
          if (req.method === 'HEAD') {
            res.end()
            return
          }
          res.end(buf)
        } catch (err: any) {
          clearTimeout(t)
          const msg = err?.message || String(err)
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'upstream_failed', message: msg, upstream: upstreamUrl }))
        }
      },
    })
    return () => dispose()
  }, 'plugin-top: /api/plugin-top/data upstream proxy')
}
