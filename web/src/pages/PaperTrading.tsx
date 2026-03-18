import React, { useEffect, useState } from 'react';
import { fetchPaperWallet, fetchPaperTrades, fetchPaperStats } from '../api';

const STRATEGY_LABELS: Record<string, string> = {
  'strategy_a_volume': '策略A·量驱动',
  'strategy_b_sm': '策略B·SM先行',
  'strategy_c_test_vol': '策略C·测试量',
  'strategy_d_test_sm': '策略D·测试SM',
};
function stratLabel(name: string): string {
  if (STRATEGY_LABELS[name]) return STRATEGY_LABELS[name];
  if (name.startsWith('volume_5m_')) return `量驱动·${name.replace('volume_5m_', '')}`;
  if (name.startsWith('sm_buy_count_')) return `SM·${name.replace('sm_buy_count_', '')}人`;
  return name;
}

const PaperTrading: React.FC = () => {
  const [wallet, setWallet] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 10000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    try {
      const [w, t, s] = await Promise.all([
        fetchPaperWallet(),
        fetchPaperTrades(),
        fetchPaperStats()
      ]);
      setWallet(w.wallet);
      setTrades(t.trades);
      setStats(s.stats);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>虚拟模拟盘 (Paper Trading & Backtesting)</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">可用资金 (USD)</div>
          <div className="stat-value mono-num" style={{ fontSize: 24 }}>
            ${wallet?.balance?.toFixed(2) || '0.00'}
          </div>
        </div>
        <div className={`stat-card ${wallet?.totalPnl >= 0 ? 'green' : 'red'}`}>
          <div className="stat-label">累计实现盈亏 (PnL)</div>
          <div className="stat-value mono-num" style={{ fontSize: 24 }}>
            {wallet?.totalPnl >= 0 ? '+' : ''}${wallet?.totalPnl?.toFixed(2) || '0.00'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">历史总单数</div>
          <div className="stat-value mono-num" style={{ fontSize: 24 }}>
            {trades.filter(t => t.status === 'closed').length} 单
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">活跃持仓数</div>
          <div className="stat-value mono-num" style={{ fontSize: 24, color: 'var(--brand)' }}>
            {trades.filter(t => t.status === 'open').length} 单
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 20 }}>
        {/* 左侧：策略胜率榜单 */}
        <div className="panel">
          <div className="panel-header"><div className="panel-title">🏆 策略奖励排行榜</div></div>
          <div style={{ padding: 16 }}>
            {stats.length === 0 && <div className="empty-state">暂无统计数据 (需产生平仓单)</div>}
            {stats.map((s, idx) => (
              <div key={idx} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>{s.strategyName}</span>
                  <span className={`signal-tag ${s.winRate >= 50 ? 'buy' : 'sell'}`}>
                    胜率 {s.winRate.toFixed(1)}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>均次收益: <span className={s.avgReturnPct >= 0 ? 'green' : 'red'}>{s.avgReturnPct.toFixed(2)}%</span></span>
                  <span>{s.winningTrades} 胜 / {s.totalTrades} 总</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：交易流水 */}
        <div className="panel">
          <div className="panel-header"><div className="panel-title">🚀 模拟订单流水</div></div>
          <table className="data-table">
            <thead>
              <tr>
                <th>代币</th>
                <th>状态</th>
                <th>使用策略</th>
                <th style={{ textAlign: 'right' }}>买入价</th>
                <th style={{ textAlign: 'right' }}>当前价</th>
                <th style={{ textAlign: 'right' }}>实时盈亏</th>
                <th style={{ textAlign: 'right' }}>最高涨幅</th>
                <th style={{ textAlign: 'right' }}>持仓时长</th>
                <th style={{ textAlign: 'right' }}>入场时间</th>
                <th style={{ textAlign: 'right' }}>最后操作</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 && (
                <tr><td colSpan={10} className="empty-state">暂无模拟交易记录</td></tr>
              )}
              {trades.map(t => {
                const isOpen = t.status === 'open';
                const pnlPct = isOpen ? t.currentPnlPct : t.pnlPct;
                const pnlUsd = isOpen ? t.currentPnlUsd : t.pnlUsd;
                const curPrice = isOpen ? t.currentPrice : t.exitPrice;
                return (
                <tr key={t.id} style={{ opacity: !isOpen ? 0.6 : 1, background: isOpen ? 'rgba(14,203,129,0.03)' : 'transparent' }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.symbol}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t.chainId}</div>
                  </td>
                  <td>
                    {isOpen ? (
                      <span className="signal-tag buy">🟢 持仓中</span>
                    ) : (
                      <span className="signal-tag" style={{ background: 'var(--border)', color: 'var(--text-primary)' }}>
                        ⬛ {t.exitReason === 'take_profit' ? '止盈' : t.exitReason === 'stop_loss' ? '止损' : '超时'}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {stratLabel(t.strategyUsed)}
                  </td>
                  <td className="mono-num" style={{ textAlign: 'right' }}>${t.entryPrice?.toFixed(6)}</td>
                  <td className="mono-num" style={{ textAlign: 'right', color: isOpen ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                    {curPrice ? `$${curPrice.toFixed(6)}` : '-'}
                  </td>
                  <td className="mono-num" style={{ textAlign: 'right' }}>
                    {pnlPct != null ? (
                      <div className={pnlPct >= 0 ? 'green' : 'red'}>
                        <div style={{ fontWeight: 600 }}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</div>
                        {pnlUsd != null && <div style={{ fontSize: 11 }}>(${pnlUsd.toFixed(2)})</div>}
                      </div>
                    ) : <span style={{ color: 'var(--text-tertiary)' }}>--</span>}
                  </td>
                  <td className="mono-num" style={{ textAlign: 'right', color: t.maxGainPct > 0 ? 'var(--green)' : 'inherit' }}>
                    {t.maxGainPct?.toFixed(2)}%
                  </td>
                  <td className="mono-num" style={{ textAlign: 'right', fontSize: 12 }}>
                    {isOpen && t.hoursHeld != null ? (
                      <span style={{ color: 'var(--accent)' }}>{t.hoursHeld < 1 ? `${Math.round(t.hoursHeld * 60)}分` : `${t.hoursHeld.toFixed(1)}时`}</span>
                    ) : '-'}
                  </td>
                  <td className="mono-num" style={{ textAlign: 'right', fontSize: 12 }}>
                    {new Date(t.enteredAt + 'Z').toLocaleTimeString('zh-CN')}
                  </td>
                  <td className="mono-num" style={{ textAlign: 'right', fontSize: 11 }}>
                    {isOpen ? (
                      <span style={{ color: 'var(--green)' }}>{t.dynamicsTime ? (() => { const d = Math.floor((Date.now() - new Date(t.dynamicsTime + 'Z').getTime()) / 60000); return d < 1 ? '刚刚监控' : d < 60 ? `${d}分前` : `${Math.floor(d/60)}时前`; })() : '监控中'}</span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>{t.closedAt ? new Date(t.closedAt + 'Z').toLocaleTimeString('zh-CN') : '-'}</span>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PaperTrading;
