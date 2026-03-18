# 币安 Skills API 完整参考文档

> 爬取自 https://www.binance.com/zh-CN/skills （2026-03-14）

---

## 通用规则

- **所有请求必须包含 `User-Agent` 头**，具体值见各 Skill 说明
- Web3 数据类 API 为公开接口，无需 API Key
- 交易类 API 需要 `API Key` + `Secret Key`（HMAC SHA256 签名）
- 数值字段多为字符串类型，需自行 parse
- 图标路径需拼接前缀 `https://bin.bnbstatic.com`

---

## 1. meme-rush（MEME 代币实时监控）

**描述**：Meme token fast-trading assistant。实时获取 Pump.fun / Four.meme 等 Launchpad 的 MEME 代币列表，支持新发、冲刺中、已迁移三个阶段。

**User-Agent**: `binance-web3/1.0 (Skill)`

### 1.1 Meme Rush - 代币列表

```
POST https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list
```

**Request Body (JSON):**

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `chainId` | string | ✅ | `56` (BSC), `CT_501` (Solana) |
| `rankType` | integer | ✅ | `10` (Latest/新发), `20` (Rising/冲刺中), `30` (Viral/已迁移) |
| `page` | integer | ❌ | 页码，默认 1 |
| `size` | integer | ❌ | 每页数量 |

**过滤参数（均为可选）：**

| 参数 | 说明 |
|------|------|
| `tokenAgeMin` / `tokenAgeMax` | 代币存在时间范围 |
| `liquidityMin` / `liquidityMax` | 流动性范围 |
| `volumeMin` / `volumeMax` | 成交量范围 |
| `marketCapMin` / `marketCapMax` | 市值范围 |
| `holdersMin` / `holdersMax` | 持有人数范围 |
| `progressMin` / `progressMax` | Bonding Curve 进度 |
| `isMintBurned` | 是否已烧毁 Mint |
| `isMintRevoked` | 是否已撤销 Mint 权限 |
| `isFreezeRevoked` | 是否已撤销 Freeze 权限 |
| `isPoolBurned` | 是否已烧毁 Pool |
| `isLpLocked` | LP 是否已锁定 |
| `topHoldersPercentageMin` / `Max` | Top 持有人占比范围 |
| `devPercentageMin` / `Max` | 开发者持仓占比 |
| `insiderPercentageMin` / `Max` | 内部人持仓占比 |
| `bundlerPercentageMin` / `Max` | Bundler 持仓占比 |
| `devMigrateCountMin` / `Max` | 开发者迁移次数 |
| `excludeDevWashTrading` | 排除开发者刷量 |
| `protocol` | 协议过滤 (Pump.fun, Moonit, Raydium 等) |
| `paidOnDexScreener` | 是否在 DexScreener 付费推广 |
| `cmcBoost` | 是否有 CMC Boost |

**示例请求：**
```bash
curl -X POST 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: binance-web3/1.0 (Skill)' \
  -d '{"chainId":"CT_501","rankType":10,"page":1,"size":20}'
```

### 1.2 Topic Rush - 热门话题

AI 驱动的市场热点话题，关联代币按净流入排序。

---

## 2. crypto-market-rank（市场排行榜）

**描述**：多维排行榜 — 趋势代币、热搜、Alpha 代币、社交热度、Smart Money 流入、MEME 排行、交易者盈亏排行。

**User-Agent**: `binance-web3/2.0 (Skill)`

### 2.1 Social Hype Leaderboard（社交热度排行）

```
GET https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/social/hype/rank/leaderboard
```

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `chainId` | string | ✅ | `56` (BSC), `8453` (Base), `CT_501` (Solana) |
| `sentiment` | string | ❌ | `All`, `Positive`, `Negative`, `Neutral` |
| `targetLanguage` | string | ✅ | `en`, `zh` |
| `timeRange` | number | ✅ | `1` (24小时) |
| `socialLanguage` | string | ❌ | `ALL` |

**响应关键字段** (`data.leaderBoardList[]`):
- `metaInfo.symbol` — 代币符号
- `metaInfo.contractAddress` — 合约地址
- `marketInfo.marketCap` — 市值
- `socialHypeInfo.socialHype` — 社交热度评分
- `socialHypeInfo.socialSummaryBrief` — 社交摘要

```bash
curl 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/social/hype/rank/leaderboard?chainId=56&sentiment=All&socialLanguage=ALL&targetLanguage=en&timeRange=1' \
  -H 'Accept-Encoding: identity' \
  -H 'User-Agent: binance-web3/2.0 (Skill)'
```

### 2.2 Unified Token Rank（统一排行榜 — 推荐）

```
POST https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/unified/rank/list
```

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `rankType` | integer | ✅ | `10` (Trending), `11` (Top Search), `20` (Alpha), `40` (Stock) |
| `chainId` | string | ✅ | `1` (ETH), `56` (BSC), `8453` (Base), `CT_501` (Sol) |
| `period` | integer | ❌ | `10` (1m), `20` (5m), `30` (1h), `40` (4h), `50` (24h) |
| `sortBy` | integer | ❌ | `0` (Default), `40` (Market Cap), `70` (Volume) |
| `orderAsc` | boolean | ❌ | 排序方向 |
| `page` | integer | ❌ | 页码 |
| `size` | integer | ❌ | 每页数量 |

**过滤参数**（均可选）: `marketCapMin/Max`, `volumeMin/Max`, `liquidityMin/Max`, `holdersMin/Max`, `launchTimeMin/Max`, `percentChangeMin/Max`

**响应字段**: `price`, `marketCap`, `liquidity`, `percentChange`, `volume`, `auditInfo`, `kycHolders`

```bash
curl -X POST 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/unified/rank/list' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: binance-web3/2.0 (Skill)' \
  -d '{"rankType":10,"chainId":"1","period":50,"sortBy":70,"orderAsc":false,"page":1,"size":20}'
```

### 2.3 Smart Money Inflow Rank（Smart Money 流入排行）

```
POST https://web3.binance.com/bapi/defi/v1/public/wallet-direct/tracker/wallet/token/inflow/rank/query
```

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `chainId` | string | ✅ | `56` (BSC), `CT_501` (Solana) |
| `period` | string | ❌ | `5m`, `1h`, `4h`, `24h` |
| `tagType` | integer | ✅ | 固定为 `2` |

**响应字段** (`data[]`): `ca`, `inflow` (净流入 USD), `traders` (Smart Money 地址数), `tokenRiskLevel`

```bash
curl -X POST 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/tracker/wallet/token/inflow/rank/query' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: binance-web3/2.0 (Skill)' \
  -d '{"chainId":"56","period":"24h","tagType":2}'
```

### 2.4 Meme Rank（MEME 排行）

```
GET https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/exclusive/rank/list
```

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `chainId` | string | ✅ | `56` (BSC) |

返回 Top 100 MEME 代币（通过 Pulse 平台发射），按突破潜力评分。

**响应字段**: `score`, `volumeBnTotal` (币安用户成交量), `uniqueTraderBn`, `aiNarrativeFlag`

```bash
curl 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/exclusive/rank/list?chainId=56' \
  -H 'User-Agent: binance-web3/2.0 (Skill)'
```

### 2.5 Address PnL Rank（地址盈亏排行）

```
GET https://web3.binance.com/bapi/defi/v1/public/wallet-direct/market/leaderboard/query
```

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `chainId` | string | ✅ | `CT_501` (Solana) 等 |
| `period` | string | ✅ | `7d`, `30d`, `90d` |
| `tag` | string | ✅ | `ALL`, `KOL` |
| `pageNo` | integer | ❌ | 页码 |
| `pageSize` | integer | ❌ | 每页数量 |

**响应字段** (`data.data[]`): `address`, `realizedPnl`, `winRate`, `topEarningTokens`

```bash
curl 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/market/leaderboard/query?tag=ALL&pageNo=1&chainId=CT_501&pageSize=25&sortBy=0&orderBy=0&period=30d' \
  -H 'User-Agent: binance-web3/2.0 (Skill)'
```

---

## 3. trading-signal（Smart Money 信号）

**描述**：订阅和获取链上 Smart Money 交易信号。

**User-Agent**: `binance-web3/1.0 (Skill)`

```
POST https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/web/signal/smart-money
```

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `chainId` | string | ✅ | `56` (BSC), `CT_501` (Solana) |
| `smartSignalType` | string | ❌ | 信号类型 |
| `page` | number | ❌ | 页码，默认 1 |
| `pageSize` | number | ❌ | 每页数量，最大 100 |

**响应字段**:
- `signalId` — 信号 ID
- `ticker` — 代币符号
- `contractAddress` — 合约地址
- `direction` — 方向 (buy/sell)
- `alertPrice` — 触发价格
- `alertMarketCap` — 触发时市值
- `currentPrice` — 当前价格
- `highestPrice` — 最高价
- `maxGain` — 最大收益百分比
- `smartMoneyCount` — 参与的 Smart Money 地址数
- `status` — 状态 (active/timeout/completed)

```bash
curl -X POST 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/web/signal/smart-money' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: binance-web3/1.0 (Skill)' \
  -d '{"chainId":"CT_501","page":1,"pageSize":20}'
```

---

## 4. alpha（Binance Alpha 代币发现与交易）

**描述**：Binance Alpha 专属代币的发现、行情查询和交易。

**User-Agent**: `binance-alpha/1.0.0 (Skill)`

**认证**：交易接口需要 `X-MBX-APIKEY` 头 + HMAC SHA256 签名

### 4.1 Token List（Alpha 代币列表）

```
GET https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list
```

返回所有 Binance Alpha 代币列表。

### 4.2 Ticker（行情）

```
GET /bapi/defi/v1/public/alpha-trade/ticker
```

### 4.3 Exchange Info（交易对信息）

```
GET /bapi/defi/v1/public/alpha-trade/get-exchange-info
```

### 4.4 Aggregated Trades（聚合成交记录）

```
GET /bapi/defi/v1/public/alpha-trade/agg-trades
```

### 4.5 Klines（K线数据）

```
GET /bapi/defi/v1/public/alpha-trade/klines
```

**重要说明**：
- 交易 symbol 格式为 `ALPHA_175USDT`（从 Token List 获取）
- `newClientOrderId` 必须以 `agent-` 为前缀

---

## 5. spot（现货交易）

**描述**：币安现货交易完整 API。

**Base URL**:
- 主网: `https://api.binance.com`
- 测试网: `https://testnet.binance.vision`
- Demo: `https://demo-api.binance.com`

**User-Agent**: `binance-spot/1.0.2 (Skill)`

**认证**: 
- Header: `X-MBX-APIKEY: <your-api-key>`
- 签名: HMAC SHA256，参数中携带 `timestamp` 和 `signature`

### 5.1 市场数据（公开接口）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v3/exchangeInfo` | GET | 交易对信息 |
| `/api/v3/depth` | GET | 深度/订单簿 |
| `/api/v3/klines` | GET | K线/蜡烛图 |
| `/api/v3/ticker/24hr` | GET | 24小时行情 |
| `/api/v3/ticker/price` | GET | 最新价格 |

### 5.2 交易接口（签名接口）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v3/order` | POST | 下单 |
| `/api/v3/order` | DELETE | 撤单 |
| `/api/v3/order` | GET | 查询订单状态 |
| `/api/v3/openOrders` | GET | 查询当前挂单 |
| `/api/v3/orderReplace` | POST | 替换订单 |

### 5.3 账户接口（签名接口）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v3/account` | GET | 账户余额 |
| `/api/v3/myTrades` | GET | 历史成交记录 |

**下单核心参数**:
- `symbol` — 交易对 (如 `BTCUSDT`)
- `side` — `BUY` / `SELL`
- `type` — `LIMIT` / `MARKET`
- `quantity` — 数量
- `price` — 价格（限价单必须）
- `timeInForce` — `GTC` / `IOC` / `FOK`
- `recvWindow` — 请求有效窗口（毫秒）
- `newClientOrderId` — 自定义 ID（需以 `agent-` 前缀）

---

## 6. query-token-info（代币信息查询）

**描述**：代币搜索、元数据、实时行情、K线图表。

**User-Agent**: `binance-web3/1.0 (Skill)`

### 6.1 代币搜索

```
GET https://web3.binance.com/bapi/defi/v5/public/wallet-direct/buw/wallet/market/token/search
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `keyword` | string | 搜索关键词（名称/符号/合约地址） |
| `binanceChainId` | string | 链 ID |

### 6.2 代币元数据

```
GET https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/dex/market/token/meta/info
```

返回：Logo、名称、描述、社交链接（Twitter/Telegram/Website）

### 6.3 代币实时数据（推荐）

```
GET https://web3.binance.com/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `binanceChainId` | string | 链 ID（56/8453/CT_501/1） |
| `contractAddress` | string | 合约地址 |

**响应字段**: `tokenId`, `price`, `marketCap`, `fdv`, `holders`, `kycHolders`, `liquidity`, `volume24h`, `percentChange`

### 6.4 K线数据

```
GET https://dquery.sintral.io/u-kline/v1/k-line/candles
```

**注意**：此端点域名不同（`dquery.sintral.io`）

---

## 7. query-token-audit（安全审计）

**描述**：代币安全审计 — 检测蜜罐、恶意合约、Rug Pull 风险。

**User-Agent**: `binance-web3/1.4 (Skill)`

```
POST https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit
```

**Headers**:
- `Content-Type: application/json`
- `User-Agent: binance-web3/1.4 (Skill)`
- `source: agent`

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `binanceChainId` | string | ✅ | `56` (BSC), `8453` (Base), `CT_501` (Sol), `1` (ETH) |
| `contractAddress` | string | ✅ | 代币合约地址 |
| `requestId` | string | ✅ | UUID v4 |

**响应字段**:
- 合约风险：危险的 Owner 函数、隐藏增发
- 交易风险：`buyTax`, `sellTax`
- 诈骗检测：蜜罐风险、Rug Pull 风险
- 风险项列表：每项含 `riskItemName`, `riskHit` (true/false)

```bash
curl -X POST 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: binance-web3/1.4 (Skill)' \
  -H 'source: agent' \
  -d '{"binanceChainId":"56","contractAddress":"0x...","requestId":"uuid-v4-here"}'
```

---

## 8. query-address-info（钱包地址查询）

**描述**：查询任意链上钱包地址的代币余额和持仓。

**User-Agent**: `binance-web3/1.0 (Skill)`

返回指定钱包在某条链上的所有代币持仓，包含：代币名称、符号、价格、24h 价格变动、持有数量。

---

## 9. assets（资产查询）

**描述**：查询币安账户资产信息。

**认证**：需要 API Key + Secret Key

---

## 链 ID 映射表

| chainId | 链 |
|---------|----|
| `1` | Ethereum |
| `56` | BSC (BNB Chain) |
| `8453` | Base |
| `CT_501` | Solana |

---

## 与本项目关键关联

| 项目功能 | 主要使用的 Skill API |
|---------|---------------------|
| 热门 MEME 数据采集 | `meme-rush` + `crypto-market-rank` (2.2/2.4) |
| 社交热度排行 | `crypto-market-rank` (2.1) |
| Smart Money 追踪 | `crypto-market-rank` (2.3) + `trading-signal` |
| Alpha 代币监控 | `alpha` (4.1) |
| 代币市值/流动性查询 | `query-token-info` (6.3) |
| 代币安全检查 | `query-token-audit` |
| 自动买入执行 | `alpha` (交易) / `spot` (5.2) |
