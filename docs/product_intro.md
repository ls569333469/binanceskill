# 🚀 Meme Alpha Scanner — AI 驱动的 MEME 代币发现引擎

## 一句话介绍

**用 AI 代替你盯盘。** 自动扫描 BSC + Solana 链上趋势 MEME 代币，6维评分筛选 Alpha，模拟交易验证策略。

---

## 🔥 核心功能

### 📡 多维数据扫描
- 实时追踪 **Trending / Top Search / Alpha** 排行榜
- Smart Money 流入追踪 — 聪明钱在买什么？
- 社交热度排行 — Twitter/Telegram 讨论最多的代币
- Launchpad 新币监控 — Pump.fun / Four.meme 第一时间发现

### 🧠 6维 AI 评分引擎
每个代币自动计算综合评分（0-100）：

| 维度 | 权重 | 数据来源 |
|------|------|---------|
| 🐋 Smart Money | 20% | SM持仓 + 流入信号 |
| 📱 社交热度 | 10% | Twitter/Telegram热搜 |
| 📈 趋势动量 | 20% | 5m/1h/4h多窗口涨幅 |
| 💰 资金流入 | 20% | 买卖量比 + 成交量 |
| 👑 KOL/鲸鱼 | 15% | KOL/Pro持仓分析 |
| 🔥 Hype指数 | 15% | Topic Rush + 叙事关联 |

### 📊 实时 Dashboard
- 热门代币排行（支持 5m/1h/4h/24h 切换）
- 代币详情面板（K线、持仓分布、催化进程）
- 观察列表 + 买入信号通知
- 模拟交易盈亏追踪

### 🤖 OpenClaw Skill 集成
已发布为标准 Claude Skill，AI Agent 可直接调用 Binance Web3 API 扫描代币：

```
npx skills add https://github.com/ls569333469/binance-meme-skills
```

---

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Node.js + Hono + SQLite |
| 前端 | React + Vite |
| 数据源 | Binance Web3 公开 API（无需API Key） |
| AI Skill | Claude Standard Format |
| 支持链 | BSC (56) + Solana (CT_501) |

---

## 📌 推特文案参考

### 中文版
```
🚀 开源了我的 Meme Alpha Scanner！

用 AI 自动扫描 BSC + Solana 链上趋势 MEME 代币
✅ 6维评分引擎（Smart Money / 社交 / 趋势 / KOL）
✅ 实时 Dashboard + 买入信号通知
✅ 模拟交易验证策略
✅ 已发布 OpenClaw Skill

数据源：Binance Web3 公开API，完全免费

GitHub: github.com/ls569333469/binanceskill
Skill: github.com/ls569333469/binance-meme-skills

#BinanceSkillsHub #OpenClaw #MEME #BSC #Solana
```

### 英文版
```
🚀 Open-sourced my Meme Alpha Scanner!

AI-powered meme token discovery engine for BSC + Solana
✅ 6-dimension scoring (Smart Money / Social / Trend / KOL)
✅ Real-time Dashboard + buy signal alerts
✅ Paper trading simulation
✅ Published as OpenClaw Skill

Powered by Binance Web3 public APIs — completely free

GitHub: github.com/ls569333469/binanceskill
Skill: github.com/ls569333469/binance-meme-skills

#BinanceSkillsHub #OpenClaw #MEME #BSC #Solana
```

---

## 🔗 链接

- **项目源码**: [github.com/ls569333469/binanceskill](https://github.com/ls569333469/binanceskill)
- **OpenClaw Skills**: [github.com/ls569333469/binance-meme-skills](https://github.com/ls569333469/binance-meme-skills)
