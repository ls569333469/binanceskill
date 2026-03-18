const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3456';

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/api/stats`);
  return res.json();
}

export async function fetchTokens(chainId?: string, limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (chainId) params.set('chainId', chainId);
  const res = await fetch(`${API_BASE}/api/tokens?${params}`);
  return res.json();
}

export async function fetchHotTokens(period = '1h', chainId?: string, limit = 30) {
  const params = new URLSearchParams({ period, limit: String(limit) });
  if (chainId) params.set('chainId', chainId);
  const res = await fetch(`${API_BASE}/api/tokens/hot?${params}`);
  return res.json();
}

export async function fetchTokenHistory(id: number, limit = 50) {
  const res = await fetch(`${API_BASE}/api/tokens/${id}/history?limit=${limit}`);
  return res.json();
}

export async function fetchAlpha(limit = 100) {
  const res = await fetch(`${API_BASE}/api/alpha?limit=${limit}`);
  return res.json();
}

export async function fetchAlphaNew() {
  const res = await fetch(`${API_BASE}/api/alpha/new`);
  return res.json();
}

export async function fetchSignals(limit = 50) {
  const res = await fetch(`${API_BASE}/api/signals?limit=${limit}`);
  return res.json();
}

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/api/config`);
  return res.json();
}

export async function updateConfig(name: string, body: any) {
  const res = await fetch(`${API_BASE}/api/config/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function runCollector(name: string) {
  const res = await fetch(`${API_BASE}/api/collector/run/${name}`, { method: 'POST' });
  return res.json();
}

export async function runAllCollectors() {
  const res = await fetch(`${API_BASE}/api/collector/run-all`, { method: 'POST' });
  return res.json();
}

export async function fetchMatches(limit = 100) {
  const res = await fetch(`${API_BASE}/api/matches?limit=${limit}`);
  return res.json();
}

// ── P2: Watchlist ──
export async function fetchWatchlist(status?: string, entryMode?: string) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (entryMode) params.set('entryMode', entryMode);
  const res = await fetch(`${API_BASE}/api/watchlist?${params}`);
  return res.json();
}

export async function updateWatchlistStatus(id: number, status: string) {
  const res = await fetch(`${API_BASE}/api/watchlist/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return res.json();
}

export async function scanWatchlist() {
  const res = await fetch(`${API_BASE}/api/watchlist/scan`, { method: 'POST' });
  return res.json();
}

export async function evaluateWatchlist() {
  const res = await fetch(`${API_BASE}/api/watchlist/evaluate`, { method: 'POST' });
  return res.json();
}

// ── P2: Topics ──
export async function fetchTopics(limit = 50) {
  const res = await fetch(`${API_BASE}/api/topics?limit=${limit}`);
  return res.json();
}

// ── P2: Strategy ──
export async function fetchStrategies() {
  const res = await fetch(`${API_BASE}/api/strategy`);
  return res.json();
}

export async function updateStrategy(name: string, body: any) {
  const res = await fetch(`${API_BASE}/api/strategy/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── P3: Token Dynamics ──
export async function fetchDynamics(chainId?: string) {
  const params = new URLSearchParams();
  if (chainId) params.set('chainId', chainId);
  const res = await fetch(`${API_BASE}/api/dynamics?${params}`);
  return res.json();
}

export async function fetchTokenDynamic(chainId: string, address: string) {
  const res = await fetch(`${API_BASE}/api/dynamics/${chainId}/${address}`);
  return res.json();
}

// ── P3: Top Traders ──
export async function fetchTraders(chainId = 'CT_501', period = '30d', limit = 25) {
  const res = await fetch(`${API_BASE}/api/traders?chainId=${chainId}&period=${period}&limit=${limit}`);
  return res.json();
}

// ── P3: Meme Exclusive ──
export async function fetchMemeExclusive(chainId?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (chainId) params.set('chainId', chainId);
  const res = await fetch(`${API_BASE}/api/meme-exclusive?${params}`);
  return res.json();
}

// ── P3: Token Detail ──
export async function fetchTokenDetail(chainId: string, address: string) {
  const res = await fetch(`${API_BASE}/api/token-detail/${chainId}/${address}`);
  return res.json();
}

// ── P2: Klines ──
export async function fetchKlines(chainId: string, address: string, interval = '5min') {
  const res = await fetch(`${API_BASE}/api/klines/${chainId}/${address}?interval=${interval}`);
  return res.json();
}

// ── P5: Paper Trading ──
export async function fetchPaperWallet() {
  const res = await fetch(`${API_BASE}/api/paper-trading/wallet`);
  return res.json();
}

export async function fetchPaperTrades(status?: string, limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  const res = await fetch(`${API_BASE}/api/paper-trading/trades?${params}`);
  return res.json();
}

export async function fetchPaperStats() {
  const res = await fetch(`${API_BASE}/api/paper-trading/stats`);
  return res.json();
}

// ── P8: Evaluation Logs ──
export async function fetchEvaluationLogs(runId?: string, symbol?: string, status?: string, limit = 200) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (runId) params.set('runId', runId);
  if (symbol) params.set('symbol', symbol);
  if (status) params.set('status', status);
  const res = await fetch(`${API_BASE}/api/evaluation-logs?${params}`);
  return res.json();
}

export async function fetchEvaluationRuns(limit = 50) {
  const res = await fetch(`${API_BASE}/api/evaluation-logs/runs?limit=${limit}`);
  return res.json();
}

// ── P8b: Activity Feed ──
export async function fetchActivityFeed(limit = 100, hours = 24, symbol?: string) {
  const params = new URLSearchParams({ limit: String(limit), hours: String(hours) });
  if (symbol) params.set('symbol', symbol);
  const res = await fetch(`${API_BASE}/api/activity-feed?${params}`);
  return res.json();
}

// ── P7: 信号中心接口 ──
export async function fetchSocialHype(chainId = '56', lang = 'zh') {
  const res = await fetch(`${API_BASE}/api/social-hype?chainId=${chainId}&lang=${lang}`);
  return res.json();
}

export async function fetchHoldersRank(sortBy = 'kol', limit = 50) {
  const res = await fetch(`${API_BASE}/api/holders-rank?sortBy=${sortBy}&limit=${limit}`);
  return res.json();
}

export async function fetchTopTraders(chainId = 'CT_501', period = '30d') {
  const res = await fetch(`${API_BASE}/api/top-traders?chainId=${chainId}&period=${period}`);
  return res.json();
}

// ── P7: 策略回测统计 ──
export async function fetchBacktestStats() {
  const res = await fetch(`${API_BASE}/api/strategy/backtest-stats`);
  return res.json();
}

