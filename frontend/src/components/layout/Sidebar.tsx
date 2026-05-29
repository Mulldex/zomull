import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, FileText, Clock,
  Users, Settings, LogOut, Truck, FolderOpen,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS } from '../../types'

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const avatarColors: Record<string, string> = {
  admin: 'red',
  ekonom: 'green',
  pripravar: 'green',
  foreman: 'amber',
  director: '',
  konatel: 'blue',
}

export default function Sidebar({ pendingCount }: { pendingCount: number }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-inner">
          <div style={{
            background: '#fff',
            borderRadius: 6,
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <img
              src="/mulldex-logo.png"
              alt="MULLDEX logo"
              style={{ height: 28, width: 'auto', display: 'block' }}
            />
          </div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-name">
              ZO<span>MU</span>LL
            </div>
            <div className="sidebar-logo-sub">Objednávky a zmluvy</div>
          </div>
        </div>
      </div>

      {/* Prihlásený používateľ */}
      {user && (
        <div className="sidebar-user">
          <div className={`avatar ${avatarColors[user.role] || ''}`}>
            {initials(user.full_name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.full_name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              {ROLE_LABELS[user.role]}
            </div>
          </div>
        </div>
      )}

      {/* Navigácia */}
      <nav className="sidebar-nav">
        <div className="nav-section">Prehľad</div>
        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <LayoutDashboard /> Nástrojový panel
        </NavLink>

        <div className="nav-section">Dokumenty</div>
        <NavLink to="/objednavky" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <ShoppingCart /> Objednávky
        </NavLink>
        <NavLink to="/zmluvy" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <FileText /> Zmluvy
        </NavLink>

        {(user?.role === 'foreman' || user?.role === 'director' || user?.role === 'ekonom' || user?.role === 'admin') && (
          <NavLink to="/schvalenie" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Clock /> Na schválenie
            {pendingCount > 0 && <span className="badge-dot" />}
          </NavLink>
        )}

        <div className="nav-section">Evidencia</div>
        <NavLink to="/projekty" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <FolderOpen /> Projekty
        </NavLink>
        <NavLink to="/dodavatelia" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Truck /> Dodávatelia
        </NavLink>

        {user?.role === 'admin' && (
          <>
            <div className="nav-section">Správa</div>
            <NavLink to="/pouzivatelia" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Users /> Používatelia
            </NavLink>
            <NavLink to="/nastavenia" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Settings /> Nastavenia
            </NavLink>
          </>
        )}
      </nav>

      {/* Odhlásiť */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          className="btn"
          style={{ width: '100%', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
          onClick={handleLogout}
        >
          <LogOut size={15} /> Odhlásiť sa
        </button>
      </div>
    </aside>
  )
}
