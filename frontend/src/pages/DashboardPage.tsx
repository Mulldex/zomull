import { useEffect, useState } from 'react'
import { ShoppingCart, FileText, Clock, CheckCircle, XCircle, TrendingUp } from 'lucide-react'
import { orderService, contractService } from '../services/documentService'
import type { Order, Contract } from '../types'
import { useAuth } from '../context/AuthContext'
import { OrderStatusBadge, ContractStatusBadge } from '../components/ui/StatusBadge'
import { format } from 'date-fns'
import { sk } from 'date-fns/locale'

function fmt(d: string) {
  try { return format(new Date(d), 'd. M. yyyy', { locale: sk }) } catch { return d }
}

function fmtMoney(v: number, c = 'EUR') {
  return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(v)
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([orderService.list(), contractService.list()])
      .then(([o, c]) => { setOrders(o); setContracts(c) })
      .finally(() => setLoading(false))
  }, [])

  const pendingOrders = orders.filter(o => o.status === 'pending_foreman' || o.status === 'pending_director')
  const pendingContracts = contracts.filter(c => c.status === 'pending_approval')
  const approvedOrders = orders.filter(o => o.status === 'approved')
  const approvedContracts = contracts.filter(c => c.status === 'approved')
  const totalOrdersValue = approvedOrders.reduce((s, o) => s + o.total_amount, 0)

  const recentOrders = [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
  const recentContracts = [...contracts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  return (
    <div className="page-content">
      {/* Štatistiky */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-light)', color: 'var(--blue)' }}>
            <ShoppingCart size={20} />
          </div>
          <div className="stat-body">
            <div className="stat-value">{orders.length}</div>
            <div className="stat-label">Celkom objednávok</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-light)', color: 'var(--blue)' }}>
            <FileText size={20} />
          </div>
          <div className="stat-body">
            <div className="stat-value">{contracts.length}</div>
            <div className="stat-label">Celkom zmlúv</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-light)', color: 'var(--amber)' }}>
            <Clock size={20} />
          </div>
          <div className="stat-body">
            <div className="stat-value">{pendingOrders.length + pendingContracts.length}</div>
            <div className="stat-label">Čaká na schválenie</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>
            <TrendingUp size={20} />
          </div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: 17 }}>{fmtMoney(totalOrdersValue)}</div>
            <div className="stat-label">Hodnota schválených obj.</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 0 }}>
        {/* Posledné objednávky */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><ShoppingCart size={16} /> Posledné objednávky</h3>
            <a href="/objednavky" className="btn btn-ghost btn-sm">Zobraziť všetky</a>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {recentOrders.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Žiadne objednávky
              </div>
            ) : (
              <table className="table">
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/objednavky/${o.id}`}>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{o.order_number}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{o.supplier_name}</div>
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 12 }}>{fmt(o.order_date)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtMoney(o.total_amount, o.currency)}</td>
                      <td><OrderStatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Posledné zmluvy */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><FileText size={16} /> Posledné zmluvy</h3>
            <a href="/zmluvy" className="btn btn-ghost btn-sm">Zobraziť všetky</a>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {recentContracts.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Žiadne zmluvy
              </div>
            ) : (
              <table className="table">
                <tbody>
                  {recentContracts.map(c => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/zmluvy/${c.id}`}>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{c.contract_number}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.counterparty}</div>
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 12 }}>{c.sign_date ? fmt(c.sign_date) : '–'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{c.value ? fmtMoney(c.value, c.currency) : '–'}</td>
                      <td><ContractStatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Na schválenie banner */}
      {(pendingOrders.length > 0 || pendingContracts.length > 0) && (
        <div className="alert alert-warning" style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><Clock size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Čakajú na vaše schválenie: <strong>{pendingOrders.length} objednávok</strong> a <strong>{pendingContracts.length} zmlúv</strong>
          </span>
          <a href="/schvalenie" className="btn btn-primary btn-sm">Prejsť na schválenie</a>
        </div>
      )}
    </div>
  )
}
