import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ArrowLeftRight, BarChart3, ClipboardList, Settings, LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { AppLogo } from '../brand/AppLogo'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/trading-record', icon: ClipboardList, label: 'Trading Record' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { user, doLogout } = useAuth()

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <AppLogo />
          <span className="sidebar-title">FortuneFlow</span>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-label">Menu</p>
          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <item.icon size={17} className="sidebar-link-icon" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{user?.username.charAt(0).toUpperCase()}</div>
            <span className="sidebar-user-name">{user?.username}</span>
          </div>
          <button className="sidebar-link sidebar-logout" onClick={doLogout}>
            <LogOut size={17} className="sidebar-link-icon" />
            <span>Sign Out</span>
          </button>
          <p className="sidebar-copyright">© 2026 Codex074 v1.0.9</p>
        </div>
      </aside>

      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
