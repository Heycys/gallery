这是一篇可以直接用语雀顶栏「复制为 Markdown 格式」复制的样本。正文用同一组虚构读数串起各种块，方便在复制结果里找回原位置。

# 一、标题与正文
普通段落：今天记录两次读数，上午为 18.5，下午为 21.0。第二句含中文标点、English words、百分号 50% 和 emoji 🌱。

## 二级标题：采样地点
### 三级标题：窗边
#### 四级标题：仪器 A
##### 五级标题：刻度
###### 六级标题：读数单位
第一段的末尾是「甲」。

第二段的开头是「乙」。同一段内的第一行到这里。  
这是手动换行后的第二行。

## 二、行内格式
常规文字、**粗体**、_斜体_、_**粗斜体**_、~~已作废~~、`sensor_id`，以及[回到原初个人知识库](https://yuque.example.com/example.user/book01)。

组合样本：**起点 **`A-01`** 与终点**，链接后面紧接中文标点。字面字符样本：*星号*、[方括号]、`a | b`。

富文本样本：<u>下划线</u>、H<sub>2</sub>O、m<sup>2</sup>、<font style="color:rgb(216,57,49);">红色文字</font>、<font style="background-color:rgb(255,241,184);">黄色高亮</font>。

---

## 三、列表和任务
+ 温度计
    - 玻璃温度计
    - 电子温度计
        * 型号 `T-01`
+ 计时器
1. 记录初值。
2. 复测两次。
    - 第一次读数 **18.5**。
    - 第二次读数 **18.7**。
3. 写下平均值。
- [x] 上午读数已登记
- [ ] 下午读数待复核

## 四、引用与提示
> 来自记录本：每次采样前，先让仪器静置一分钟。
>
> 引用中的第二段含 **重点** 和 `60s`。
>

引用结束，这句话是普通正文。

:::info
提示框：蓝色标签代表上午批次，绿色标签代表下午批次。

:::

## 五、代码与公式
行内代码含反引号：`display(`T-01`)`。下面的 Python 代码含缩进、空行和竖线。

```python
def mean(values):
    if not values:
        return None

    return sum(values) / len(values)

print("A | B", mean([18.5, 21.0]))
```

下面的代码块含标题、列表和粗体的字面标记。

```markdown
# 字面标题
- [ ] 字面任务
**字面星号**
```

行内公式：$ \Delta T = T_2 - T_1 $。

$ \bar{T} = \frac{1}{n}\sum_{i=1}^{n} T_i $

## 六、表格
| 批次 | 读数 | 备注 |
| :--- | ---: | :---: |
| 上午 A | 18.5 | **已复核** |
| 下午 B | 21.0 | `T-01` |
| 对照 C |  | 包含竖线 A|B |


表后正文：对照 C 的读数有意留空。

合并单元格示例：

| **两天采样记录** | | 备注 |
| --- | --- | --- |
| 窗边 | 周一 | 晴<br/>下午有风 |
| | 周二 | 阴 |


## 七、图片与折叠内容
<img src="https://example.com/skylark/lark/0/2026/png/100000000/1794212656744-9fad7187-d41a-4f45-afa6-40283e84e256.png" alt="语雀文档顶栏的复制为 Markdown 格式按钮" title="" crop="0,0,1,1" id="vCr32" class="ne-image">

图注：图中的 MD 按钮就是这份样本的复制入口。

<details class="lake-collapse"><summary id="yfm-summary-7-2"><span class="ne-text">展开补充记录</span></summary><p id="u8ae291b5" class="ne-p"><span class="ne-text">盒内第一段：仪器放在窗边。</span></p><p id="u07c38040" class="ne-p"><span class="ne-text">盒内第二段含 </span><strong><span class="ne-text">加粗文字</span></strong><span class="ne-text">。</span></p></details>
折叠块外：这里回到普通段落。

## 八、画板
下面的思维导图按「采集 → 复核」组织示例步骤。
