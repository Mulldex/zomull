import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'

import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/layout/Sidebar'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import CreateOrderPage from './pages/CreateOrderPage'
import ContractsPage from './pages/ContractsPage'
import ContractDetailPage from './pages/ContractDetailPage'
import CreateContractPage from './pages/CreateContractPage'
import ApprovePage from './pages/ApprovePage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SuppliersPage from './pages/SuppliersPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import { orderService, contractService } from './services/documentService'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Nástrojový panel',
  '/objednavky': 'Objednávky',
  '/objednavky/nova': 'Nová objednávka',
  '/zmluvy': 'Zmluvy',
  '/zmluvy/nova': 'Nová zmluva',
  '/schvalenie': 'Na schválenie',
  '/projekty': 'Projekty',
  '/dodavatelia': 'Dodávatelia',
  '/pouzivatelia': 'Správa používateľov',
  '/nastavenia': 'Nastavenia',
}

function AppLayout() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!user) return
    const loadPending = async () => {
      try {
        const [orders, contracts] = await Promise.all([
          orderService.list({ status: 'pending_foreman,pending_director' }),
          contractService.list({ status: 'pending_approval' }),
        ])
        setPendingCount(orders.length + contracts.length)
      } catch {}
    }
    loadPending()
  }, [user, location.pathname])

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--brand-dark)' }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] ?? 'ZOMULL'

  // Objednávky môžu vytvárať všetky role okrem… (vlastne všetky)
  const canCreateOrder = ['admin', 'ekonom', 'pripravar', 'foreman', 'director'].includes(user.role)
  // Zmluvy môžu vytvárať admin, ekonóm a prípravár
  const canCreateContract = user.role === 'admin' || user.role === 'ekonom' || user.role === 'pripravar'

  return (
    <div className="app-layout">
      <Sidebar pendingCount={pendingCount} />
      <div className="main-content">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="topbar-brand-line" />
            <h2>{title}</h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {canCreateOrder && location.pathname === '/objednavky' && (
              <a href="/objednavky/nova" className="btn btn-primary btn-sm">+ Nová objednávka</a>
            )}
            {canCreateContract && location.pathname === '/zmluvy' && (
              <a href="/zmluvy/nova" className="btn btn-primary btn-sm">+ Nová zmluva</a>
            )}
          </div>
        </div>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/objednavky" element={<OrdersPage />} />
          <Route path="/objednavky/nova" element={<CreateOrderPage />} />
          <Route path="/objednavky/:id" element={<OrderDetailPage />} />
          <Route path="/zmluvy" element={<ContractsPage />} />
          <Route path="/zmluvy/nova" element={<CreateContractPage />} />
          <Route path="/zmluvy/:id" element={<ContractDetailPage />} />
          <Route path="/schvalenie" element={<ApprovePage />} />
          <Route path="/projekty" element={<ProjectsPage />} />
          <Route path="/projekty/:id" element={<ProjectDetailPage />} />
          <Route path="/dodavatelia" element={<SuppliersPage />} />
          <Route path="/pouzivatelia" element={<UsersPage />} />
          <Route path="/nastavenia" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              fontFamily: 'Outfit, sans-serif',
              fontSize: '13px',
              borderRadius: '8px',
            },
            success: { iconTheme: { primary: '#2E7D32', secondary: '#fff' } },
            error: { iconTheme: { primary: '#C0272D', secondary: '#fff' } },
          }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
