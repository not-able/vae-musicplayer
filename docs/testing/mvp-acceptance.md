# MVP 最终验收记录

## 结论

- 状态：通过（浏览器自动化端到端验收；扬声器主观听感待人工兼容性复测）
- 验收日期：2026-07-17 23:41–23:42（Asia/Shanghai）
- 验收分支：`task/mvp-13-mvp-acceptance`
- 验收基线：`defc0cc`（`feat(playlist): integrate persistent playlist`）
- 历史记录：[local-audio-smoke.md](./local-audio-smoke.md) 仅保留为 MVP-08 的历史证据；其中“刷新后清空临时歌单”的结论已由 MVP-12 的持久化能力取代，不能作为本轮结果。

本轮在全新、独立的浏览器 profile 中从空站点数据开始执行。所有目录与队列操作均通过界面完成；音频解码、媒体时钟、暂停、恢复、自然结束和换曲均由真实 `HTMLAudioElement` 验证。

## 环境与测试资源

| 项目       | 记录                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 操作系统   | Windows NT 10.0.26200.0，x64                                                                                    |
| Node / npm | `v22.16.0` / `11.13.0`                                                                                          |
| 浏览器     | Chrome `148.0.7778.217`，`headless=new`，独立持久 profile，非无痕                                               |
| 验收来源   | `http://127.0.0.1:4183/`；所有刷新保持同一来源                                                                  |
| 音频 A     | 自制正弦波 WAV，`audio/wav`，43,244 bytes，1.35 s                                                               |
| 音频 B     | 自制正弦波 WAV，`audio/wav`，49,644 bytes，1.55 s                                                               |
| 版权与位置 | A/B 都由本轮验收临时生成、位于仓库外系统临时目录，脚本结束即删除；没有复制进仓库、`public/`、测试目录或构建产物 |

## 浏览器端到端检查

| 检查               | 操作与预期                                                            | 结果                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 建立目录           | 新增“`MVP-13 验收占位专辑`”，先加曲序 2 的歌曲 A，再加曲序 1 的歌曲 B | 通过：刷新前后均显示 B、A，用户目录恢复                                                                                                                                                                                  |
| 单曲、整张加入     | 先加入 A，再整张加入                                                  | 通过：初始队列为 A、B、A；两个 A 是独立队列项                                                                                                                                                                            |
| 次数与排序         | 第一项 A 设为 2 次，第二项 A 设为 3 次；把 B 拖到首位                 | 通过：队列为 B(1)、A(2)、A(3)，播放序列共 6 次；两个 A 的次数互不影响                                                                                                                                                    |
| 未绑定保护         | 只绑定 A，切到未绑定的 B                                              | 通过：播放按钮禁用，媒体元素处于暂停且没有 `src`/`currentSrc`                                                                                                                                                            |
| 本地真实播放       | 绑定 B 后播放、暂停、继续、从头播放、上一首、下一首                   | 通过：`readyState=4`、`blob:` 本地源和媒体时钟均正常；暂停时钟不推进，继续后推进                                                                                                                                         |
| 自然结束推进       | 从头播放 B，让其自然结束                                              | 通过：推进到 A 的第 1/2 次，继续播放 A 的正确绑定文件                                                                                                                                                                    |
| 刷新恢复           | 在含队列与两个绑定时刷新                                              | 通过：目录 B/A、队列 B/A/A、次数 1/2/3 和两个音频绑定同时恢复；播放器停在 B 的安全暂停状态，不自动播放；再次播放 B 的媒体时钟正常推进                                                                                    |
| 显式清空           | 清空歌单后刷新                                                        | 通过：空歌单被持久化，目录和两个音频绑定仍在                                                                                                                                                                             |
| 存储内容           | 检查 `localStorage` 与 IndexedDB                                      | 通过：存在 `vae-music:user-catalog-changes:v1`、`vae-music:temporary-playlist:v1`，以及 `vae-music-local-library` / `local-audio-files` 的两条 `File` 记录；目录/歌单快照不含路径、远程 URL、`blob:`、播放进度或播放序列 |
| Console 与 Network | 收集整个流程中的 Console、运行时异常和请求                            | 通过：Console 0、运行时异常 0、失败请求 0、远程请求 0；12 个同源页面/资源请求和 8 个本地 `blob:` 媒体请求均符合预期                                                                                                      |

首次运行发现浏览器会请求不存在的 `/favicon.ico`，造成同源 404 Console 噪声。MVP-13 在 [index.html](../../index.html) 声明空 favicon（`data:,`）后，从头重跑本表，最终 Console 为 0；没有新增音频、图片或网络媒体资源。

## 自动化检查

| 命令                       | 结果                           |
| -------------------------- | ------------------------------ |
| `npm.cmd run test:run`     | 通过：8 个测试文件，187 项测试 |
| `npm.cmd run lint`         | 通过                           |
| `npm.cmd run format:check` | 通过                           |
| `npm.cmd run build`        | 通过：Vite 转换 46 个模块      |
| `git diff --check`         | 通过                           |

## 静态合规扫描

| 扫描                                         | 结果与分类                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 工作树媒体、歌词、图片和视频文件扩展名       | 无匹配；不含任何 `.mp3`、`.wav`、`.lrc`、封面或视频资产                                   |
| 运行时代码中的 HTTP(S)、`file://` 与绝对路径 | 无匹配；不把 `package-lock.json`、测试夹具或历史文档混作运行时端点                        |
| 运行时网络 API                               | 无 `fetch`、XHR、WebSocket、EventSource、Beacon、Axios 等匹配                             |
| 硬编码 `blob:`                               | 无匹配；实现仅使用 `URL.createObjectURL(record.file)` 与对应的 `URL.revokeObjectURL(...)` |

本轮使用的命令：

```powershell
rg --files --hidden -uu -g '!node_modules/**' -g '!dist/**' -g '!coverage/**' -g '!.git/**' |
  rg -i '\.(mp3|flac|wav|aac|m4a|ogg|opus|wma|ape|lrc|srt|ass|jpg|jpeg|png|gif|webp|avif|bmp|tiff|svg|ico|mp4|mov|mkv|webm)$'

rg -n -i 'https?://|file://|[A-Za-z]:\\|/Users/|/home/|\\\\[A-Za-z0-9_.-]+\\' src public index.html package.json vite.config.ts --glob '!src/tests/**'
rg -n -i '\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\baxios\b' src public index.html --glob '!src/tests/**'
rg -n -i 'blob:' src public index.html --glob '!src/tests/**'
rg -n 'URL\.(createObjectURL|revokeObjectURL)' src --glob '!src/tests/**'
```

测试中的 `example.invalid` / `blob:https://example.invalid/...` 是存储拒绝与序列化边界夹具；`package-lock.json` 的 npm registry URL 是安装期依赖元数据；它们都不属于应用运行时媒体或接口。

## 已知限制

- 本轮 Chrome 自动化直接验证了 WAV 解码、媒体时钟和播放器状态；自动化环境无法主观听取扬声器输出。需要评估外放设备、系统音量或其他浏览器格式时，应由人工使用仓库外合法音频补做听感兼容性复测。
- 目录和歌单在 `localStorage`，音频文件在 IndexedDB；它们按浏览器来源隔离，且不是跨存储事务。更换协议、域名或端口、无痕模式、配额不足或浏览器清理会使数据不可用。
- 刷新后固定安全暂停，不恢复播放进度或播放中状态，也不会自动播放。
- 临时歌单跨标签页采用最后写入覆盖；没有云同步、导出、备份、目录扫描、批量匹配、远程元数据或远程音源。
- 扩展名/MIME 通过校验不等于所有浏览器或系统都能解码；实际支持的格式仍取决于浏览器和系统编解码能力。
