# Gallery

**Gallery — Where humans and AI agents create together.** An agent-first, HTML-native workspace where AI agents write HTML, humans edit in a Notion-like interface, and both stay in sync.

Gallery 是一个本地的文档工作区：AI Agent（Claude Code、Codex 等）把材料、数据和实验结论写成 HTML 文档，你在浏览器里像用 Notion 一样直接改，双方的修改自动合并；写完导出成一个可交互、可复核、可离线分享的单文件 HTML。它由两部分组成：命令行程序 `gallery`（npm 包 `@heycys/gallery`，带一个只监听本机的本地服务和浏览器里的工作台），和一个很薄的 Skill（告诉 Agent 怎么写文档、怎么用 `gallery`，由 `gallery skill install` 装好）。

Agent 只负责内容和组件选择：排版、配色、深浅色主题、响应式布局、表格对齐与排序都由共享组件完成；公式由本地打包的 KaTeX 渲染，代码高亮由本地打包的 Shiki 完成。图表没有预设的样式：文档自己的脚本用 `DocCharts.define` 定义一次图表类型（用 D3 画），每张图是一个图形块，各带自己的数据（一段 JSON，或者页面上的一张表格：读者改了表格，图跟着重画）；图形的边框、坐标轴外观、主题颜色和重画由共享组件负责，页面编辑时整个图形可以删除和移动。示意图、时间线、架构图用文档自己的 HTML 或 SVG 画，也是图形。

## 要求

- Node.js 22.13 或更高版本（https://nodejs.org 的 LTS 版），macOS、Linux 或 Windows。
- 在浏览器里编辑和 `gallery qa` 需要 Chrome 或 Microsoft Edge（编辑器只支持 Chromium 内核的浏览器；默认浏览器是 Safari 或 Firefox 时，把地址复制到 Chrome 或 Edge 里打开）。`gallery qa` 和 PDF 导出用电脑上装好的 Chrome 或 Edge，不另外下载浏览器；`GALLERY_BROWSER=<程序路径>` 可以指定一个。

## 安装

```bash
npm i -g @heycys/gallery
gallery --version
gallery skill install
```

`gallery skill install` 把和这个版本配套的 Skill 写到 Agent 读 Skill 的地方：Claude Code 是 `~/.claude/skills/gallery`（设置了 `CLAUDE_CONFIG_DIR` 时是它下面的 `skills/gallery`），Codex 是 `~/.codex/skills/gallery`（设置了 `CODEX_HOME` 时是它下面的）；两个都装了就两个都写，都没有就写 Claude Code 的。`--agent claude|codex` 只写一个，`--project` 写进当前项目的 `.claude/skills/gallery`（或 `.codex/skills/gallery`，Codex 是否读项目里的 Skill 还没有验证），`--dir <文件夹>` 写到任意文件夹（用于别的 Agent）。升级 `gallery` 之后再运行一次，Skill 跟着更新；Skill 没变时什么都不做。也可以不用命令，把 `gallery-skill-<版本>.zip` 解压到 Agent 的 Skill 目录。

只给 Agent 装了 Skill、电脑上还没有 `gallery` 也可以：Agent 会先运行 `gallery --version`，发现没有（或版本不配套）时先问你，你同意后它运行 `npm i -g @heycys/gallery@^0.4.0`。

- macOS、Linux 上 `npm i -g` 报 `EACCES`（npm 的全局目录属于系统）：不要用 `sudo`，执行 `npm config set prefix ~/.npm-global`，把 `~/.npm-global/bin` 加进 `PATH`，重开终端再装；或者每个命令都写成 `npx -y @heycys/gallery@^0.4.0 <命令>`（每次慢几秒，适合不能全局安装的沙箱和 CI）。
- Windows PowerShell 提示“禁止运行脚本”（`gallery.ps1`）：改用 `gallery.cmd`，或者执行一次 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。
- 命令名很短，在 Agent 的权限设置里允许一次 `gallery *` 就够了。

**更新。** Agent 每次开始任务都先运行 `gallery --version`。装着的 Skill 比 `gallery` 旧，或者 npm 上有更新的 Gallery 时，它在版本号下面多打一行（`技能：…`、`新版本：…`，各带要运行的命令），Agent 在这次任务里告诉你一次、问你要不要更新（所以有新版时你能及时知道），你同意后才运行（`gallery skill install`；新版本是先 `npm i -g @heycys/gallery@^<新版本>` 再 `gallery skill install`；用 `npx` 运行 Gallery 时，两行给的都是 `npx -y @heycys/gallery@^<版本> skill install`），之后新开的 Agent 会话读到新 Skill。别的命令不说 npm 上的新版（装着的 Skill 比 `gallery` 旧时，命令末尾会多一行 `需要处理：…`）。查 npm 从不让命令等：`gallery --version` 只读本机的一个小缓存（Windows 在 `%LOCALAPPDATA%\gallery`，macOS 在 `~/Library/Caches/gallery`，其他系统在 `~/.cache/gallery`），缓存超过一天才在后台问一次 npm 源。问的是 npm 安装时用的源：`npm config set registry` 设的镜像（写在 `~/.npmrc` 里）照样算，`GALLERY_REGISTRY` 可以另指；要走代理时用 npm 设的代理（`npm config set proxy`）或环境变量 `HTTPS_PROXY`，这要 Node 22.21 或更新的版本，更早的 Node 在代理后面查不到。没网、查不到都不报错，一小时后再试；缓存文件夹写不进去时（有的沙盒里）不查。不想查 npm：设环境变量 `GALLERY_NO_UPDATE_CHECK=1`（设了 `CI` 或 `NO_UPDATE_NOTIFIER` 也不查）；Skill 的检查只读本机文件，一直开着。

## 快速开始

**自己用。**

```bash
gallery new my-doc "我的文档"     # 新建文档，启动本地服务，打印地址
gallery open                      # 在默认浏览器里打开工作台
gallery export my-doc             # 导出离线单文件 <工作区>/exports/my-doc.html
gallery help                      # 所有命令
```

工作台里可以新建、导入（Markdown、Word、PDF、HTML、Notion 导出的 ZIP……）、编辑、导出文档。

**交给 Agent。** 装好 Skill 后，在 Claude Code 或 Codex 里说“用 Gallery 把这些材料写成一份文档”（Codex 里也可以写 `$gallery`）。Skill 只在你点名 Gallery 时使用。Agent 会运行 `gallery new`，先把文档的地址发给你：你在浏览器里看着文档写出来，随时可以直接改，你改的和它改的会自动合并。写完它运行 `gallery qa`（先导出，再用 Chrome 或 Edge 在三种宽度下检查导出文件），最后告诉你检查留下的问题；你要文件时它才给你离线文件的路径。要改已有的文档，告诉它标题或主题即可（它用 `gallery list` 找到）；工作台“更多操作”里的“复制本地路径”和“复制批注”可以把文件位置和你的批注直接交给它。

在云端沙箱里运行的 Agent 打不开你电脑上的本地服务：它会跳过地址，直接把导出的文件交给你。

## 工作区

文档放在**工作区**里，一个工作区就是一个装文档的文件夹，按这个顺序找到：

1. `--workspace <dir>`（每个命令都接受）；
2. 环境变量 `GALLERY_WORKSPACE`；
3. 当前目录往上最近的含 `gallery.json` 的文件夹（`gallery init <dir>` 把一个文件夹建成工作区）；
4. “文档”文件夹里的 `Gallery`，即 `~/Documents/Gallery`（第一次用时自动建好）。Windows 上是资源管理器里的“文档”：OneDrive 备份了“文档”时，就是 OneDrive 里的那个；Linux 上是桌面的“文档”文件夹（如 `~/文档`）；macOS 第一次可能会问终端能否访问“文稿”。这一个叫“默认工作区”，侧栏里它的那一栏叫“默认文档”；环境变量 `GALLERY_DEFAULT_WORKSPACE` 可以让别的文件夹代替它。

`gallery new`、`gallery list`、`gallery open` 会打印文档所在工作区。文档仍保存在选定文件夹，首次使用后登记到全局文档树。所有工作区共用默认工作区的 Gallery 服务、栏目顺序、扩展、首页、自定义块和写作偏好。登记表位于用户数据目录的 `workspaces.json`（`GALLERY_DATA_DIR` 可指定独立目录）。工作区布局：

| 路径 | 内容 |
| --- | --- |
| `<工作区>/<slug>/doc.html`、`doc.json` | 一份文档：编辑源和它的标题、说明；同一个文件夹里还有 `assets/`（图片和文件）、`materials/`（随文档带的原始材料）、`annotations.json`（批注）。Gallery 0.1 以前建的文档是 `report.html`、`report.json`，照旧按原名读写，不改名 |
| `<工作区>/exports/<slug>.html` | 导出的离线单文件，交给读者的就是它（这个文件夹里的文件 Gallery 从不删除） |
| `<工作区>/components/<范围>/<名字>/` | 一个自定义块：工作区自己的、能反复使用的块，能看见、能进 git；放进文档，也能做成自定义页上的卡片（看它清单里的 `places`）；不是文档，改动后打开着的、用到它的页面会跟着更新。文件沿用 component 这个词（`component.json`、`data-doc-component`）；`components/gallery/` 和 `components/gallery-soft/` 是 Gallery 自带的两个块包（「Gallery 风格」和「柔光风格」，工作区第一次启动时装上，后者默认关闭），一个范围带上 `pack.json` 就是一个能分享的块包 |
| `<工作区>/preferences/` | 写作偏好：你给 Agent 的写作要求，每份一个 Markdown 文件（新工作区先有一份 `通用写作.md`；以前的 `<工作区>/preferences.md` 迁移成 `项目报告写作.md`） |
| `<工作区>/gallery.json` | 标明这是 Gallery 的工作区；设置 › 组件列表 的开关也记在这里（`components`：hidden、disabled、shown、unlisted、net），还有自定义页的顺序和默认首页建过没有（`pages`：order、homeMade） |

Gallery 自己的东西都在隐藏的 `.gallery/` 里：目录顺序、回收区、写作偏好那一页、首页那条说明关掉了没有、编辑状态和最近版本、每天的编辑记录（首页的编辑热力图用它，丢了也没关系）、`gallery qa` 的截图、服务器的地址和日志，还有 `gallery block try` 试用时临时复制的文档（试完就删）。`exports` 和以点开头的名字不能做文档的 slug；`components/` 放自定义块，不是文档，新文档也不能用这个名字（以前就叫这个名字的文档不受影响）。`doc.html` 里没有套件的标签（本地服务和导出时才加上），所以它不是能单独打开的网页：要看文档，用工作台或导出文件。

Gallery 自己写进文件的字（新文档的起始页和说明、首页的标题、页面的 `lang`、副本标题的后缀、导入的说明）跟系统语言走，写的那一刻定：中文系统写中文，别的系统写英文；环境变量 `GALLERY_LANGUAGE=zh` 或 `en` 可以指定另一种。已经写好的不会跟着改（英文系统上以前建的首页还叫“首页”，想改自己重命名）。界面的语言是另一回事：在工作台的 设置 › 语言 里选，没选时跟浏览器。

一个用户数据目录只有一个 Gallery 服务，只监听 127.0.0.1；优先沿用上次使用的端口，否则依次尝试 8080–8099（可用 `GALLERY_PORT` 指定起点）。已记住的旧端口不会因升级被改掉。在哪个文件夹运行 `gallery new/import/open/serve` 都使用它，`gallery stop` 停掉它。服务登记、令牌与日志分别在 `<data>/server.json`、`<data>/token`、`<data>/logs/server.log`。文档、媒体、回收区和导出仍保存在文档所属文件夹。

## 命令

| 命令 | 作用 |
| --- | --- |
| `gallery init [<dir>] [--name "<名字>"] [--from <旧的 reports 目录>]` | 建一个工作区（`gallery.json` 和 `.gallery/`）；`--from` 把旧版 Gallery 的文档复制进来（slug 已占用的跳过并列出），旧目录只读不改。工作区还没有过首页时，顺带建好默认的首页（`pages/home`，放问候与日期、便签、我的待办、最近编辑、工作区统计、编辑热力图六张卡片），和服务第一次启动时一样；建过一次就不再建。`--name` 给工作区起名（写进 `gallery.json`，别处按这个名字叫它；不给就按文件夹的名字） |
| `gallery new <slug> "<标题>" ["<说明>"] [--under <文档>] [--after <文档> \| --first] [--column "<栏>"] [--open]` | 从 starter 新建 `<工作区>/<slug>/doc.html` 和 `doc.json`（`type` 默认是 `report`，可以改；没给说明时是“新文档”，英文系统是 `New document`）；`--under` 放到某份文档下面（最后一个，加 `--first` 放第一个），`--after` 放在某份文档后面，都不给就放在顶层最后，打印工作区、写作偏好 `<工作区>/preferences.md` 在哪里（还没有时先按默认的写作偏好建一份）和下一步（第一步是马上把地址发给用户），最后启动（或沿用）唯一的本地服务，最后一行是交给用户的地址。`--column` 把新文档放进侧栏的某一栏。不打开浏览器：地址由 Agent 发给你，Agent 改了你没在看的文档时侧栏那一行会亮一个蓝点；加 `--open` 才在默认浏览器里打开 |
| `gallery import <文件> [<slug> ["<标题>"]] [--open]` | 把一个文件做成新文档（和工作台的导入同一套转换）：Markdown、HTML（包括 Notion 导出的）、CSV、Word、PDF、EPUB 或 ZIP；ZIP 里的每一页成为一份文档，按原来的层级放进目录。Markdown 里相对路径的图片复制到 `assets/`；打印做了什么、哪些内容没能照原样带过来（带行号），以及和 `gallery new` 一样的工作区、写作偏好、下一步和地址；也和它一样不打开浏览器，加 `--open` 才打开 |
| `gallery open [<slug>] [--no-browser] [--present]` | 启动（或沿用）统一的 Gallery 本地服务，用默认浏览器打开工作台（给了 slug 就打开那份文档），打印地址。服务在后台运行，命令结束后继续运行，日志在 `<data>/logs/server.log`。加 `--present` 直接用演示视图打开（给用户的地址是工作台地址，`#` 前面带 `?present`） |
| `gallery serve [--port <n>]` | 在前台运行本地服务，Ctrl+C 停止 |
| `gallery sandbox [--extension <dir>]... [--from <workspace>] [--demo] [--open] [--keep]` | 在独立临时工作区里试 Gallery 和扩展 |
| `gallery stop` | 停止统一的 Gallery 本地服务（先存完队列里的保存） |
| `gallery check [<slug>...]` | 检查文档结构、依赖、占位内容，并用 TypeScript 检查内联 JS；不写 slug 就检查全部；不改动文件，只列出导出时会写成套件写法的行，以及导出时会补上块身份的块 |
| `gallery export <slug>... [--original-images]`（或 `--all`）、`gallery export <slug>... --format pdf\|markdown\|html [--paper A4] [--scale 100] [--no-files] [--subpages [--folders]] [--out <文件夹>]`、`gallery export <slug>... [--allow-images <https 来源>] [--embeds-as-links]` | 交稿：先把 `doc.html` 写成套件写法、给每一块补上块身份 `data-block-id`，再检查、构建并导出离线单文件 `<工作区>/exports/<slug>.html`；列出改了哪些行和补上的块身份；最后一行是离线文件的完整路径（用户要文件时再给）。`--format` 和工作台的「导出」对话框一样导出 PDF（要 Chrome 或 Edge）、Markdown 或 HTML，`--paper`、`--scale` 是 PDF 的纸张和缩放，`--no-files` 不带图片和文件，`--subpages` 连同下面的文档一起导出（`--folders`：每份的子页面放进以它命名的文件夹），`--out` 指定写到哪个文件夹；不写 `--format` 就和上面一样，最后一行照旧是 `交给用户（…）：` 加完整路径。离线文件里的图片是按页面需要缩小的副本（文档文件夹里的原图不动）：最宽为正文宽度的两倍（默认 1424 像素），截图（PNG）和过宽的照片由电脑上的 Chrome 或 Edge 重新编码成 WebP；SVG、GIF、动图和本来就不大的图照原样；`--original-images` 改为放原图。PDF 和 Markdown 照原样带图。给要把离线文件发到别的平台的程序（比如扩展）用的两个选项：`--allow-images` 让文件里的图片也能从给出的 https 来源加载（`https:` 或 `https://cdn.example.com`、`https://*.example.com`，逗号隔开；离线文件默认不联网，会挡住网络图片），输出里会说明它可以从哪些来源加载图片；`--embeds-as-links` 把每个嵌入块写成指向它网页的卡片，给会删掉 `<iframe>` 的平台。这样的文件在 `exports/` 里叫 `<slug>-web.html`（`--subpages` 的压缩包叫 `<slug>-web.zip`），`<slug>.html` 始终是不联网的离线文件；没通过检查的文档和离线文件一样不写出（退出码 1） |
| `gallery qa <slug>... [--blocks a,b] [--tiles] [--no-export] [--pictures]` | 用 Chrome 或 Edge 在 1024、736、360px 三种宽度（再加笔记本的 1024×768 窗口）打开导出文件，说出读者会遇到的问题（失败、警告、提示），每条带 `doc.html` 里的行号；导出文件不是由现在的 `doc.html` 导出的就先导出。每次运行的截图放进新的 `<工作区>/.gallery/qa/<slug>/<运行时间>/`（只留最近 5 次）；改过或移动的块都拍，被持有的在同一次里补拍；末尾的「要看的图（N 张）」只列检查标出问题的地方，每处一张（标出问题的最窄宽度），其余的图存着不列，写在「不用看：」里（`--pictures` 列出这次拍的全部图）。结论之后单独一行是离线文件的路径（用户要文件时才给）。有失败退出 1，什么都没看（没找到浏览器或浏览器两次都没启动起来）退出 3，看了但有几处没验证退出 4 |
| `gallery list [<词>...]`、`gallery list --tree [<文档>]`、`gallery list [<词>...] --all`、以上都可加 `--json` | 列出工作区里的文档（以及侧栏里的网页链接）：slug、标题、说明、在侧栏目录里的位置（在别的文档下面时）、上次编辑时间和文件位置，最近改过的在前；给了词就先列标题、说明或 slug 里有这些词的，再列正文里有的（带上第一处）。`--tree` 按侧栏的样子列出栏和目录层级，给了文档就只列它和它下面的；`--all` 在登记表里的每个工作区里找，每份文档前打印它的工作区。开头打印工作区和写作偏好在哪里。`--json` 打印给程序读的字段，之后只加不改（`workspaces`、`page list`、`block list`、`block pack list`、`trash list`、`notes`、`history`、`status` 同样） |
| `gallery workspaces [--scan [<文件夹>]] [--name "<名字>"] [--forget <路径>] [--show <路径或 id> [--doc <slug>]] [--hide <路径或 id>] [--json]` | 列出这台机器登记过的工作区（当前的在最前，每个有名字、`ws-` 开头的 id、路径、文档数和上次编辑时间，统一服务的地址单独列出一次；文件夹不在了的标 `不在了`，仍留在登记表里）；`--scan` 把某个文件夹（默认是“文档”）往下 6 层里的工作区登记进来，`--name` 给当前工作区起名，`--forget` 把一个工作区从登记表去掉（磁盘上的东西不动）；`--show` 把另一个工作区（或其中一篇文档）加到侧栏，`--hide` 只是不在侧栏里显示它（文件不动，和 `--forget` 不同） |
| `gallery link add <网址> "<名字>" [--column "<栏>"] [--under <条目>] [--after <条目> \| --first]`、`link set <链接> [--url …] [--title …] [--icon …]`、`link remove <链接>` | 侧栏里的网页链接：一个 http 或 https 页面，点开后在右侧显示（拒绝被嵌入的网站给一张卡片和“在浏览器中打开”）；它是 `<工作区>/<slug>/link.json` 一个文件夹，不是文档，不检查、不导出、不进搜索。默认放在这个工作区自己那一栏的最前面，`--column` 放进别的栏。本地服务在运行时经它写，打开着的工作台马上显示；删除放进回收区，设置 › 回收区 可以恢复 |
| `gallery extension list`、`extension check <id>` | 扩展给侧栏加的栏（`<工作区>/extensions/<id>/sidebar.json`：一个标题和一串条目，每个条目有标题、可选的图标和网址，可以分层；点开有网址的条目，右侧显示它的网页，和网页链接一样）：`list` 列出工作区里有哪些扩展、各自的栏名和条目数，`check <id>` 照侧栏的读法读那份文件，打印侧栏会显示什么，读不出来时退出 1 并说明原因。Gallery 只读这些文件，写它们的是扩展（写法在 `skills/gallery/references/extensions.md`）；栏放在哪里由你拖动决定，条目不能拖进拖出。扩展的文件夹没了（`extension remove` 或手动删掉），Gallery 启动时和发现文件夹没了时把它的栏从目录里清掉；停用的扩展保留位置 |
| `gallery extension settings <id> [<键>=<值>...] [--json]` | 扩展自己的设置（`extension.json` 的 `settings`，现在只有开关）：不带键值时列出每一项、当前值和后台读的文件；带 `键=值`（`true`/`false`、`on`/`off`）就像在「设置 › 拓展列表」里拨开关一样改，扩展停用时不让改。后台从 `GALLERY_EXTENSION_SETTINGS` 指的文件读，改了不用重启；工作台脚本用 `api.settings` 和 `api.onSettings` |
| `gallery move <文档> (--under <文档> \| --top) [--after <文档> \| --first] [--column "<栏>"]` | 在侧栏目录里移动一份文档（连同它下面的）：放到某份文档下面或顶层，放在某份文档后面、第一个或最后一个。本地服务开着时经由它写，开着的工作台马上看到；文档文件不动，文档之间的链接照常可用 |
| `gallery set <文档> [--title "<标题>"] [--icon <图标>\|none] [--description "<说明>"] [--font sans\|serif\|mixed] [--size small\|default\|large] [--spacing compact\|default\|loose] [--width narrow\|default\|wide] [--full on\|off] [--wide-tables on\|off] [--wide-databases on\|off] [--all]` | 改文档的标题、页面图标或说明，和工作台的重命名、图标选择器一样同时改 `doc.html` 的页头和 `doc.json`；打开着的页面和侧栏马上显示。`--font`、`--size`、`--spacing`、`--width`、`--full`、`--wide-tables` 是工作台「字体与布局」和「全宽」「宽表格」那几项，写进 `doc.json` 的 `look`，加 `--all` 就是「应用到全部文档」；图标也可以写自定义表情的名字 |
| `gallery trash <条目>...`、`trash list [--json]`、`trash restore <条目>...`、`trash empty [<条目>...]` | 回收区，和侧栏的「移至回收区」「设置 › 回收区」一样：文档、自定义页、网页链接都能移进去（移进去的文档，它下面的文档照侧栏的规则上移，不跟着进回收区）；`list` 列出里面有什么和各自原来在哪，`restore` 放回原处，`empty` 永久删除（不可恢复，只在你明确要求时）。`gallery link remove` 是它对网页链接的别名 |
| `gallery duplicate <文档> [<新 slug>] [--title "<标题>"] [--open]` | 创建副本，和菜单里的「创建副本」一样：放在原文档后面，标题加「（副本）」（英文系统是 ` (copy)`），打印新文档的地址（不打开浏览器，加 `--open` 才打开） |
| `gallery copy <文档> --to <工作区> [--under <文档>]` | 把一份文档（连同它下面的文档）复制到另一个工作区，和把它拖进另一个工作区的栏里一样 |
| `gallery favorite <条目> [--off]` | 把一个条目放进侧栏的「收藏」，或者取消收藏（收藏是全局一份，记在用户数据文件夹里） |
| `gallery column new\|rename\|remove "<栏>"` | 侧栏里的栏：新建、重命名，或移除（里面的条目回到「默认文档」，不删任何文件）；`gallery new` 和 `gallery move` 的 `--column` 把文档放进某一栏 |
| `gallery read <文档>`、`read <文档> --outline\|--map`、`read <文档> --block <id>\|--section <id 或标题>`、`--format markdown\|text\|html\|json` | 读一篇文档，什么也不写（不改文件、不加块 id、不导出，也不用开服务）。默认把每一块按顺序列出来，一块不落：左边是它在 `doc.html` 里的行号和块的 `data-block-id`；Markdown 写得出的照 Markdown 写，写不出的（图表和它的数据、自己画的图和它的 HTML、选项卡、分栏、提示块、详情卡片、文件和嵌入、自定义块和它的数据……）写明是什么、原样给出，最后说全不全。`--outline` 只列标题，`--map` 每块一行，`--block`、`--section` 只读一块或一节；`--format markdown` 是导出用的 Markdown（会丢东西，末尾写明丢了什么），`text` 只有文字，`html` 是文件里那一段的原文，`json` 给程序读。浏览器里这篇有没保存的修改时会说一声 |
| `gallery notes <文档> [--json]`、`notes done <文档> <id>... [--undo]`、`notes remove <文档> <id>...\|--done\|--all` | 批注（都可加 `--json`）：列出，标记为已处理（在界面里变灰；`--undo` 取消标记），或删除（只在你要求时；界面上可以撤销） |
| `gallery status [--json]` | 浏览器里开着哪些文档和页面、最后用的是哪一个、光标或选中的文字在哪一块，以及每篇的保存状态（已保存、待保存、有冲突）；你对 Agent 说「这篇」「这一段」时，它先运行这个 |
| `gallery history <文档> [--json]`、`history <文档> --changes <版本>`、`history <文档> --restore <版本>` | 一份文档的历史版本（时间、谁改的、改了哪几块）；`--changes` 列出某一版和上一版比改了什么，每块原来和现在的字（工作台的历史版本里在页面上标出来的那些）；恢复到某一版时，恢复前的样子也存成一个版本，所以恢复本身也能撤回 |
| `gallery revert <文档>` | 和页面底部的「撤回 Agent 的这些修改」一样：撤回 Agent 自你上次确认以来的修改，保留你自己的修改；没有待审阅的修改时退出 1。撤回后打印撤回前存下的版本，`gallery history <文档> --restore <版本>` 能把它恢复回来 |
| `gallery doctor` | 检查 Node、Gallery 版本、Skill 版本、工作区能不能写、有没有 Chrome，最后一行「下一步：」只说该做的一件事；别的命令只在有事要处理（装着的 Skill 比 `gallery` 旧）时多打印一行 `需要处理：…（运行 gallery doctor）`；npm 上有新版只由 `gallery --version` 和它说 |
| `gallery emoji add <名字> <图片>`、`emoji list [--json]` | 工作区自己的表情（页面图标选择器里的「+」）：加进去以后，`gallery set --icon <名字>` 也能用它 |
| `gallery block new <id> [--script] [--recipe <名字>]`、`add <名字>`、`list`、`show <id>`、`check <id> [--documents]`、`try <slug> …`、`pack install <文件夹或 zip>`、`pack list`、`pack remove <包>`、`pack on\|off <包>`、`menu on\|off <块>`、`net on\|off <块>` | 工作区里的自定义块（`components/<scope>/<name>/`，能反复使用的块；`gallery component …` 是同一个命令的旧名字）：`new` 起一个新块（`--recipe` 以 Gallery 自带的一个块为起点；`gallery` 范围留给自带块），`add` 原样装上一个自带块（文档用的 `card`、`chart-card`，自定义页用的 `today` 问候与日期、`note` 便签、`static` 静态卡片、`countdown` 倒计时、`habit` 习惯打卡，以及读工作区数据的 `todos` 我的待办、`recent` 最近编辑、`stats` 工作区统计、`heatmap` 编辑热力图），记下版本，以后再 `add` 只更新没被改过的副本，`list` 按“文档里可用”“自定义页可用”分组列出现在能用的、它们的版本和要用的能力，以及不能用的和原因、还没装的自带块，`show` 打印一个块的写法和示例，`check` 检查清单、`kit.js`（语法、禁用的 API、对 SDK 的类型检查）、`style.css`（每个选择器都在实例范围内）、`template.html` 和 `example.html`，再把示例放进临时文档导出，在导出的 CSP 下用 Chrome 或 Edge 运行：看控制台，测挂载、清理、再挂载和放回后 DOM 是否一样，查块的脚本有没有重画文字部分，并出 360、736、1024 宽和深浅色的图。每个问题带文件和行号。`--documents` 还把工作区各文档里这个块的每个实例照示例那样跑一遍，问题带那篇文档的文件和行号，不改任何文档。`pack install` 装上别人分享的块包（一个文件夹或 zip，最上一层是 `pack.json`，每个块一个文件夹；重装新版本时只更新没改过的块），`pack list` 列出工作区的块包和开关，`pack remove` 删掉装进来的包（自带的两个只能在 设置 › 组件列表 里关掉）；`try` 在文档的临时副本上做读者的操作（按、拖、按键、打字（中文走输入法）、选下拉项，`--steps` 多步），打印每步写进文件的行，逐步撤销核对，再开新页面确认能读回；`doc.html` 不动，加 `--keep` 才写进文档。`pack on|off`、`menu on|off`（块在不在文档的“/”菜单里）、`net on|off`（允许不允许联网，打开前先打印它会访问哪些网站）就是 设置 › 组件列表 里的开关 |
| `gallery page new <slug> "<标题>"`、`list`、`open <slug>`、`add <slug> <块>`、`try <slug> <卡片 id> <手势>`、`check <slug>`、`set <页> --title --icon`、`move <页> --after <页>\|--first`、`card <页> <卡片 id> --set k=v\|--move x,y\|--size w,h\|--remove`、`reset-cards <页>` | 工作区里的自定义页（`pages/<slug>/`：`page.html` 是卡片排成的画布，`page.json` 是标题和图标），在工作台侧栏「新建」「搜索」下面，地址是 `/#@<slug>`，首页（`home`）排第一：`new` 建一个带一块空画布的页面，`list` 按侧栏的顺序列出，`open` 启动或沿用本地服务并在浏览器里打开它，`add` 把一个块的卡片放进第一个空位（或 `--x --y --w --h` 指定的位置，碰到的卡片往下推），补上卡片 id；`try` 在页面的临时副本里对一张卡片做读者的操作（手势同 `gallery block try`），说出写进了它的哪些数据部分，按页面自己的撤销复原，再在新页面里读回，别处有改动就算问题；`check` 检查页面的结构（没有自己的脚本、卡片 id 不缺不重、格子不越界不重叠、块能放在页面上、`assets/` 里的文件都在），列出和上一次检查相比改了哪些卡片，并在 1280、1920、600 宽、深浅两色下截图。页面自己的图片放在 `pages/<slug>/assets/`，写 `assets/<文件>`。自定义页和文档共用一套 slug，互不占用；`pages` 留给这个文件夹，新文档不用这个名字。`set` 给页面改名字和图标，`move` 改它在侧栏里的顺序，`card` 改、移、调整大小或删掉一张卡片，`reset-cards` 恢复默认卡片，都经由本地服务写，打开着的页面马上更新；删除页面用 `gallery trash` |
| `gallery skill install [--agent claude\|codex] [--project] [--dir <文件夹>]` | 写入和这个版本配套的 Agent Skill（见上面的“安装”）；遇到旧版的完整 Skill，先把它的文档复制进工作区，再把它整个移到 `<工作区>/.gallery/old-skill-<日期>/`（不删除） |
| `gallery help [<命令> [<子命令>]]`、`gallery --version` | 用法和版本；`--version` 还会说装着的 Skill 比它旧、npm 上有更新的 Gallery（见上面“安装”的“更新”）；`gallery help block pack` 这样只看一个子命令 |

命令写错（不认识的参数、名字不是 slug、该写 slug 没写）时只打印原因和用法并退出（退出码 2），不读也不改任何文档；`--help` 打印完整用法。每份文档独立检查和导出：某一份出错只会让它自己被跳过并在结果中列出，其他照常导出；出错文档之前的导出文件保持不变，命令会提示它没有更新。导出时会自动去掉文档没用到的共享脚本，例如没有代码块就不打包 Shiki，没有公式就不打包 KaTeX，一份纯文字文档约 60 KB。

### 临时测试工作区

```sh
gallery sandbox --name my-test --demo --extension ./my-extension
```

命令在前台运行，自动选一个本机端口并打印地址和工作区。用 Chrome 或 Edge 打开该地址，或启动时加 `--open`。工作台顶部显示「沙盒」。`--demo` 放入两篇示例文档。`--from <workspace>` 把文档、资源、页面、扩展和内容设置复制到新工作区。副本跳过符号链接、其他工作区的目录引用、Gallery 的网络密钥和运行状态。原有扩展的启用状态需要在副本中重新设置。

`--extension <dir>` 可以重复使用。每个目录须有 `extension.json`。Gallery 安装并启用副本，源文件变化时重新安装，保留沙盒里当前的启用开关，工作台脚本随即重新 `activate(api)`（脚本必须导出它，不再有全局的 `window.gallery`）。扩展后台以当前用户的操作系统权限运行，请使用你信任的代码。

Ctrl+C 或另一个终端中的 `gallery sandbox stop my-test` 停止服务。默认清理临时文件，加 `--keep` 可以在停止后检查副本。用 `gallery sandbox list` 查看名称和状态。若要在运行时从另一个终端执行 Gallery 命令，先运行 `gallery sandbox env my-test`，在单独的 PowerShell 或 POSIX shell 中执行它打印的命令。它会切换到沙盒工作区，并设置独立的数据、缓存和 Agent 配置目录。

## 从旧版升级

旧版 Gallery（以及更早的 HTML Report Studio）整个装在 Agent 的 Skill 目录里（`gallery/` 或 `html-report-studio/`，里面有 `package.json`、`src/` 和放文档的 `reports/`）。装好 npm 包后运行一次 `gallery skill install`：它先把旧 Skill 里的文档（旧名字 `report.html`、`report.json` 照旧）、写作偏好、目录顺序、自定义表情、最近版本和 `exports/` 里的导出文件复制进工作区（slug 或文件名已占用的跳过并列出），再把旧 Skill 整个移到 `<工作区>/.gallery/old-skill-<日期>/`，从不删除，这样 Agent 只会看到一个 Gallery Skill。移走的文件夹里的 `node_modules/`（约 280 MB）已经用不上，可以删掉，工作区在 OneDrive、iCloud 这类同步文件夹里时尤其值得删。旧 Skill 的预览服务还在运行时会拒绝，先关掉它。也可以手动：`gallery init --from <旧目录>/reports` 复制文档，旧目录原样不动，再自己把旧目录移出 Skill 目录。

扩展作者：0.2.4 起工作台脚本从 `/__gallery/extensions/<id>/files/@revision/<版本>/` 加载，照脚本地址推算的后台地址（`new URL('../api/', import.meta.url)`）会落到 `files/` 下，得到 404（`reason: "backend-address"`），拓展列表里这个扩展也显示这条错误。改用 `activate(api)` 里的 `api.fetch('<后台路径>', init)`（自动带令牌，返回浏览器的 Response）或 `api.backend`（后台的完整地址，以 `/` 结尾）。0.2.5 起全局的 `window.gallery` 已经去掉：脚本必须导出 `activate(api)`，`window.gallery.token()`、`slot()`、`onRoute()` 等改用 `api` 上的同名方法，否则拓展列表显示「工作台脚本需要导出 activate(api)」。扩展要给用户开关，就在 `extension.json` 里写 `settings`（写法在 `skills/gallery/references/extensions.md` 的 Settings 一节），Gallery 在拓展列表的详情里画出开关并保存，不用自己做设置面板。

早期版本曾使用 4173 或从 4317 起的端口；现在首次启动默认从 8080 起，已有用户继续优先使用记住的端口。若手动换端口或端口被占用导致地址变化，浏览器按地址保存的收藏、深浅色、侧栏宽度、语言、导出目录选择和未保存修改仍留在旧地址下，旧书签也不会自动跳转。换地址前等开着的文档保存完成，再用 `gallery open` 打开实际地址并更新书签。

## 在浏览器里编辑

用 `gallery open` 打开工作台（或某份文档）后，页面直接就能改，改完自动保存（见下面的“自动保存”）。能改的有：文档标题、各级标题、段落、列表项、引用、高亮块、提示块、卡片的标题和说明、表格单元格、折叠块的标题和内容、弹窗里的正文、代码块、公式（行内的和独立成块的），以及自定义块里的文字部分。图表本身、带按钮的段落和脚本填出来的文字不能改，鼠标停在上面会说明原因。改文档标题时，网页标题 `<title>` 和 `doc.json` 里的标题一起更新。Agent 按普通网页写的内容（裸公式、`<details>`、`<pre>`、表格、图片、`<mark>` 等）在页面上显示成套件的块，所以同样能直接改；只是打开页面不改动文件，你第一次在页面上改动时，保存才把文件写成套件的写法（导出时也会写）。只有 Agent 自定义 class 的容器是整体块，按原样保留。

这一节只写使用者要知道的事；每个操作的完整规则、快捷键和边界情况在 [`docs/editor.md`](editor.md)（维护者文档）。

- **改字和格式。** 回车分段，Shift+Enter 段内换行，退格和 Delete 在块的两端合并或删除。选中文字后出现格式条：格式刷（应用格式）、文字颜色、加粗、下划线、清除格式、行内代码、公式，以及“更多”里的链接、删除线、斜体和弹窗卡片；跨几块选中的文字也有格式条，一起设置格式（链接、公式和弹窗卡片只能加在一块里的文字上，这时按钮是灰的）；常用的有 Ctrl+B、Ctrl+I、Ctrl+U、Ctrl+E、Ctrl+K。中文和英文字母、数字挨着打时自动加一个空格，行内代码和公式两边也一样。开着中文输入法也能用“/”菜单和 Markdown 标记。
- **新建和转换块。** 在空段落里输入“/”（中文输入法下的“、”也行）打开块菜单，按名称、拼音或首字母筛选：文本、小字、标题 1 至 4、符号列表、编号列表、待办事项、折叠列表、提示块、高亮块、代码块、引用块、分割线、表格、公式块、选项卡、图片、文件、网页书签、嵌入。在一段开头打 Markdown 标记再加空格（`# `、`- `、`1. `、`> `、`[] `）也会变成对应的块；`---` 和三个反引号单独一行变成分割线和代码块。空块都会留在文件里（媒体块的空占位读者看不到，空的文本块是一行空白），直到你填上内容或删掉它。
- **块的操作。** 鼠标移进一个块，左边出现手柄：点它选中这一块并打开块菜单（换类型、颜色、在下方新建、分区与分栏、删除），按住拖动可以把块放到文档里任何放得下它的地方；把正文、图片这些块拖到列表项文字右边一点（往右缩进一格）松手，就挂到这一项下面，和这一项的文字左对齐；在列表正下方的段落里按 Tab 也能挂到最后一项下面，Shift+Tab（或在它开头按退格）移出来。从空白处拖出矩形可以选中多块，选中的块可以一起删除、移动、复制和剪切。按住鼠标从一段文字拖到别的块，可以跨块选文字。块的颜色在块菜单里的“颜色”里：正文、小字、标题和列表项可以同时有文本颜色和背景颜色，高亮块、提示块、折叠列表和代码块只有背景颜色，其他块没有颜色；提示块左边的竖线是它背景颜色的深色，没设颜色时就是调色盘里的蓝色。Ctrl+Z／Ctrl+Y 撤销和重做，已经保存的修改也能撤销。
- **各种块。** 表格可以增删和移动行列、合并单元格、拖动列宽和表格大小、一键优化；图片、文件、网页书签和嵌入在“/”菜单里上传或给链接，文件存进文档自己的文件夹（`<工作区>/<slug>/assets/`）；选项卡可以新建、改名、换位置、删除；代码块点一下就能改，语言在块头的菜单里选；图形和表格可以拖边框调大小；分栏把几块并排。页面图标在标题上方，点“添加图标”或点图标，从表情、图标或上传的图片里选。
- **和 Agent 同时改。** 你改的和 Agent 改的是别处，保存时自动合并；改了同一处，这一处先不保存，左下角出现冲突卡片让你选。见下面的“自动保存”。

保存只替换改动过的那几段，`doc.html` 的其余内容逐字节不变。一块第一次在页面上被改动、移动或调整时，保存会给它加上 `data-block-id`：块的身份，没有含义。之后即使 Agent 把这块移到别处又改了字，编辑器也能准确对上它，不再靠原文去猜；Agent 新写的块没有它也照样能改。`gallery export` 导出时会给所有还没有它的块补上，所以文档从第一次导出起每一块都有；`node src/cli/add-block-ids.mjs <slug>` 也能单独补（原文件和改动行存到 `<工作区>/.gallery/backups/<slug>/`）。什么时候补都安全：块身份不算进块的内容，页面开着、还有没保存的修改时补，保存照样落在原来那一块上，不会出冲突。之后 Agent 新加的块先不带，第一次在页面上改到它时再补；只是打开页面，不会改动文件。行内公式和图标视图的链接是不可拆开的整体，保存时原样写回。

**自动保存。** 页面一打开就是编辑状态，没有“编辑文字”“保存”按钮：停止打字片刻后自动保存（一直在打字时也隔一段时间存一次），删除、移动、拆分、转换、调整大小、设格式、撤销这类操作马上保存，中文输入法拼写中不会保存；Ctrl+S 立即保存。保存进度（已保存、正在保存、离线、冲突）显示在工作台顶栏；需要告诉你的事（合并了 Agent 的修改、有冲突、连不上本地服务等）用底部的提示条说。撤销和重做跨越保存照常可用。

- 还没保存的修改随时存在浏览器里：页面刷新、关闭、崩溃，或者连不上本地服务时，下次打开这份文档会先把它们写回文件，再显示出来。同一份文档开了几个标签页，各存各的，互不覆盖。
- Agent 同时改了文件：它改的是别处，或者同一段的不同地方，保存时自动合并（同一段逐字合并）；Agent 写的内容直接出现在页面上，不用刷新，你可以接着打字，光标、选区、撤销和输入法都不受影响。少数没法原地显示的情况（例如页面的样式或脚本变了），等你停下来后整页刷新一次，滚动位置和光标所在的块保持不变。你和 Agent 改了同一处时，只有这一段先不保存：它标上红框，左下角出现一张冲突卡片，卡片里列着你的版本和文件里的版本，两边不一样的字都在原处标出来，可以“保留我的”或“用文件里的”，其他地方照常保存。你删掉或转换的块被 Agent 改过、你改的块被 Agent 删掉、新块原来的位置没了（先自动放到所在区域的末尾）这些情况，也在卡片里处理。有冲突也可以离开，下次打开时会列出你的文字，方便复制。
- Agent 按它早先读到的版本把整份文件重写、把你已经保存的修改改回去时，页面不会直接刷新，而是先出卡片：“恢复我的”把你的文字写回去，“接受 Agent 的”保留它的版本。
- 每次保存前，文件原来的样子会另存一份到工作区的 `.gallery/state/history/<slug>/`（每份文档保留最近 30 份），出问题时可以手动找回。本地服务重启不影响已经打开的页面，它照样能保存。
- 替换文件前的最后一刻会再核对一次：如果这期间 Agent 又写入了文件，会先和它的新版本合并再写，不会把它覆盖掉（文件一再变化时最多重试三次，之后稍后再存）。这只是把可能覆盖的时间缩到极短，并不是给文件加锁；不经过本地服务、恰好在同一瞬间写文件的程序，仍有可能撞上。

**字体与布局。** 工作台顶栏“更多操作”里的“字体与布局”：字体（等线体、衬线体、混合体：标题衬线、正文等线）、字体大小（小号、默认、大号，只改字的大小和行高）、正文宽度（偏窄、默认、偏宽，648、712、776 像素，默认字号下一行约 40、44、48 个字，不随字体大小变）和正文间距（紧凑、默认、宽松）。点了马上在页面上换，菜单不关；选的是这份文档自己的，存在它的 `doc.json`（`look`），导出的文件和打印也照这样排。卡片最下面的“应用到全部文档”把这份文档现在的样子设为工作区默认（存在工作区的 `gallery.json`，`look`），去掉每份文档自己的设置，所有文档马上换上，以后新建的也照它；之后在某份文档里再选，只改这一份。没有撤销，换回去也是在这里点。“更多操作”里目录下面还有一个“全宽”开关：打开后这份文档不管正文宽度设的是多少，都按整个页面的宽度显示，关掉就回到原来的宽度（同样是这份文档自己的，存在它的 `doc.json` 的 `look`，导出的文件也是全宽）。全宽下面是“宽表格”，默认关：打开后比正文宽、直接在正文里的表格在自己那一行居中，左右都可以超出正文，最宽到全宽时的页边，再放不下才在表格里左右滚动；高亮块、分栏、折叠块这些容器里的表格不变。它下面的“宽多维表格”对多维表格做同样的事：表格视图比正文宽、直接在正文里的多维表格整块（标签、筛选条和视图）居中超出正文，看板、日历这些视图和表格一样宽，最宽到页边，再放不下才在视图里左右滚动；只在页面里有这样的表格、多维表格时才出现这两个开关。它也存在 `doc.json` 的 `look`，导出的文件右上角的显示菜单里也有这个开关，打开时的状态跟着导出那一刻。这两个是整页的开关；单独一个比正文宽的表格、多维表格，在它的块菜单（手柄菜单）里也有“宽表格”“宽多维表格”，只管这一个，写在 `doc.html` 里它身上（`data-doc-wide="on"` 或 `"off"`），比整页的优先；再点整页的开关，所有表格（多维表格）都跟着整页，各自的设置就去掉了。

**复制、导入和导出。** 都在工作台顶栏的“更多操作”里：

- **导出**：可选 PDF、HTML、Markdown，可以去掉文件和图片、带上子页面（放在各自的文件夹里）；PDF 可以选纸张和比例，由电脑上的 Chrome 或 Edge 直接排版生成，不弹打印窗口。HTML 是离线单文件，图表照常可以交互，图片是按页面需要缩小的副本（截图和过宽的照片由 Chrome 或 Edge 重新编码成 WebP，原图不动）；Markdown 是 Notion 格式，图表存成图片。先保存还没保存的修改，再下载文件：只有一个文件时直接下载这个文件，多个文件才打包成 zip；文件名就是文档标题，不加编号。导出前先做导出必需的检查（不跑 TypeScript 和写作上的检查）：有联网代码、引用的图片或文件不在文档文件夹里、写在导出不会嵌入的位置等，就不生成文件，弹窗说明哪一页哪一处没通过、怎么改。要做完整检查再导出到 `exports/`，用 `gallery export <slug>`。
- **导入**：把 Markdown/文本、HTML（包括 Notion 导出的）、CSV、Word、PDF、EPUB 或 ZIP（最大 5GB）拖进来或选择文件，每个文件成为一份新文档，放在当前文档下面（工作区菜单里的“导入”放在顶层）；ZIP 里的子页面按原来的层级放好，图片和附件存进各自文档的 `assets/`。
- **复制页面内容**：把整页按 Markdown 格式复制到剪贴板（先保存还没保存的修改；图片、文件是本地服务上的地址，图表是它的表格）。
- **复制本地路径**：顶栏“更多操作”的第二项，把这份文档的 `doc.html`（旧版建的文档是 `report.html`）在电脑上的完整路径（按系统的写法，Windows 是反斜杠）复制到剪贴板，好直接告诉 Agent 改哪份。
- **导出当前视图副本**在导出的 HTML 文件右上角的阅读设置里：把页面连同现在的阅读状态（当前选项卡、展开的折叠块、备注、排序等）另存一份，不改动源文件。工作台里不再有这一项。

**工作台。** `gallery open` 打开的地址是本地的文档工作台：左侧是文档目录（可以拖动调整层级和顺序、收藏、搜索），右侧打开一份文档，文档里照常改字（自动保存）。新建、复制、改名、移到回收区、恢复、彻底删除、导入和导出都在这里做；新建的文档是空白的，只有标题和一段空文本，直接写就行，写完就能导出。目录是一排栏：这台机器上登记过的每个工作区各占一栏（默认工作区的那一栏叫“默认文档”），同一工作区内拖动直接排序；跨工作区拖动先确认，再连同子页面复制到目标，原项保留；栏标题的“＋”在这一栏里新建文档，“···”里有添加在线网页…、新建栏、添加其他 Gallery 项目…、重命名、复制本地路径、在文件夹中显示和从侧边栏移除。网页链接（点开后在右侧显示，拒绝被嵌入的网站显示一张卡片和“在浏览器中打开”；Agent 用 `gallery link add` 也能加）放在加它的那一栏的最前面。“添加其他 Gallery 项目…”是一张输入框右侧带蓝色“添加”的卡片，里面能选工作区，也能选工作区里的某份文档：选工作区再点添加，就把这一栏和里面的全部文档加进来；选文档再点添加，只加这一栏和这份文档。目录的栏、层级和顺序统一存在 `<默认工作区>/.gallery/outline.json`，只记文档和链接的组织关系，不存正文，拖动也不会移动磁盘上的目录；收藏、侧栏宽度、深浅色这些个人偏好只存在浏览器里。移到回收区的文档在 `<工作区>/.gallery/trash/`，可以恢复。切换文档、关闭窗口时不会再问你：当前文档会先把还没保存的修改存掉，来不及保存的（比如连不上本地服务）留在浏览器里，下次打开这份文档时自动写回。

**自定义页和首页。** 侧栏“新建”“搜索”下面是自定义页：一张由卡片排成的画布，每张卡片是一个自定义块，由 Agent 用 `gallery page new` 建（对它说“给我做一个读书页”“首页加一张倒计时卡片”）。第一次启动服务时 Gallery 自己建好首页（`pages/home`：问候与日期、便签、我的待办、最近编辑、工作区统计、编辑热力图），点侧栏顶上的 Gallery 字标回到它，它在侧栏里的右键菜单有“恢复默认卡片”。页面不画大标题，名字在侧栏、标签页和顶栏上。鼠标移到卡片上，卡片右上角里面出现六个点的把手：按住拖动移动卡片，点一下打开菜单（设置…、大小 ›、删除）；有的卡片右下角还能拖动改大小，拖动时碰到的卡片往下让。页面右上角 ··· 菜单里的第一项“添加自定义块”打开块库，选一个就放在第一个空位；Ctrl+Z 撤销这些操作。会联网的卡片（天气这类）要你点“允许访问”后才去取数据。设置 › 组件列表 里一行一个块（自带的和你工作区里自己的）：右边的总开关关掉后，这个块不再出现在“/”、“添加自定义块”和表格的“视图”里，已经写在文档和页面里的照常显示；点开一行还能看到版本、说明，以及“在文档菜单里显示”“停用”“允许联网”几个开关。

**写作偏好。** “设置”里的“写作偏好”是你写给 Agent 的写作要求：写什么、按什么顺序写、开头概括、标题、忠于材料、数据口径，以及语气、术语、版式等，Agent 每次写文档前都会先读它、照它写。第一次读它时（点开它，或 Agent 运行 `gallery new`、`gallery import`、`gallery list`）按 Gallery 默认的写作偏好（`src/shared/writing-preferences.md`，一份简短的通用写作规则：读者和目的、结构、句子、数字和事实、交稿前）建一份 `<工作区>/preferences/通用写作.md`，之后就是你的：在弹出的窗口里像文档一样直接改，点“保存”才存到这个文件，不点就关掉窗口不保存，下次打开时显示的还是文件里的样子（标题就是这份写作偏好的名字，也是文件名；什么都不留时只剩标题，默认的不会再回来）。有人直接改了这份 Markdown（比如你让 Agent 改的），下次打开窗口时显示的就是改过的样子。第一次打开写作偏好时，上面有一张说明卡片：写作偏好是做什么的、你和 Agent 能做什么，还有一份项目报告的写作偏好示例（中文、英文各一份），点一个就加成一份新的偏好，卡片也不再出现；点卡片右上角的 × 也是。想让 Agent 参考某份文档的结构和写法，就在写作偏好里写明是哪份。它是你自己的数据（在工作区里；那一页本身在 `<工作区>/.gallery/pages/` 里，它的 `doc.json` 里有 `"instructions": true`），技能更新不会覆盖它。`skills/gallery/SKILL.md`、`skills/gallery/references/` 只讲怎么用这个技能，不在工作台里改。回收区也在“设置”里。

**演示。** 顶栏“更多操作”里的“演示视图”全屏放映这份文档（读者看到的样子，不能编辑）。左下角的工具条有指针、激光笔、画笔、荧光笔、清除笔迹、上一节 / 下一节和退出；笔迹跟着页面滚动，退出就没了。Esc 退出。

**偏好。** “设置”里的“显示编辑框”打开后，点进文字时周围会出现蓝色虚线框（默认不显示）；“减少通知”打开后，移动、删除、复制、粘贴这类常用操作不再在底部提示，只提示需要你处理的事和不常用的操作。

**语言。** 侧栏底部“设置”里的“语言”可以把工作台和编辑器的界面换成中文或 English，选择记在浏览器里（没选过时跟随浏览器的语言）；文档内容本身不会被翻译。工作台和文档页之间的会话协议、工作区接口的规格见 [`docs/workbench.md`](workbench.md)。

编辑器只存在于本地服务的页面上，导出的离线文件里没有它。页面编辑支持桌面版 Chrome 和 Edge；Firefox、Safari 和触屏设备还没有验证过。页面会运行文档自己的脚本，而编辑器和保存接口也在同一个页面里，所以它是为你自己的文档（例如 Agent 为你写的）准备的，不要用它打开来路不明的文档。

## 二次开发

这一节是给改 Gallery 本身的人看的。修改 `src/` 或 `skills/gallery/sdk/` 前先读 [`docs/internals.md`](internals.md)：它说明每个系统在哪、系统之间怎么分开，并指向各系统的文档（渲染 `render.md`、编辑 `editor.md`、工作台 `workbench.md`、测试 `testing.md`）。改完运行 `npm run kit:check`，再把一个工作区（比如你自己的）复制到临时目录，对副本运行 `node src/cli/bin.mjs --workspace <副本> export --all`。不要直接对原来的工作区导出：导出前会把每篇文档按预览重写，并给每块编号。

| 路径 | 内容 |
| --- | --- |
| `src/cli/bin.mjs` | `gallery` 命令的入口（`src/cli/gallery.mjs` 分发到各个命令） |
| `skills/gallery/` | Skill 的内容：Agent 入口 `SKILL.md`（不超过 15 KB：装没装好有问题时运行 `gallery doctor`，再是五步工作流程和交付约束），写法说明 `writing-html.md`（写文档前必读）、`charts-and-figures.md`（自己画的图表和图示）、做自定义块的说明 `building-blocks.md`、`block-script.md`（块的脚本和写回）、`pages-and-data.md`（自定义页上的卡片，以及读工作区数据、表格和联网的块）、`extensions.md`（扩展给侧栏加一栏）和示例文档 `example-report.html`（每种块各写一次），共享组件的 TypeScript 接口声明（入口 `skills/gallery/sdk/index.d.ts`），Codex 的显示信息（`skills/gallery/agents/openai.yaml`）；写作规则在写作偏好里（默认的是 `src/shared/writing-preferences.md`，随 npm 包发布） |
| `src/` | Gallery 本身的实现，一个系统一个目录：`render/`（共享样式与组件 `kit/`、新文档的起始页 `starter/`、检查与导出）、`editor/`（页面上的编辑器与保存）、`workbench/`（工作台）、`server/`（本地服务：开发时挂在 Vite 上，发布包里是自己的 node:http 服务）、`cli/`（`gallery` 命令和维护者脚本）、`shared/`（系统之间的约定） |
| `tests/` | 回归测试：`unit/`（`kit:check`）、`browser/`（真实浏览器）、`release/`（npm 包的冒烟测试，`test:release`）、`fixtures/`（组件目录） |
| `release/` | 构建产物（不进 git）：`npm/` 是发布用的 npm 包（`release:build`），`skill/gallery/` 和 `gallery-skill-<版本>.zip` 是 Skill（`skill:package`） |
| `docs/` | 维护者文档：总览 `internals.md`，渲染、编辑、工作台、测试各一篇；还有写法参考：组件卡片 `docs/components/`、类名速查 `quick-reference.md`、版面规则 `visual-design.md`、文档契约 `report-contract.md`；以及这份中文手册 `manual.zh-CN.md`。都不进 npm 包和 Skill |

组件目录（Component Catalog，`tests/fixtures/component-catalog/`）是测试用的样例，收录所有组件，不在工作区里：单元测试靠它确认每个组件都有一例、都能运行，`kit-diff.mjs` 用它比较套件改动前后的样子。npm 包和 Skill 都不带这份文档，也不带任何文档。组件目录开头是概括块，下面分四页：正文（页面结构、标题段落与列表、行内颜色、公式、代码与 diff、提示框、高亮块、折叠块、详情卡片）、图像（用 `DocCharts.define` 自定义的图表、从表格画的图、交互的图表、示意图、卡片宽度与配色）、表格（自动列宽、固定首列的宽表、排序）、状态（阅读状态、筛选、从表格画的图与表格联动、选项卡）。

开发目录里用 `node src/cli/bin.mjs <命令>` 运行 `gallery`（或在开发目录里 `npm link` 一次，之后直接用 `gallery`）。仓库根目录往上没有 `gallery.json`，不加 `--workspace` 就会用 `~/Documents/Gallery`，也就是你平时用的工作区。试改动可以用 `node src/cli/bin.mjs sandbox --name try --demo` 开一个临时的 Gallery（见上面的“临时测试工作区”）：工作区、数据和缓存目录都是它自己的，放两篇示例文档，Ctrl+C 停止时一起清掉；也可以用 `--workspace <仓库外的文件夹>` 指定一个测试用的工作区。`npm run dev` 在 8080 端口运行开发用的本地服务（Vite，工作台改了代码立即生效），服务使用默认工作区（`GALLERY_DEFAULT_WORKSPACE` 指定的文件夹，没设时是 `~/Documents/Gallery`，没有就建好，首页和自带的块包也在启动时补上），登记在用户数据目录（`GALLERY_DATA_DIR`）里。开发隔离请在第一次 `npm run dev` 之前同时设置 `GALLERY_DEFAULT_WORKSPACE` 和 `GALLERY_DATA_DIR`：都不设时它改的就是你平时的文档。装好的 Gallery 正在运行时它起不来（那个 Gallery 占着 8080 时停在“端口已被占用”，占着别的端口时打出 `Gallery already runs on port …`），但停下之前默认工作区已经按这份代码准备过一遍（自带的块包和首页）。`gallery stop` 不停它，在运行它的窗口里停。开发目录里的 `gallery skill install` 先用 `skill:package` 的同一套规则把 Skill 做到临时目录里再写入。

改了编辑器、工作台、本地服务、自动保存或导出流程后，再运行 `npm run test:browser`：它用本机的 Chrome 或 Edge 在真实浏览器里跑一遍会丢修改、会改坏源文件的那些操作（耗时见 `docs/testing.md`），全程使用临时目录和单独的端口，不碰你的文档，也不影响正在运行的本地服务。中文输入法等仍需按 `docs/testing.md` 里的清单手测。

发布用的 npm 包 `@heycys/gallery` 由 `npm run release:build` 构建到 `release/npm/`（命令和本地服务用 esbuild 打包，工作台用 Vite 构建，kit 预先构建好，TypeScript、pdf.js、d3 的类型作为文件随包，Skill 也在里面，`gallery skill install` 写的就是它；运行时不需要 Vite、esbuild，也不安装任何依赖，不往包自己的目录里写东西）。`npm run test:release` 构建、`npm pack`、把 tarball 装进临时目录里的全局前缀，再用一个临时工作区把各个命令（包括 `gallery skill install --dir`）和浏览器里的编辑跑一遍，最后打印包的大小和各命令的耗时（见 `docs/testing.md` 的 “Release smoke test”）。`npm run skill:package` 先跑 `kit:check`，再把 Skill 单独做成 `release/gallery-skill-<版本>.zip`（`SKILL.md` 里要求的 `@heycys/gallery` 版本范围由它按 `package.json` 的版本写入）。发布前这几步都要通过；本仓库不执行 `npm publish`。

### 登录后自动启动

Windows 与 macOS 正式安装的 Gallery 在第一次启动服务时默认登记当前用户的登录启动项。以后登录系统时后台启动同一个服务，沿用已保存的端口，不打开终端或浏览器。可将 Gallery 地址加入书签。

服务在运行中意外停止（程序出错、内存不够）时，会在几秒内自己在原来的端口上重新启动，已打开的页面自动重连，没保存的修改在这期间存在浏览器里，连上后保存。用 `npm i -g` 升级后，服务也会自己换成新版本。`gallery stop` 停下的服务不会自己重启。日志在用户数据目录的 `logs/server.log`。

设置中的「开机自启动」可以关闭；Agent 也可以使用 `gallery startup status`、`gallery startup disable`、`gallery startup enable`。关闭选择保存在用户数据目录，升级不会重新开启。`gallery stop` 仅停止本次服务；要阻止下次登录启动，请关闭自启动。

源码预览、临时 npx 缓存以及测试不登记启动项。需要长期自启动时请使用 `npm install -g @heycys/gallery`。它是用户登录后的启动项，不是在登录前运行的系统服务。
