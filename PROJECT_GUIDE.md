# Comment Console 项目说明与开发交接

更新日期：2026-10-11。面向首次接手项目的开发者。

## 1. 产品目标与当前阶段

本项目是本机运行的抖音 AI 获客工作台。核心目标是从公开视频和评论中识别有真实、近期需求的人，展示证据，生成合适的回复，并记录后续互动。优先把找客效果做好，再扩展桌面客户端、服务器模型服务和联网更新。

当前产品仍是本地网页：Node.js 后端 + 浏览器前端 + 抖音油猴脚本。它不是云端 SaaS，也不是独立桌面安装应用。关闭抖音标签页或停止本地服务，会影响采集和互动能力。

目前已有完整的基础模块和自动化流程，但不能把它描述为已经验证成熟的企业级全自动获客系统。关键不足在于真实需求的召回、筛选准确性、平台接口兼容性和端到端验证。

当前场景包括演唱会求票用户和大模型 API 中转服务用户。票务规则与中转服务规则均已存在；扩展其他行业时必须验证规则是否适配，不能仅替换客户画像就假定通用。

## 2. 功能现状

| 模块 | 已实现 | 交接时应注意 |
| --- | --- | --- |
| 视频发现 | 手动搜索词、AI 扩词、多词搜索、视频去重、发布时间和评论量过滤 | 搜索返回的相关性仍需人工抽查 |
| 视频质量 | 抽样评论、近期评论统计、需求线索评分、扩展抽样 | 抽样不是完整评论区，可能漏掉后面的需求评论 |
| 评论判定 | 线索词、时间过滤、AI 意向分数/标签/理由、主题语境检查 | AI 分数不是购买概率；误判和漏判需要标注样本验证 |
| 后台任务 | 后台执行、进度、阶段、任务历史、结果持久化 | 服务重启会把未完成任务标记为中断，不能从断点继续 |
| 评论互动 | 回复草稿、审核发布、可配置直接发布、失败记录 | CLI 和 HTTP API 存在发送能力，测试时必须避免真实发布 |
| 去重 | 评论 ID 去重、已回复评论/用户跳过、同一进程回复锁 | 多进程并发发送下的原子性、账号作用域仍需进一步审查 |
| 工作流 | 保存、编辑、暂停、手动执行、按间隔巡检、绑定连接账号 | 是本地调度，需要后端常驻；重启不补跑积压任务 |
| 账号池 | 连接心跳、登录探测、昵称与账号标识、连接分配 | 不同账号通常需要不同浏览器配置文件或独立登录环境；同一配置文件的标签页共享登录态 |
| 私信 | 真实发送接口、桥接接收实时消息、本地保存、会话展示 | 旧历史聊天没有完整回填，私信收发需要真实环境验证 |
| 模型设置 | 自备 API、模型列表、手动选模型、发送 hi 测试、应用测试配置 | 扩词/意向/回复请求与 hi 测试的负载不同，测试成功不能保证后续每次请求成功 |
| MCP | 状态、账号、找客、任务、线索、草稿工具 | 已有代码；是否被助手加载取决于 MCP 客户端配置 |
| 启动与打包 | Windows 启动脚本、教程、便携包构建脚本 | 包需在干净 Windows 机器重新验证；源码环境需要安装 Node.js |
| 托管模型/联网更新 | 托管模型模式预留 | 尚未完成账号、套餐、计费、更新检查/下载/回滚等服务 |

点赞和关注开关目前保存为配置，找客任务会明确提示尚未自动执行，不能当作完成的能力。工作流虽保存评论额度字段，但当前执行入口没有完整接入这个额度；私信传入的是任务数量上限，不等同于完整的按账号每日额度账本。上线自动动作前优先补齐并测试。

## 3. 本次交接的验证依据

2026-10-11 本地执行 `npm test`：26 个测试文件、291 项测试全部通过。测试主要覆盖代码逻辑、协议、存储和模拟响应，不能代替真实抖音搜索、评论发布或私信收发测试。

交接检查时本地 `19422` 服务未运行。现有本机数据库里最近三次找客任务均执行完成，但有效客户数为 0；其中大量搜索结果因视频时间窗口被排除，剩余候选又因评论需求线索不足被淘汰。这说明流程可以完成，但获客效果仍需要改善。

本机历史任务和采集数据不随仓库提交。朋友克隆后应从自己的配置与数据开始，不能依赖开发者电脑上的数据库。

## 4. 系统架构

```text
浏览器工作台 frontend/          MCP 客户端 / CLI
            │                         │
            └──── 本机 Node.js 服务 ───┘
                    server.js
                    lib/server/router.js
                           │
                 lib/app/controller.js
           搜索 → 抽样 → 采集 → 判定 → 草稿/动作
                     │             │
               SQLite/JSON       模型 API
                     │
              Bridge 请求通道
                     │
      登录抖音的浏览器 + Tampermonkey 脚本
                     │
           抖音页面上下文与平台请求
```

账号来自当前连接的抖音页面；软件不会自动读取电脑上所有浏览器。多个连接需要根据账号 UID、连接 ID 和连接索引分配，不能凭“第一个浏览器”推断账号。连接存在和登录有效是两个不同状态。

抖音端依赖页面登录态和非稳定的平台接口，平台改版、账号限制或请求错误都可能影响功能。本机工作台默认监听 `127.0.0.1:19422`，不要直接暴露到公网作为服务器产品。

## 5. 目录与代码入口

| 路径 | 责任 |
| --- | --- |
| `server.js` | 后端启动、配置读取、HTTP 与 Bridge 初始化 |
| `launcher.js` / `启动评论工作台.cmd` | Windows 启动与打开工作台 |
| `frontend/index.html` | 页面与表单结构 |
| `frontend/app.js` | 页面状态、API 调用、任务/结果/账号/会话渲染 |
| `frontend/styles.css` | 布局、响应式样式、弹窗和组件样式 |
| `lib/server/router.js` | HTTP 路由、本地会话、账号与工作流调度 |
| `lib/server/registry.js` / `ws-hub.js` | 连接登记、心跳、过期连接清理和请求通道 |
| `lib/app/controller.js` | 主要业务流程；搜索、筛选、任务、评论和私信动作 |
| `lib/app/settings.js` | 抓取与筛选设置的规范化与持久化 |
| `lib/app/llm-settings.js` | 模型配置、模型列表、真实测试与凭证脱敏 |
| `lib/app/workflows.js` | 工作流配置、状态和运行统计 |
| `lib/commands/` | 可复用 CLI 命令，包含搜索、评论采集、发布、草稿等 |
| `lib/llm.js` / `prompts/` | 模型客户端、意向与回复提示词 |
| `lib/memory/db.js` | SQLite schema 与迁移；当前 schema 版本 12 |
| `lib/memory/app-jobs.js` / `dm.js` | 任务结果、真实私信会话和消息持久化 |
| `scripts/douyin.user.js` | 浏览器连接桥与抖音页面 API |
| `scripts/dm-bridge-funcs.js` / `dm-bridge-lib.js` | 私信桥接源码与协议支持 |
| `mcp/server.mjs` | 标准输入/输出 MCP 服务 |
| `scripts/build-portable.js` | Windows 便携包构建 |
| `tests/` | Vitest 回归测试 |

`controller.js`、`router.js` 和前端 `app.js` 目前较大。后续可按发现、意向判定、交付、账号、私信拆分，但重构前保留现有测试并逐步迁移。

## 6. 新开发者启动步骤

建议 Node.js 24，MCP 最低需要 Node.js 20。项目基础 CLI 仍声明 Node.js 18+；CI 当前使用 Node.js 18，版本约定尚待统一。需要 Git，以及 Chrome 或 Edge + Tampermonkey。

```powershell
git clone https://github.com/zhaifeicom-ui/douyin-comment-console.git
cd douyin-comment-console
npm ci
Copy-Item config.example.json config.json
npm start
```

打开 `http://127.0.0.1:19422/app`。从工作台教程安装 `http://127.0.0.1:19422/app/douyin.user.js` 提供的连接脚本：服务会为该副本注入本机 Bridge token，仓库里的脚本保留空凭证。

在安装脚本的同一个浏览器配置文件里打开抖音并登录，刷新页面，然后确认工作台的连接与登录状态。模型 API 在设置页配置并发送 hi 测试。优先验证少量视频的只读采集，再测试草稿。

只运行后端、不自动打开浏览器：

```powershell
npm run server
```

`npm ci` 若出现 SQLite 原生模块 ABI 错误，应先统一 Node 版本并重新安装依赖，不要复制其他 Node 版本的 `node_modules`。

## 7. HTTP API 与 CLI

`GET /api/health` 与 `GET /api/status` 用于健康和 Bridge 状态检查。`/api/app/*` 仅接受本机请求，调用前需要通过 `GET /app` 建立并保留 `app_session` Cookie；普通脚本忽略 Cookie 会返回 401。MCP 已实现这个会话流程。

| 方法与路由 | 用途 |
| --- | --- |
| `GET /api/app/douyin/session` | 探测抖音登录态 |
| `GET /api/app/accounts?probe=1` | 读取连接账号并刷新账号信息 |
| `POST /api/app/videos/discover` | 搜索标题并采集原始评论；适合只读调研 |
| `POST /api/app/campaign/run` | 完整找客任务 |
| `GET /api/app/videos` | 已保存的视频 |
| `POST /api/app/videos/:awemeId/fetch` | 采集指定视频评论 |
| `GET /api/app/comments?aweme_id=...` | 查询保存的评论及筛选结果 |
| `POST /api/app/videos/:awemeId/analyze` | 意向分析 |
| `POST /api/app/comments/:cid/draft` | 生成回复草稿 |
| `GET /api/app/jobs` / `GET /api/app/jobs/:id` | 任务列表、状态与结果 |
| `GET/POST/PUT /api/app/workflows` | 工作流列表、创建与更新 |
| `POST /api/app/workflows/:id/run` | 手动运行工作流 |
| `GET /api/app/inbox` | 真实私信会话与消息 |
| `POST /api/app/llm/models` / `POST /api/app/llm/test` | 模型列表与真实对话测试 |

异步 API 返回任务，调用方继续查询 job ID；任务执行结果应结合 `status`、`error`、筛选统计和真实结果判断，不能只看进度条。

只读调研建议使用 `videos/discover` 的 `keyword`、`count`、`maxCommentsPerVideo` 参数，或者 CLI：

```powershell
node cli.js search "大模型 API 中转" --count 5
node cli.js get <aweme_id> --pages 2 --count 20
```

评论发布与私信发送另有写接口和 CLI 命令。研究标题、评论与筛选效果时应使用只读采集路径，避免工作流继承已保存的发送模板。

## 8. MCP 接入

MCP 使用 stdio，不是远程 HTTP MCP。先启动本机后端，再在助手的 MCP 客户端配置中添加：

```json
{
  "mcpServers": {
    "comment-console": {
      "command": "node",
      "args": ["A:/dy/douyin-comment-console/mcp/server.mjs"]
    }
  }
}
```

朋友需要替换为自己的绝对路径。存在 `mcp/server.mjs` 不代表客户端已经加载成功，配置完成后应实际检查工具列表和状态工具。

现有工具：`comment_console_status`、`comment_console_list_accounts`、`comment_console_discover_customers`、`comment_console_list_jobs`、`comment_console_get_job`、`comment_console_list_leads`、`comment_console_draft_reply`。

MCP 找客工具强制关闭发送，只执行搜索、公开评论采集和 AI 判定。当前 MCP 主要返回筛出的线索，尚没有独立的原始视频标题/完整评论调研工具；调研时可先使用 HTTP API 或 CLI，后续再补只读 MCP 工具。

## 9. 配置、数据与提交边界

- `config.example.json`：可提交的空凭证示例。
- `config.json`：本机模型密钥和 Bridge 配置，已忽略，不能提交或发给朋友。
- `storage/`：SQLite、工作流与业务设置等本机数据，已忽略。
- `logs/`、`downloads/`、`release/`：日志、下载与发布产物，已忽略。
- `artifacts/`：历史 UI 截图，可能包含实际任务、用户内容或模型设置；分享前人工检查。

配置路径支持 `COMMENT_CONSOLE_DATA_DIR`、`COMMENT_CONSOLE_CONFIG_PATH`；数据、日志与下载还支持 `DOUYIN_STORAGE_DIR`、`DOUYIN_LOG_DIR`、`DOUYIN_DOWNLOADS_DIR`。默认都位于项目目录相应位置。

SQLite 迁移写在 `lib/memory/db.js` 中。新迁移应追加、幂等，并验证已有数据库升级。不要删除别人的数据库来解决迁移问题。

## 10. 测试与交付

```powershell
npm test
npm run test:watch
npx vitest run tests/app-controller.test.js tests/server/router.test.js
```

测试用临时数据目录隔离真实记录，并关闭请求节奏延迟。不要把测试环境的无节流配置用于真实账号。

页面冒烟脚本 `node scripts/ui-smoke.js` 需要先运行工作台，并依赖本机 Edge；脚本会读取当前页面并生成截图，不能把输出截图视为匿名测试数据。

真实环境验收：确认心跳与登录有效；少量搜索；检查视频标题与评论实际关联；检查分页和评论时间；人工标注意向；生成草稿；在有明确授权的测试对象上验证一次发送；重跑验证去重；重启后验证历史记录。

`npm run build:portable` 在 `release/` 下构建 Windows x64 包，复制当前 Node 运行时及 SQLite 原生模块。应在 Windows x64 构建，检查模板文件齐全，并在未安装 Node 的干净 Windows 环境验收。构建脚本会重建同版本输出目录，不要在该目录里放唯一的用户数据。联网更新尚未实现。

## 11. 下一阶段优先级与建议分工

1. **获客效果**：通过软件只读接口采集真实视频标题和评论，建立人工标注样本；分别评估搜索相关性、评论采集覆盖率、规则召回和 AI 判定。先定位漏在哪一层，再改提示词或模型。
2. **筛选规则**：重点识别“明确求服务”“现有服务不满意并寻找替代”“接入受阻且需要服务商”；排除泛讨论、广告和已解决需求。视频发布时间与评论时间应分别评估，旧教程也可能有新需求评论。
3. **执行可靠性**：补齐跨任务/跨进程去重、按账号的持久化每日限额、发送状态确认和失败恢复；避免网络超时后盲目重发。
4. **只读 MCP 调研能力**：提供搜索标题、分页采集评论、查看原始证据和筛选拒绝原因的工具，方便助手真正使用工作台研究。
5. **产品闭环**：线索 → 草稿/触达 → 客户回复 → 跟进状态 → 转化记录。私信历史与实时接收需要端到端验证。
6. **后续交付**：完成便携包干净机器验收，再考虑桌面壳、托管模型服务和联网更新。

协作可按“发现与筛选”“前端与结果解释”“连接/账号/私信”“MCP与测试”拆分任务。`controller.js`、`router.js` 和 `frontend/app.js` 是冲突高发文件，应约定负责人和改动范围。

## 12. 仓库协作方式

2026-10-11 通过 GitHub 查询，仓库 `zhaifeicom-ui/douyin-comment-console` 的可见性是 **PRIVATE**。邀请朋友需要在仓库 Settings → Collaborators 中添加协作者；直接发链接不会自动授予访问权限。

从最新 `main` 创建各自的功能分支，用 Pull Request 合并。提交说明写明行为变化、验证方式与未完成部分；默认不要改动他人的本机配置、采集数据或账号脚本凭证。查看 PR 时优先核对筛选证据和发送条件，而不仅检查 UI 是否能打开。

已有 MIT 许可证和原项目说明应继续保留。后续若改变仓库可见性，需要先审查源码与 Git 历史中的凭证和实际用户数据；当前仓库不会因本次交接自动改为公开。
