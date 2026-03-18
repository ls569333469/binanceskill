import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchWatchlist, scanWatchlist, evaluateWatchlist, updateWatchlistStatus, fetchActivityFeed, fetchTokenDetail, runAllCollectors, fetchEvaluationLogs } from '../api'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3456';

/* ── Types ── */
interface WatchItem {
  id: number; symbol: string; chainId: string; contractAddress: string
  entryMode: string; entryReason: string; entryVolume: number; entryPrice: number; enteredAt: string
  smScore: number; socialScore: number; trendScore: number; inflowScore: number
  negativeScore: number; totalScore: number; status: string; expiresAt: string
  scoreUpdatedAt: string; signalDetailsJson: string; kolScore: number; hypeScore: number
  launchTime: number | null
}
interface WatchStats { total: number; watching: number; buySignal: number; bought: number; dismissed: number; volumeDriven: number; smDriven: number }
interface EvalLog { id: number; runId: string; tokenSymbol: string; smScore: number; socialScore: number; trendScore: number; inflowScore: number; kolScore: number; hypeScore: number; negativeScore: number; totalScore: number; prevStatus: string; newStatus: string; detailsJson: string; evaluatedAt: string }

/* ── Helpers ── */
function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  if (n < 0.0001 && n > 0) return `$${n.toFixed(8)}`
  return `$${n.toFixed(4)}`
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function timeAgo(ts: string): string {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts + 'Z').getTime()
  if (diff < 0 || isNaN(diff)) return '—'
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}

function tokenAge(launchTime: number | null, enteredAt: string): string {
  let refTime: number
  if (launchTime && launchTime > 1000000000 && launchTime < 2000000000) {
    refTime = launchTime * 1000
  } else if (launchTime && launchTime > 1000000000000) {
    refTime = launchTime
  } else if (enteredAt) {
    refTime = new Date(enteredAt + 'Z').getTime()
  } else {
    return '—'
  }
  const diff = Date.now() - refTime
  if (diff < 0 || isNaN(diff)) return '—'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}分钟`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}小时`
  return `${Math.floor(hrs / 24)}天`
}

/* ── ScoreBar ── */
function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const p = Math.min(100, Math.max(0, (value / max) * 100))
  const c = value >= 60 ? '#0ecb81' : value >= 30 ? '#f0b90b' : 'rgba(255,255,255,0.15)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', width: 28, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <span className="mono-num" style={{ fontSize: 11, width: 24, textAlign: 'right', color: value > 0 ? '#f0b90b' : 'rgba(255,255,255,0.25)' }}>{value.toFixed(0)}</span>
    </div>
  )
}

/* ── Main Component ── */
export default function Watchlist() {
  const [items, setItems] = useState<WatchItem[]>([])
  const [stats, setStats] = useState<WatchStats | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [toast, setToast] = useState('')
  const [signalEvents, setSignalEvents] = useState<EvalLog[]>([])
  const prevEventIdRef = useRef(-1)
  const [showSignals, setShowSignals] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [tokenEvents, setTokenEvents] = useState<any[]>([])
  const [tokenDetail, setTokenDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [evalLogs, setEvalLogs] = useState<EvalLog[]>([])
  const [detailTab, setDetailTab] = useState<'scores' | 'evalLog' | 'milestones'>('scores')
  const [showHistory, setShowHistory] = useState(false)
  const [milestones, setMilestones] = useState<any[]>([])

  // Pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineStep, setPipelineStep] = useState('')
  const [lastPipelineTime, setLastPipelineTime] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(60)
  const pipelineTimerRef = useRef<any>(null)
  const countdownRef = useRef<any>(null)

  // Draggable split
  const [leftPct, setLeftPct] = useState(40)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onMouseDown = () => { dragging.current = true }
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setLeftPct(Math.max(25, Math.min(65, pct)))
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const playSound = () => {
    try { const a = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg'); a.volume = 0.5; a.play().catch(() => { }) } catch (_) { }
  }
  const sendNotif = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
  }

  const load = useCallback(async () => {
    const data = await fetchWatchlist(statusFilter || undefined)
    setItems(data.items || [])
    setStats(data.stats || null)
    if (!selectedId && data.items?.length) setSelectedId(data.items[0].id)

    // 实时信号事件: 从 evaluation_logs 拉取 buy_signal 事件
    try {
      const evtData = await fetchEvaluationLogs(undefined, undefined, undefined, 50)
      const buyEvents = (evtData.logs || []).filter((e: EvalLog) => e.newStatus === 'buy_signal')
      setSignalEvents(buyEvents)

      // 新事件通知: 检测最新事件ID是否变化
      if (buyEvents.length > 0 && prevEventIdRef.current >= 0 && buyEvents[0].id > prevEventIdRef.current) {
        const newest = buyEvents[0]
        playSound()
        setToast(`🟢 ${newest.tokenSymbol} 触发买入信号！(${newest.totalScore.toFixed(1)}分)`)
        setTimeout(() => setToast(''), 6000)
        sendNotif('🟢 买入信号', `${newest.tokenSymbol} 总分 ${newest.totalScore.toFixed(1)}`)
      }
      if (buyEvents.length > 0) prevEventIdRef.current = buyEvents[0].id
    } catch (e) { /* evaluation logs fetch failed, non-critical */ }
  }, [statusFilter, selectedId])

  // ★ P7: Full Pipeline (Sync → Scan → Evaluate → Refresh) ★
  const handleFullPipeline = useCallback(async () => {
    if (pipelineRunning) return
    setPipelineRunning(true)
    try {
      // Step 1: 同步采集器 (可选，超时不阻塞)
      setPipelineStep('🔄 同步采集器...')
      try {
        await Promise.race([
          runAllCollectors(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000))
        ])
      } catch (e: any) {
        console.warn('Collector sync skipped:', e.message)
      }

      // Step 2: 扫描
      setPipelineStep('🔍 扫描新代币...')
      try { await scanWatchlist() } catch (e) { console.warn('Scan error:', e) }

      // Step 3: 评估
      setPipelineStep('📊 6维评估...')
      try { await evaluateWatchlist() } catch (e) { console.warn('Evaluate error:', e) }

      // Step 4: 刷新数据
      setPipelineStep('✅ 刷新数据...')
      await load()
      setLastPipelineTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setPipelineStep('')
    } catch (e: any) {
      setPipelineStep(`❌ 错误: ${e.message}`)
      setTimeout(() => setPipelineStep(''), 3000)
    } finally {
      setPipelineRunning(false)
      setCountdown(60)
    }
  }, [pipelineRunning, load])

  // Load token detail + events + eval logs when selection changes
  useEffect(() => {
    if (!selectedId) { setTokenDetail(null); setTokenEvents([]); setEvalLogs([]); return }
    const sel = items.find(i => i.id === selectedId)
    if (!sel) return
    fetchActivityFeed(50, 168, sel.symbol).then(d => setTokenEvents(d.events || []))
    setDetailLoading(true)
    fetchTokenDetail(sel.chainId, sel.contractAddress)
      .then(d => setTokenDetail(d))
      .catch(() => setTokenDetail(null))
      .finally(() => setDetailLoading(false))
    // Load evaluation logs for this token
    fetchEvaluationLogs(undefined, sel.symbol).then(d => setEvalLogs(d.logs || d || []))
    // Load milestones for this token
    fetch(`${API_BASE}/api/milestones/${sel.id}`).then(r => r.json()).then(d => setMilestones(d.milestones || [])).catch(() => setMilestones([]))
  }, [selectedId, items])

  // ★ 关键修复：页面加载时先直接load数据，再启动Pipeline循环 ★
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    // 先加载现有数据（立即显示）
    load()
    // 5秒后启动第一次Pipeline（给页面先渲染的时间）
    const firstRun = setTimeout(() => handleFullPipeline(), 5000)
    // 之后每60秒循环
    pipelineTimerRef.current = setInterval(() => { handleFullPipeline() }, 60000)
    countdownRef.current = setInterval(() => { setCountdown(c => Math.max(0, c - 1)) }, 1000)
    return () => {
      clearTimeout(firstRun)
      if (pipelineTimerRef.current) clearInterval(pipelineTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, []) // eslint-disable-line

  const handleScan = async () => { setLoading(true); const r = await scanWatchlist(); setActionMsg(`✅ 扫描完成 — 新增 ${r.added || 0}`); setLoading(false); load() }
  const handleEvaluate = async () => { setLoading(true); const r = await evaluateWatchlist(); setActionMsg(`✅ 评估完成 — ${r.evaluated || 0} 已评分`); setLoading(false); load() }
  const handleSyncAll = async () => { setLoading(true); setActionMsg('⏳ 正在同步所有采集器...'); await runAllCollectors(); setActionMsg('✅ 采集器同步完成'); setLoading(false); load() }
  const handleDismiss = async (id: number) => { await updateWatchlistStatus(id, 'dismissed'); load() }

  // Categorize items
  const buySignalItems = items.filter(i => i.status === 'buy_signal').sort((a, b) => b.totalScore - a.totalScore)
  const watchingItems = items.filter(i => i.status === 'watching').sort((a, b) => b.totalScore - a.totalScore)
  const historyItems = items.filter(i => i.status === 'dismissed' || i.status === 'bought').sort((a, b) => b.totalScore - a.totalScore)

  const selected = items.find(i => i.id === selectedId) || null
  const details = selected?.signalDetailsJson ? JSON.parse(selected.signalDetailsJson) : {}
  const threshold = details.buyThreshold || 60
  const progress = selected ? Math.min(100, (selected.totalScore / threshold) * 100) : 0

  const statusIcon = (s: string) => s === 'buy_signal' ? '🟢' : s === 'bought' ? '🟢' : s === 'watching' ? '🟡' : '⚪'
  const statusText = (s: string) => s === 'buy_signal' ? '买入信号' : s === 'watching' ? '观察中' : s === 'bought' ? '已买入' : '已移出'

  const td = tokenDetail || {}
  const dynamics = td.dynamics || td.snapshot || {}
  const memeRank = td.memeRank
  const smSignals = td.smSignals || []

  // Render a token row
  const renderRow = (item: WatchItem, idx: number) => {
    const det = item.signalDetailsJson ? JSON.parse(item.signalDetailsJson) : {}
    const thr = det.buyThreshold || 60
    const prog = Math.min(100, (item.totalScore / thr) * 100)
    return (
      <div key={item.id} onClick={() => setSelectedId(item.id)}
        style={{
          padding: '10px 14px', cursor: 'pointer',
          borderLeft: selectedId === item.id ? '3px solid #f0b90b' : '3px solid transparent',
          background: selectedId === item.id ? 'rgba(240,185,11,0.06)' : 'transparent',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          transition: 'all 0.15s ease',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', width: 18 }}>{idx + 1}</span>
            <span style={{ fontSize: 11 }}>{statusIcon(item.status)}</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{item.symbol}</span>
            <span style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 3,
              background: item.chainId === '56' ? 'rgba(240,185,11,0.15)' : 'rgba(14,203,129,0.15)',
              color: item.chainId === '56' ? '#f0b90b' : '#0ecb81'
            }}>
              {item.chainId === '56' ? 'BSC' : 'SOL'}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{tokenAge(item.launchTime, item.enteredAt)}</span>
          </div>
          <span className="mono-num" style={{ fontSize: 15, fontWeight: 700, color: item.status === 'buy_signal' ? '#0ecb81' : '#f0b90b' }}>
            {item.totalScore.toFixed(1)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginLeft: 26 }}>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', maxWidth: 180 }}>
            <div style={{ width: `${prog}%`, height: '100%', background: prog >= 100 ? '#0ecb81' : '#f0b90b', borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{prog.toFixed(0)}%</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{statusText(item.status)} · {item.entryMode === 'sm_driven' ? 'SM先行' : '交易量'}</span>
          {item.entryPrice > 0 && <span className="mono-num" style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{fmt(item.entryPrice)}</span>}
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="page-header">
        <h1>📋 观察列表</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Pipeline status */}
          <div style={{ fontSize: 11, color: pipelineRunning ? '#f0b90b' : 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            {pipelineRunning ? (
              <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span> {pipelineStep}</>
            ) : (
              <>✅ {lastPipelineTime || '—'} <span className="mono-num" style={{ color: 'rgba(255,255,255,0.25)' }}>下次 {countdown}s</span></>
            )}
          </div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(14,203,129,0.2)}50%{box-shadow:0 0 16px 4px rgba(14,203,129,0.1)}}`}</style>
          <button className="btn-action" onClick={() => handleFullPipeline()} disabled={pipelineRunning}
            title="立即执行完整Pipeline: 同步→扫描→评估→刷新">🚀 Pipeline</button>
          <button className="btn-action" onClick={handleSyncAll} disabled={loading}
            title="同步数据：重新运行所有采集器">🔄 同步</button>
          <button className="btn-action" onClick={handleScan} disabled={loading}
            title="扫描入选：从信号中心筛选代币加入观察列表">🔍 扫描</button>
          <button className="btn-action gold" onClick={handleEvaluate} disabled={loading}
            title="评估评分：对观察中的代币进行6维评分">📊 评估</button>
        </div>
      </header>

      {toast && <div style={{ position: 'fixed', bottom: 30, right: 30, zIndex: 9999, background: '#0ecb81', color: '#fff', padding: '14px 22px', borderRadius: 12, fontWeight: 700, fontSize: 15, boxShadow: '0 8px 32px rgba(14,203,129,0.3)' }}>{toast}</div>}
      {actionMsg && <div style={{ marginBottom: 8, padding: '8px 14px', color: '#0ecb81', fontSize: 13 }}>{actionMsg}</div>}

      {/* 统计卡片 — 4格 */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>📦 总量</div>
            <div className="mono-num" style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{stats.total}</div>
          </div>
          <div style={{ background: 'rgba(240,185,11,0.05)', border: '1px solid rgba(240,185,11,0.2)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(240,185,11,0.7)', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>🟡 观察中</div>
            <div className="mono-num" style={{ fontSize: 22, fontWeight: 700, color: '#f0b90b' }}>{stats.watching}</div>
          </div>
          <div style={{ background: (stats.bought || 0) > 0 ? 'rgba(14,203,129,0.06)' : 'rgba(14,203,129,0.02)', border: `1px solid ${(stats.bought || 0) > 0 ? 'rgba(14,203,129,0.3)' : 'rgba(14,203,129,0.1)'}`, borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: (stats.bought || 0) > 0 ? '#0ecb81' : 'rgba(14,203,129,0.4)', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>💰 已买入</div>
            <div className="mono-num" style={{ fontSize: 22, fontWeight: 700, color: (stats.bought || 0) > 0 ? '#0ecb81' : 'rgba(14,203,129,0.3)' }}>{stats.bought || 0}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>⚪ 已移出</div>
            <div className="mono-num" style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.35)' }}>{stats.dismissed}</div>
          </div>
        </div>
      )}

      {/* ── 可拖拽二栏布局 ── */}
      <div ref={containerRef} style={{ display: 'flex', minHeight: 'calc(100vh - 180px)', gap: 0, userSelect: dragging.current ? 'none' : 'auto', alignItems: 'flex-start' }}>

        {/* ═══ 左栏：买入信号 → 实时信号 → 历史 ═══ */}
        <div className="panel" style={{ width: `${leftPct}%`, flexShrink: 0, overflow: 'auto', maxHeight: 'calc(100vh - 180px)', padding: 0 }}>

          {/* 🟢 买入信号区 */}
          {buySignalItems.length > 0 && (
            <div style={{ borderBottom: '2px solid rgba(14,203,129,0.2)' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(14,203,129,0.06)', fontSize: 14, fontWeight: 700, color: '#0ecb81', display: 'flex', alignItems: 'center', gap: 6 }}>
                🟢 买入信号 ({buySignalItems.length})
              </div>
              {buySignalItems.map((item, idx) => renderRow(item, idx))}
            </div>
          )}

          {/* 🔔 实时信号事件 */}
          <div style={{ borderBottom: '2px solid rgba(14,203,129,0.15)' }}>
            <div onClick={() => setShowSignals(!showSignals)} style={{
              padding: '10px 14px', cursor: 'pointer',
              background: 'rgba(14,203,129,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🔔</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0ecb81' }}>实时信号</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>({signalEvents.length})</span>
              </div>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{showSignals ? '▼' : '▶'}</span>
            </div>
            {showSignals && (
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                {signalEvents.length === 0 ? (
                  <div style={{ padding: '14px', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>暂无新信号</div>
                ) : signalEvents.slice(0, 20).map(evt => {
                  const t = new Date(evt.evaluatedAt + 'Z')
                  const hm = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`
                  return (
                    <div key={evt.id} style={{
                      padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background 0.15s',
                    }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(14,203,129,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ fontSize: 12 }}>🟢</span>
                      <span className="mono-num" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', width: 42 }}>{hm}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', flex: 1 }}>{evt.tokenSymbol}</span>
                      <span style={{ fontSize: 12, color: 'rgba(14,203,129,0.7)' }}>触发买入</span>
                      <span className="mono-num" style={{ fontSize: 14, fontWeight: 700, color: '#0ecb81' }}>{evt.totalScore.toFixed(1)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 🟡 观察中区 */}
          {watchingItems.length > 0 && (
            <div style={{ borderBottom: '2px solid rgba(240,185,11,0.15)' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(240,185,11,0.04)', fontSize: 14, fontWeight: 700, color: '#f0b90b', display: 'flex', alignItems: 'center', gap: 6 }}>
                🟡 观察中 ({watchingItems.length})
              </div>
              {watchingItems.map((item, idx) => renderRow(item, idx))}
            </div>
          )}

          {/* 📜 历史区（折叠） */}
          {historyItems.length > 0 && (
            <div>
              <div onClick={() => setShowHistory(!showHistory)} style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {showHistory ? '▼' : '▶'} 📜 历史 ({historyItems.length})
              </div>
              {showHistory && historyItems.slice(0, 50).map((item, idx) => renderRow(item, idx))}
            </div>
          )}

          {items.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}><div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>列表为空 — 点击"Pipeline"启动</div>}
        </div>

        {/* ═══ 拖拽分割线 ═══ */}
        <div onMouseDown={onMouseDown} style={{
          width: 6, cursor: 'col-resize', flexShrink: 0,
          background: dragging.current ? 'rgba(240,185,11,0.3)' : 'rgba(255,255,255,0.04)',
          transition: 'background 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 2, height: 40, background: 'rgba(255,255,255,0.15)', borderRadius: 1 }} />
        </div>

        {/* ═══ 右栏：融合详情面板 ═══ */}
        <div style={{ flex: 1, overflow: 'auto', maxHeight: 'calc(100vh - 210px)', display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 12 }}>
          {selected ? (
            <>
              {/* 标题 + 总分 */}
              <div className="panel" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{selected.symbol}</span>
                      <span style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 4,
                        background: selected.chainId === '56' ? 'rgba(240,185,11,0.15)' : 'rgba(14,203,129,0.15)',
                        color: selected.chainId === '56' ? '#f0b90b' : '#0ecb81'
                      }}>
                        {selected.chainId === '56' ? 'BSC' : 'SOL'}
                      </span>
                      <span style={{
                        fontSize: 11, padding: '2px 7px', borderRadius: 4,
                        background: selected.status === 'buy_signal' ? 'rgba(14,203,129,0.15)' : selected.status === 'watching' ? 'rgba(240,185,11,0.1)' : 'rgba(255,255,255,0.05)',
                        color: selected.status === 'buy_signal' ? '#0ecb81' : selected.status === 'watching' ? '#f0b90b' : 'rgba(255,255,255,0.4)',
                      }}>{statusIcon(selected.status)} {statusText(selected.status)}</span>
                      {details.hasDynamics && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(14,203,129,0.1)', color: '#0ecb81' }}>Dynamic ✓</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      币龄 {tokenAge(selected.launchTime, selected.enteredAt)} · {selected.entryMode === 'sm_driven' ? 'SM先行' : '交易量驱动'} · 入选 {timeAgo(selected.enteredAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono-num" style={{ fontSize: 28, fontWeight: 700, color: selected.status === 'buy_signal' ? '#0ecb81' : '#f0b90b' }}>{selected.totalScore.toFixed(1)}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>阈值 {threshold}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', borderRadius: 3, background: progress >= 100 ? '#0ecb81' : '#f0b90b', transition: 'width 0.4s' }} />
                </div>
                <div style={{ marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>{progress.toFixed(0)}% → 买入</div>
              </div>

              {/* 市场数据 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {[
                  { label: '价格', value: dynamics.price ? (dynamics.price < 0.01 ? `$${dynamics.price.toFixed(8)}` : fmt(dynamics.price)) : '—', sub: dynamics.percentChange1h != null ? pct(dynamics.percentChange1h) + ' (1h)' : '', up: (dynamics.percentChange1h || 0) >= 0 },
                  { label: '市值', value: fmt(dynamics.marketCap), sub: `FDV ${fmt(dynamics.fdv)}`, up: true },
                  { label: '流动性', value: fmt(dynamics.liquidity), sub: '', up: true },
                  { label: '持有者', value: (dynamics.holders || 0).toLocaleString(), sub: `KYC ${(dynamics.kycHolderCount || dynamics.kycHolders || 0).toLocaleString()}`, up: true },
                  { label: 'Pulse', value: memeRank ? memeRank.score?.toFixed(1) : '—', sub: memeRank ? `#${memeRank.rank}` : '', up: true },
                ].map((s, i) => (
                  <div key={i} className="panel" style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
                    <div className="mono-num" style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{detailLoading ? '...' : s.value}</div>
                    {s.sub && <div className="mono-num" style={{ fontSize: 10, color: s.up ? 'rgba(255,255,255,0.35)' : '#f6465d', marginTop: 2 }}>{s.sub}</div>}
                  </div>
                ))}
              </div>


              {/* ── 6维评分 + 入场信息 并排 ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="panel" style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>📊 6维评分</div>
                  <ScoreBar label="SM" value={selected.smScore} />
                  <ScoreBar label="社交" value={selected.socialScore} />
                  <ScoreBar label="趋势" value={selected.trendScore} />
                  <ScoreBar label="流入" value={selected.inflowScore} />
                  <ScoreBar label="KOL" value={selected.kolScore} />
                  <ScoreBar label="热度" value={selected.hypeScore} />
                  {details.sm && (
                    <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
                      {details.sm.dynSmHolders != null && <div>SM持仓: {details.sm.dynSmHolders}人</div>}
                      {details.kol?.kolHolders != null && <div>KOL: {details.kol.kolHolders} Pro: {details.kol.proHolders}</div>}
                      {details.trend?.dynPct1h != null && <div>1h涨幅: {pct(details.trend.dynPct1h)} 5m: {pct(details.trend.dynPct5m)}</div>}
                      {details.inflow?.dynVol5m != null && <div>5m量: {fmt(details.inflow.dynVol5m)} 1h: {fmt(details.inflow.dynVol1h)}</div>}
                      {details.inflow?.buyRatio != null && <div>买方比: {(details.inflow.buyRatio * 100).toFixed(1)}%</div>}
                    </div>
                  )}
                </div>
                <div className="panel" style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>📋 入场信息</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '5px 10px', fontSize: 12 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>因子</span>
                    <span style={{ color: '#fff' }}>{selected.entryReason || '—'}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>价格</span>
                    <span className="mono-num" style={{ color: '#f0b90b' }}>{selected.entryPrice > 0 ? fmt(selected.entryPrice) : '—'}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>入场量</span>
                    <span className="mono-num" style={{ color: '#fff' }}>{selected.entryVolume > 0 ? fmt(selected.entryVolume) : '—'}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>合约</span>
                    <span className="mono-num" style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{selected.contractAddress.slice(0, 8)}...{selected.contractAddress.slice(-6)}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>评分</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>{timeAgo(selected.scoreUpdatedAt)}</span>
                  </div>
                  {selected.status === 'watching' && (
                    <button onClick={() => handleDismiss(selected.id)}
                      style={{ marginTop: 10, fontSize: 11, padding: '4px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                      移出观察
                    </button>
                  )}
                </div>
              </div>

              {/* ── 评估日志 ── */}
              <div className="panel" style={{ padding: 14, maxHeight: 300, overflow: 'auto' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>📝 评估日志 ({evalLogs.length})</div>
                {evalLogs.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding: '4px 6px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>时间</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>SM</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>社交</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>趋势</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>流入</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>KOL</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>热度</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>总分</th>
                        <th style={{ padding: '4px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalLogs.slice(0, 30).map((log, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '4px 6px', color: 'rgba(255,255,255,0.35)' }}>{timeAgo(log.evaluatedAt)}</td>
                          <td className="mono-num" style={{ padding: '4px 4px', textAlign: 'center', color: log.smScore > 0 ? '#f0b90b' : 'rgba(255,255,255,0.2)' }}>{log.smScore}</td>
                          <td className="mono-num" style={{ padding: '4px 4px', textAlign: 'center', color: log.socialScore > 0 ? '#f0b90b' : 'rgba(255,255,255,0.2)' }}>{log.socialScore}</td>
                          <td className="mono-num" style={{ padding: '4px 4px', textAlign: 'center', color: log.trendScore > 0 ? '#f0b90b' : 'rgba(255,255,255,0.2)' }}>{log.trendScore}</td>
                          <td className="mono-num" style={{ padding: '4px 4px', textAlign: 'center', color: log.inflowScore > 0 ? '#f0b90b' : 'rgba(255,255,255,0.2)' }}>{log.inflowScore}</td>
                          <td className="mono-num" style={{ padding: '4px 4px', textAlign: 'center', color: log.kolScore > 0 ? '#f0b90b' : 'rgba(255,255,255,0.2)' }}>{log.kolScore}</td>
                          <td className="mono-num" style={{ padding: '4px 4px', textAlign: 'center', color: log.hypeScore > 0 ? '#f0b90b' : 'rgba(255,255,255,0.2)' }}>{log.hypeScore}</td>
                          <td className="mono-num" style={{ padding: '4px 4px', textAlign: 'center', fontWeight: 700, color: log.totalScore >= threshold ? '#0ecb81' : '#f0b90b' }}>{log.totalScore.toFixed(1)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            {log.newStatus !== log.prevStatus ? (
                              <span style={{ fontSize: 10, color: log.newStatus === 'buy_signal' ? '#0ecb81' : log.newStatus === 'dismissed' ? '#f6465d' : '#f0b90b' }}>
                                {log.prevStatus} → {log.newStatus}
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 12, textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>暂无评估记录</div>
                )}
              </div>

              {/* ── 催化进程 ── */}
              <div className="panel" style={{ padding: 14, maxHeight: 300, overflow: 'auto' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>🚀 催化进程</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 12, padding: '4px 0' }}>
                  {['100K', '200K', '500K', '1M', '2M', '5M', '10M', '20M'].map((label, i) => {
                    const reached = milestones.find((m: any) => m.milestoneLabel === label);
                    return (
                      <div key={label} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 7, fontWeight: 700, flexShrink: 0,
                          background: reached ? 'linear-gradient(135deg, #f0b90b, #e8a500)' : 'rgba(255,255,255,0.06)',
                          color: reached ? '#000' : 'rgba(255,255,255,0.25)',
                          boxShadow: reached ? '0 0 8px rgba(240,185,11,0.3)' : 'none',
                        }}>{label}</div>
                        {i < 7 && <div style={{ flex: 1, height: 2, background: reached ? '#f0b90b' : 'rgba(255,255,255,0.06)' }} />}
                      </div>
                    );
                  })}
                </div>
                {milestones.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding: '3px 6px', textAlign: 'left', color: 'rgba(255,255,255,0.4)' }}>里程碑</th>
                        <th style={{ padding: '3px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>市值</th>
                        <th style={{ padding: '3px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>SM</th>
                        <th style={{ padding: '3px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>社交</th>
                        <th style={{ padding: '3px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>趋势</th>
                        <th style={{ padding: '3px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>流入</th>
                        <th style={{ padding: '3px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>KOL</th>
                        <th style={{ padding: '3px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>总分</th>
                        <th style={{ padding: '3px 4px', textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map((m: any) => (
                        <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '4px 6px', fontWeight: 700, color: '#f0b90b' }}>{m.milestoneLabel}</td>
                          <td className="mono-num" style={{ textAlign: 'center', color: '#fff' }}>{fmt(m.actualMcap)}</td>
                          <td className="mono-num" style={{ textAlign: 'center', color: m.smScore > 50 ? '#0ecb81' : 'rgba(255,255,255,0.5)' }}>{m.smScore?.toFixed(0)}</td>
                          <td className="mono-num" style={{ textAlign: 'center', color: m.socialScore > 50 ? '#0ecb81' : 'rgba(255,255,255,0.5)' }}>{m.socialScore?.toFixed(0)}</td>
                          <td className="mono-num" style={{ textAlign: 'center', color: m.trendScore > 50 ? '#0ecb81' : 'rgba(255,255,255,0.5)' }}>{m.trendScore?.toFixed(0)}</td>
                          <td className="mono-num" style={{ textAlign: 'center', color: m.inflowScore > 50 ? '#0ecb81' : 'rgba(255,255,255,0.5)' }}>{m.inflowScore?.toFixed(0)}</td>
                          <td className="mono-num" style={{ textAlign: 'center', color: m.kolScore > 50 ? '#0ecb81' : 'rgba(255,255,255,0.5)' }}>{m.kolScore?.toFixed(0)}</td>
                          <td className="mono-num" style={{ textAlign: 'center', fontWeight: 700, color: m.totalScore >= 60 ? '#0ecb81' : '#f0b90b' }}>{m.totalScore?.toFixed(0)}</td>
                          <td className="mono-num" style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{new Date(m.reachedAt + 'Z').toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 8, textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>暂无里程碑记录</div>
                )}
              </div>

              {/* SM信号 + 信号时间线 并排 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1 }}>
                <div className="panel" style={{ padding: 14, overflow: 'auto' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>🐋 SM信号 ({smSignals.length})</div>
                  {smSignals.length > 0 ? smSignals.slice(0, 15).map((sig: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                      <span style={{ color: sig.signalType?.includes('buy') ? '#0ecb81' : sig.signalType?.includes('sell') ? '#f6465d' : '#f0b90b', fontWeight: 600 }}>
                        {sig.signalType?.includes('buy') ? '买入' : sig.signalType?.includes('sell') ? '卖出' : '流入'}
                      </span>
                      <span className="mono-num" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {sig.count || sig.sm_count || ''}x
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 'auto', fontSize: 10 }}>
                        {sig.detectedAt ? timeAgo(sig.detectedAt) : ''}
                      </span>
                    </div>
                  )) : <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, padding: 12, textAlign: 'center' }}>{detailLoading ? '加载中...' : '暂无SM信号'}</div>}
                </div>

                <div className="panel" style={{ padding: 14, overflow: 'auto' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>📡 {selected.symbol} 时间线</div>
                  {tokenEvents.length > 0 ? tokenEvents.slice(0, 15).map((ev: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', width: 40, flexShrink: 0 }}>
                        {ev.time ? new Date(ev.time + 'Z').toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      <span style={{
                        fontSize: 11, color:
                          ev.type === 'buy_signal' ? '#0ecb81' : ev.type === 'sm_buy' ? '#f0b90b' : ev.type === 'entry' ? '#f0b90b' : 'rgba(255,255,255,0.5)'
                      }}>{ev.title}</span>
                      {ev.score > 0 && <span className="mono-num" style={{ fontSize: 10, color: '#f0b90b', marginLeft: 'auto' }}>{ev.score.toFixed(1)}</span>}
                    </div>
                  )) : <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, padding: 12, textAlign: 'center' }}>暂无事件</div>}
                </div>
              </div>
            </>
          ) : (
            <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
                <div>选择左侧代币查看详情</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
