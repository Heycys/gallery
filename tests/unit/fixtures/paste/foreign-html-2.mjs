// Second round of foreign-HTML samples (as ./foreign-html-1.mjs, checked the same way): harder structure and the odd sources.
export const FOREIGN_HTML = [
  {
    name: 'word-more',
    types: ['text/html', 'text/plain', 'text/rtf', 'Files'],
    html: `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta name=Generator content="Microsoft Word 15"><style><!--p.MsoNormal{margin:0cm;font-size:10.5pt;} h2{font-size:16.0pt;font-weight:bold;} .MsoHyperlink{color:#0563C1;text-decoration:underline;}--></style></head><body><!--StartFragment--><h2>第二节<o:p></o:p></h2><p class=MsoNormal align=center style='text-align:center'>居中段落<o:p></o:p></p><p class=MsoNormal style='text-indent:21.0pt'>首行缩进的段落，含<a href="https://example.com/doc"><span class=MsoHyperlink>超链接</span></a><span style='mso-spacerun:yes'>&nbsp;&nbsp; </span>结束<o:p></o:p></p><p class=MsoListParagraph style='margin-left:18.0pt;text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>圆点一<o:p></o:p></p><p class=MsoListParagraph style='margin-left:39.0pt;text-indent:-18.0pt;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:Wingdings'><span style='mso-list:Ignore'>n<span style='font:7.0pt "Times New Roman"'>&nbsp; </span></span></span><![endif]>二级<o:p></o:p></p><p class=MsoListParagraph style='margin-left:60.0pt;text-indent:-18.0pt;mso-list:l0 level3 lfo1'><![if !supportLists]><span style='font-family:Wingdings'><span style='mso-list:Ignore'>u<span style='font:7.0pt "Times New Roman"'>&nbsp; </span></span></span><![endif]>三级<o:p></o:p></p><p class=MsoListParagraph style='margin-left:18.0pt;text-indent:-18.0pt;mso-list:l1 level1 lfo2'><![if !supportLists]><span><span style='mso-list:Ignore'>1.1.<span style='font:7.0pt "Times New Roman"'>&nbsp; </span></span></span><![endif]>多级编号<o:p></o:p></p><p class=MsoNormal><img width=100 height=50 src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png" v:shapes="图片_x0020_1"><o:p></o:p></p><table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse'><tr><td width=368 colspan=2 style='width:276.5pt'><p class=MsoNormal align=center style='text-align:center'>合并表头<o:p></o:p></p></td></tr><tr><td width=184><p class=MsoNormal>a<o:p></o:p></p></td><td width=184><p class=MsoNormal><span style='color:#00B050'>绿色</span><o:p></o:p></p></td></tr></table><!--EndFragment--></body></html>`,
  },
  {
    name: 'email',
    html: `<div dir="ltr"><div>Hi team,</div><div><br></div><div>Please see <b>below</b>:</div><ul><li>Item one</li><li>Item two</li></ul><div><font color="#ff0000">red font</font> and <font face="monospace">mono</font></div><div><br></div><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Mon, Bob wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr">quoted reply<div>second line</div></div></blockquote></div></div>`,
  },
  {
    name: 'yuque',
    html: `<meta charset="utf-8"><h2 data-lake-id="u1" id="u1"><span data-lake-id="u2">语雀标题</span></h2><p data-lake-id="u3"><span data-lake-id="u4">正文</span><strong><span data-lake-id="u5">加粗</span></strong><span data-lake-id="u6" style="color: #DF2A3F">红字</span></p><ul list="u7" data-lake-indent="0"><li fid="u8" data-lake-id="u9"><span data-lake-id="u10">列表</span></li></ul><ul list="u11" data-lake-indent="1"><li fid="u12" data-lake-id="u13"><span data-lake-id="u14">子列表</span></li></ul><pre data-language="javascript" id="u15" class="ne-codeblock language-javascript"><code>let a = 1;
a++;</code></pre><blockquote data-lake-id="u16"><p data-lake-id="u17"><span data-lake-id="u18">引用</span></p></blockquote><p data-lake-id="u19"><span data-lake-id="u20" style="background-color: #FBDE28">黄底</span></p>`,
  },
  {
    name: 'confluence',
    html: `<meta charset="utf-8"><h1 id="Page-Title">Page Title</h1><div class="confluence-information-macro confluence-information-macro-note"><span class="aui-icon aui-icon-small aui-iconfont-warning confluence-information-macro-icon"></span><div class="confluence-information-macro-body"><p>note text</p></div></div><div class="code panel pdl conf-macro output-block"><div class="codeContent panelContent pdl"><pre class="syntaxhighlighter-pre" data-syntaxhighlighter-params="brush: java; gutter: false; theme: Confluence" data-theme="Confluence">public class A {
  int x;
}</pre></div></div><div class="table-wrap"><table class="wrapped confluenceTable"><colgroup><col><col></colgroup><tbody><tr><th class="confluenceTh">Key</th><th class="confluenceTh">Value</th></tr><tr><td class="confluenceTd">a</td><td class="confluenceTd"><ul><li>x</li></ul></td></tr></tbody></table></div>`,
  },
  {
    name: 'csdn-code',
    html: `<meta charset="utf-8"><p>示例代码：</p><pre class="prettyprint"><code class="has-numbering hljs language-python" onclick="mdcp.copyCode(event)" style="position: unset;"><span class="hljs-keyword">def</span> <span class="hljs-title function_">f</span>():
    <span class="hljs-keyword">pass</span>
</code><ul class="pre-numbering" style=""><li style="color: rgb(153, 153, 153);">1</li><li style="color: rgb(153, 153, 153);">2</li></ul></pre><p>结束</p>`,
  },
  {
    name: 'mdn',
    html: `<meta charset="utf-8"><p>The <code>Array</code> object, see <a href="/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from"><code>Array.from()</code></a>.</p><div class="code-example"><div class="example-header"><span class="language-name">js</span></div><pre class="brush: js notranslate"><code><span class="token keyword">const</span> x <span class="token operator">=</span> <span class="token number">1</span><span class="token punctuation">;</span>
</code></pre></div><dl><dt><code>length</code></dt><dd><p>The length.</p></dd></dl>`,
  },
  {
    name: 'nested-lists',
    html: `<ul><li>level 1<ol><li>level 2 ordered<ul><li>level 3</li></ul></li><li>level 2 again</li></ol></li><li><p>para one</p><p>para two</p></li><li>a<ul><li>b</li></ul>tail text</li></ul><ol type="a"><li>alpha</li><li value="5">five</li></ol><ol start="0"><li>zero start</li></ol><ul><li><input type="checkbox" checked> checked box<ul><li><input type="checkbox"> nested box</li></ul></li></ul>`,
  },
  {
    name: 'tables-hard',
    html: `<table><caption>Caption</caption><thead><tr><th colspan="2">Head</th><th>H3</th></tr></thead><tbody><tr><td rowspan="3">tall</td><td>b</td><td>c</td></tr><tr><td><table><tr><td>inner</td></tr></table></td><td>e</td></tr></tbody></table><table><tr><th>only th</th></tr></table><table><tbody></tbody></table><table style="width:600px"><colgroup><col style="width:120px"><col style="width:33%"></colgroup><tr><td style="background-color:#ff0">bg td</td><td><p style="color:#ff0000">red p</p></td></tr></table>`,
  },
  {
    name: 'quotes',
    html: `<blockquote><p>outer</p><blockquote><p>inner</p></blockquote><ul><li>list in quote</li></ul><h3>heading in quote</h3><pre><code>code in quote</code></pre></blockquote><p>after</p><blockquote>bare quote text<br>second line</blockquote>`,
  },
  {
    name: 'code-variants',
    html: `<pre><code class="hljs language-typescript">let t: number = 1;</code></pre><pre class="language-rust"><code>fn main() {}</code></pre><pre><code class="lang-go">package main</code></pre><pre>line a<br>line b</pre><div class="highlight"><pre><span class="k">import</span> os</pre></div><p>inline <code>a<b>b</b>c</code> mixed</p><pre><code class="language-text">  indented
	tabbed</code></pre>`,
  },
  {
    name: 'katex',
    html: `<p>Euler: <span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><msup><mi>e</mi><mrow><mi>i</mi><mi>π</mi></mrow></msup></mrow><annotation encoding="application/x-tex">e^{i\\pi}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="mord"><span class="mord mathnormal">e</span><span class="msupsub"><span class="vlist-t"><span class="vlist-r"><span class="vlist"><span class="sizing reset-size6 size3 mtight"><span class="mord mtight">iπ</span></span></span></span></span></span></span></span></span></span> done.</p>`,
  },
  {
    name: 'inline-styles',
    html: `<p><span style="font-weight:bold">b1</span> <span style="font-weight: 700;">b2</span> <span style="text-decoration-line: underline">u-line</span> <span style="color: rgb(36, 91, 219)">palette blue</span> <span style="background: rgb(255, 233, 40)">bg shorthand</span> <mark>mark</mark> <ins>ins</ins> <small>small</small> <q>q</q> <kbd>kbd</kbd> <var>var</var> <s>s</s> <strike>strike</strike> <del>del</del> <em><strong>both</strong></em></p><p style="font-weight:bold">bold paragraph <span style="font-weight:normal">normal span</span></p><h3><b>bold h3</b> plain</h3>`,
  },
  {
    name: 'links',
    html: `<p><a href="www.example.com">no scheme</a> <a href="https://例子.测试/路径">idn</a> <a href="ftp://files.example.com/a">ftp</a> <a href="tel:123">tel</a> <a href=" https://spaced.example.com ">spaced</a> <a href="https://x.com"><img src="https://x.com/i.png"></a> <a href="https://y.com"><div>block in link</div></a> <a name="anchor">named</a> <a href="https://z.com" title="t"><b>bold link</b></a></p>`,
  },
  {
    name: 'quill',
    html: `<p>Quill text</p><ol><li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>one</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>two</li></ol><p class="ql-align-center">centered by class</p><pre class="ql-syntax" spellcheck="false">code line 1
code line 2
</pre>`,
  },
  {
    name: 'lark-doc',
    html: `<div class="lark-doc"><div class="heading-h2">old doc heading</div><div>**not md** and - not list</div><ul><li data-list="bullet1">old list</li></ul></div>`,
  },
  {
    name: 'plain-divs',
    html: `<div>line 1</div><div>line 2 with <span>span</span></div><div><div>nested div</div></div><div>&nbsp;</div><div><br></div><div>after blank</div><p>p after</p>`,
  },
];
