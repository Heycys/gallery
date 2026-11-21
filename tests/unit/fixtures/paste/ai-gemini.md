以下是一份全格式兼容性测试样本（建议直接点击回答底部的**复制按钮**，而非手动划选复制，以测试富文本与 Markdown 剪贴板在不同粘贴模式下的解析表现）。

---

## 1. 基础文本样式与标题层级

### 三级标题测试 (H3)

#### 四级标题测试 (H4)

这是一段包含多种行内样式的标准段落：这里有**加粗文本 (Bold)**、*斜体文本 (Italic)*、***粗斜体混合 (Bold & Italic)***、~~删除线文本 (Strikethrough)~~、以及 `inline_code_snippet()` 行内代码。此外还包含一个外部超链接测试：[Notion 官方文档](https://www.notion.so) 以及快捷键标识如 `Ctrl + Shift + V`。

> **单层引用块 (Blockquote)：**
> 引用块通常用于高亮核心结论或注意事项。测试在引用块内是否能正常解析**加粗**、`行内代码`以及行内公式 $\boldsymbol{y} = \boldsymbol{W}\boldsymbol{x} + \boldsymbol{b}$。
> > **嵌套引用块 (Nested Blockquote)：**
> > 部分文档编辑器（如 Notion）默认不支持原生二级嵌套引用，粘贴时可能会将其展平或合并为同一层级。
> 
> 

---

## 2. 列表与多级嵌套测试

**无序列表（测试层级缩进）：**

* 第一层无序列表项 A
* 第二层嵌套列表项 A.1（包含 `code` 与 **粗体**）
* 第二层嵌套列表项 A.2
* 第三层深度嵌套项 A.2.1




* 第一层无序列表项 B

**有序列表（测试序号继承与混排）：**

1. 第一步：数据预处理与特征归一化
2. 第二步：构建模型前向传播计算图
1. 子步骤 2.1：初始化权重矩阵 $\boldsymbol{W}$
2. 子步骤 2.2：计算注意力得分


3. 第三步：反向传播与梯度更新

**任务状态列表 (To-do Checkboxes)：**

* [x] 已完成任务：验证基础 Markdown 标题与粗斜体解析
* [ ] 待办任务 1：检查行内公式与行间公式是否自动转为 Equation Block
* [ ] 待办任务 2：检查表格内嵌代码与公式是否错位

---

## 3. 数学公式渲染测试 (LaTeX)

### 3.1 行内公式 (Inline Math)

设输入样本特征向量为 $\boldsymbol{x} \in \mathbb{R}^d$，变换权重矩阵为 $\boldsymbol{W} \in \mathbb{R}^{k \times d}$，偏置向量为 $\boldsymbol{b} \in \mathbb{R}^k$。经过仿射变换后的隐层表征为 $\boldsymbol{z} = \boldsymbol{W}\boldsymbol{x} + \boldsymbol{b}$，其计算时间复杂度为 $\mathcal{O}(k \cdot d)$，且满足范数约束 $\Vert{}\boldsymbol{W}\Vert{}_F \le C$ 与渐近性质 $\lim_{n \to \infty} \frac{1}{n}\sum_{i=1}^n \mathcal{L}_i = \mathbb{E}[\mathcal{L}]$。

### 3.2 复杂行间公式：多步推导与等号对齐 (`aligned` 环境)

测试带正则项的岭回归（Ridge Regression）目标函数求导及闭式解推导过程：

$$\begin{aligned} \mathcal{J}(\boldsymbol{\theta}) &= \frac{1}{2N} \Vert{}\boldsymbol{X}\boldsymbol{\theta} - \boldsymbol{y}\Vert{}_2^2 + \frac{\lambda}{2} \Vert{}\boldsymbol{\theta}\Vert{}_2^2 \\ &= \frac{1}{2N} (\boldsymbol{X}\boldsymbol{\theta} - \boldsymbol{y})^\top (\boldsymbol{X}\boldsymbol{\theta} - \boldsymbol{y}) + \frac{\lambda}{2} \boldsymbol{\theta}^\top \boldsymbol{\theta} \\ &= \frac{1}{2N} \left( \boldsymbol{\theta}^\top \boldsymbol{X}^\top \boldsymbol{X} \boldsymbol{\theta} - 2\boldsymbol{y}^\top \boldsymbol{X}\boldsymbol{\theta} + \boldsymbol{y}^\top \boldsymbol{y} \right) + \frac{\lambda}{2} \boldsymbol{\theta}^\top \boldsymbol{I} \boldsymbol{\theta} \\ \nabla_{\boldsymbol{\theta}} \mathcal{J}(\boldsymbol{\theta}) &= \frac{1}{N} \boldsymbol{X}^\top (\boldsymbol{X}\boldsymbol{\theta} - \boldsymbol{y}) + \lambda \boldsymbol{\theta} = \boldsymbol{0} \\ \boldsymbol{\theta}^* &= \left( \boldsymbol{X}^\top \boldsymbol{X} + N\lambda \boldsymbol{I} \right)^{-1} \boldsymbol{X}^\top \boldsymbol{y} \end{aligned}$$

### 3.3 复杂行间公式：分块矩阵与分段函数 (`bmatrix` 与 `cases`)

测试协方差矩阵 $\boldsymbol{\Sigma}$ 的排版以及带温度系数的分段概率映射 $\mathcal{P}(\boldsymbol{z})_i$：

$$\boldsymbol{\Sigma} = \begin{bmatrix} \sigma_{11}^2 & \rho_{12}\sigma_1\sigma_2 & \cdots & \rho_{1n}\sigma_1\sigma_n \\ \rho_{21}\sigma_2\sigma_1 & \sigma_{22}^2 & \cdots & \rho_{2n}\sigma_2\sigma_n \\ \vdots & \vdots & \ddots & \vdots \\ \rho_{n1}\sigma_n\sigma_1 & \rho_{n2}\sigma_n\sigma_2 & \cdots & \sigma_{nn}^2 \end{bmatrix}, \quad \mathcal{P}(\boldsymbol{z})_i = \begin{cases} \dfrac{\exp(\boldsymbol{z}_i / \tau)}{\sum_{j=1}^{K} \exp(\boldsymbol{z}_j / \tau)}, & \text{if } \tau \gt 0 \\ \mathbb{I}\left(i = \arg\max_{j} \boldsymbol{z}_j\right), & \text{if } \tau \to 0^+ \end{cases}$$

### 3.4 复杂行间公式：多重积分与变分下界 (ELBO)

测试大型算子、上下限堆叠与期望符号：

$$\log p_{\boldsymbol{\theta}}(\boldsymbol{x}) = \mathbb{E}_{q_{\boldsymbol{\phi}}(\boldsymbol{z}\vert{}\boldsymbol{x})} \left[ \log \frac{p_{\boldsymbol{\theta}}(\boldsymbol{x}, \boldsymbol{z})}{q_{\boldsymbol{\phi}}(\boldsymbol{z}\vert{}\boldsymbol{x})} \right] + D_{\mathrm{KL}}\left( q_{\boldsymbol{\phi}}(\boldsymbol{z}\vert{}\boldsymbol{x}) \,\middle\Vert{}\, p_{\boldsymbol{\theta}}(\boldsymbol{z}\vert{}\boldsymbol{x}) \right) \ge \int_{\Omega} q_{\boldsymbol{\phi}}(\boldsymbol{z}\vert{}\boldsymbol{x}) \log \frac{p_{\boldsymbol{\theta}}(\boldsymbol{x}, \boldsymbol{z})}{q_{\boldsymbol{\phi}}(\boldsymbol{z}\vert{}\boldsymbol{x})} \, d\boldsymbol{z}$$

---

## 4. 多维表格渲染测试 (Tables)

测试左对齐、居中对齐、右对齐，以及单元格内混排**粗体**、`代码`和行内公式：

| 算子名称 (左对齐) | 核心计算表达式 (居中对齐) | 空间复杂度 | 典型应用场景 (右对齐) |
| --- | --- | --- | --- |
| **Standard Attention** | $\mathrm{Softmax}\left(\frac{\boldsymbol{Q}\boldsymbol{K}^\top}{\sqrt{d_k}}\right)\boldsymbol{V}$ | $\mathcal{O}(N^2)$ | `seq_len <= 4096` |
| **Linear Attention** | $\frac{\phi(\boldsymbol{Q})\left(\phi(\boldsymbol{K})^\top \boldsymbol{V}\right)}{\phi(\boldsymbol{Q})\sum \phi(\boldsymbol{K})^\top}$ | $\mathcal{O}(N \cdot d)$ | 超长序列建模 `long_context` |
| **LoRA Adapter** | $\boldsymbol{h} = \boldsymbol{W}_0\boldsymbol{x} + \frac{\alpha}{r}\boldsymbol{B}\boldsymbol{A}\boldsymbol{x}$ | $\mathcal{O}(r(d + k))$ | 参数高效微调 `peft_tuning` |

---

## 5. 多语言代码块测试 (Code Blocks)

**Python 代码块（测试语法高亮、装饰器、类型注解与特殊符号）：**

```python
import torch
import torch.nn as nn
from typing import Optional, Tuple

class ScaledDotProductAttention(nn.Module):
    """测试文档代码块：缩放点积注意力机制"""
    def __init__(self, temperature: float, attn_dropout: float = 0.1) -> None:
        super().__init__()
        self.temperature = temperature
        self.dropout = nn.Dropout(attn_dropout)

    @torch.no_grad()
    def forward(
        self, 
        q: torch.Tensor, 
        k: torch.Tensor, 
        v: torch.Tensor, 
        mask: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        # 计算注意力权重: (batch, heads, len_q, len_k)
        attn = torch.matmul(q / self.temperature, k.transpose(2, 3))
        if mask is not None:
            attn = attn.masked_fill(mask == 0, -1e9)
        
        attn = self.dropout(torch.softmax(attn, dim=-1))
        output = torch.matmul(attn, v)
        return output, attn

```

**Bash 脚本代码块（测试环境变量、管道符与重定向）：**

```bash
#!/usr/bin/env bash
set -euo pipefail

export CUDA_VISIBLE_DEVICES="0,1,2,3"
LOG_FILE="./logs/train_$(date +%Y%m%d_%H%M%S).log"

echo "[INFO] Starting distributed evaluation..." | tee -a "${LOG_FILE}"
python -m torch.distributed.run --nproc_per_node=4 evaluate.py \
    --batch-size 32 \
    --bf16 > "${LOG_FILE}" 2>&1 &

```