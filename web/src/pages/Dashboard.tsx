import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { fetchStats, fetchSignals, runAllCollectors, fetchMemeExclusive, fetchHotTokens } from '../api'
import ActivityFeed from '../components/ActivityFeed'

const COLORS = ['#f0b90b', '#60a5fa', '#f87171', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#818cf8']

function fmt(n: number | null | undefined): string {
  if (n == null) return '-'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return n >= 1 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`
}

function fmtVol(n: number | null | undefined): string {
  if (n == null) return '-'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(0)
}

function addr(s: string): string {
  if (!s) return ''
  return s.slice(0, 6) + '..' + s.slice(-4)
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts + 'Z').getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtTime(ts: string): string {
  const d = new Date(ts + 'Z')
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function formatAge(epoch: number | null | undefined): string {
  if (!epoch) return '-'
  // Auto-detect: if > 1e12 it's milliseconds, convert to seconds
  const epochSec = epoch > 1e12 ? Math.floor(epoch / 1000) : epoch
  const now = Math.floor(Date.now() / 1000)
  const diff = now - epochSec
  if (diff < 0) return '-'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function PctBadge({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="mono-num" style={{ color: 'var(--text-tertiary)' }}>-</span>
  const cls = v >= 0 ? 'change-up' : 'change-down'
  return <span className={`mono-num ${cls}`}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>
}

type ChainFilter = 'all' | '56' | 'CT_501'
type PeriodFilter = '5m' | '1h' | '4h' | '24h'

const TAB_BASE: React.CSSProperties = {
  padding: '7px 18px', borderRadius: 8, border: '1px solid var(--border)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)',
  background: 'transparent', color: 'var(--text-secondary)', transition: 'all 0.15s',
}
const TAB_ACTIVE: React.CSSProperties = {
  ...TAB_BASE,
  background: 'var(--accent-soft)', color: 'var(--accent)',
  borderColor: 'var(--accent)', boxShadow: '0 0 12px rgba(240,185,11,0.15)',
}

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null)
  const [hotTokens, setHotTokens] = useState<any[]>([])
  const [signals, setSignals] = useState<any[]>([])
  const [memeTop, setMemeTop] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [chain, setChain] = useState<ChainFilter>('all')
  const [period, setPeriod] = useState<PeriodFilter>('1h')

  const loadHot = useCallback(async (p: PeriodFilter, ch: ChainFilter) => {
    const cid = ch === 'all' ? undefined : ch
    const res = await fetchHotTokens(p, cid, 30)
    setHotTokens(res.tokens || [])
  }, [])

  const load = async () => {
    try {
      const [s, sig, me] = await Promise.all([
        fetchStats(), fetchSignals(10), fetchMemeExclusive(undefined, 5)
      ])
      setStats(s)
      setSignals(sig.signals || [])
      setMemeTop(me.tokens || [])
      await loadHot(period, chain)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const timer = setInterval(() => { if (!syncing) load() }, 15000)
    return () => clearInterval(timer)
  }, [syncing])

  useEffect(() => { loadHot(period, chain) }, [period, chain, loadHot])

  const handleSync = async () => {
    setSyncing(true)
    await runAllCollectors()
    await load()
    setSyncing(false)
  }

  if (loading) return <div className="loading"><div className="spinner" />Loading...</div>

  return (
    <>
      <header className="page-header">
        <h1>MEME 市场总览</h1>
        <div className="header-right">
          <span className="header-time">{new Date().toLocaleString('zh-CN')}</span>
          <button className="sync-badge" onClick={handleSync} disabled={syncing} style={{ border: 'none', cursor: 'pointer' }}>
            <div className="sync-dot" />
            {syncing ? '同步中...' : '立即同步'}
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card gold">
          <div className="stat-label">追踪代币</div>
          <div className="stat-value">{stats?.tokens || 0}</div>
          <div className="stat-sub">BSC + Solana</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">聪明钱信号</div>
          <div className="stat-value">{stats?.signals || 0}</div>
          <div className="stat-sub">活跃信号</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">快照数据</div>
          <div className="stat-value">{stats?.snapshots || 0}</div>
          <div className="stat-sub">历史记录</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid #a78bfa' }}>
          <div className="stat-label">Meme 精选</div>
          <div className="stat-value">{memeTop.length > 0 ? memeTop.length + '+' : '0'}</div>
          <div className="stat-sub">{memeTop[0] ? `榜首: ${memeTop[0].symbol} (${memeTop[0].score?.toFixed(1)})` : 'Pulse 评分'}</div>
        </div>
      </section>

      {/* Meme Exclusive Top 5 */}
      {memeTop.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <span className="panel-title">Meme 精选排行 | Pulse 评分</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(memeTop.length, 5)}, 1fr)`, gap: 16, padding: '20px 24px' }}>
            {memeTop.slice(0, 5).map((m: any) => (
              <div key={m.id} style={{
                padding: '16px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)', transition: 'all 0.2s',
                borderLeft: `4px solid ${m.score >= 4 ? 'var(--green)' : m.score >= 2 ? 'var(--accent)' : 'var(--text-tertiary)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>
                    <Link to={`/token/${m.chainId}/${m.contractAddress}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {m.symbol}
                    </Link>
                  </span>
                  <span className="mono-num" style={{ fontWeight: 700, fontSize: 18, color: m.score >= 4 ? 'var(--green)' : 'var(--accent)', textShadow: m.score >= 4 ? '0 0 12px rgba(14,203,129,0.3)' : 'none' }}>{m.score?.toFixed(1)}</span>
                </div>
                <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {m.marketCap > 0 && <span>市值: {fmt(m.marketCap)}</span>}
                  {m.holders > 0 && <span>持有人: {m.holders.toLocaleString()}</span>}
                  <span className={`chain-badge ${m.chainId === '56' ? 'chain-bsc' : 'chain-sol'}`}>
                    {m.chainId === '56' ? 'BSC' : 'SOL'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hot Tokens P7 */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span className="panel-title">热门代币</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(['5m', '1h', '4h', '24h'] as PeriodFilter[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                style={period === p ? TAB_ACTIVE : TAB_BASE}>
                {p}
              </button>
            ))}
            <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 6px' }} />
            {(['all', '56', 'CT_501'] as ChainFilter[]).map(c => (
              <button key={c} onClick={() => setChain(c)} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: chain === c ? 'var(--accent-soft)' : 'transparent',
                color: chain === c ? 'var(--accent)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.5px'
              }}>
                {c === 'all' ? '全部' : c === '56' ? 'BSC' : 'SOL'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>代币</th>
                <th>链</th>
                <th>价格</th>
                <th>市值</th>
                <th>流动性</th>
                <th>5分涨幅</th>
                <th>1时涨幅</th>
                <th>5分交量</th>
                <th>1时交量</th>
                <th>持有人</th>
                <th>币安用户</th>
                <th>聪明钱</th>
                <th>KOL</th>
                <th>上线</th>
                <th>更新</th>
              </tr>
            </thead>
            <tbody>
              {hotTokens.map((t: any, i: number) => {
                const liq = t.dynamicsLiquidity ?? t.liquidity
                const mc = t.dynamicsMarketCap ?? t.marketCap
                const h = t.dynamicsHolders ?? t.holders
                const updateTs = (() => {
                  const dt = t.dynamicsTime ? new Date(t.dynamicsTime + 'Z').getTime() : 0
                  const st = t.snapshotTime ? new Date(t.snapshotTime + 'Z').getTime() : 0
                  return dt > st ? t.dynamicsTime : (t.snapshotTime || t.dynamicsTime)
                })()
                return (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td>
                      <div className="token-cell">
                        <div className="token-avatar" style={{ background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 3) % COLORS.length]})` }}>
                          {(t.symbol || '?')[0]}
                        </div>
                        <div>
                          <div className="token-name">
                            <Link to={`/token/${t.chainId}/${t.contractAddress}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {t.symbol}
                            </Link>
                          </div>
                          <div className="token-addr" style={{ cursor: 'pointer' }} title={t.contractAddress} onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(t.contractAddress);
                            const el = e.currentTarget;
                            el.textContent = '✅ 已复制';
                            setTimeout(() => { el.textContent = addr(t.contractAddress); }, 1200);
                          }}>{addr(t.contractAddress)}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`chain-badge ${t.chainId === '56' ? 'chain-bsc' : 'chain-sol'}`}>{t.chainId === '56' ? 'BSC' : 'SOL'}</span></td>
                    <td className="mono-num">${t.price?.toFixed(t.price < 0.01 ? 6 : 4) || '-'}</td>
                    <td className="mono-num" style={{ color: 'var(--text-secondary)' }}>{fmt(mc)}</td>
                    <td className="mono-num" style={{ color: 'var(--text-secondary)' }}>{fmt(liq)}</td>
                    <td><PctBadge v={t.percentChange5m} /></td>
                    <td><PctBadge v={t.percentChange1h} /></td>
                    <td className="mono-num" style={{ color: 'var(--text-secondary)' }}>{fmtVol(t.volume5m)}</td>
                    <td className="mono-num" style={{ color: 'var(--text-secondary)' }}>{fmtVol(t.volume1h)}</td>
                    <td><span className="holders-badge">{h?.toLocaleString() || '-'}</span></td>
                    <td>
                      {(t.dynamicsKycHolders ?? t.kycHolders) != null ? (
                        <span className="mono-num" style={{ color: (t.dynamicsKycHolders ?? t.kycHolders) > 0 ? '#3b82f6' : 'var(--text-tertiary)', fontWeight: 600 }}>
                          {(t.dynamicsKycHolders ?? t.kycHolders)?.toLocaleString()}
                        </span>
                      ) : <span style={{ color: 'var(--text-tertiary)' }}>-</span>}
                    </td>
                    <td>
                      {t.smartMoneyHolders != null ? (
                        <span className="mono-num" style={{ color: t.smartMoneyHolders > 0 ? 'var(--green)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                          {t.smartMoneyHolders}
                        </span>
                      ) : <span style={{ color: 'var(--text-tertiary)' }}>-</span>}
                    </td>
                    <td>
                      {t.kolHolders != null ? (
                        <span className="mono-num" style={{ color: t.kolHolders > 0 ? '#a78bfa' : 'var(--text-tertiary)', fontWeight: 600 }}>
                          {t.kolHolders}
                        </span>
                      ) : <span style={{ color: 'var(--text-tertiary)' }}>-</span>}
                    </td>
                    <td className="mono-num" style={{ fontSize: 12, color: t.launchTime && (Date.now()/1000 - t.launchTime) < 86400 ? 'var(--green)' : 'var(--text-secondary)', fontWeight: 600 }}>
                      {formatAge(t.launchTime)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {updateTs ? fmtTime(updateTs) : '-'}
                    </td>
                  </tr>
                )
              })}
              {hotTokens.length === 0 && <tr><td colSpan={16} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>暂无数据，请点击"立即同步"获取。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Feed - compact */}
      <div className="panel" style={{ padding: 20 }}>
        <ActivityFeed compact={false} maxItems={30} hours={24} title="📡 最新信号活动" showFilters={false} autoRefresh={true} />
      </div>
    </>
  )
}
