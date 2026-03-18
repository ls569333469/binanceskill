import { useEffect, useState, useCallback } from 'react'
import { fetchStrategies, updateStrategy, fetchConfig, updateConfig, fetchBacktestStats } from '../api'

type ViewTab = 'strategy' | 'filters' | 'collectors'

// Stable filter input component (defined outside render to avoid remount/focus-loss)
function FilterInput({ label, field, hint, value, onChange }: {
  label: string; field: string; hint?: string;
  value: number; onChange: (field: string, val: number) => void;
}) {
  const fmtHint = (v: number) => {
    if (!v) return ''
    if (v >= 1e6) return `= ${(v / 1e6).toFixed(1)}M`
    if (v >= 1e3) return `= ${(v / 1e3).toFixed(1)}K`
    return `= ${v}`
  }
  return (
    <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block' }}>
      {label}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <input type="number" value={value}
          onChange={e => onChange(field, Number(e.target.value))}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }} />
        <span className="mono-num" style={{ fontSize: 12, color: 'var(--accent)', minWidth: 60 }}>{fmtHint(value)}</span>
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{hint}</div>}
    </label>
  )
}

export default function SystemConfig() {
  const [tab, setTab] = useState<ViewTab>('strategy')

  // Strategy state
  const [strategies, setStrategies] = useState<any[]>([])
  const [dirty, setDirty] = useState<Record<string, any>>({})

  // Collector config state
  const [configs, setConfigs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Backtest stats
  const [backtestStats, setBacktestStats] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetchStrategies().then((d: any) => setStrategies(d.strategies || [])),
      fetchConfig().then(d => setConfigs(Array.isArray(d) ? d : (d.configs || d.data || []))),
      fetchBacktestStats().then((d: any) => setBacktestStats(d.stats || [])).catch(() => {}),
    ]).then(() => setLoading(false))
  }, [])

  // Strategy helpers
  const getDirty = (name: string): any => dirty[name] || strategies.find(s => s.name === name) || {}
  const setField = (name: string, field: string, value: any) => {
    setDirty(prev => ({ ...prev, [name]: { ...getDirty(name), [field]: value } }))
  }
  const saveStrategy = async (name: string) => {
    const d = getDirty(name)
    await updateStrategy(name, d)
    const fresh = await fetchStrategies()
    setStrategies(fresh.strategies || [])
    setDirty(prev => { const n = { ...prev }; delete n[name]; return n })
  }

  const toggleCollector = async (name: string, enabled: number) => {
    await updateConfig(name, { enabled: enabled ? 0 : 1 })
    setConfigs(prev => prev.map(c => c.name === name ? { ...c, enabled: enabled ? 0 : 1 } : c))
  }

  // Global filter helpers (stable references via useCallback)
  const gf = configs.find(c => c.name === 'global_filters')
  const gfParams = gf?.params || {}

  const setGF = useCallback((key: string, val: number) => {
    setConfigs(prev => prev.map(c =>
      c.name === 'global_filters' ? { ...c, params: { ...c.params, [key]: val } } : c
    ))
  }, [])

  const saveGlobalFilters = useCallback(async () => {
    const current = configs.find(c => c.name === 'global_filters')
    if (!current) return
    setSaving(true)
    try {
      await updateConfig('global_filters', { params: current.params })
      alert('✅ 全局过滤参数已保存！Dashboard 将在下次刷新时生效。')
    } catch (e) {
      alert('❌ 保存失败，请检查后端是否运行。')
    } finally {
      setSaving(false)
    }
  }, [configs])

  if (loading) return <div className="loading"><div className="spinner" />加载中...</div>

  return (
    <>
      <header className="page-header">
        <h1>⚙️ 系统配置</h1>
        <div className="panel-tabs">
          <button className={`panel-tab ${tab === 'strategy' ? 'active' : ''}`} onClick={() => setTab('strategy')}>🧪 策略配置</button>
          <button className={`panel-tab ${tab === 'filters' ? 'active' : ''}`} onClick={() => setTab('filters')}>🛡️ 全局过滤</button>
          <button className={`panel-tab ${tab === 'collectors' ? 'active' : ''}`} onClick={() => setTab('collectors')}>🔧 采集器 ({configs.length})</button>
        </div>
      </header>

      {/* ── Tab: 策略配置 ── */}
      {tab === 'strategy' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
          {strategies.map((s: any) => {
            const d = getDirty(s.name)
            const isDirty = !!dirty[s.name]
            const wSum = (d.weightSm || 0) + (d.weightSocial || 0) + (d.weightTrend || 0) + (d.weightInflow || 0) + (d.weightKol || 0) + (d.weightHype || 0)
            return (
              <div key={s.name} className="panel" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{s.entryMode === 'volume_driven' ? '📊 策略A · 量驱动' : '🐋 策略B · SM先行'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{s.name}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={async () => {
                      await updateStrategy(s.name, { enabled: s.enabled ? 0 : 1 })
                      const fresh = await fetchStrategies()
                      setStrategies(fresh.strategies || [])
                    }} style={{
                      fontSize: 12, padding: '5px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, transition: 'all 0.2s',
                      background: s.enabled ? 'rgba(14,203,129,0.2)' : 'rgba(246,70,93,0.15)',
                      color: s.enabled ? 'var(--green)' : 'var(--red)',
                    }}>
                      {s.enabled ? '✅ 已启用' : '⛔ 已禁用'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    买入总分阈值
                    <input type="number" value={d.buyThreshold ?? ''} onChange={e => setField(s.name, 'buyThreshold', Number(e.target.value))}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }} />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    观察超时(分钟)
                    <input type="number" value={d.watchExpireMinutes ?? ''} onChange={e => setField(s.name, 'watchExpireMinutes', Number(e.target.value))}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }} />
                  </label>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  入场门槛限制 (Entry Filters)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    5分钟交易量下限 ($)
                    <input type="number" value={d.entryVolume5mMin ?? ''} onChange={e => setField(s.name, 'entryVolume5mMin', Number(e.target.value))}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }} />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    聪明钱(SM)入场人数门槛
                    <input type="number" value={d.entrySmCountMin ?? ''} onChange={e => setField(s.name, 'entrySmCountMin', Number(e.target.value))}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }} />
                  </label>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  信号权重 <span style={{ color: wSum === 100 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>({wSum}/100)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                  {[['SM', 'weightSm'], ['社交', 'weightSocial'], ['趋势', 'weightTrend'], ['流入', 'weightInflow'], ['鲸鱼/KOL', 'weightKol'], ['热度', 'weightHype']].map(([label, key]) => (
                    <label key={key} style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {label}
                      <input type="number" value={d[key] ?? ''} onChange={e => setField(s.name, key, Number(e.target.value))}
                        style={{ display: 'block', width: '100%', marginTop: 2, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }} />
                    </label>
                  ))}
                </div>

                {/* P7: 回测止盈止损参数 */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  📈 回测出场条件
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    止盈线 (%)
                    <input type="number" value={d.takeProfitPct ?? 50} onChange={e => setField(s.name, 'takeProfitPct', Number(e.target.value))}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }} />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    止损线 (%)
                    <input type="number" value={d.stopLossPct ?? 20} onChange={e => setField(s.name, 'stopLossPct', Number(e.target.value))}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }} />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    超时平仓 (小时)
                    <input type="number" value={d.timeoutHours ?? 4} onChange={e => setField(s.name, 'timeoutHours', Number(e.target.value))}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }} />
                  </label>
                </div>

                {(() => {
                  const bStats = backtestStats.find((bs: any) => s.name === bs.strategyName)
                  if (!bStats) return null
                  return (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>📊 回测统计</span>
                        {bStats.openPositions > 0 && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>🟢 {bStats.openPositions} 活跃持仓</span>}
                        {bStats.lastTradeTime && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>最后: {new Date(bStats.lastTradeTime + 'Z').toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                        <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>胜率</div>
                          <div className="mono-num" style={{ fontSize: 15, fontWeight: 700, color: (bStats.winRate || 0) >= 50 ? 'var(--green)' : 'var(--red)' }}>
                            {(bStats.winRate || 0).toFixed(1)}%
                          </div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>盈/亏</div>
                          <div className="mono-num" style={{ fontSize: 14, fontWeight: 700 }}>
                            <span style={{ color: 'var(--green)' }}>{bStats.winningTrades}</span>/<span style={{ color: 'var(--red)' }}>{bStats.losingTrades}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>均收益</div>
                          <div className="mono-num" style={{ fontSize: 14, fontWeight: 700, color: (bStats.avgReturnPct || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {(bStats.avgReturnPct || 0) >= 0 ? '+' : ''}{(bStats.avgReturnPct || 0).toFixed(1)}%
                          </div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>累计PnL</div>
                          <div className="mono-num" style={{ fontSize: 14, fontWeight: 700, color: (bStats.totalPnlUsd || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            ${(bStats.totalPnlUsd || 0).toFixed(0)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>总单/活跃</div>
                          <div className="mono-num" style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                            {bStats.totalTrades}<span style={{ color: 'var(--text-tertiary)' }}>/</span><span style={{ color: 'var(--green)' }}>{bStats.openPositions || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {isDirty && (
                  <button onClick={() => saveStrategy(s.name)}
                    style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: wSum === 100 ? 'var(--accent)' : 'var(--text-tertiary)', color: '#000', fontWeight: 700, cursor: wSum === 100 ? 'pointer' : 'not-allowed', fontSize: 14 }}
                    disabled={wSum !== 100}>
                    💾 保存配置
                  </button>
                )}
              </div>
            )
          })}
          {strategies.length === 0 && <div className="empty"><div className="empty-icon">🧪</div>暂无策略配置</div>}
        </div>
      )}

      {/* ── Tab: 全局过滤漏斗 (P7) ── */}
      {tab === 'filters' && (
        gf ? (
          <div style={{ maxWidth: 720 }}>
            <div className="panel" style={{ padding: 24, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🛡️ 全局防黑盒漏斗</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>所有参数填 0 = 关闭该过滤项。Dashboard 热门代币和 Watchlist 入口均受此底线控制。</div>

              {/* Section 1: 基本面 */}
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                📊 基本面底线
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <FilterInput label="链上持币地址数" field="minBinanceHolders" hint="链上所有持币钱包数，推荐 ≥ 1, 屏蔽零散户诈骗盘" value={gfParams.minBinanceHolders ?? 0} onChange={setGF} />
                <FilterInput label="币安KYC用户持币数" field="minKycHolders" hint="币安实名认证用户持币数，有效筛除假项目" value={gfParams.minKycHolders ?? 0} onChange={setGF} />
                <FilterInput label="资金池流动性下限 ($)" field="minLiquidity" hint="例: 10000 = $10K, 拦截空池貔貅盘" value={gfParams.minLiquidity ?? 0} onChange={setGF} />
                <FilterInput label="最低市值 ($)" field="minMarketCap" hint="例: 100000 = $100K" value={gfParams.minMarketCap ?? 0} onChange={setGF} />
                <FilterInput label="最高市值上限 ($)" field="maxMarketCap" hint="0 = 不限上限" value={gfParams.maxMarketCap ?? 0} onChange={setGF} />
                <FilterInput label="代币最大年龄 (天)" field="maxTokenAgeDays" hint="例: 7 = 只看7天内的币, 0 = 不限" value={gfParams.maxTokenAgeDays ?? 0} onChange={setGF} />
              </div>

              {/* Section 2: 交易活跃度 */}
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                📈 交易活跃度 (多窗口)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <FilterInput label="5分钟交易量下限 ($)" field="volume5mMin" hint="最高频过滤, 实时性极强" value={gfParams.volume5mMin ?? 0} onChange={setGF} />
                <FilterInput label="1小时交易量下限 ($)" field="volume1hMin" hint="例: 5000 = $5K" value={gfParams.volume1hMin ?? 0} onChange={setGF} />
                <FilterInput label="4小时交易量下限 ($)" field="volume4hMin" hint="中等窗口" value={gfParams.volume4hMin ?? 0} onChange={setGF} />
                <FilterInput label="最低买入笔数 (24h)" field="minBuyCount" hint="过滤刷量空壳, 建议 >= 10" value={gfParams.minBuyCount ?? 0} onChange={setGF} />
              </div>

              {/* Section 3: KOL / SM */}
              <div style={{ fontSize: 13, fontWeight: 600, color: '#a78bfa', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                🐋 KOL / SM 过滤
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                <FilterInput label="最低 KOL 持仓数" field="kolHoldersMin" hint="KOL活跃买入, 验证项目真实热度" value={gfParams.kolHoldersMin ?? 0} onChange={setGF} />
                <FilterInput label="最低聪明钱(SM)持仓数" field="smartMoneyHoldersMin" hint="聪明钱地址, 有效筛除假项目" value={gfParams.smartMoneyHoldersMin ?? 0} onChange={setGF} />
                <FilterInput label="最低 Pro 持仓数" field="proHoldersMin" hint="专业交易者, 高胜率参与者" value={gfParams.proHoldersMin ?? 0} onChange={setGF} />
              </div>

              <button onClick={saveGlobalFilters} disabled={saving}
                style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: saving ? 'var(--text-tertiary)' : 'var(--accent)', color: '#000', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                {saving ? '⏳ 保存中...' : '💾 保存全局底线参数'}
              </button>
            </div>
          </div>
        ) : <div className="loading">加载全局设置中...</div>
      )}

      {/* ── Tab: 采集器 ── */}
      {tab === 'collectors' && (
        <div className="panel">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-tertiary)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>采集器</th>
              <th style={{ padding: '10px 8px', textAlign: 'center' }}>状态</th>
              <th style={{ padding: '10px 8px', textAlign: 'left' }}>Cron</th>
              <th style={{ padding: '10px 8px', textAlign: 'left' }}>参数</th>
              <th style={{ padding: '10px 8px', textAlign: 'center' }}>开关</th>
            </tr></thead>
            <tbody>
              {configs.map((c: any) => (
                <tr key={c.name} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.04))' }}>
                  <td style={{ padding: '12px', fontWeight: 600, fontSize: 13 }}>{c.name}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c.enabled ? 'var(--green)' : 'var(--red)' }} />
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{c.cronExpr}</td>
                  <td style={{ padding: '12px 8px', fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.paramsJson?.length > 80 ? c.paramsJson.slice(0, 80) + '...' : c.paramsJson}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    <button onClick={() => toggleCollector(c.name, c.enabled)}
                      style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: 'none', background: c.enabled ? 'rgba(246,70,93,0.2)' : 'rgba(14,203,129,0.2)', color: c.enabled ? 'var(--red)' : 'var(--green)', cursor: 'pointer', fontWeight: 600 }}>
                      {c.enabled ? '禁用' : '启用'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
