import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchTokenDetail, fetchKlines } from '../api'

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(2)}`
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function timeAgo(ts: string | null): string {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts + 'Z').getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}

function fmtTime(ts: string | null): string {
  if (!ts || ts === '—') return ''
  const d = new Date(ts + 'Z')
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{value.toFixed(0)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-hover)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(value, 100)}%`, borderRadius: 3, background: color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

export default function TokenDetail() {
  const { chainId, address } = useParams()
  const [data, setData] = useState<any>(null)
  const [klines, setKlines] = useState<any[]>([])
  const [klInterval, setKlInterval] = useState('5min')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!chainId || !address) return
    setLoading(true)
    Promise.all([
      fetchTokenDetail(chainId, address),
      fetchKlines(chainId, address, klInterval),
    ]).then(([d, k]) => {
      setData(d)
      setKlines(k.klines || [])
    }).finally(() => setLoading(false))
  }, [chainId, address, klInterval])

  if (loading) return <div className="loading"><div className="spinner" />加载中...</div>
  if (!data) return <div className="loading">代币未找到</div>

  const { token, snapshot, watchEntry, dynamics, memeRank, audit, smSignals } = data
  const sym = token?.symbol || memeRank?.symbol || address?.slice(0, 8) || '?'
  const chain = chainId === '56' ? 'BSC' : 'SOL'
  const price = dynamics?.price || snapshot?.price || memeRank?.price
  const mc = dynamics?.marketCap || snapshot?.marketCap || memeRank?.marketCap
  const liq = dynamics?.liquidity || snapshot?.liquidity || memeRank?.liquidity

  // Score colors
  const scoreColor = (v: number) => v >= 70 ? '#0ecb81' : v >= 40 ? '#f0b90b' : '#f87171'

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--text-tertiary)', textDecoration: 'none', fontSize: 14 }}>← 返回</Link>
          <h1 style={{ margin: 0 }}>🔍 ${sym}</h1>
          <span className={`chain-badge ${chainId === '56' ? 'chain-bsc' : 'chain-sol'}`}>{chain}</span>
          {watchEntry && (
            <span style={{
              padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: watchEntry.status === 'buy_signal' ? 'var(--green-bg)' : 'var(--accent-soft)',
              color: watchEntry.status === 'buy_signal' ? 'var(--green)' : 'var(--accent)',
            }}>
              {watchEntry.status === 'buy_signal' ? '🟢 买入信号' : watchEntry.status === 'watching' ? '👀 观察中' : watchEntry.status}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>合约:</span>
          <code className="mono-num" style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 4 }}>{address}</code>
          <button onClick={() => {
            navigator.clipboard.writeText(address || '');
            const btn = document.getElementById('ca-copy-btn');
            if (btn) { btn.textContent = '✅ 已复制'; setTimeout(() => { btn.textContent = '📋 复制'; }, 1200); }
          }} id="ca-copy-btn" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>📋 复制</button>
        </div>
      </header>

      {/* ── Price Overview ── */}
      <section className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 20 }}>
        <div className="stat-card gold">
          <div className="stat-label">价格</div>
          <div className="stat-value mono-num" style={{ fontSize: 20 }}>${price?.toFixed(price < 0.01 ? 8 : 4) || '—'}</div>
          <div className="stat-sub">
            {dynamics ? (
              <span className={dynamics.percentChange1h >= 0 ? 'up' : 'down'}>
                1h {pct(dynamics.percentChange1h)}
              </span>
            ) : snapshot ? (
              <span className={snapshot.percentChange >= 0 ? 'up' : 'down'}>{pct(snapshot.percentChange)}</span>
            ) : '—'}
          </div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">市值</div>
          <div className="stat-value mono-num" style={{ fontSize: 20 }}>{fmt(mc)}</div>
          <div className="stat-sub mono-num">FDV {fmt(dynamics?.fdv)}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">流动性</div>
          <div className="stat-value mono-num" style={{ fontSize: 20 }}>{fmt(liq)}</div>
          <div className="stat-sub">流动池</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">持有者</div>
          <div className="stat-value mono-num" style={{ fontSize: 20 }}>{(dynamics?.holders || snapshot?.holders || 0).toLocaleString()}</div>
          <div className="stat-sub">KYC {(dynamics?.kycHolderCount || snapshot?.kycHolders || 0).toLocaleString()}</div>
        </div>
        {memeRank && (
          <div className="stat-card purple">
            <div className="stat-label">Pulse 评分</div>
            <div className="stat-value mono-num" style={{ color: 'var(--purple)', fontSize: 20 }}>{memeRank.score?.toFixed(2)}</div>
            <div className="stat-sub">排名 #{memeRank.rank} · 曝光 {(memeRank.impression || 0).toLocaleString()}</div>
          </div>
        )}
        {!memeRank && (
          <div className="stat-card">
            <div className="stat-label">Pulse 评分</div>
            <div className="stat-value mono-num" style={{ color: 'var(--text-tertiary)', fontSize: 20 }}>—</div>
            <div className="stat-sub">未上排行</div>
          </div>
        )}
      </section>

      {/* ── Main Grid ── */}
      <section className="content-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>

        {/* ── Left: K-line + Trading Data ── */}
        <div>
          {/* K-line Chart (simplified as data table for now) */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="panel-title">📈 K线数据</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['5min', '1h', '4h'].map(iv => (
                  <button key={iv} onClick={() => setKlInterval(iv)} style={{
                    padding: '4px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: klInterval === iv ? 'var(--accent-soft)' : 'transparent',
                    color: klInterval === iv ? 'var(--accent)' : 'var(--text-tertiary)',
                  }}>
                    {iv}
                  </button>
                ))}
              </div>
            </div>
            {klines.length > 0 ? (
              <div style={{ padding: '0 16px 16px', maxHeight: 260, overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead><tr><th>时间</th><th>开</th><th>高</th><th>低</th><th>收</th><th>量</th></tr></thead>
                  <tbody>
                    {klines.slice(-20).map((k: any, i: number) => {
                      const t = new Date(k.timestamp * 1000)
                      const isUp = (k.close || 0) >= (k.open || 0)
                      return (
                        <tr key={i}>
                          <td className="mono-num" style={{ color: 'var(--text-tertiary)' }}>{t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="mono-num">{k.open?.toFixed(k.open < 0.01 ? 8 : 4)}</td>
                          <td className="mono-num" style={{ color: 'var(--green)' }}>{k.high?.toFixed(k.high < 0.01 ? 8 : 4)}</td>
                          <td className="mono-num" style={{ color: 'var(--red)' }}>{k.low?.toFixed(k.low < 0.01 ? 8 : 4)}</td>
                          <td className="mono-num" style={{ color: isUp ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{k.close?.toFixed(k.close < 0.01 ? 8 : 4)}</td>
                          <td className="mono-num" style={{ color: 'var(--text-secondary)' }}>{fmt(k.volume)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>暂无K线数据</div>
            )}
          </div>

          {/* Volume / Trading Data */}
          {dynamics && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header"><span className="panel-title">📊 交易数据</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, padding: '0 16px 16px' }}>
                {[
                  { label: '5分钟量', value: fmt(dynamics.volume5m), sub: pct(dynamics.percentChange5m) },
                  { label: '1小时量', value: fmt(dynamics.volume1h), sub: pct(dynamics.percentChange1h) },
                  { label: '4小时量', value: fmt(dynamics.volume4h), sub: pct(dynamics.percentChange4h) },
                  { label: '24小时量', value: fmt(dynamics.volume24h), sub: pct(dynamics.percentChange24h) },
                ].map(({ label, value, sub }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</div>
                    <div className="mono-num" style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
                    <div className="mono-num" style={{ fontSize: 11, color: sub.startsWith('+') ? 'var(--green)' : sub.startsWith('-') ? 'var(--red)' : 'var(--text-tertiary)' }}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '0 16px 16px' }}>
                <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-hover)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>24h 买卖分布</div>
                  <div className="mono-num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--green)' }}>买 {fmt(dynamics.volume24hBuy)}</span>
                    <span style={{ color: 'var(--red)' }}>卖 {fmt(dynamics.volume24hSell)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--red-bg)', marginTop: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: 'var(--green)',
                      width: `${dynamics.volume24hBuy && dynamics.volume24hSell ? (dynamics.volume24hBuy / (dynamics.volume24hBuy + dynamics.volume24hSell) * 100) : 50}%`
                    }} />
                  </div>
                </div>
                <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-hover)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>24h 交易笔数</div>
                  <div className="mono-num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--green)' }}>买 {dynamics.count24hBuy?.toLocaleString() || 0}</span>
                    <span style={{ color: 'var(--red)' }}>卖 {dynamics.count24hSell?.toLocaleString() || 0}</span>
                  </div>
                  <div className="mono-num" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    总计 {dynamics.count24h?.toLocaleString() || 0} 笔
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SM Signals */}
          {smSignals && smSignals.length > 0 && (
            <div className="panel">
              <div className="panel-header"><span className="panel-title">🎯 聪明钱信号历史</span></div>
              <div className="signal-feed" style={{ maxHeight: 220 }}>
                {smSignals.map((s: any, i: number) => (
                  <div className="signal-item" key={s.id || i}>
                    <div className="signal-line">
                      <div className={`signal-dot ${s.direction === 'sell' ? 'sell' : 'buy'}`} />
                      {i < smSignals.length - 1 && <div className="signal-wire" />}
                    </div>
                    <div className="signal-content">
                      <div className="signal-top">
                        <span className={`signal-tag ${s.direction === 'sell' ? 'sell' : 'buy'}`}>
                          {s.direction === 'sell' ? '卖出' : s.direction === 'inflow' ? '流入' : '买入'}
                        </span>
                        <span className="mono-num" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.smartMoneyCount} 个聪明钱地址</span>
                      </div>
                      <div className="signal-time">{timeAgo(s.capturedAt)} · {fmtTime(s.capturedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Scores + Holdings + Audit ── */}
        <div>
          {/* Signal Scores */}
          {watchEntry && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header">
                <span className="panel-title">🎯 信号评分</span>
                <span className="mono-num" style={{
                  fontWeight: 700, fontSize: 18,
                  color: scoreColor(watchEntry.totalScore),
                  textShadow: watchEntry.totalScore >= 60 ? `0 0 12px ${scoreColor(watchEntry.totalScore)}` : 'none'
                }}>
                  {watchEntry.totalScore?.toFixed(1)}
                </span>
              </div>
              <div style={{ padding: '0 16px 16px' }}>
                <ScoreBar label="SM" value={watchEntry.smScore || 0} color="#60a5fa" />
                <ScoreBar label="社交" value={watchEntry.socialScore || 0} color="#a78bfa" />
                <ScoreBar label="趋势" value={watchEntry.trendScore || 0} color="#f0b90b" />
                <ScoreBar label="流入" value={watchEntry.inflowScore || 0} color="#0ecb81" />
                {watchEntry.negativeScore > 0 && (
                  <div style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>
                    ⚠️ 负面扣分 -{watchEntry.negativeScore?.toFixed(1)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                  入场: {watchEntry.entryMode === 'volume_driven' ? '📊 量驱动' : '🐋 SM先行'} · {timeAgo(watchEntry.enteredAt)}{watchEntry.enteredAt ? ` · ${fmtTime(watchEntry.enteredAt)}` : ''} · {fmtTime(watchEntry.enteredAt)}
                </div>
              </div>
            </div>
          )}

          {/* Holdings / KOL / Pro */}
          {dynamics && (dynamics.kolHolders > 0 || dynamics.proHolders > 0 || dynamics.smartMoneyHolders > 0) && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header"><span className="panel-title">👥 持仓分布</span></div>
              <div style={{ padding: '0 16px 16px' }}>
                {[
                  { label: '🐋 KOL', count: dynamics.kolHolders, pct: dynamics.kolHoldingPercent },
                  { label: '💎 Pro', count: dynamics.proHolders, pct: dynamics.proHoldingPercent },
                  { label: '🧠 聪明钱', count: dynamics.smartMoneyHolders, pct: dynamics.smartMoneyHoldingPercent },
                ].filter(h => h.count > 0).map(h => (
                  <div key={h.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13 }}>{h.label}</span>
                    <div className="mono-num" style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{h.count}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>{h.pct?.toFixed(2)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meme Exclusive Details */}
          {memeRank && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header"><span className="panel-title">🏆 Meme Exclusive</span></div>
              <div style={{ padding: '0 16px 16px' }}>
                {[
                  { label: 'Pulse 评分', value: memeRank.score?.toFixed(2), color: '#a78bfa' },
                  { label: '排名', value: `#${memeRank.rank}` },
                  { label: '币安交易量 (总)', value: fmt(memeRank.volumeBnTotal) },
                  { label: '币安交易量 (7d)', value: fmt(memeRank.volumeBn7d) },
                  { label: '独立交易者', value: memeRank.uniqueTraderBn?.toLocaleString() },
                  { label: '曝光次数', value: memeRank.impression?.toLocaleString() },
                  { label: 'Alpha 状态', value: memeRank.alphaStatus === 1 ? '✅ 已上 Alpha' : '❌ 未上', color: memeRank.alphaStatus === 1 ? '#0ecb81' : '#f87171' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <span className="mono-num" style={{ fontWeight: 600, color: color || 'var(--text-primary)' }}>{value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit */}
          {audit && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header"><span className="panel-title">🛡️ 安全审计</span></div>
              <div style={{ padding: '0 16px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>风险等级</span>
                  <span style={{
                    fontWeight: 700, fontSize: 13,
                    color: audit.riskLevel === 'low' ? '#0ecb81' : audit.riskLevel === 'medium' ? '#f0b90b' : '#f87171',
                  }}>
                    {audit.riskLevel === 'low' ? '🟢 低风险' : audit.riskLevel === 'medium' ? '🟡 中等' : '🔴 高风险'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>买入税 <b>{audit.buyTax?.toFixed(1)}%</b></span>
                  <span style={{ color: 'var(--text-secondary)' }}>卖出税 <b>{audit.sellTax?.toFixed(1)}%</b></span>
                </div>
                {audit.riskItems && audit.riskItems.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {audit.riskItems.map((r: any, i: number) => (
                      <div key={i}>⚠️ {r.title || r}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No data hint */}
          {!watchEntry && !dynamics && !memeRank && !audit && (
            <div className="panel">
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                暂无详细数据<br />
                <span style={{ fontSize: 11 }}>代币需要被采集器覆盖后才会有更多数据</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
