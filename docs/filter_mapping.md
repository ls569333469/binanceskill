# Binance Web3 热门代币筛选 — 前端 ↔ API 对照 & 实测经验

> 对应页面：**Binance Web3 Wallet → 市场 → 热门/聪明钱/社交热度/Alpha/证券代币**
> API 端点：`POST /bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/unified/rank/list`
> 无需认证，无需 API Key

---

## 1. Tab & 基础参数

| 前端 Tab | `rankType` | 说明 |
|---------|-----------|------|
| 热门 | `10` | 趋势代币 |
| Alpha | `20` | Binance Alpha 代币 |
| 证券代币 | `40` | 链上股票代币 |

> 聪明钱 和 社交热度 是独立 API，不在此端点内

| 前端选项 | `period` | | 前端选项 | `sortBy` |
|---------|---------|---|---------|---------|
| 1 分 | `10` | | 默认 | `0` |
| 5 分钟 | `20` | | 上线时间 | `10` |
| 1 小时 | `30` | | 流动性 | `20` |
| 4 小时 | `40` | | 持有人 | `30` |
| 24 小时 | `50` | | 市值 | `40` |
| | | | 涨幅 | `50` |
| | | | 交易笔数 | `60` |
| | | | 交易量 | `70` |
| | | | 币安持币人 | `80` |

链 ID：BSC = `"56"`，Solana = `"CT_501"`
排序方向：`orderAsc: false`（降序）/ `true`（升序）

---

## 2. 筛选参数完整对照

### 关键字

| 前端 | API 参数 | 类型 |
|------|---------|------|
| 搜索（代币名称） | `keywords` | string[] (最多5个) |
| 不含（代币名称） | `excludes` | string[] (最多5个) |

### 币龄

| 前端 | API 参数 | 单位 |
|------|---------|------|
| 币龄（分钟）最小 | `launchTimeMin` | 分钟 |
| 币龄（分钟）最大 | `launchTimeMax` | 分钟 |

> [!WARNING]
> **实测修正**：SKILL 文档标注类型为"timestamp ms"，但实际接受**分钟值**！
>
> | 场景 | 参数 |
> |-----|------|
> | 90 天内 | `launchTimeMax: 129600` |
> | 30 天内 | `launchTimeMax: 43200` |
> | 7 天内 | `launchTimeMax: 10080` |
> | 24h 内 | `launchTimeMax: 1440` |

### 指标 ($)

| 前端 | API 参数 | 单位 |
|------|---------|------|
| 流动性 最小/最大 | `liquidityMin` / `liquidityMax` | USD |
| 市值 最小/最大 | `marketCapMin` / `marketCapMax` | USD |
| 交易笔数 最小/最大 | `countMin` / `countMax` | 笔 |
| 交易量 最小/最大 | `volumeMin` / `volumeMax` | USD |

> 交易笔数和交易量按 `period` 时间窗口计算

### 持币地址

| 前端 | API 参数 | 类型 |
|------|---------|------|
| 持币地址 最小/最大 | `holdersMin` / `holdersMax` | long |
| 币安持币人数 最小/最大 | `kycHoldersMin` / `kycHoldersMax` | long |
| 前10持有者占比 最小/最大 | `holdersTop10PercentMin` / `Max` | decimal (%) |

> 狙击者持有%、专业持有者占比、新地址持有% 在 API 中无对应参数

### 社交 & 标签

| 前端 | API 参数 | 值 |
|------|---------|---|
| 至少一个社交链接 | `socials: [0]` | `0` |
| X | `socials` 含 | `1` |
| Telegram | `socials` 含 | `2` |
| 网站 | `socials` 含 | `3` |
| DexScreener 已付费 | `tagFilter` 含 | `23` |
| 隐藏 Alpha 代币 | `tagFilter` 含 | `0` |

### 审计过滤

| 前端 | API 参数 | 值 |
|------|---------|---|
| 已弃权（隐藏未弃权） | `auditFilter` 含 | `0` |
| 隐藏可冻结代币 | `auditFilter` 含 | `1` |
| 隐藏可增发代币 | `auditFilter` 含 | `2` |

---

## 3. 实测经验 & 踩坑记录

### ✅ 已验证可用的参数

| 参数 | 效果 | 实测结果 |
|------|------|---------|
| `marketCapMin/Max` | 市值过滤 | ✅ 精准 |
| `volumeMin/Max` | 交易量过滤 | ✅ 按 period 窗口 |
| `kycHoldersMin` | 币安持币人数 | ✅ 最强过滤器（2411→355 on Solana） |
| `auditFilter: [0,1,2]` | 审计三合一 | ✅ 71→36 有效过滤 |
| `launchTimeMax` | 币龄上限 | ✅ 接受分钟值 |
| `sortBy: 40` + `orderAsc: false` | 按市值降序 | ✅ |

### ⚠️ 踩坑记录

| 坑 | 描述 | 解决 |
|----|------|------|
| `launchTimeMin/Max` 单位 | SKILL 文档写 "timestamp ms"，实际是**分钟** | 直接传分钟值：90天=129600 |
| `launchTimeMin` 返回 0 | 传时间戳会导致结果为空 | 改用分钟值或不传此参数 |
| `tokenAgeMax` 无效 | meme-rush 的参数名，unified rank 不支持 | 用 `launchTimeMax` |
| 数据实时波动 | 热门榜数据每分钟变化 | 同一条件前后几分钟结果可能不同 |
| `kycHoldersMin` 过严 | 设 100 会大幅减少结果 | 按需降低到 10-50 |

### 📊 各过滤器对结果的影响（BSC 1h 实测）

```
无过滤 (baseline)                         → 2411 tokens
+ marketCapMin=100K                       →  ~200
+ volumeMin=50K                           →   ~30
+ kycHoldersMin=100                       →    ~9
+ auditFilter=[0,1,2]                     →    ~9 (审计在此条件下影响不大)
+ launchTimeMax=129600 (90d)              →    ~9
```

---

## 4. 推荐采集配置

### 宽松模式（数据储备用）

```json
{
  "rankType": 10, "chainId": "56", "period": 50,
  "sortBy": 70, "orderAsc": false, "page": 1, "size": 200,
  "marketCapMin": 50000, "kycHoldersMin": 10
}
```

### 严格模式（交易候选用）

```json
{
  "rankType": 10, "chainId": "56", "period": 30,
  "sortBy": 40, "orderAsc": false, "page": 1, "size": 50,
  "marketCapMin": 100000, "volumeMin": 50000,
  "kycHoldersMin": 100, "auditFilter": [0, 1, 2],
  "launchTimeMax": 129600
}
```
