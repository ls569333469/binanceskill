import { useState, useEffect, useCallback } from 'react'
import { fetchActivityFeed } from '../api'
import { Link } from 'react-router-dom'

interface FeedEvent {
  type: string
  time: string
  symbol: string
  chainId: string
  contractAddress: string
  title: string
  detail: string
  score?: number
  extra?: any
}

const TYPE_STYLES: Record<string, { bg: string; border: string; glow: string }> = {
  buy_signal:  { bg: 'rgba(14,203,129,0.08)', border: 'rgba(14,203,129,0.35)', glow: '0 0 20px rgba(14,203,129,0.15)' },
  entry:       { bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.3)', glow: 'none' },
  sm_buy:      { bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.25)', glow: 'none' },
  sm_sell:     { bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.25)', glow: 'none' },
  dismissed:   { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.08)', glow: 'none' },
  evaluate:    { bg: 'rgba(167,139,250,0.05)', border: 'rgba(167,139,250,0.2)', glow: 'none' },
  trade_open:  { bg: 'rgba(14,203,129,0.06)', border: 'rgba(14,203,129,0.25)', glow: 'none' },
  trade_close: { bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.25)', glow: 'none' },
}

const DIM_COLORS: Record<string, string> = {
  SM: '#3b82f6', '社交': '#a78bfa', '趋势': '#34d399',
  '流入': '#fbbf24', KOL: '#f472b6', '热度': '#60a5fa'
}

function ScoreMini({ extra }: { extra: any }) {
  if (!extra?.smScore && extra?.smScore !== 0) return null
  const dims = [
    { k: 'SM', v: extra.smScore },
    { k: '社交', v: extra.socialScore },
    { k: '趋势', v: extra.trendScore },
    { k: '流入', v: extra.inflowScore },
    { k: 'KOL', v: extra.kolScore },
    { k: '热度', v: extra.hypeScore },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {dims.map(d => (
        <div key={d.k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{d.k}</span>
          <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, d.v || 0)}%`, background: DIM_COLORS[d.k], borderRadius: 2 }} />
          </div>
          <span className="mono-num" style={{ fontSize: 10, color: DIM_COLORS[d.k], fontWeight: 600 }}>{d.v?.toFixed(0)}</span>
        </div>
      ))}
      {extra.negativeScore < 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 10, color: '#f87171' }}>扣分</span>
          <span className="mono-num" style={{ fontSize: 10, color: '#f87171', fontWeight: 600 }}>{extra.negativeScore?.toFixed(0)}</span>
        </div>
      )}
    </div>
  )
}

function fmtTime(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts + (ts.includes('Z') || ts.includes('+') ? '' : 'Z'))
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function timeAgo(ts: string): string {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts + (ts.includes('Z') || ts.includes('+') ? '' : 'Z')).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}

interface ActivityFeedProps {
  compact?: boolean
  maxItems?: number
  hours?: number
  symbolFilter?: string
  title?: string
  showFilters?: boolean
  autoRefresh?: boolean
}

export default function ActivityFeed({
  compact = false,
  maxItems = 100,
  hours = 48,
  symbolFilter,
  title = '📡 信号活动流',
  showFilters = true,
  autoRefresh = true,
}: ActivityFeedProps) {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [search, setSearch] = useState(symbolFilter || '')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const load = useCallback(async () => {
    const d = await fetchActivityFeed(maxItems, hours, search || undefined)
    setEvents(d.events || [])
    setLoading(false)
  }, [maxItems, hours, search])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [load, autoRefresh])

  const filtered = typeFilter === 'all' ? events : events.filter(e => e.type === typeFilter)

  const typeCounts: Record<string, number> = {}
  for (const e of events) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1
  }

  const filterBtns = [
    { key: 'all', label: '全部', icon: '📡' },
    { key: 'buy_signal', label: '买入信号', icon: '🟢' },
    { key: 'entry', label: '入选', icon: '🔍' },
    { key: 'sm_buy', label: 'SM买入', icon: '💰' },
    { key: 'sm_sell', label: 'SM卖出', icon: '🔴' },
    { key: 'evaluate', label: '评估', icon: '📊' },
    { key: 'dismissed', label: '移出', icon: '⚪' },
    { key: 'trade_open', label: '开仓', icon: '🚀' },
    { key: 'trade_close', label: '平仓', icon: '💹' },
  ]

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>加载活动流...</div>

  return (
    <div>
      {/* Header */}
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          {showFilters && (
            <input
              type="text" placeholder="🔍 搜索代币..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, width: 160 }}
            />
          )}
        </div>
      )}

      {/* Type filters */}
      {showFilters && !compact && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {filterBtns.map(f => {
            const cnt = f.key === 'all' ? events.length : (typeCounts[f.key] || 0)
            if (f.key !== 'all' && cnt === 0) return null
            return (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key)}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: typeFilter === f.key ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)',
                  border: typeFilter === f.key ? '1px solid var(--accent)' : '1px solid var(--border)',
                  color: typeFilter === f.key ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {f.icon} {f.label} {cnt > 0 && <span style={{ opacity: 0.6 }}>({cnt})</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Event stream */}
      <div style={{ position: 'relative', paddingLeft: compact ? 0 : 24 }}>
        {/* Timeline line */}
        {!compact && <div style={{ position: 'absolute', left: 9, top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.06)' }} />}

        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            暂无活动记录 — 等待信号系统运行
          </div>
        )}

        {filtered.map((ev, idx) => {
          const style = TYPE_STYLES[ev.type] || TYPE_STYLES['evaluate']
          const isExpanded = expandedIdx === idx
          const hasScores = ev.extra?.smScore !== undefined

          return (
            <div
              key={`${ev.type}-${ev.time}-${ev.symbol}-${idx}`}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              style={{
                position: 'relative',
                padding: compact ? '10px 14px' : '14px 18px',
                marginBottom: compact ? 6 : 10,
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: 12,
                cursor: hasScores ? 'pointer' : 'default',
                boxShadow: style.glow,
                transition: 'all 0.2s ease',
              }}
            >
              {/* Timeline dot */}
              {!compact && (
                <div style={{
                  position: 'absolute', left: -24, top: 18,
                  width: 10, height: 10, borderRadius: '50%',
                  background: style.border.replace(/[\d.]+\)$/, '1)'),
                  border: '2px solid var(--bg-primary)',
                  boxShadow: ev.type === 'buy_signal' ? '0 0 8px rgba(14,203,129,0.5)' : 'none',
                }} />
              )}

              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: compact ? 13 : 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link
                      to={`/token/${ev.chainId}/${ev.contractAddress}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                      onClick={e => e.stopPropagation()}
                    >
                      {ev.title}
                    </Link>
                    <span className={`chain-badge ${ev.chainId === '56' ? 'chain-bsc' : 'chain-sol'}`} style={{ fontSize: 10 }}>
                      {ev.chainId === '56' ? 'BSC' : 'SOL'}
                    </span>
                    {ev.score !== undefined && ev.score > 0 && ev.type !== 'sm_buy' && ev.type !== 'sm_sell' && (
                      <span className="mono-num" style={{
                        fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                        background: ev.score >= 70 ? 'rgba(14,203,129,0.15)' : ev.score >= 40 ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)',
                        color: ev.score >= 70 ? 'var(--green)' : ev.score >= 40 ? '#fbbf24' : 'var(--text-tertiary)',
                      }}>
                        {ev.score?.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: compact ? 11 : 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ev.detail}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                  <div>{fmtTime(ev.time)}</div>
                  <div style={{ fontSize: 10 }}>{timeAgo(ev.time)}</div>
                </div>
              </div>

              {/* Expanded scores */}
              {isExpanded && hasScores && <ScoreMini extra={ev.extra} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
