import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { fetchSignals, fetchTokens, fetchTokenHistory, fetchTopics, fetchSocialHype, fetchHoldersRank, fetchTopTraders } from '../api'
import ActivityFeed from '../components/ActivityFeed'

const PAGE_SIZE = 20
const COLORS = ['#f0b90b', '#60a5fa', '#f87171', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#818cf8']

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts + 'Z').getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}

function fmtTime(ts: string): string {
  const d = new Date(ts + 'Z')
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function fmt(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(4)}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

interface Snapshot { capturedAt: string; price: number; marketCap: number; volume: number; percentChange: number }

function MiniChart({ data, color, metric }: { data: Snapshot[]; color: string; metric: keyof Snapshot }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data.length) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth; const h = canvas.clientHeight
    canvas.width = w * dpr; canvas.height = h * dpr
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h)
    const values = data.map(d => Number(d[metric]) || 0).reverse()
    if (!values.length) return
    const min = Math.min(...values) * 0.95; const max = Math.max(...values) * 1.05
    const range = max - min || 1
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) { const y = (h / 4) * i + 10; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, color + '30'); gradient.addColorStop(1, color + '00')
    ctx.beginPath()
    values.forEach((v, i) => { const x = (i / (values.length - 1)) * w; const y = h - ((v - min) / range) * (h - 20) - 10; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill()
    ctx.beginPath()
    values.forEach((v, i) => { const x = (i / (values.length - 1)) * w; const y = h - ((v - min) / range) * (h - 20) - 10; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()
    const lastV = values[values.length - 1]; const dotY = h - ((lastV - min) / range) * (h - 20) - 10
    ctx.beginPath(); ctx.arc(w - 2, dotY, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
  }, [data, color, metric])
  return <canvas ref={canvasRef} style={{ width: '100%', height: 140 }} />
}

type SortKey = 'maxGain' | 'smartMoneyCount' | 'capturedAt'
type TabType = 'feed' | 'signals' | 'social' | 'chart' | 'inflow' | 'holders' | 'topics'

const TABS: { key: TabType; label: string }[] = [
  { key: 'feed', label: '📡 信号聚合' },
  { key: 'signals', label: '💰 聪明钱' },
  { key: 'social', label: '🗣 社交热度' },
  { key: 'chart', label: '📈 趋势排行' },
  { key: 'inflow', label: '💧 资金流入' },
  { key: 'holders', label: '👑 大户持仓' },
  { key: 'topics', label: '🔥 话题热度' },
]

export default function SignalCenter() {
  const [tab, setTab] = useState<TabType>('feed')

  // Signals state
  const [signals, setSignals] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('capturedAt')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Chart state
  const [tokens, setTokens] = useState<any[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [metric, setMetric] = useState<keyof Snapshot>('price')

  // Topics state
  const [topics, setTopics] = useState<any[]>([])

  // Social hype state
  const [socialItems, setSocialItems] = useState<any[]>([])
  const [socialChain, setSocialChain] = useState('56')
  const [socialLoading, setSocialLoading] = useState(false)

  // Holders state
  const [holdersItems, setHoldersItems] = useState<any[]>([])
  const [holdersSortBy, setHoldersSortBy] = useState('kol')

  // Top traders state
  const [traders, setTraders] = useState<any[]>([])
  const [traderChain, setTraderChain] = useState('CT_501')
  const [traderPeriod, setTraderPeriod] = useState('30d')

  useEffect(() => {
    const loadData = () => {
      Promise.all([
        fetchSignals(500).then(d => setSignals(d.signals || [])),
        fetchTokens(undefined, 50).then(d => {
          setTokens(d.tokens || [])
          setSelected(prev => {
            if (!prev && d.tokens?.length) return d.tokens[0].id
            return prev
          })
        }),
        fetchTopics(30).then(d => setTopics(d.topics || [])),
      ]).then(() => setLoading(false))
    }
    loadData()
    const timer = setInterval(loadData, 15000)
    return () => clearInterval(timer)
  }, [])

  // Load social hype when tab switches
  useEffect(() => {
    if (tab === 'social') {
      setSocialLoading(true)
      fetchSocialHype(socialChain).then(d => { setSocialItems(d.items || []); setSocialLoading(false) })
    }
  }, [tab, socialChain])

  // Load holders when tab switches
  useEffect(() => {
    if (tab === 'holders') {
      fetchHoldersRank(holdersSortBy).then(d => setHoldersItems(d.items || []))
    }
  }, [tab, holdersSortBy])

  // Load top traders
  useEffect(() => {
    if (tab === 'inflow') {
      fetchTopTraders(traderChain, traderPeriod).then(d => setTraders(d.items || []))
    }
  }, [tab, traderChain, traderPeriod])

  const loadHistory = useCallback(async (id: number) => {
    const d = await fetchTokenHistory(id, 100)
    setHistory(d.snapshots || [])
  }, [])
  useEffect(() => { if (selected) loadHistory(selected) }, [selected, loadHistory])

  // Signal filtering
  const filtered = useMemo(() => {
    let list = signals
    if (filter !== 'all') list = list.filter((s: any) => s.direction === filter)
    if (search) { const q = search.toLowerCase(); list = list.filter((s: any) => s.ticker?.toLowerCase().includes(q) || s.contractAddress?.toLowerCase().includes(q)) }
    list.sort((a: any, b: any) => {
      let av: any, bv: any
      if (sortKey === 'capturedAt') { av = new Date(a.capturedAt || 0).getTime(); bv = new Date(b.capturedAt || 0).getTime() }
      else { av = a[sortKey] || 0; bv = b[sortKey] || 0 }
      return sortAsc ? av - bv : bv - av
    })
    return list
  }, [signals, filter, search, sortKey, sortAsc])

  // Inflow signals (direction = inflow)
  const inflowSignals = useMemo(() => {
    return signals.filter((s: any) => s.direction === 'inflow')
      .sort((a: any, b: any) => (b.smartMoneyCount || 0) - (a.smartMoneyCount || 0))
  }, [signals])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const toggleSort = (key: SortKey) => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(false) }; setPage(1) }

  const selToken = tokens.find((t: any) => t.id === selected)
  const latest = history[0]

  if (loading) return <div className="loading"><div className="spinner" />加载中...</div>

  return (
    <>
      <header className="page-header">
        <h1>🎯 信号中心</h1>
        <div className="panel-tabs" style={{ flexWrap: 'wrap', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.key} className={`panel-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)} style={{ fontSize: 13, padding: '6px 14px' }}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Tab: 信号聚合 ── */}
      {tab === 'feed' && (
        <ActivityFeed hours={72} maxItems={200} title="" showFilters={true} autoRefresh={true} />
      )}

      {/* ── Tab: 聪明钱信号 ── */}
      {tab === 'signals' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" placeholder="🔍 搜索代币..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{ width: 220 }} />
            <div className="panel-tabs">
              <button className={`panel-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => { setFilter('all'); setPage(1) }}>全部</button>
              <button className={`panel-tab ${filter === 'signal' ? 'active' : ''}`} onClick={() => { setFilter('signal'); setPage(1) }}>买入</button>
              <button className={`panel-tab ${filter === 'inflow' ? 'active' : ''}`} onClick={() => { setFilter('inflow'); setPage(1) }}>流入</button>
              <button className={`panel-tab ${filter === 'sell' ? 'active' : ''}`} onClick={() => { setFilter('sell'); setPage(1) }}>卖出</button>
            </div>
            <div className="panel-tabs">
              <button className={`panel-tab ${sortKey === 'capturedAt' ? 'active' : ''}`} onClick={() => toggleSort('capturedAt')} style={{ fontSize: 12 }}>时间{sortKey === 'capturedAt' ? (sortAsc ? '▲' : '▼') : ''}</button>
              <button className={`panel-tab ${sortKey === 'maxGain' ? 'active' : ''}`} onClick={() => toggleSort('maxGain')} style={{ fontSize: 12 }}>收益{sortKey === 'maxGain' ? (sortAsc ? '▲' : '▼') : ''}</button>
              <button className={`panel-tab ${sortKey === 'smartMoneyCount' ? 'active' : ''}`} onClick={() => toggleSort('smartMoneyCount')} style={{ fontSize: 12 }}>SM数{sortKey === 'smartMoneyCount' ? (sortAsc ? '▲' : '▼') : ''}</button>
            </div>
          </div>
          <div className="panel">
            <div className="signal-feed">
              {paged.map((s: any, i: number) => (
                <div className="signal-item" key={s.id || i}>
                  <div className="signal-line">
                    <div className={`signal-dot ${s.direction === 'sell' ? 'sell' : 'buy'}`} />
                    {i < paged.length - 1 && <div className="signal-wire" />}
                  </div>
                  <div className="signal-content" style={{ flex: 1 }}>
                    <div className="signal-top">
                      <span className="signal-token">{s.ticker || '—'}</span>
                      <span className={`signal-tag ${s.direction === 'sell' ? 'sell' : 'buy'}`}>
                        {s.direction === 'sell' ? '卖出' : s.direction === 'inflow' ? '流入' : '买入'}
                      </span>
                      {s.maxGain > 0 && <span className="mono-num" style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginLeft: 8 }}>↑ {s.maxGain.toFixed(1)}%</span>}
                      {s.exitRate > 0 && <span className="mono-num" style={{ fontSize: 11, color: s.exitRate > 50 ? 'var(--red)' : 'var(--text-tertiary)', marginLeft: 8 }}>退出 {s.exitRate}%</span>}
                    </div>
                    <div className="signal-detail"><span className="mono-num text-green">{s.smartMoneyCount || 0}</span> 个SM地址 · {s.chainId === '56' ? 'BSC' : 'SOL'}{s.alertPrice > 0 && ` · $${s.alertPrice.toFixed(4)}`}</div>
                    <div className="signal-time">{s.capturedAt ? `${timeAgo(s.capturedAt)} · ${fmtTime(s.capturedAt)}` : ''}</div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="empty"><div className="empty-icon">🎯</div>暂无信号</div>}
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 16 }}>
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', opacity: page === 1 ? 0.3 : 1 }}>← 上页</button>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{page} / {totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', opacity: page === totalPages ? 0.3 : 1 }}>下页 →</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tab: 社交热度 ── */}
      {tab === 'social' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <div className="panel-tabs">
              {[{ id: '56', label: 'BSC' }, { id: 'CT_501', label: 'Solana' }, { id: '8453', label: 'Base' }].map(c => (
                <button key={c.id} className={`panel-tab ${socialChain === c.id ? 'active' : ''}`} onClick={() => setSocialChain(c.id)}>{c.label}</button>
              ))}
            </div>
            {socialLoading && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>加载中...</span>}
          </div>
          <div className="panel data-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>代币</th>
                  <th>社交热度</th>
                  <th>社交摘要</th>
                  <th>价格</th>
                  <th>涨跌幅</th>
                  <th>市值</th>
                </tr>
              </thead>
              <tbody>
                {socialItems.map((item: any, i: number) => (
                  <tr key={item.contractAddress || i}>
                    <td className="mono-num">{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.symbol}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, item.socialHype)}%`, height: '100%', background: 'linear-gradient(90deg, #f0b90b, #f87171)', borderRadius: 3 }} />
                        </div>
                        <span className="mono-num" style={{ fontSize: 12, color: '#f0b90b' }}>{item.socialHype}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.socialSummary || '—'}</td>
                    <td className="mono-num">{fmt(item.price)}</td>
                    <td className={`mono-num ${item.percentChange >= 0 ? 'text-green' : 'text-red'}`}>{fmtPct(item.percentChange)}</td>
                    <td className="mono-num">{fmt(item.marketCap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {socialItems.length === 0 && <div className="empty"><div className="empty-icon">🗣</div>暂无社交热度数据</div>}
          </div>
        </>
      )}

      {/* ── Tab: 趋势排行 ── */}
      {tab === 'chart' && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
          <div className="panel" style={{ maxHeight: 'calc(100vh - 140px)', overflow: 'auto' }}>
            <div className="panel-header"><span className="panel-title">代币</span>
              <div className="panel-tabs">
                {(['price', 'marketCap', 'volume'] as (keyof Snapshot)[]).map(m => (
                  <button key={m} className={`panel-tab ${metric === m ? 'active' : ''}`} onClick={() => setMetric(m)} style={{ fontSize: 11 }}>
                    {m === 'price' ? '价格' : m === 'marketCap' ? '市值' : '量'}
                  </button>
                ))}
              </div>
            </div>
            {tokens.map((t: any, i: number) => (
              <div key={t.id} onClick={() => setSelected(t.id)} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: t.id === selected ? 'var(--accent-soft)' : 'transparent', borderLeft: t.id === selected ? '3px solid var(--accent)' : '3px solid transparent' }}>
                <div className="token-avatar" style={{ width: 26, height: 26, borderRadius: 7, fontSize: 10, background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 3) % COLORS.length]})` }}>{(t.symbol || '?')[0]}</div>
                <div><div style={{ fontWeight: 600, fontSize: 12 }}>{t.symbol}</div><div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t.chainId === '56' ? 'BSC' : 'SOL'}</div></div>
              </div>
            ))}
          </div>
          <div>
            {selToken && (
              <>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
                  <div className="stat-card gold"><div className="stat-label">价格</div><div className="stat-value mono-num" style={{ fontSize: 20 }}>{latest ? `$${latest.price?.toFixed(latest.price < 0.01 ? 6 : 4)}` : '—'}</div></div>
                  <div className="stat-card blue"><div className="stat-label">市值</div><div className="stat-value mono-num" style={{ fontSize: 20 }}>{latest ? fmt(latest.marketCap) : '—'}</div></div>
                  <div className="stat-card purple"><div className="stat-label">交易量</div><div className="stat-value mono-num" style={{ fontSize: 20 }}>{latest ? fmt(latest.volume) : '—'}</div></div>
                  <div className={`stat-card ${(latest?.percentChange || 0) >= 0 ? 'green' : 'red'}`}><div className="stat-label">涨跌幅</div><div className="stat-value mono-num" style={{ fontSize: 20 }}>{latest ? fmtPct(latest.percentChange) : '—'}</div></div>
                </div>
                <div className="panel" style={{ padding: 20 }}>
                  <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{selToken.symbol} · {metric === 'price' ? '价格' : metric === 'marketCap' ? '市值' : '交易量'}趋势 <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{history.length} 点</span></div>
                  {history.length > 1 ? <MiniChart data={history} color={COLORS[tokens.findIndex((t: any) => t.id === selected) % COLORS.length]} metric={metric} /> : <div className="empty" style={{ padding: 40 }}>📊 数据不足</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: 资金流入 (SM Inflow + 顶级交易者) ── */}
      {tab === 'inflow' && (
        <>
          {/* SM流入信号 */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-header"><span className="panel-title">💧 聪明钱流入信号</span><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{inflowSignals.length} 条</span></div>
            <div className="signal-feed">
              {inflowSignals.slice(0, 20).map((s: any, i: number) => (
                <div className="signal-item" key={s.id || i}>
                  <div className="signal-line">
                    <div className="signal-dot buy" />
                    {i < Math.min(19, inflowSignals.length - 1) && <div className="signal-wire" />}
                  </div>
                  <div className="signal-content" style={{ flex: 1 }}>
                    <div className="signal-top">
                      <span className="signal-token">{s.ticker}</span>
                      <span className="signal-tag buy">流入</span>
                      {s.maxGain > 0 && <span className="mono-num" style={{ fontSize: 11, color: 'var(--green)', marginLeft: 8 }}>↑ {s.maxGain.toFixed(1)}%</span>}
                    </div>
                    <div className="signal-detail"><span className="mono-num text-green">{s.smartMoneyCount}</span> 个SM地址 · {s.chainId === '56' ? 'BSC' : 'SOL'} · {fmt(s.alertPrice || 0)}</div>
                    <div className="signal-time">{s.capturedAt ? timeAgo(s.capturedAt) : ''}</div>
                  </div>
                </div>
              ))}
              {inflowSignals.length === 0 && <div className="empty">暂无流入信号</div>}
            </div>
          </div>
          {/* 顶级交易者排行 */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">🏆 顶级交易者排行</span>
              <div className="panel-tabs">
                {[{ id: 'CT_501', label: 'Solana' }, { id: '56', label: 'BSC' }].map(c => (
                  <button key={c.id} className={`panel-tab ${traderChain === c.id ? 'active' : ''}`} onClick={() => setTraderChain(c.id)}>{c.label}</button>
                ))}
                {[{ id: '7d', label: '7天' }, { id: '30d', label: '30天' }].map(p => (
                  <button key={p.id} className={`panel-tab ${traderPeriod === p.id ? 'active' : ''}`} onClick={() => setTraderPeriod(p.id)}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>地址</th>
                    <th>标签</th>
                    <th>实现盈利</th>
                    <th>胜率</th>
                    <th>交易量</th>
                    <th>交易数</th>
                  </tr>
                </thead>
                <tbody>
                  {traders.map((t: any, i: number) => (
                    <tr key={t.address}>
                      <td className="mono-num">{i + 1}</td>
                      <td className="mono-num" style={{ fontSize: 11 }}>{t.address.slice(0, 6)}...{t.address.slice(-4)}</td>
                      <td>{t.tags ? <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(240,185,11,0.15)', borderRadius: 4, color: '#f0b90b' }}>{t.tags}</span> : '—'}</td>
                      <td className={`mono-num ${(t.realizedPnl || 0) >= 0 ? 'text-green' : 'text-red'}`}>{fmt(t.realizedPnl || 0)}</td>
                      <td className="mono-num">{((t.winRate || 0) * 100).toFixed(1)}%</td>
                      <td className="mono-num">{fmt(t.totalVolume || 0)}</td>
                      <td className="mono-num">{t.totalTxCnt || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {traders.length === 0 && <div className="empty">暂无交易者数据 — 等待采集器运行</div>}
            </div>
          </div>
        </>
      )}

      {/* ── Tab: 大户持仓 ── */}
      {tab === 'holders' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div className="panel-tabs">
              {[{ id: 'kol', label: '👑 KOL持仓' }, { id: 'pro', label: '💎 专业交易者' }, { id: 'sm', label: '🧠 聪明钱' }].map(s => (
                <button key={s.id} className={`panel-tab ${holdersSortBy === s.id ? 'active' : ''}`} onClick={() => setHoldersSortBy(s.id)}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="panel data-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>代币</th>
                  <th>价格</th>
                  <th>市值</th>
                  <th>KOL持有</th>
                  <th>KOL占比</th>
                  <th>专业交易者</th>
                  <th>Pro占比</th>
                  <th>SM持有</th>
                  <th>SM占比</th>
                  <th>总持有者</th>
                </tr>
              </thead>
              <tbody>
                {holdersItems.map((item: any, i: number) => (
                  <tr key={item.contractAddress || i}>
                    <td className="mono-num">{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.symbol}</td>
                    <td className="mono-num">{fmt(item.price || 0)}</td>
                    <td className="mono-num">{fmt(item.marketCap || 0)}</td>
                    <td className="mono-num" style={{ color: item.kolHolders > 0 ? '#f0b90b' : 'var(--text-tertiary)' }}>{item.kolHolders}</td>
                    <td className="mono-num">{(item.kolHoldingPct || 0).toFixed(2)}%</td>
                    <td className="mono-num" style={{ color: item.proHolders > 0 ? '#60a5fa' : 'var(--text-tertiary)' }}>{item.proHolders}</td>
                    <td className="mono-num">{(item.proHoldingPct || 0).toFixed(2)}%</td>
                    <td className="mono-num" style={{ color: item.smHolders > 0 ? '#34d399' : 'var(--text-tertiary)' }}>{item.smHolders}</td>
                    <td className="mono-num">{(item.smHoldingPct || 0).toFixed(2)}%</td>
                    <td className="mono-num">{item.holders || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {holdersItems.length === 0 && <div className="empty"><div className="empty-icon">👑</div>暂无大户数据 — 需要先有观察列表代币动态数据</div>}
          </div>
        </>
      )}

      {/* ── Tab: 话题热度 ── */}
      {tab === 'topics' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {topics.map((t: any) => (
            <div key={t.id} className="panel" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name || '话题'}</div>
                <span style={{ fontSize: 11, color: t.netInflow1h > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {t.netInflow1h > 0 ? '▲' : '▼'} ${Math.abs(t.netInflow1h || 0).toLocaleString()}
                </span>
              </div>
              {t.aiSummary && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>{t.aiSummary}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 12 }}>
                <span>代币数: {t.tokenSize || 0}</span>
                <span>净流入: {fmt(t.netInflow || 0)}</span>
                {t.type && <span>类型: {t.type}</span>}
              </div>
            </div>
          ))}
          {topics.length === 0 && <div className="empty"><div className="empty-icon">🔥</div>暂无话题数据 — 等待采集器运行</div>}
        </div>
      )}
    </>
  )
}
