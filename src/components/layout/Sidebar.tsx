import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ArrowLeftRight, PieChart, BarChart3, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/portfolio', icon: PieChart, label: 'Portfolio' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">F</div>
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
