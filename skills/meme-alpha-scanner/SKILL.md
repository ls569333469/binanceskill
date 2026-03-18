---
title: Meme Alpha Scanner
description: |
  Multi-dimensional meme token discovery and analysis tool combining 5 Binance Web3 APIs.
  Use this skill when users ask to scan/discover meme tokens, find trending memes, 
  check smart money flows, analyze social hype, or build a meme token watchlist.
  Supports BSC (chainId: 56) and Solana (chainId: CT_501).
metadata:
  version: "1.0"
  author: meme-alpha-team
license: MIT
---

# Meme Alpha Scanner

## Overview

A comprehensive meme token scanner that cross-references multiple Binance Web3 data sources to discover high-potential meme tokens. Combines trending rankings, smart money flows, social sentiment, and launchpad lifecycle data into a unified view.

## Use Cases

1. **Trending Discovery**: Find trending meme tokens by volume, price change, or market cap
2. **Smart Money Tracking**: Identify tokens receiving smart money inflows
3. **Social Sentiment**: Discover socially hyped tokens with positive market sentiment
4. **New Launch Sniping**: Find freshly launched tokens on Pump.fun, Four.meme
5. **Topic Trading**: Find tokens grouped by AI-generated trending narratives
6. **Cross-Reference Analysis**: Combine multiple signals (trending + smart money + social) to find Alpha

## Supported Chains

| Chain | chainId |
|-------|---------|
| BSC | `56` |
| Solana | `CT_501` |

---

## API 1: Unified Token Rank (Trending / Top Search / Alpha)

The primary discovery API. Returns ranked token lists by various criteria.

### Method: POST

**URL**:
```
https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/unified/rank/list
```

**Headers**: `Content-Type: application/json`, `User-Agent: binance-web3/2.0 (Skill)`

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rankType | integer | ✅ | `10`=Trending, `11`=Top Search, `20`=Alpha, `40`=Stock Meme |
| chainId | string | ✅ | `56` (BSC), `CT_501` (Solana) |
| period | integer | ❌ | `10`=1m, `20`=5m, `30`=1h, `40`=4h, `50`=24h |
| sortBy | integer | ❌ | `0`=Default, `40`=Market Cap, `70`=Volume |
| orderAsc | boolean | ❌ | Sort direction |
| page | integer | ❌ | Page number |
| size | integer | ❌ | Results per page (max ~200) |

**Optional Filters**: `marketCapMin/Max`, `volumeMin/Max`, `liquidityMin/Max`, `holdersMin/Max`, `launchTimeMin/Max`, `percentChangeMin/Max`

### Example

```bash
curl -X POST 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/unified/rank/list' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: binance-web3/2.0 (Skill)' \
  -d '{"rankType":10,"chainId":"56","period":30,"sortBy":70,"orderAsc":false,"page":1,"size":50}'
```

### Response Fields (`data[]`)

| Field | Type | Description |
|-------|------|-------------|
| symbol | string | Token symbol |
| tokenContractAddress | string | Contract address |
| price | string | Current price (USD) |
| marketCap | string | Market cap (USD) |
| liquidity | string | Liquidity (USD) |
| holders | long | Holder count |
| kycHolders | long | Binance-verified holder count |
| kolHolders | long | KOL holder count |
| proHolders | long | Pro trader holder count |
| smartMoneyHolders | long | Smart money holder count |
| percentChange5m/1h/4h/24h | string | Price change by period |
| volume5m/1h/4h/24h | string | Volume by period (USD) |
| launchTime | long | Token launch timestamp (ms) |
| holdersTop10Percent | string | Top 10 holders percentage |

---

## API 2: Smart Money Inflow Rank

Tracks tokens receiving the most smart money inflows.

### Method: POST

**URL**:
```
https://web3.binance.com/bapi/defi/v1/public/wallet-direct/tracker/wallet/token/inflow/rank/query
```

**Headers**: `Content-Type: application/json`, `User-Agent: binance-web3/2.0 (Skill)`

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| chainId | string | ✅ | `56` (BSC), `CT_501` (Solana) |
| period | string | ❌ | `5m`, `1h`, `4h`, `24h` |
| tagType | integer | ✅ | Fixed: `2` |

### Example

```bash
curl -X POST 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/tracker/wallet/token/inflow/rank/query' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: binance-web3/2.0 (Skill)' \
  -d '{"chainId":"56","period":"24h","tagType":2}'
```

### Response Fields (`data[]`)

| Field | Type | Description |
|-------|------|-------------|
| ca | string | Contract address |
| inflow | string | Net inflow (USD) |
| traders | integer | Number of smart money addresses |
| tokenRiskLevel | integer | Risk level |

---

## API 3: Smart Money Trading Signals

Individual smart money buy/sell signals.

### Method: POST

**URL**:
```
https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/web/signal/smart-money
```

**Headers**: `Content-Type: application/json`, `User-Agent: binance-web3/1.0 (Skill)`

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| chainId | string | ✅ | `56`, `CT_501` |
| page | integer | ❌ | Page number (default 1) |
| pageSize | integer | ❌ | Results per page (max 100) |

### Example

```bash
curl -X POST 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/web/signal/smart-money' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: binance-web3/1.0 (Skill)' \
  -d '{"chainId":"56","page":1,"pageSize":50}'
```

### Response Fields (`data[]`)

| Field | Type | Description |
|-------|------|-------------|
| signalId | integer | Signal ID |
| ticker | string | Token symbol |
| contractAddress | string | Contract address |
| direction | string | Signal direction (buy/sell) |
| alertPrice | number | Price at signal trigger |
| currentPrice | number | Current price |
| maxGain | number | Max gain percentage |
| smartMoneyCount | integer | Smart money addresses involved |
| status | string | Signal status (active/timeout/completed) |

---

## API 4: Social Hype Leaderboard

Ranks tokens by social media activity and sentiment.

### Method: GET

**URL**:
```
https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/social/hype/rank/leaderboard
```

**Headers**: `User-Agent: binance-web3/2.0 (Skill)`, `Accept-Encoding: identity`

### Query Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| chainId | string | ✅ | `56`, `CT_501` |
| sentiment | string | ❌ | `All`, `Positive`, `Negative`, `Neutral` |
| targetLanguage | string | ✅ | `en` or `zh` |
| timeRange | number | ✅ | `1` (24 hours) |
| socialLanguage | string | ❌ | `ALL` |

### Example

```bash
curl 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/social/hype/rank/leaderboard?chainId=56&sentiment=All&socialLanguage=ALL&targetLanguage=en&timeRange=1' \
  -H 'Accept-Encoding: identity' \
  -H 'User-Agent: binance-web3/2.0 (Skill)'
```

### Response Fields (`data.leaderBoardList[]`)

| Field | Type | Description |
|-------|------|-------------|
| metaInfo.symbol | string | Token symbol |
| metaInfo.contractAddress | string | Contract address |
| marketInfo.marketCap | string | Market cap |
| socialHypeInfo.socialHype | number | Social hype score |
| socialHypeInfo.socialSummaryBrief | string | Brief social summary |

---

## API 5: Token Dynamic Info (Real-time Detail)

Fetches real-time detailed data for a specific token.

### Method: GET

**URL**:
```
https://web3.binance.com/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info
```

**Headers**: `User-Agent: binance-web3/1.0 (Skill)`

### Query Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| chainId | string | ✅ | `56`, `CT_501` |
| contractAddress | string | ✅ | Token contract address |

### Example

```bash
curl 'https://web3.binance.com/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info?chainId=56&contractAddress=0x1234...' \
  -H 'User-Agent: binance-web3/1.0 (Skill)'
```

### Response Fields (`data`)

| Field | Type | Description |
|-------|------|-------------|
| price | string | Current price (USD) |
| marketCap | string | Market cap (USD) |
| fdv | string | Fully diluted valuation |
| liquidity | string | Liquidity (USD) |
| holders | string | Holder count |
| volume5m/1h/4h/24h | string | Volume by period |
| percentChange5m/1h/4h/24h | string | Price change by period |
| kolHolders | string | KOL holder count |
| kolHoldingPercent | string | KOL holding percentage |
| smartMoneyHolders | string | Smart money holder count |
| smartMoneyHoldingPercent | string | Smart money holding % |
| volume24hBuy / volume24hSell | string | Buy/sell volumes |
| count24hBuy / count24hSell | string | Buy/sell trade counts |

---

## Combined Scanning Strategy

To discover Alpha meme tokens, cross-reference these APIs:

### Step 1: Cast a wide net
Call **API 1** (Unified Rank, rankType=10) for both BSC and Solana to get trending tokens.

### Step 2: Check smart money involvement
Call **API 2** (Smart Money Inflow) to find tokens with significant smart money activity.
Cross-reference with Step 1 results — tokens appearing in both lists are higher conviction.

### Step 3: Validate social sentiment
Call **API 4** (Social Hype) to check if socially active tokens align with trending + smart money data.

### Step 4: Deep dive on candidates
For tokens passing Steps 1-3, call **API 5** (Token Dynamic) to get real-time volume, holder distribution, and buy/sell pressure data.

### Step 5: Score and rank
Combine all dimensions into a composite score:
- **Smart Money Score** (30%): sm holders, inflow, signal direction
- **Social Score** (15%): social hype rating, sentiment
- **Trend Score** (20%): price change momentum, volume growth
- **KOL/Whale Score** (15%): KOL & pro holder count and %
- **Volume Score** (10%): buy vs sell volume ratio, absolute volume
- **Hype Score** (10%): topic rush appearance, narrative alignment

---

## Notes

1. All Binance Web3 APIs are public — no API key required
2. Percentage fields are pre-formatted strings — append `%` directly
3. Icon URLs require prefix: `https://bin.bnbstatic.com` + path
4. Rate limiting: be respectful, add 200-500ms delay between calls
5. All numerical values returned as strings — parse with `parseFloat()`
