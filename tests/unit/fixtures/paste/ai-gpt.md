下面是一份综合富文本兼容性测试文档，包含标题、混合文字样式、多级列表、任务清单、引用、表格、行内公式、复杂行间公式、矩阵、分段函数、代码块、流程图和图表等。

建议直接从下面的一级标题开始，全选复制到 Notion、飞书文档、Google Docs 等编辑器，观察哪些格式能够保留，哪些会降级成纯文本。

# 富文本兼容性测试文档

## 01. 标题层级测试

# 一级标题 H1

## 二级标题 H2

### 三级标题 H3

#### 四级标题 H4

普通正文：这是一段用于测试中文、English、数字 123456、标点符号和不同字形混排的普通文本。The quick brown fox jumps over the lazy dog.

## 02. 行内文字样式

这是一段包含多种文字样式的测试：

- 加粗文本 Bold
- 斜体文本 Italic
- 下划线文本 Underline
- 删除线文本 Strikethrough
- 粗斜体混合 Bold Italic
- 加粗中嵌套 斜体文本 的内容
- 行内代码：`const answer = 42;`
- 普通超链接：[OpenAI 官方网站](https://openai.com?utm_source=chatgpt.com)
- 中英文混排：Transformer Architecture 与 Attention Mechanism
- 特殊符号：→ ← ↔ ⇒ ∞ ∑ ∫ ∂ ∇ ∈ ∀ ∃ ≈ ≠ ≤ ≥ ±
- Unicode 上下标：H₂O、CO₂、x²、aₙ、10⁻³

这是一个包含 加粗、斜体、下划线、删除线、`inline code` 和行内公式 \\(E=mc^2\\) 的混合段落，用于测试编辑器是否正确维护行内节点顺序。

## 03. 多级列表测试

### 无序列表

- 机器学习
  - 监督学习
    - 分类任务
    - 回归任务
  - 无监督学习
    - 聚类
    - 降维
- 深度学习
  - Transformer
  - Diffusion Model

### 有序列表

1. 数据准备
   1. 数据清洗
   2. Tokenization
   3. 数据质量检查
2. 模型训练
   1. Pretraining
   2. Supervised Fine-Tuning
   3. Reinforcement Learning
3. 模型评测

### 任务清单

- 数据集构建完成
- 基础模型训练完成
- 运行 Benchmark
- 完成消融实验
- 撰写最终研究报告

## 04. 引用与分隔线

> 知识的价值不仅在于记住了多少，更在于能够如何组织、推导和应用。
>
> 这是引用块中的第二段文字，用于测试多段引用及换行格式。

以下是水平分隔线：

分隔线之后的普通正文，用于测试块级元素的边界与段落恢复。

## 05. 表格测试

### 普通数据表格

| 模型      | 参数规模     | Context | Accuracy | 状态  |
| ------- | -------- | ------- | -------- | --- |
| Model-A | 7B       | 8K      | 72.5%    | 完成  |
| Model-B | 32B      | 32K     | 81.3%    | 最佳  |
| Model-C | 70B      | 128K    | 84.7%    | 实验中 |
| Model-D | 500B MoE | 256K    | —        | 未开始 |

### 混合格式表格

| 类型   | 测试内容                                                          | 备注     |
| ---- | ------------------------------------------------------------- | ------ |
| 粗体   | 重点数据                                                          | 格式测试   |
| 行内代码 | `model.forward()`                                             | Python |
| 行内数学 | \\(O(n\log n)\\)                                              | 复杂度    |
| 链接   | [Wikipedia](https://www.wikipedia.org?utm_source=chatgpt.com) | 外部链接   |
| 多种样式 | Mixed Format                                                  | 混合嵌套   |

## 06. 行内数学公式测试

这是第一个行内公式：\\(E=mc^2\\)，公式前后均存在普通文本。

概率分布：\\(P(y\mid x)=\frac{P(x\mid y)P(y)}{P(x)}\\)。

复杂行内公式：\\(\mathcal{L}(\theta)=-\sum\_{i=1}^{N}\log p\_\theta(y_i\mid x_i)\\)，用于测试分式、求和、下标和希腊字母。

矩阵维度：\\(X\in\mathbb{R}^{n\times d}\\)，注意力表达式：\\(\operatorname{softmax}(QK^\top/\sqrt{d_k})V\\)。

同一段落中的多公式：当 \\(n\to\infty\\) 时，若 \\(X_n\xrightarrow{p}\mu\\)，则有 \\(\bar X_n\approx\mu\\)。

## 07. 独立行间公式测试

### 基础行间公式

\\[ a^2+b^2=c^2 \\]

### 分式、积分及极限

\\[ \int\_{-\infty}^{+\infty}e^{-x^2}\\,dx=\sqrt{\pi} \\]

\\[ \lim\_{n\to\infty}\left(1+\frac{1}{n}\right)^n=e \\]

### 复杂多行公式（Aligned）

\\[ \begin{aligned} \mathcal{L}(\theta) &= -\frac{1}{N}\sum\_{i=1}^{N} \log P\_{\theta}(y_i\mid x_i)\\\\[6pt] &= -\frac{1}{N}\sum\_{i=1}^{N} \sum\_{t=1}^{T_i} \log P\_{\theta} \left(y\_{i,t}\mid x_i,y\_{i,\<t}\right)\\\\[6pt] \nabla\_{\theta}\mathcal{L} &= -\frac{1}{N}\sum\_{i=1}^{N} \nabla\_{\theta}\log P\_{\theta}(y_i\mid x_i) \end{aligned} \\]

### 矩阵与行列式

\\[ A= \begin{bmatrix} 1 & 2 & 3\\\ 0 & \alpha & -1\\\ x^2 & \frac{1}{2} & \sqrt{5} \end{bmatrix} ,\qquad \det(A)= \begin{vmatrix} 1&2&3\\\ 0&\alpha&-1\\\ x^2&\frac12&\sqrt5 \end{vmatrix} \\]

### 分段函数

\\[ f(x)= \begin{cases} x^2+1, & x<0,\\\\[4pt] \sin(x), & 0\le x<\pi,\\\\[4pt] \displaystyle\frac{1}{1+e^{-x}}, & x\ge\pi. \end{cases} \\]

### 复杂优化目标函数

\\[ \boxed{ \begin{aligned} \theta^\* &=\underset{\theta\in\Theta}{\arg\min} \left[ \mathbb{E}\_{(x,y)\sim\mathcal D} \bigl[\ell(f\_\theta(x),y)\bigr] +\lambda\\|\theta\\|\_2^2 \right]\\\\[6pt] \text{s.t.}\quad &\sum\_{i=1}^{K}w_i=1,\\\ &w_i\ge0,\quad\forall i\in\\{1,\ldots,K\\},\\\ &\mathbb P\left(g_j(\theta)\le0\right)\ge1-\delta_j. \end{aligned} } \\]

### Transformer Attention 公式

\\[ \begin{aligned} \operatorname{Attention}(Q,K,V) &=\operatorname{softmax} \left(\frac{QK^\top}{\sqrt{d_k}}+M\right)V,\\\\[6pt] \operatorname{MultiHead}(Q,K,V) &=\operatorname{Concat}(H_1,\ldots,H_h)W^O,\\\ H_i&=\operatorname{Attention}(QW_i^Q,KW_i^K,VW_i^V). \end{aligned} \\]

## 08. 代码块测试

### Python 代码块

```
from dataclasses import dataclassimport numpy as np@dataclassclass ExperimentConfig:    model_name: str = "Transformer-32B"    learning_rate: float = 1e-4    batch_size: int = 256def softmax(x: np.ndarray) -> np.ndarray:    x = x - np.max(x, axis=-1, keepdims=True)    return np.exp(x) / np.sum(        np.exp(x), axis=-1, keepdims=True    )if __name__ == "__main__":    config = ExperimentConfig()    print(f"Training model: {config.model_name}")
```

### JSON 代码块

```
{
  "experiment": "rich-text-compatibility",
  "version": "1.0.0",
  "models": ["7B", "32B", "70B"],
  "settings": {
    "enable_math": true,
    "enable_tables": true,
    "max_context": 32768
  },
  "status": null
}
```

### SQL 代码块

```
SELECT
    model_name,
    AVG(accuracy) AS avg_accuracy,
    COUNT(*) AS num_runs
FROM experiments
WHERE status = 'completed'
GROUP BY model_name
HAVING COUNT(*) >= 3
ORDER BY avg_accuracy DESC;
```

### Shell 代码块

```
#!/bin/bash
export CUDA_VISIBLE_DEVICES=0,1,2,3
python train.py \
  --model "Transformer-32B" \
  --batch-size 256 \
  --learning-rate 1e-4
```

## 09. 特殊字符及排版边界测试

中文标点：「测试」、‘测试’、《文档标题》、（括号）、……、——。

英文符号：`@ # $ % ^ & * _ + = | \ / ~`

数学符号：α β γ δ θ λ μ σ Ω π ∇ ∂ ∞ ⊕ ⊗ ∴ ∵。

表情符号：📚 🧪 🔬 ✅ ❌ ⚠️ 🚀 💡。

长文本：这是一个用于测试自动换行、段落高度和行内元素排版稳定性的长句子，其中混合了 bold emphasis、`code_identifier`、\\(\mathbb{E}[X]=\mu\\)、中文字符、English Words、1234567890，以及各种标点，目的是验证复制到目标编辑器后是否仍然具有正确的段落结构、行高、换行行为和光标定位。

## 10. 最终混合格式压力测试

### 实验结论：模型性能与数据规模

我们希望研究数据规模 \\(D\\) 与模型性能 \\(P(D)\\) 的关系，可以使用如下简化模型：

\\[ P(D)=P\_{\max}-\frac{A}{(D+D_0)^\alpha}, \qquad A,\alpha,D_0>0. \\]

其中：

- \\(P\_{\max}\\)：模型的理论性能上界。
- \\(D\\)：训练数据 Token 数量。
- \\(\alpha\\)：缩放定律指数。
- \\(A\\)：任务相关常数。

实验结果如下：

| 训练规模 | Model-A | Model-B | 增益      |
| ---- | ------- | ------- | ------- |
| 100B | 62.3%   | 68.4%   | +6.1 pp |
| 300B | 71.5%   | 76.2%   | +4.7 pp |
| 500B | 75.8%   | 80.1%   | +4.3 pp |
| 1T   | 79.2%   | 84.6%   | +5.4 pp |

> 关键发现： 在上述模拟数据中，Model-B 在所有训练预算下都表现更好，但两者的性能差距并不严格单调。

因此，下一阶段需要：

1. 对缩放定律进行拟合。
2. 计算参数 \\(\hat{\alpha}\\) 的置信区间。
3. 使用交叉验证检验泛化性能。
4. 记录实验配置与可复现代码。

最终状态： 实验设计完成，仍需运行正式实验。

## 测试文档结束

以上是格式兼容性测试样本。重点观察：复杂 LaTeX 是否变成可编辑公式、Mermaid 是否保持图形、代码块是否保留语言属性、嵌套列表是否保持层级，以及加粗、斜体和公式混排时是否发生节点丢失。