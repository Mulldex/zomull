import { useEffect, useState } from 'react'
import { ShoppingCart, FileText } from 'lucide-react'
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

export default function ApprovePage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'orders' | 'contracts'>('orders')

  useEffect(() => {
    Promise.all([
      orderService.list({ status: 'pending_foreman,pending_director' }),
      contractService.list({ status: 'pending_approval' }),
    ]).then(([o, c]) => {
      setOrders(o)
      setContracts(c)
    }).finally(() => setLoading(false))
  }, [])

  // Filtrovanie: zobraz len čo sa týka aktuálneho používateľa
  const myOrders = orders.filter(o => {
    if (user?.role === 'admin') return true
    if (user?.role === 'foreman') return o.status === 'pending_foreman' && o.foreman?.id === user.id
    if (user?.role === 'director') return o.status === 'pending_director' && o.director?.id === user.id
    return false
  })

  const myContracts = contracts.filter(c => {
    if (user?.role === 'admin') return true
    if (user?.role === 'foreman') return c.foreman_approver?.id === user.id && !c.foreman_approved
    if (user?.role === 'ekonom') return c.ekonom_approver?.id === user.id && !c.ekonom_approved
    if (user?.role === 'director') return c.director_approver?.id === user.id && !c.director_approved
    return false
  })

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  return (
    <div className="page-content">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        <button
          className={`btn btn-sm ${tab === 'orders' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('orders')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          <ShoppingCart size={14} /> Objednávky
          <span className="badge" style={{ marginLeft: 4 }}>{myOrders.length}</span>
        </button>
        <button
          className={`btn btn-sm ${tab === 'contracts' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('contracts')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          <FileText size={14} /> Zmluvy
          <span className="badge" style={{ marginLeft: 4 }}>{myContracts.length}</span>
        </button>
      </div>

      {tab === 'orders' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Objednávky na schválenie</h3>
          </div>
          {myOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>
              Žiadne objednávky čakajú na vaše schválenie
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Číslo OBJ</th>
                  <th>Predmet</th>
                  <th>Dodávateľ</th>
                  <th>Projekt</th>
                  <th>Dátum</th>
                  <th style={{ textAlign: 'right' }}>Suma</th>
                  <th>Stav</th>
                </tr>
              </thead>
              <tbody>
                {myOrders.map(o => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/objednavky/${o.id}`}>
                    <td><span style={{ fontWeight: 600, color: 'var(--brand-red)' }}>{o.order_number}</span></td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.subject}</div>
                    </td>
                    <td>{o.supplier_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{o.project?.name || '–'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{fmt(o.order_date)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtMoney(o.total_amount, o.currency)}</td>
                    <td><OrderStatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'contracts' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Zmluvy na schválenie</h3>
          </div>
          {myContracts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>
              Žiadne zmluvy čakajú na vaše schválenie
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Číslo zmluvy</th>
                  <th>Zmluvná strana</th>
                  <th>Predmet</th>
                  <th>Projekt</th>
                  <th style={{ textAlign: 'right' }}>Hodnota</th>
                  <th>Vaše schválenie</th>
                  <th>Stav</th>
                </tr>
              </thead>
              <tbody>
                {myContracts.map(c => {
                  const myApproved =
                    (user?.role === 'foreman' && c.foreman_approved) ||
                    (user?.role === 'ekonom' && c.ekonom_approved) ||
                    (user?.role === 'director' && c.director_approved)
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/zmluvy/${c.id}`}>
                      <td><span style={{ fontWeight: 600, color: 'var(--brand-red)' }}>{c.contract_number}</span></td>
                      <td>{c.counterparty}</td>
                      <td style={{ maxWidth: 180 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.project?.name || '–'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{c.value ? fmtMoney(c.value, c.currency) : '–'}</td>
                      <td>
                        <span style={{ fontSize: 12, color: myApproved ? 'var(--green)' : 'var(--amber)' }}>
                          {myApproved ? '✓ Schválené' : '⏳ Čaká'}
                        </span>
                      </td>
                      <td><ContractStatusBadge status={c.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
