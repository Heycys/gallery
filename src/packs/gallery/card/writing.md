# 卡片 (gallery/card)

Gallery leaves this block out of the menus ("/", 在下方新建, the handle's grid) until the user turns it on in 设置 › 组件列表, and a document that has it shows and edits it as ever. Do not write it into a document: for a titled frame around blocks, write a highlight panel (`<aside>`, 高亮块) with a heading in it (references/writing-html.md, "Kit blocks").

A card that frames a few blocks under a title: a summary beside the text, a set of points to keep together, a step of a guide. Use it where a framed group reads better than a heading; for a whole section, a heading is enough.

## How to write it

Write the element as example.html does (`gallery block show gallery/card` prints it):

- the title, its `h3`: required, a few words.
- the body, its `<div data-doc-slot="body">`: required, the document's own blocks, written as anywhere in the document (paragraphs, lists, tables, formulas, a chart card). The reader edits them as any.

## How it looks

A frame with rounded corners in the kit's border color, its title at the top. It draws nothing of its own and has no script: what the file says is what a reader sees.
