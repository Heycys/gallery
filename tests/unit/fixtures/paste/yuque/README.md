# 语雀整篇复制样本

[源文档：语雀文档块样本](https://yuque.example.com/example.user/book01/sampledoc0000001)。2026-11-09 在 macOS Chrome 的语雀阅读页采集。两个目录对应同一篇文档的两次复制，均在本地页面用浏览器实际触发的 paste 事件读取。每个 MIME 项按其原始字符串存为 UTF-8 文件，保留了空白、转义和语雀节点 ID。链接中能认出文档和账号的部分换成了占位：文档地址的主机和路径换成 yuque.example.com/example.user/book01/sampledoc0000001，图片地址的主机和账号 ID 换成 example.com 和 100000000，原文和 URL 编码里都一样换了；其余字节都是采集时的原样。manifest.json 记录两次事件的条目顺序、MIME 类型、文件名、字节数和 SHA-256，字节数和 SHA-256 是采集时原件的，换过地址的文件和它们对不上。

| 操作 | 本次粘贴事件中的格式 |
| --- | --- |
| 顶栏「复制为 Markdown 格式」 | text/plain、text/html |
| 在正文内 ⌘A 全选后 ⌘C | text/plain、text/html、text/lake、text/ne-inode |

**顶栏复制。** text-plain.md 是按钮生成的原文，包含 Markdown 与语雀保留的 HTML（例如图片、折叠块）。text-html.html 是同一次复制带出的 HTML，其中包含包在 span 内的 Markdown 文本。画板章节有标题和说明，未导出思维导图本体。

**正文全选复制。** text-plain.txt 是纯文字。text-html.html 含有 ne-clipboard 元素；其 data 属性经 URL 解码和 JSON 解析后，与本次 text-ne-inode.json 的对象一致。text-lake.lake 和 text-ne-inode.json 保留了图片、折叠块、合并单元格和画板节点。图片链接的路径照语雀资源地址的原样，主机和账号 ID 是上面说的占位。

**两个可直接对照的位置。** 在「合并单元格示例」中，顶栏 Markdown 用空格位表示合并处，全选复制的结构中则保留行跨和列跨。普通表格的「包含竖线 A|B」在顶栏输出里保留了未转义的竖线。两处均按语雀实际输出收录。
