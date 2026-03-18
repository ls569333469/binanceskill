# 🚀 Meme Alpha Scanner

> AI 驱动的 MEME 代币发现引擎 — 自动扫描、评分、模拟交易

[![BSC](https://img.shields.io/badge/Chain-BSC-yellow)](https://www.bnbchain.org/)
[![Solana](https://img.shields.io/badge/Chain-Solana-purple)](https://solana.com/)
[![OpenClaw](https://img.shields.io/badge/Skill-OpenClaw-red)](https://github.com/ls569333469/binance-meme-skills)

---

## 📖 简介

Meme Alpha Scanner 是一个全自动 MEME 代币分析系统，整合 Binance Web3 公开 API，通过 6 维评分引擎从海量代币中筛选高潜力 Alpha 目标。

**不需要 API Key，完全免费。**

## ✨ 核心功能

### 📡 多维数据采集
- **趋势排行** — Trending / Top Search / Alpha / Stock Meme
- **Smart Money 追踪** — 聪明钱流入排行 + 交易信号
- **社交热度** — Twitter/Telegram 社交情绪分析
- **新币监控** — Pump.fun / Four.meme Launchpad 实时扫描
- **话题关联** — AI 生成的热门叙事 + 关联代币

### 🧠 6 维评分引擎

| 维度 | 权重 | 说明 |
|------|------|------|
| 🐋 Smart Money | 20% | SM 持仓数 + 净流入 |
| 📱 社交热度 | 10% | 社交评分 + 情绪 |
| 📈 趋势动量 | 20% | 多窗口涨跌幅共振 |
| 💰 资金流入 | 20% | 买卖量比 + 5m 成交量 |
| 👑 KOL/鲸鱼 | 15% | KOL + Pro 持仓分析 |
| 🔥 Hype 指数 | 15% | Topic Rush + 叙事匹配 |

综合评分 ≥ 阈值自动触发 **买入信号**。

### 📊 实时 Dashboard
- 热门代币排行（5m / 1h / 4h / 24h 切换）
- 代币详情面板（价格、持仓分布、催化进程）
- 观察列表管理（watching → buy_signal → bought → sold）
- 实时信号通知（浏览器通知 + 声音提醒）

### 💹 模拟交易
- 自动入场（评分达标触发）
- 止盈 / 止损 / 超时退出
- 盈亏统计 + 策略回测

### 🤖 OpenClaw Skill
已发布为标准 Claude Skill，AI Agent 可直接调用：
```bash
npx skills add https://github.com/ls569333469/binance-meme-skills
```

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────┐
│              Frontend (React + Vite)         │
│  Dashboard │ Watchlist │ Config │ Logs       │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────┴──────────────────────────┐
│              Backend (Hono + Node.js)        │
│                                              │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  │Collectors│  │ Evaluator│  │Paper Trader│  │
│  │(6 APIs) │→ │(6维评分) │→ │(模拟交易)  │  │
│  └─────────┘  └──────────┘  └────────────┘  │
│                     │                        │
│              ┌──────┴──────┐                 │
│              │ SQLite (DB) │                 │
│              └─────────────┘                 │
└──────────────────────────────────────────────┘
                   │
         Binance Web3 Public API
```

## 📦 项目结构

```
binanceskill/
├── src/
│   ├── collectors/        # 数据采集器
│   │   ├── unified-rank   # 统一排行榜
│   │   ├── meme-rush      # Launchpad 新币
│   │   ├── smart-money    # SM 信号 + 流入
│   │   ├── social-hype    # 社交热度
│   │   ├── token-dynamic  # 代币实时数据
│   │   └── ...
│   ├── engine/
│   │   ├── signal-evaluator  # 6维评分引擎
│   │   ├── paper-trader      # 模拟交易
│   │   └── matcher           # 策略匹配
│   ├── db/                # 数据库 Schema
│   └── server.ts          # API 服务
├── web/                   # 前端 Dashboard
├── skills/                # OpenClaw Skills
└── data/                  # 数据库文件 (gitignored)
```

## 🚀 快速开始

### 环境要求
- Node.js ≥ 22

### 安装 & 运行

```bash
# 克隆项目
git clone https://github.com/ls569333469/binanceskill.git
cd binanceskill

# 安装依赖
npm install
cd web && npm install && cd ..

# 启动后端
npm run dev

# 启动前端（新终端）
cd web && npm run dev
```

打开 `http://localhost:5173` 查看 Dashboard。

### 配置

系统默认已配置好，开箱即用。可在前端 Dashboard 的 **⚙️ 设置** 页面调整：
- 全局过滤条件（最小市值、最小流动性等）
- 策略权重和阈值
- 扫描链（BSC / Solana）

---

## 📡 数据源

所有数据来自 Binance Web3 **公开 API**，无需 API Key：

| API | 用途 |
|-----|------|
| Unified Rank | 趋势 / 热搜 / Alpha 排行 |
| Meme Rush | Launchpad 新币监控 |
| Topic Rush | AI 热门话题 |
| Smart Money Signal | SM 交易信号 |
| Smart Money Inflow | SM 净流入排行 |
| Social Hype | 社交热度排行 |
| Token Dynamic | 代币实时详情 |
| Token Audit | 安全审计 |

---

## 🔗 相关链接

- **OpenClaw Skills**: [github.com/ls569333469/binance-meme-skills](https://github.com/ls569333469/binance-meme-skills)
- **Binance Skills Hub**: [github.com/binance/binance-skills-hub](https://github.com/binance/binance-skills-hub)

## 📄 License

MIT
