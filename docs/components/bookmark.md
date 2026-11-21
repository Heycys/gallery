# Bookmarks

A bookmark (网页书签) is a card block (卡片块): a web page as a card the reader clicks to open it in a new tab, with the page's title, description, address and cover, and its caption under it. In the preview the reader makes one from a link, reads the page again, shows it as a link in the text, edits its caption, and moves, deletes and copies it. Use it for a page the reader should go and read (a source, a dashboard, a document); quote what matters of it in the document itself.

Write a bookmark the short way, a paragraph holding only its link: its words the page's title, its `title` the description. The tools write the card of it (`src/editor/source/natural.mjs`), with an empty caption; nothing is fetched (the reader's 刷新预览 in the preview reads the page for its icon and cover).

<!-- you write -->
```html
<p><a class="doc-bookmark" href="https://example.com/handbook" title="数据集、指标和评分规则的说明。">评测手册</a></p>
```

<!-- the file then holds -->
```html
<figure class="doc-bookmark">
  <a class="doc-bookmark-card" href="https://example.com/handbook" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">评测手册</span><span class="doc-bookmark-description">数据集、指标和评分规则的说明。</span><span class="doc-bookmark-url"><span class="doc-bookmark-href">https://example.com/handbook</span></span></span></a>
  <figcaption></figcaption>
</figure>
```

A card with the page's icon and cover, as the preview writes one:

<!-- the file holds -->
```html
<figure class="doc-bookmark">
  <a class="doc-bookmark-card" href="https://example.com/handbook" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">评测手册</span><span class="doc-bookmark-description">数据集、指标和评分规则的说明。</span><span class="doc-bookmark-url"><img class="doc-bookmark-icon" src="assets/bookmark-icon-handbook.png" alt=""><span class="doc-bookmark-href">https://example.com/handbook</span></span></span><span class="doc-bookmark-cover"><img src="assets/bookmark-cover-handbook.png" alt=""></span></a>
  <figcaption></figcaption>
</figure>
```

- The card is one link to a web address (`https://…`), opening in a new tab. Its text holds the title (`.doc-bookmark-title`), an optional description (`.doc-bookmark-description`, two lines shown) and the address (`.doc-bookmark-url`, with an optional `.doc-bookmark-icon` and the `.doc-bookmark-href` text). The optional cover (`.doc-bookmark-cover`) shows at the right, and goes where the card is narrow.
- The icon and the cover are files of the document's own folder (`assets/<file>`), which an export embeds; `gallery check` fails one from elsewhere, one not in the folder, and a link that is no web address. The page itself stays on the web.
- The caption is always written: `<figcaption></figcaption>` when there is none (it shows only with text). Nothing else goes in the figure.
