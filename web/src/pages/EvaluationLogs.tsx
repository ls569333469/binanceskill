import { useState, useEffect, useCallback } from 'react'
import { fetchEvaluationLogs, fetchEvaluationRuns } from '../api'

interface EvalLog {
  id: number
  runId: string
  tokenSymbol: string
  chainId: string
  contractAddress: string
  smScore: number
  socialScore: number
  trendScore: number
  inflowScore: number
  kolScore: number
  hypeScore: number
  negativeScore: number
  totalScore: number
  prevStatus: string
  newStatus: string
  detailsJson: string
  evaluatedAt: string
}

interface EvalRun {
  runId: string
  evaluatedAt: string
  totalEvaluated: number
  buySignals: number
  dismissed: number
  watching: number
}

const DIM_COLORS: Record<string, string> = {
  SM: '#3b82f6', Social: '#a78bfa', Trend: '#34d399',
  Inflow: '#fbbf24', KOL: '#f472b6', Hype: '#60a5fa'
}

function statusArrow(prev: string, next: string) {
  if (prev === next) return <span style={{ color: 'var(--text-tertiary)' }}>{next}</span>
  const color = next === 'buy_signal' ? 'var(--green)' : next === 'dismissed' ? '#f87171' : 'var(--text-secondary)'
  return <span style={{ color }}>{prev} <span style={{ color: 'var(--accent)' }}>{'>'}</span> <strong>{next}</strong></span>
}

function ScoreBar({ score, color, width = 60 }: { score: number; color: string; width?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, width }}>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, score))}%`, background: color, borderRadius: 3 }} />
      </div>
      <span className="mono-num" style={{ fontSize: 10, color, fontWeight: 600, minWidth: 20 }}>{score?.toFixed(0)}</span>
    </div>
  )
}

export default function EvaluationLogs() {
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [logs, setLogs] = useState<EvalLog[]>([])
  const [selectedRun, setSelectedRun] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [symbolSearch, setSymbolSearch] = useState<string>('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchEvaluationRuns(30).then(d => {
      setRuns(d.runs || [])
      if (d.runs?.length > 0 && !selectedRun) {
        setSelectedRun(d.runs[0].runId)
      }
    })
  }, [])

  const loadLogs = useCallback(async () => {
    if (!selectedRun && !symbolSearch) return
    setLoading(true)
    const d = await fetchEvaluationLogs(
      selectedRun || undefined,
      symbolSearch || undefined,
      statusFilter || undefined,
      200
    )
    setLogs(d.logs || [])
    setLoading(false)
  }, [selectedRun, statusFilter, symbolSearch])

  useEffect(() => { loadLogs() }, [loadLogs])

  const currentRun = runs.find(r => r.runId === selectedRun)

  const fmtTime = (ts: string) => {
    if (!ts) return '-'
    const d = new Date(ts + 'Z')
    return d.toLocaleString()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>📊 Evaluation Logs</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select
            value={selectedRun}
            onChange={e => setSelectedRun(e.target.value)}
            style={{ maxWidth: 320 }}
          >
            <option value="">All Runs</option>
            {runs.map(r => (
              <option key={r.runId} value={r.runId}>
                {fmtTime(r.evaluatedAt)} | {r.totalEvaluated} tokens | Buy:{r.buySignals} Dismiss:{r.dismissed}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="buy_signal">Buy Signal</option>
            <option value="dismissed">Dismissed</option>
            <option value="watching">Watching</option>
          </select>
          <input
            type="text"
            placeholder="Search symbol..."
            value={symbolSearch}
            onChange={e => setSymbolSearch(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, width: 140 }}
          />
        </div>
      </div>

      {/* Run Stats Cards */}
      {currentRun && (
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-label">Run Time</div>
            <div className="stat-value" style={{ fontSize: 14 }}>{fmtTime(currentRun.evaluatedAt)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tokens Evaluated</div>
            <div className="stat-value mono-num">{currentRun.totalEvaluated}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Buy Signals</div>
            <div className="stat-value mono-num" style={{ color: 'var(--green)' }}>{currentRun.buySignals}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Dismissed</div>
            <div className="stat-value mono-num">{currentRun.dismissed}</div>
          </div>
          <div className="stat-card gold">
            <div className="stat-label">Still Watching</div>
            <div className="stat-value mono-num">{currentRun.watching}</div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="panel data-table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Token</th>
              <th>Chain</th>
              <th>SM</th>
              <th>Social</th>
              <th>Trend</th>
              <th>Inflow</th>
              <th>KOL</th>
              <th>Hype</th>
              <th>Neg</th>
              <th>Total</th>
              <th>Status Change</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => {
              const isExpanded = expandedId === log.id
              const isBuy = log.newStatus === 'buy_signal'
              const isDismissed = log.newStatus === 'dismissed'
              return (
                <>
                <tr
                  key={log.id}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  style={{
                    cursor: 'pointer',
                    background: isBuy ? 'rgba(14,203,129,0.04)' : isDismissed ? 'rgba(239,68,68,0.03)' : undefined,
                  }}
                >
                  <td className="mono-num" style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{fmtTime(log.evaluatedAt)}</td>
                  <td style={{ fontWeight: 600 }}>{log.tokenSymbol}</td>
                  <td><span className={`chain-badge ${log.chainId === '56' ? 'chain-bsc' : 'chain-sol'}`}>{log.chainId === '56' ? 'BSC' : 'SOL'}</span></td>
                  <td><ScoreBar score={log.smScore} color={DIM_COLORS.SM} /></td>
                  <td><ScoreBar score={log.socialScore} color={DIM_COLORS.Social} /></td>
                  <td><ScoreBar score={log.trendScore} color={DIM_COLORS.Trend} /></td>
                  <td><ScoreBar score={log.inflowScore} color={DIM_COLORS.Inflow} /></td>
                  <td><ScoreBar score={log.kolScore} color={DIM_COLORS.KOL} /></td>
                  <td><ScoreBar score={log.hypeScore} color={DIM_COLORS.Hype} /></td>
                  <td className="mono-num" style={{ color: log.negativeScore < 0 ? '#f87171' : 'var(--text-tertiary)', fontWeight: 600 }}>{log.negativeScore?.toFixed(0)}</td>
                  <td>
                    <strong className="mono-num" style={{
                      color: log.totalScore >= 70 ? 'var(--green)' : log.totalScore >= 40 ? 'var(--accent)' : 'var(--text-tertiary)',
                      fontSize: 15
                    }}>{log.totalScore?.toFixed(1)}</strong>
                  </td>
                  <td style={{ fontSize: 12 }}>{statusArrow(log.prevStatus, log.newStatus)}</td>
                </tr>
                {isExpanded && (
                  <tr key={`d-${log.id}`}>
                    <td colSpan={12} style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '2px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Full Evaluation Details</div>
                      <pre style={{
                        fontSize: 11, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)',
                        padding: 16, borderRadius: 8, overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap',
                        fontFamily: 'var(--font-mono)'
                      }}>{(() => {
                        try { return JSON.stringify(JSON.parse(log.detailsJson), null, 2) }
                        catch { return log.detailsJson || 'No details' }
                      })()}</pre>
                    </td>
                  </tr>
                )}
                </>
              )
            })}
            {logs.length === 0 && !loading && (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                {runs.length === 0 ? 'No evaluation logs yet. Wait for the scheduler to run signal_evaluate.' : 'No logs match the current filters.'}
              </td></tr>
            )}
            {loading && (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Loading...</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
