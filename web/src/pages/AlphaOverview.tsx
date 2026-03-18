import { useEffect, useState, useMemo } from 'react'
import { fetchAlpha, fetchMatches } from '../api'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3456'

const PAGE_SIZE = 20

type ViewTab = 'alpha' | 'matches'

function fmt(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(2)}`
}

export default function AlphaOverview() {
  const [tab, setTab] = useState<ViewTab>('matches')
  const [alphaTokens, setAlphaTokens] = useState<any[]>([])
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    Promise.all([
      fetchAlpha().then(d => setAlphaTokens(d.tokens || [])),
      fetchMatches().then(d => setMatches(d.matches || [])),
    ]).then(() => setLoading(false))
  }, [])

  const filteredAlpha = useMemo(() => {
    if (!search) return alphaTokens
    const q = search.toLowerCase()
    return alphaTokens.filter(t => t.symbol?.toLowerCase().includes(q) || t.contractAddress?.toLowerCase().includes(q))
  }, [alphaTokens, search])

  const filteredMatches = useMemo(() => {
    if (!search) return matches
    const q = search.toLowerCase()
    return matches.filter(m => m.symbol?.toLowerCase().includes(q))
  }, [matches, search])

  const list = tab === 'alpha' ? filteredAlpha : filteredMatches
  const totalPages = Math.ceil(list.length / PAGE_SIZE)
  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleDismiss = async (id: number) => {
    await fetch(`${API_BASE}/api/matches/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'dismissed' }) })
    setMatches(prev => prev.map(m => m.id === id ? { ...m, status: 'dismissed' } : m))
  }

  if (loading) return <div className="loading"><div className="spinner" />加载中...</div>

  return (
    <>
      <header className="page-header">
        <h1>⚡ Alpha 总览 <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 400 }}>暂停开发</span></h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="text" placeholder="🔍 搜索..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, width: 160, outline: 'none' }} />
          <div className="panel-tabs">
            <button className={`panel-tab ${tab === 'matches' ? 'active' : ''}`} onClick={() => { setTab('matches'); setPage(1) }}>🔥 匹配 ({matches.length})</button>
            <button className={`panel-tab ${tab === 'alpha' ? 'active' : ''}`} onClick={() => { setTab('alpha'); setPage(1) }}>📋 列表 ({alphaTokens.length})</button>
          </div>
        </div>
      </header>

      {tab === 'matches' ? (
        <div className="panel">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-tertiary)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>代币</th>
              <th style={{ padding: '10px 8px', textAlign: 'right' }}>评分</th>
              <th style={{ padding: '10px 8px', textAlign: 'right' }}>市值</th>
              <th style={{ padding: '10px 8px', textAlign: 'right' }}>SM数</th>
              <th style={{ padding: '10px 8px', textAlign: 'center' }}>风险</th>
              <th style={{ padding: '10px 8px', textAlign: 'left' }}>匹配原因</th>
              <th style={{ padding: '10px 8px', textAlign: 'center' }}>操作</th>
            </tr></thead>
            <tbody>
              {paged.map((m: any) => {
                const reasons = (() => { try { return JSON.parse(m.reasons || '[]') } catch { return [] } })()
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.04))' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{m.symbol} <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{m.chainId === '56' ? 'BSC' : 'SOL'}</span></td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <span style={{ background: m.score >= 50 ? 'var(--green)' : m.score >= 30 ? 'var(--accent)' : 'var(--text-tertiary)', color: '#000', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 13 }}>{m.score}</span>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: 13 }}>{fmt(m.marketCap || 0)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: 13 }}>{m.smartMoneyCount || 0}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: m.riskLevel === 'LOW' ? 'rgba(14,203,129,0.2)' : m.riskLevel === 'HIGH' ? 'rgba(246,70,93,0.2)' : 'rgba(255,255,255,0.1)', color: m.riskLevel === 'LOW' ? 'var(--green)' : m.riskLevel === 'HIGH' ? 'var(--red)' : 'var(--text-tertiary)' }}>{m.riskLevel || '—'}</span>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: 11, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reasons.join(' · ')}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      {m.status !== 'dismissed' && <button onClick={() => handleDismiss(m.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>忽略</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {list.length === 0 && <div className="empty"><div className="empty-icon">🔥</div>暂无匹配结果</div>}
        </div>
      ) : (
        <div className="panel">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-tertiary)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>代币</th>
              <th style={{ padding: '10px 8px', textAlign: 'left' }}>链</th>
              <th style={{ padding: '10px 8px', textAlign: 'left' }}>合约</th>
              <th style={{ padding: '10px 8px', textAlign: 'center' }}>新发现</th>
              <th style={{ padding: '10px 8px', textAlign: 'center' }}>已匹配</th>
            </tr></thead>
            <tbody>
              {paged.map((t: any) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.04))' }}>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{t.symbol}</td>
                  <td style={{ padding: '12px 8px', fontSize: 12 }}>{t.chainId === '56' ? 'BSC' : 'SOL'}</td>
                  <td style={{ padding: '12px 8px', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{t.contractAddress?.slice(0, 10)}...</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{t.isNew ? '🆕' : '—'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{t.matched ? '✅' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 16 }}>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', opacity: page === 1 ? 0.3 : 1 }}>← 上一页</button>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', opacity: page === totalPages ? 0.3 : 1 }}>下一页 →</button>
        </div>
      )}
    </>
  )
}
