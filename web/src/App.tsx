import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import SignalCenter from './pages/SignalCenter'
import Watchlist from './pages/Watchlist'
import AlphaOverview from './pages/AlphaOverview'
import SystemConfig from './pages/SystemConfig'
import TokenDetail from './pages/TokenDetail'
import PaperTrading from './pages/PaperTrading'
import EvaluationLogs from './pages/EvaluationLogs'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <NavLink to="/" className="logo">M</NavLink>

          <div className="nav-section-title">MEME 信号</div>
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            📊<span className="nav-tooltip">市场总览</span>
          </NavLink>
          <NavLink to="/signals" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            🎯<span className="nav-tooltip">信号中心</span>
          </NavLink>
          <NavLink to="/watchlist" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            📋<span className="nav-tooltip">观察列表</span>
          </NavLink>

          <div className="nav-section-title">Alpha</div>
          <NavLink to="/alpha" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            ⚡<span className="nav-tooltip">Alpha 总览</span>
          </NavLink>

          <div className="nav-section-title">系统</div>
          <NavLink to="/paper-trading" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            🚀<span className="nav-tooltip">模拟回测</span>
          </NavLink>
          <NavLink to="/config" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            ⚙️<span className="nav-tooltip">系统配置</span>
          </NavLink>
          <NavLink to="/evaluation-logs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            📊<span className="nav-tooltip">评估日志</span>
          </NavLink>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/signals" element={<SignalCenter />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/alpha" element={<AlphaOverview />} />
            <Route path="/config" element={<SystemConfig />} />
            <Route path="/paper-trading" element={<PaperTrading />} />
            <Route path="/evaluation-logs" element={<EvaluationLogs />} />
            <Route path="/token/:chainId/:address" element={<TokenDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
