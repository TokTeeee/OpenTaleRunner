# UI 设计规范与改进方案

> 状态：方案草案 v0.1 · 2026-06-03
> 适用：OpenTaleRunner / Aeslan 客户端（React 19 + Tailwind 4 + framer-motion 12 + zustand 5）
> 目标：在保留当前三栏布局（LeftPanel / CenterPanel / RightPanel）与模态分层结构的前提下，把视觉语言从"通用暗色玻璃"提升为"被施了咒的电子典籍"，并把动效从纯 CSS keyframe 升级为剧场化的 framer-motion 编排。

---

## 一、设计理念

**核心隐喻**：玩家不是在操作一个软件，而是在翻阅一本会呼吸、会写字、会施法的羊皮卷典籍。典籍的"页面"是玻璃面板，"墨水"是渐变色与字体的叙事层，"魔力回路"是装饰性的网格扫描线与细颗粒噪点。

| 维度 | 当前状态 | 改进方向 |
|---|---|---|
| 主题色板 | 暗蓝紫 + 玻璃模糊 | 暗色 + **羊皮卷暖金** (`#d4b884`) + **墨蓝靛** (`#3b3b6d`) 双轨 |
| 字体 | Georgia / system-sans / Noto Serif SC | **Cinzel + Noto Serif SC**（Display）+ **Lora + Noto Serif SC**（叙事）+ **Inter Tight + Noto Sans SC**（UI）+ **JetBrains Mono**（数据） |
| 装饰元素 | 几乎无 | 网格扫描线 / 噪点 / 薄边框 / 章节分隔卷轴 / 墨水滴落 |
| 动效 | CSS keyframe（fadeIn / pulse / breathe） | framer-motion **剧场化**（墨水扩散 / 渐变覆盖 / 骰子色散 / 章节翻页） |
| 交互反馈 | 颜色变化 / 透明度变化 | 微缩放 / 粒子溅射 / 边框高亮滑动 / 声音提示（可选） |

---

## 二、设计令牌（Design Tokens）

> 所有令牌集中定义在 `client/src/styles/tokens.ts`（新建），并通过 Tailwind 4 的 `@theme` 块注入到 `index.css`。组件中**不**直接写 hex / px / ms，全部走 `var(--token)` 或 Tailwind 类。

### 2.1 配色矩阵（Color Tokens）

#### 基础色（Basics）

| Token | Hex | 用途 |
|---|---|---|
| `--ink-950` | `#08080f` | 主背景（典籍的"封面"） |
| `--ink-900` | `#0d0d1f` | 面板背景 |
| `--ink-800` | `#14142a` | 卡片背景 |
| `--ink-700` | `#1c1c38` | 浮层背景 |
| `--ink-600` | `#2a2a4a` | 边框（次级） |
| `--ink-500` | `#3b3b6d` | 分隔线 |
| `--ink-400` | `#5a5a8a` | 文字（弱） |
| `--ink-300` | `#8a8ab0` | 文字（次要） |
| `--ink-200` | `#c8c8d4` | 文字（默认） |
| `--ink-100` | `#e8e8f0` | 文字（强） |

#### 羊皮卷暖金（Parchment Gold）

| Token | Hex | 用途 |
|---|---|---|
| `--gold-700` | `#8a6a3a` | 标题阴影 / 章节装饰 |
| `--gold-600` | `#b8924e` | 边框高光 |
| `--gold-500` | `#d4b884` | 强调色（章节名 / 章节分隔） |
| `--gold-400` | `#e8d4a8` | 文字高亮 |
| `--gold-300` | `#f4e8c8` | 浅色装饰 |

#### 墨水三色（Ink Trio）

| Token | Hex | 用途 |
|---|---|---|
| `--indigo-500` | `#6366f1` | 主行动按钮（创建 / 继续） |
| `--indigo-400` | `#818cf8` | hover 高亮 |
| `--indigo-300` | `#a5b4fc` | 文字（链接 / 标签） |
| `--purple-500` | `#a855f7` | 渐变次色 |
| `--purple-400` | `#c084fc` | hover 高亮 |
| `--emerald-500` | `#10b981` | 多人联机 / 成功 |
| `--emerald-400` | `#34d399` | hover |
| `--cyan-500` | `#06b6d4` | 信息提示 |
| `--cyan-400` | `#22d3ee` | hover |
| `--amber-500` | `#f59e0b` | 警告 |
| `--amber-400` | `#fbbf24` | hover |
| `--rose-500` | `#f43f5e` | 错误 / 危险 |
| `--rose-400` | `#fb7185` | hover |

#### 透明叠加（Overlays）

| Token | rgba | 用途 |
|---|---|---|
| `--glass-weak` | `rgba(18,18,30,.4)` | 弱玻璃面板（tooltip） |
| `--glass` | `rgba(18,18,30,.6)` | 标准玻璃面板（侧栏） |
| `--glass-strong` | `rgba(14,14,24,.75)` | 强玻璃面板（模态） |
| `--glass-gold` | `rgba(212,184,132,.05)` | 金色光晕叠加（章节头） |

### 2.2 字体令牌（Typography Tokens）

> 通过 Google Fonts CDN 加载以下字体（CDN 链路见 §六）。`font-display: swap` 必须设置。

| 角色 | 英文 | 中文 | 用途 | 字重 | 字距 |
|---|---|---|---|---|---|
| **Display** | **Cinzel** | **Noto Serif SC** | LOGO / 世界名 / 章节标题 / 模态大标题 | 600/700 | `tracking-wide` ~ `tracking-widest` |
| **Narrative** | **Lora** | **Noto Serif SC** | 叙事正文（GM 输出） | 400/500 | `tracking-normal` |
| **UI Sans** | **Inter Tight** | **Noto Sans SC** | 按钮 / 标签 / 菜单 / 表单 | 400/500/600 | `tracking-tight` |
| **Mono Data** | **JetBrains Mono** | — | 数值 / 时间戳 / ID / 调试 | 400/500 | `tracking-normal` |
| **Quote** | **EB Garamond** | **Noto Serif SC** | NPC 对话 / 引用 | 400 italic | `tracking-normal` |

**Tailwind 类映射**（写入 `tailwind.config` 的 `theme.extend.fontFamily`）：

```ts
fontFamily: {
  display: ['"Cinzel"', '"Noto Serif SC"', 'serif'],
  narrative: ['"Lora"', '"Noto Serif SC"', 'serif'],
  sans: ['"Inter Tight"', '"Noto Sans SC"', 'sans-serif'],
  mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
  quote: ['"EB Garamond"', '"Noto Serif SC"', 'serif'],
}
```

**字号比例（Type Scale）**——采用 1.25 (Major Third)：

| Token | rem | px | 用途 |
|---|---|---|---|
| `text-xs` | 0.75 | 12 | 角标 / 提示 |
| `text-sm` | 0.875 | 14 | 标签 / 按钮 |
| `text-base` | 1 | 16 | 正文 / 段落 |
| `text-lg` | 1.125 | 18 | 强调段落 |
| `text-xl` | 1.25 | 20 | 小标题 |
| `text-2xl` | 1.5 | 24 | 区段标题 |
| `text-3xl` | 1.875 | 30 | 模态标题 |
| `text-4xl` | 2.25 | 36 | 章节大标题 |
| `text-5xl` | 3 | 48 | 世界名 |
| `text-6xl` | 3.75 | 60 | LOGO 标题 |
| `text-7xl` | 4.5 | 72 | LOGO 副标题（可选） |

### 2.3 间距与圆角（Spacing & Radius）

继承 Tailwind 默认 4px 网格。新增半间距单位 `0.5` (2px) 用于细边框场景。

| Token | px | 用途 |
|---|---|---|
| `rounded-sm` | 4 | 标签 / 芯片 |
| `rounded` | 6 | 按钮（小） |
| `rounded-lg` | 8 | 输入框 / 卡片 |
| `rounded-xl` | 12 | 卡片（大） |
| `rounded-2xl` | 16 | 模态 / 主按钮 |
| `rounded-3xl` | 24 | 标题 / 大型装饰容器 |
| `rounded-full` | 9999 | 头像 / 圆形按钮 |

### 2.4 阴影（Shadows）

**羊皮卷"浮雕"阴影**——多层叠加制造纸质厚度感：

```css
--shadow-parchment:
  0 1px 0 rgba(212, 184, 132, 0.08) inset,  /* 顶部高光 */
  0 -1px 0 rgba(0, 0, 0, 0.4) inset,         /* 底部暗影 */
  0 2px 4px rgba(0, 0, 0, 0.3),              /* 主投影 */
  0 8px 24px rgba(0, 0, 0, 0.4);             /* 远投影 */

--shadow-glow-gold:
  0 0 0 1px rgba(212, 184, 132, 0.2),
  0 0 16px rgba(212, 184, 132, 0.15),
  0 0 32px rgba(212, 184, 132, 0.08);

--shadow-glow-indigo:
  0 0 0 1px rgba(99, 102, 241, 0.3),
  0 0 24px rgba(99, 102, 241, 0.4),
  0 0 48px rgba(99, 102, 241, 0.2);
```

### 2.5 动效令牌（Motion Tokens）

> 所有动效在 `client/src/styles/motion.ts`（新建）中以 framer-motion variants 形式集中定义。

| 名称 | 时长 | 缓动 | 用途 |
|---|---|---|---|
| `duration-instant` | 0.1s | `easeOut` | hover 颜色 |
| `duration-fast` | 0.15s | `easeOut` | 按钮微缩放 |
| `duration-base` | 0.22s | `easeOut` | 模态/侧栏进出 |
| `duration-medium` | 0.4s | `easeInOut` | 章节翻页 |
| `duration-slow` | 0.8s | `easeInOut` | 章节分隔渐变覆盖 |
| `duration-epic` | 1.6s | `easeInOut` | 骰子结果全屏震荡 |
| `ease-quill` | — | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | 文字写入（默认） |
| `ease-page` | — | `cubic-bezier(0.4, 0, 0.2, 1)` | 翻页（Material standard） |
| `ease-arcane` | — | `cubic-bezier(0.68, -0.55, 0.27, 1.55)` | 弹性出场（骰子） |

### 2.6 装饰纹理（Decoration Textures）

| 名称 | 用途 | 实现方式 |
|---|---|---|
| `noise-grain` | 细颗粒噪点（覆盖全局，4-8% 透明度） | SVG `feTurbulence` base64 内联为背景图 |
| `arcane-grid` | 魔法阵网格（章节分隔、模态底纹） | SVG 重复平铺：圆形 + 六边形 + 直线 |
| `parchment-edge` | 羊皮卷边缘不规则磨损 | SVG mask：上下边缘有毛刺 |
| `ink-drip` | 墨水滴落（按钮 hover / 完成状态） | 5-8 个随机定位的小圆点，配 `framer-motion` `y` 缓动 |
| `rune-divider` | 卢恩文字分隔符 | Unicode `ᛟ ᛇ ᚠ ᚱ` + gold-500 颜色 |

---

## 三、字体加载方案

### 3.1 加载方式

在 `client/index.html` 的 `<head>` 中预加载关键字体（Display + UI Sans）：

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter+Tight:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;1,400&family=EB+Garamond:ital,wght@0,400;1,400&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@400;500;600;700&display=swap"
/>
```

### 3.2 加载策略

- **Cinzel + Noto Serif SC**：首屏必加载，`<link rel="preload">` 关键字重
- **Lora + EB Garamond**：叙事区首次出现时通过 `next/font` 动态加载（避免首屏阻塞）
- **JetBrains Mono**：仅数据展示面板需要，懒加载
- **降级方案**：字体加载失败时回退到 `Georgia, "Noto Serif SC", serif` / `system-ui, sans-serif`

### 3.3 包体影响

- Cinzel 拉丁：~ 30KB
- Lora 拉丁：~ 35KB
- Inter Tight 拉丁：~ 50KB
- JetBrains Mono 拉丁：~ 40KB
- Noto Sans SC（Subset 3500 常用字）：~ 350KB
- Noto Serif SC（Subset 3500 常用字）：~ 380KB
- **总计首屏增加：~ 600KB**（gzip 后约 200KB）

如果对包体敏感，可以：
1. 仅在中文场景下载 Noto SC 系列
2. 使用 `font-display: swap` + 模糊占位符
3. 后期切到 `fontmin` / `字蛛` 做子集化

---

## 四、动效规范（Motion Spec）

> 原则：**每次动效都有目的**。装饰性动效仅在状态变化的瞬间出现，不持续干扰阅读。

### 4.1 组件级动效清单

| 组件 | 触发 | 动效 |
|---|---|---|
| 模态出现 | open | 220ms 渐入 + scale 0.96 → 1 + 背景模糊 0 → 16px |
| 模态关闭 | close | 180ms 渐出 + scale 1 → 0.98 + 背景模糊 → 0 |
| 侧栏切换（RightPanel tab） | tab change | 220ms slide-fade 横向位移 8px（错峰 60ms） |
| 按钮 hover | hover | 150ms scale 1.02 + 边框 gold-500 滑动高亮 |
| 按钮 click | mousedown | 80ms scale 0.98 + 粒子溅射 4-6 颗 gold-500 圆点 280ms 飞散 |
| 叙事气泡出现 | message add | 600ms 墨水扩散：clipPath 从中心向外揭示 + 1px gold-500 描边动画 |
| 叙事气泡 hover（可点击句） | hover | 背景渐变 0 → 8% gold-500 + 左侧 2px gold-500 边框滑入 |
| TTS 播放指示器 | speaking | 0.8s 呼吸 + 文字下方 2px 渐变光带 1.2s 循环移动 |
| 章节分隔 | new day | 1.6s 全屏渐变覆盖：indigo-500/30 → gold-500/20 → 透明，中间穿插 0.4s 章节大字 (`font-display text-7xl`) 渐显 + rune-divider |
| 骰子结果（命中） | result | 1.2s 全屏震荡：scale 1 → 1.04 → 1 + 边框 gold-500 闪烁 3 次 + 中心数字 0.4s scale 0.5 → 1.2 → 1 + 周边 8 颗粒子四散 + 命中音效（可选） |
| 骰子结果（大失败/大成功） | critical | 在 4.9 基础上 + 0.6s 色散光晕（gold-500/rose-500）+ 屏幕 1px shake 200ms |
| 模态章节切换（设置内 tab） | tab change | 180ms 内容区域淡出再淡入（错峰 40ms） |
| NPC 对话气泡 | enter | 400ms slide-in 下方 16px + fade + 引号字符 `"` 0.6s 旋转入场 |
| 列表项新增（已存角色/队伍） | add | 280ms scale 0.92 → 1 + gold-500 边框脉冲 1 次 |
| 列表项删除 | remove | 200ms scale 1 → 0.92 + fade + 高度 0 折叠 |
| 麦克风录音中 | recording | 红色边框呼吸 + 声波可视化（waveform 横向 8 条，高度随音量） |
| 自动播放指示器 | active | 顶部 2px 渐变光带 2s 循环 + 章节文本淡入淡出 |
| 同步通知 | arrived | 300ms 从顶部 32px 滑入 + 2px gold-500 左边框 + 1.5s 后自动滑出 |
| Toast / 错误 | show | 280ms scale 0.9 → 1 + 短暂震屏 100ms（仅 error） |

### 4.2 页面级动效清单

| 页面 | 触发 | 动效 |
|---|---|---|
| 标题页 → 创建角色向导 | open wizard | 800ms 模态渐入 + 背景从 60% 模糊增到 100% |
| 标题页 → 快速开始 | start | 全屏渐变覆盖 0.4s + 中心 quickStart 文案 0.6s 渐显 + 关闭 0.3s |
| 标题页 → 进入游戏 | start | 1.2s 全屏渐变覆盖 + 中央 logo 缩小 + 0.4s 内层渐变（"新章节"仪式感） |
| 章节翻页（自动同步） | day change | 见 4.1 章节分隔 |
| 模态栈出栈 | pop | 220ms scale + slide-down 16px |
| 退出至标题 | exit | 0.6s 全屏渐变覆盖 → 0.4s 内容淡出 |

### 4.3 性能与可访问性

- **GPU 加速**：所有 scale / translate 动效必须使用 `transform`，不要改 `width/height/top/left`
- **backdrop-filter 限制**：单页最多 3 个 backdrop-filter 层（实测 Chrome 限制约 4 个），超过会掉帧
- **prefers-reduced-motion**：检测 `window.matchMedia('(prefers-reduced-motion: reduce)')`，是则将所有动效降级为 fade-only + 30ms
- **focus-visible**：键盘 focus 永远使用 2px gold-500 实线边框（不被动画覆盖）

---

## 五、组件变更清单

按"先核心后周边"分四个阶段。每阶段完成后用浏览器目视对比新旧版本，确认无回归再进入下一阶段。

### 第一阶段：基础设施（4 个文件）

| 文件 | 变更 |
|---|---|
| `client/index.html` | 注入 Google Fonts preconnect + 主样式表 |
| `client/src/index.css` | 重写为：Tailwind 4 `@theme` + 设计令牌 CSS 变量 + 装饰纹理 base64 + 全局 typography 基础类 |
| `client/src/styles/tokens.ts`（新建） | 导出 `colors / spacing / radius / shadow / motion` 常量 |
| `client/src/styles/motion.ts`（新建） | 导出 framer-motion variants（fadeIn / slideIn / diceBurst / chapterTransition / inkDiffuse / scaleOnHover） |

### 第二阶段：标题页（1 个文件）

| 文件 | 变更 |
|---|---|
| `client/src/App.tsx`（仅 title 分支） | LOGO 改用 `font-display text-6xl` + `text-gold-400` 渐变 + rune-divider 装饰线；"创建新角色"按钮加 hover 粒子溅射 + click 动效；已存角色卡片加 hover 边框滑入 + 删除按钮更显眼的 gold-500 边框 + 入场错峰 stagger 60ms |

### 第三阶段：核心模态（2 个文件）

| 文件 | 变更 |
|---|---|
| `client/src/components/modals/SettingsModal.tsx` | 6 个 tab 重新排版：左侧 tab 列表用 `font-display` + 选中态左侧 2px gold-500 边框 + slide 指示器；测试按钮区加脉冲边框；表单输入用 `rounded-lg` + 聚焦 gold-500 边框 + 0.6s `quill` 缓动 |
| `client/src/components/modals/CharacterCreationWizard.tsx` | 步骤指示器改用羊皮卷卷轴样式（SVG），步骤切换用 `chapterTransition` 变体（淡出 → 0.3s 黑屏 → 淡入），步骤标题改用 `font-display` |

### 第四阶段：游戏内核心（4 个文件）

| 文件 | 变更 |
|---|---|
| `client/src/components/game/NarrativeArea.tsx` | 消息气泡改用 `inkDiffuse` 变体（clipPath 揭示）；分章线（day divider）改用 rune-divider + 羊皮卷卷轴 SVG；TTS 指示器加底部光带 + `quote` 字体 |
| `client/src/components/game/DiceResultOverlay.tsx` | 全屏震荡 + 色散光晕 + 大成功/大失败特别色（gold-500 / rose-500） |
| `client/src/components/game/PMThinkingOverlay.tsx` | 改用"墨水聚拢"动画：3-5 个 ink-blob 圆点从四周向中心聚拢 + 中心"PM 正在思考"用 `font-display` italic |
| `client/src/components/game/InteractionArea.tsx` | 输入框聚焦时 gold-500 边框 + 提交按钮 hover 粒子溅射 |

### 第五阶段：侧栏与多组件（可选）

| 文件 | 变更 |
|---|---|
| `client/src/components/panels/CharacterPanel.tsx` | 属性数值用 `font-mono` + 颜色映射（>14 gold-500 / <8 rose-500） |
| `client/src/components/panels/PartyPanel.tsx` | 队员卡片入场 stagger 60ms + 忠诚度变化时数字弹跳 |
| `client/src/components/multiplayer/LobbyPanel.tsx` | 房间卡片加 hover 边框 + 玩家头像加 gold-500 边框；开赛倒计时数字滚动 |
| `client/src/components/shared/WorldSyncNotifications.tsx` | 见 §四 4.1 同步通知 |
| `client/src/components/layout/{Left,Center,Right}Panel.tsx` | 标题改 `font-display` + 顶部加 1px gold-500/20 装饰线 |

---

## 六、资源与依赖

### 6.1 字体 CDN

主用：Google Fonts（已在 dev / prod 均可用）。

国内备用（可选）：
- `https://fonts.font.im/`（font.im 是 Google Fonts 国内镜像）
- `https://npm.elemecdn.com/font-awesome@4.7.0/...`（不推荐，与本项目无关）
- 自托管（生产环境推荐）：把 `*.woff2` 放在 `public/fonts/`，通过 `@font-face` 加载

### 6.2 装饰纹理资源

| 资源 | 格式 | 实现 |
|---|---|---|
| 噪点纹理 | SVG `feTurbulence` | `data:image/svg+xml;base64,...` 内联到 `index.css` |
| 魔法阵网格 | SVG 重复 | 同上 |
| 羊皮卷边缘 | SVG mask | 同上 |
| 章节分隔卷轴 | SVG | 独立组件 `client/src/components/shared/ParchmentDivider.tsx` |
| 墨水滴落粒子 | framer-motion | 代码生成，无需图片 |
| 骰子色散 | framer-motion + CSS gradient | 代码生成 |
| Rune 字符 | Unicode | `ᛟ ᛇ ᚠ ᚱ ᚦ ᛉ` 直接用 |

### 6.3 包体影响评估

- 字体（首屏，gzip）：~ 200KB
- 装饰 SVG（base64）：~ 8KB
- framer-motion（已装）：0
- motion.ts / tokens.ts（新增）：~ 4KB

**首屏增加总计：~ 220KB**。可接受。

---

## 七、A/B 对照与验收

每个阶段完成后，按以下方式对比新旧版本：

### 7.1 浏览器对比

1. 启动 dev server `pnpm dev`
2. 打开 Chrome DevTools → Performance → 录制 5 秒交互
3. 同一动作录制两次（修改前 / 修改后），对比 FPS 与主线程占用
4. 截图（修改前 + 修改后）保存在 `docs/zh/_ui_ab/<stage>/`（仅本地，不入 git）

### 7.2 视觉对比清单

| 检查项 | 通过条件 |
|---|---|
| 字体回退 | 网络断开后页面仍可读，无 layout shift |
| 玻璃模糊 | 所有面板在背景图片上仍清晰可读 |
| 动效流畅 | 60fps，无掉帧（DevTools Performance 面板） |
| 键盘可访问 | Tab 键 focus 顺序合理，focus ring 始终可见 |
| 屏幕阅读器 | NVDA / VoiceOver 朗读顺序正确（framer-motion 不破坏 DOM 顺序） |
| `prefers-reduced-motion` | 开启后所有动效降级为 fade-only |
| 中文显示 | 所有字体在中文场景下正常回退，无方框 |
| 移动端（可选） | 在 768px 以下不破版（当前不强制要求，但样式不破即可） |

### 7.3 截图位置（建议）

每个组件变更前后分别截一张图，按下面目录归档：

```
docs/zh/_ui_ab/
  stage1_infra/
    before_index.png
    after_index.png
  stage2_title/
    before_title.png
    after_title.png
  stage3_modal/
    before_settings_llm.png
    after_settings_llm.png
  stage4_game/
    before_narrative.png
    after_narrative.png
    before_dice.png
    after_dice.png
```

---

## 八、风险与决策点

| 风险 | 影响 | 缓解 |
|---|---|---|
| 字体加载延迟导致 FOIT | 首屏白屏 200-500ms | `font-display: swap` + 模糊占位符 + 关键字体 preload |
| 包体增加 220KB | 移动端 / 弱网体验下降 | 自托管 + 字体子集化（Noto SC 3500 字） |
| framer-motion 在低配机掉帧 | 体验下降 | `prefers-reduced-motion` 降级 + 关键路径只跑 transform |
| 设计令牌系统新增抽象 | 老组件迁移成本 | 提供 `tailwind.config` 映射 + 一次性批量替换脚本（可选） |
| 羊皮卷 + 现代暗色的隐喻不统一 | 视觉割裂 | 所有色板统一走 §二令牌；装饰元素只用于"过渡"与"分隔"，不进入正文 |
| 剧场化动效过度 | 用户分心 | 每个动效 ≤ 1.6s；叙事区不引入持续动效 |

---

## 九、后续可扩展（不在本次范围）

- **多主题切换**：用 CSS 变量切换 `data-theme="dark" | "light-parchment" | "midnight-arcane"`
- **声音层**：羊皮卷翻页声、墨水书写声、骰子声、章节钟声（用 `Howler.js` 或原生 `<audio>`）
- **微动效编排**：用 `framer-motion` 的 `useScroll` + `useTransform` 实现"页面滚动 → 章节标题淡入"
- **AI 头像系统**：NPC 对话气泡用 SD 生成的 1:1 头像，配合 2px gold-500 边框
- **3D 骰子**：用 `three.js` / `@react-three/fiber` 实现骰子投掷动画（性能开销大，谨慎评估）

---

## 十、实施时间线（建议）

| 阶段 | 预计工时 | 验证方式 |
|---|---|---|
| 第一阶段：基础设施 | 0.5 天 | 启动 dev server，index.html 字体加载无报错 |
| 第二阶段：标题页 | 0.5 天 | 标题页与原版对比截图 |
| 第三阶段：核心模态 | 1 天 | 设置模态 6 tab 全部能切换且动效正常 |
| 第四阶段：游戏内 | 1.5 天 | 跑一次完整游戏（创建 → 进入 → GM 响应 → 骰子） |
| 第五阶段：侧栏 | 1 天 | 切换 LeftPanel / RightPanel tab 无回归 |
| 收尾 + 文档 | 0.5 天 | 更新 `客户端架构与机制.md` + 此文件 `changelog` |

**总计：5 天**。可分两个 PR 提交：
- PR A：基础设施 + 标题页 + 设置模态（3 个文件改动）
- PR B：游戏内核心 + 侧栏（5 个文件改动）

---

## 附录 A：Tailwind 配置示例

```ts
// client/tailwind.config.ts（Tailwind 4 用 CSS 配置替代，参考示例）
// 实际写入 client/src/index.css 的 @theme 块
```

```css
@theme {
  --color-ink-950: #08080f;
  --color-ink-900: #0d0d1f;
  --color-gold-500: #d4b884;
  --color-gold-400: #e8d4a8;
  --color-indigo-500: #6366f1;
  --color-emerald-500: #10b981;
  --color-rose-500: #f43f5e;
  /* ... */

  --font-display: "Cinzel", "Noto Serif SC", serif;
  --font-narrative: "Lora", "Noto Serif SC", serif;
  --font-sans: "Inter Tight", "Noto Sans SC", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --font-quote: "EB Garamond", "Noto Serif SC", serif;

  --shadow-parchment:
    inset 0 1px 0 rgba(212, 184, 132, 0.08),
    inset 0 -1px 0 rgba(0, 0, 0, 0.4),
    0 2px 4px rgba(0, 0, 0, 0.3),
    0 8px 24px rgba(0, 0, 0, 0.4);
}
```

## 附录 B：framer-motion variants 示例

```ts
// client/src/styles/motion.ts
import type { Variants, Transition } from 'framer-motion';

export const transitions: Record<string, Transition> = {
  quill: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  page: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
  arcane: { duration: 0.8, ease: [0.68, -0.55, 0.27, 1.55] },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transitions.quill },
  exit: { opacity: 0, y: -4, transition: { duration: 0.18 } },
};

export const modalEnter: Variants = {
  initial: { opacity: 0, scale: 0.96, filter: 'blur(8px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: transitions.page },
  exit: { opacity: 0, scale: 0.98, filter: 'blur(4px)', transition: { duration: 0.18 } },
};

export const inkDiffuse: Variants = {
  initial: { clipPath: 'circle(0% at 50% 50%)', opacity: 0 },
  animate: {
    clipPath: 'circle(150% at 50% 50%)',
    opacity: 1,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const diceBurst: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.04, 1],
    transition: { duration: 1.2, times: [0, 0.5, 1] },
  },
};

export const chapterTransition: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, scale: 1.05, transition: { duration: 0.4 } },
};
```

## 附录 C：组件级变更样例

### 标题页 LOGO（`App.tsx` line 437-447）变更前 → 变更后

**变更前**：
```tsx
<h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r
                from-indigo-300 via-purple-300 to-amber-200 font-serif tracking-wide"
    style={{ textShadow: '0 0 60px rgba(99,102,241,.2)' }}>
  {worldName}
</h1>
```

**变更后**：
```tsx
<motion.h1
  className="text-6xl font-display font-bold text-transparent bg-clip-text
             bg-gradient-to-r from-gold-400 via-gold-500 to-amber-300
             tracking-[0.15em] uppercase"
  style={{
    textShadow: '0 0 80px rgba(212,184,132,.25), 0 0 32px rgba(212,184,132,.15)',
  }}
  initial={{ opacity: 0, y: -20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
>
  {worldName}
</motion.h1>
<div className="flex items-center gap-3 mt-2 opacity-70">
  <span className="text-gold-500">ᛟ</span>
  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
  <span className="text-gold-500 text-xs font-display tracking-[0.3em] uppercase">
    {displayEra}
  </span>
  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
  <span className="text-gold-500">ᛇ</span>
</div>
```

---

> **下一步**：你确认本方案后，我按"先做 4 个核心组件验证风格"分两个 PR 落地：
> - PR A：基础设施 + 标题页 + 设置模态
> - PR B：叙事区 + 骰子浮层 + 交互区 + PM 思考浮层
> 每个 PR 跑通 dev + build + 现有 200+ 测试用例，再继续下一个。

## 十一、v0.4 增量

v0.4 把"UI 通用化"分成两阶段落地：**P0 Token 化** 和 **P1 共享组件**。本文「二、设计令牌」与「五、组件变更清单」已记录初版设计；本节汇总 v0.4 实际交付物、commit 与未实现项。

### 11.1 P0: UI Token 化 (`tokens.ts`)

v0.4 把硬编码颜色 / 字号 / 间距集中到 `client/src/styles/tokens.ts`，然后逐组件迁移。

#### 11.1.1 新增调色板 (P0.1)

- `gray` 调色板 (50–900，9 档) — 替代 Tailwind `slate` 的硬编码引用
- `bg` 调色板 (5 档) — 替代 `bg-slate-900/50` 等带透明度组合
- 验证场景：NarrativeArea 气泡 / WorldMap canvas / ItemCompareTooltip
- 关键 commit: `0142480` feat(v0.4-ui): add gray + bg palettes to tokens

#### 11.1.2 组件迁移 (P0.2)

| 组件 | 迁移内容 | commit |
|------|---------|--------|
| `ItemCompareTooltip` | 颜色 / 边距全部走 tokens | `c0d7fa5` |
| `WorldMap` canvas | 自定义颜色 → tokens；Tailwind 任意值保留 | `ded36ee` |
| `NarrativeArea` 气泡 | player / pm / system 三色 + 边框 | `4da20b7` |
| `MultiplayerGameView` bg | 背景层叠色 | `3b991e1` |
| `amber[300]` 缺口 | 补 `amber[300]` token (修潜在 P0 typecheck gap) | `a308b5b` |

### 11.2 P1: 共享组件 (4 个)

v0.4 落地了"装备/背包/对比 tooltip" 3 个场景共用的 4 个组件：

| 组件 | 文件 | 复用场景 | commit |
|------|------|---------|--------|
| `ItemChip` | `components/items/ItemChip.tsx` | 装备槽 / 背包 / 对比 tooltip | `4ce7fdc` |
| `ItemCardRow` | `components/items/ItemCardRow.tsx` | BackpackModal 物品行 | `4139362` |
| `ItemDetailPanel` | `components/items/ItemDetailPanel.tsx` | BackpackModal 详情 / 锻造台 (v0.6) | `2024aa0` |
| `ItemEffectList` | `components/items/ItemEffectList.tsx` | 效果列表 / affix 词条 | `c311644` |

#### 11.2.1 组件约束

- **受控 vs 非受控** — 所有组件采用受控 props (避免内部 state 难同步)
- **ItemDetailPanel 与 ItemCardRow 共存** — 不互斥, CardRow 用于行内展开, DetailPanel 用于右侧固定详情
- **关键 commit**: `6fbd1df` feat(v0.4-ui): use ItemChip in CharacterPanel

### 11.3 v0.4 落地总览 (11 commits)

```
0142480 P0.1 gray+bg tokens
c0d7fa5 P0.2 ItemCompareTooltip
ded36ee P0.2 WorldMap canvas
4da20b7 P0.2 NarrativeArea bubbles
3b991e1 P0.2 MultiplayerGameView bg
4139362 P1 ItemCardRow
4ce7fdc P1 ItemChip
2024aa0 P1 ItemDetailPanel
c311644 P1 ItemEffectList
6fbd1df P1 CharacterPanel 接入
a308b5b P0 amber[300] 修复
```

### 11.4 已知约束 (v0.4 后将解决)

- 颜色 token 集中在 `tokens.ts`, 但部分组件仍有硬编码 `text-gold-500` / `bg-slate-900/50` 散落 — v0.5 继续迁移
- `Motion` 变体集中在 `client/src/styles/motion.ts` 但有少部分组件内联 — v0.5
- 共享组件只覆盖了"装备/物品" 类, 对话/叙事/战斗 UI 还未通用化 — v0.6-v0.7
- 字体加载方案 (「三、字体加载方案」) 仍待落地 — 后续
- framer-motion variants (附录 B) 部分组件未采用 — v0.6

