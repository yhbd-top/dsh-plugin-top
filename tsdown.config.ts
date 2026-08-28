import { defineConfig } from 'tsdown'

// 自包含转译：只编 src/，不用项目引用、不做类型检查（类型检查走 npm run typecheck）
// 参照官方 publish 文档的 turtle-ui 范例：git 安装的 prepare 脚本必须可独立运行
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node18',
  clean: true,
  dts: false,
})
