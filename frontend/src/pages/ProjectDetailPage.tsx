import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, User as UserIcon, Calendar, DollarSign, FileText, ShoppingCart, Pencil, Plus, Trash2, ChevronRight, ChevronDown, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectService, orderService, contractService, costItemService } from '../services/documentService'
import type { Project, Order, Contract, CostItem } from '../types'
import { OrderStatusBadge, ContractStatusBadge } from '../components/ui/StatusBadge'
import { CONTRACT_TYPE_LABELS } from '../types'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { sk } from 'date-fns/locale'

function fmtDate(d?: string) {
  if (!d) return '–'
  try { return format(new Date(d), 'd. M. yyyy', { locale: sk }) } catch { return d }
}
function fmtMoney(v: number, c = 'EUR') {
  return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(v)
}

type Tab = 'orders' | 'contracts' | 'cost-items'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [costItems, setCostItems] = useState<CostItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('orders')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [addingUnder, setAddingUnder] = useState<number | null | undefined>(undefined)
  const [editing, setEditing] = useState<CostItem | null>(null)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')

  const loadCostItems = async (pid: number) => {
    try {
      const items = await costItemService.list(pid)
      setCostItems(items)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!id) return
    const pid = +id
    setLoading(true)
    Promise.all([
      projectService.get(pid),
      orderService.list({ project_id: pid }),
      contractService.list({ project_id: pid }),
      costItemService.list(pid).catch(() => []),
    ])
      .then(([p, o, c, ci]) => { setProject(p); setOrders(o); setContracts(c); setCostItems(ci) })
      .catch(() => setProject(null))
      .finally(() => setLoading(false))
  }, [id])

  // Strom nákladových položiek
  const rootItems = costItems.filter(i => !i.parent_id)
  const childrenOf = (parentId: number) => costItems.filter(i => i.parent_id === parentId)

  const toggleExpand = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const saveNewItem = async () => {
    if (!project) return
    if (!newCode.trim() || !newName.trim()) { toast.error('Vyplň kód aj názov'); return }
    try {
      if (editing) {
        await costItemService.update(project.id, editing.id, { code: newCode, name: newName })
        toast.success('Položka upravená')
      } else {
        await costItemService.create(project.id, {
          code: newCode, name: newName,
          parent_id: addingUnder ?? null,
          sort_order: 0,
        })
        toast.success('Položka pridaná')
      }
      setNewCode(''); setNewName(''); setAddingUnder(undefined); setEditing(null)
      loadCostItems(project.id)
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Chyba') }
  }

  const deleteItem = async (item: CostItem) => {
    if (!project) return
    if (!confirm(`Vymazať položku "${item.code} ${item.name}" a jej podpoložky?`)) return
    try {
      await costItemService.delete(project.id, item.id)
      toast.success('Vymazané')
      loadCostItems(project.id)
    } catch { toast.error('Chyba') }
  }

  const startEdit = (item: CostItem) => {
    setEditing(item); setAddingUnder(undefined)
    setNewCode(item.code); setNewName(item.name)
  }

  const startAdd = (parentId: number | null) => {
    setEditing(null); setAddingUnder(parentId)
    setNewCode(''); setNewName('')
  }

  const renderTree = (parentId: number | null, depth: number = 0): JSX.Element[] => {
    const items = parentId === null ? rootItems : childrenOf(parentId)
    return items.flatMap(item => {
      const kids = childrenOf(item.id)
      const isOpen = expanded.has(item.id)
      return [
        <div key={item.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
          paddingLeft: 8 + depth * 24,
          borderBottom: '1px solid var(--border)',
        }}>
          {kids.length > 0 ? (
            <button type="button" onClick={() => toggleExpand(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text2)' }}>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span style={{ width: 14, display: 'inline-block' }} />
          )}
          <code style={{ fontSize: 12, color: 'var(--brand-red)', fontWeight: 600, minWidth: 60 }}>{item.code}</code>
          <span style={{ flex: 1, fontSize: 13 }}>{item.name}</span>
          {user?.role === 'admin' && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="btn btn-ghost btn-sm" title="Pridať podpoložku" onClick={() => startAdd(item.id)}>
                <Plus size={12} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" title="Upraviť" onClick={() => startEdit(item)}>
                <Pencil size={12} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" title="Vymazať" onClick={() => deleteItem(item)} style={{ color: 'var(--brand-red)' }}>
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>,
        ...(isOpen ? renderTree(item.id, depth + 1) : []),
      ]
    })
  }

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )
  if (!project) return (
    <div className="page-content"><div className="alert alert-error">Projekt nenájdený</div></div>
  )

  const ordersTotal = orders.reduce((s, o) => s + (o.total_amount || 0), 0)
  const contractsTotal = contracts.reduce((s, c) => s + (c.value || 0), 0)

  return (
    <div className="page-content">
      {/* Hlavička */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projekty')}>
            <ArrowLeft size={14} />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{project.name}</h2>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>
              {project.code}
              {!project.is_active && <span style={{ marginLeft: 8, color: 'var(--text3)' }}>· neaktívny</span>}
            </div>
          </div>
        </div>
        {user?.role === 'admin' && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projekty')}>
            <Pencil size={14} /> Upraviť na zozname
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        {/* Ľavá strana: záložky */}
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => setTab('orders')}
              className={tab === 'orders' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ borderRadius: '6px 6px 0 0', marginBottom: -1 }}
            >
              <ShoppingCart size={14} /> Objednávky <span className="badge" style={{ marginLeft: 6 }}>{orders.length}</span>
            </button>
            <button
              onClick={() => setTab('contracts')}
              className={tab === 'contracts' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ borderRadius: '6px 6px 0 0', marginBottom: -1 }}
            >
              <FileText size={14} /> Zmluvy <span className="badge" style={{ marginLeft: 6 }}>{contracts.length}</span>
            </button>
            <button
              onClick={() => setTab('cost-items')}
              className={tab === 'cost-items' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ borderRadius: '6px 6px 0 0', marginBottom: -1 }}
            >
              <Layers size={14} /> Nákladové položky <span className="badge" style={{ marginLeft: 6 }}>{costItems.length}</span>
            </button>
          </div>

          {tab === 'orders' && (
            <div className="card">
              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>
                  K tomuto projektu nie sú žiadne objednávky
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Číslo OBJ</th>
                        <th>Predmet</th>
                        <th>Dodávateľ</th>
                        <th>Dátum</th>
                        <th style={{ textAlign: 'right' }}>Suma</th>
                        <th>Stav</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/objednavky/${o.id}`)}>
                          <td><span style={{ fontWeight: 600, color: 'var(--brand-red)' }}>{o.order_number}</span></td>
                          <td style={{ maxWidth: 220 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.subject}</div>
                          </td>
                          <td>{o.supplier_name}</td>
                          <td style={{ color: 'var(--text2)', fontSize: 12 }}>{fmtDate(o.order_date)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtMoney(o.total_amount, o.currency)}</td>
                          <td><OrderStatusBadge status={o.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'cost-items' && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Nákladové položky projektu</h3>
                {user?.role === 'admin' && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => startAdd(null)}>
                    <Plus size={14} /> Pridať položku
                  </button>
                )}
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {/* Form na pridanie/úpravu */}
                {(addingUnder !== undefined || editing) && (
                  <div style={{ padding: 14, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
                      {editing ? 'Upraviť položku:' : addingUnder === null ? 'Pridať hlavnú položku:' : `Pridať podpoložku pod ID ${addingUnder}:`}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <div style={{ width: 100 }}>
                        <label className="form-label">Kód</label>
                        <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="01" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="form-label">Názov</label>
                        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="napr. Materiál, Práca, Subdodávky..." />
                      </div>
                      <button type="button" className="btn btn-primary" onClick={saveNewItem}>Uložiť</button>
                      <button type="button" className="btn btn-ghost" onClick={() => { setAddingUnder(undefined); setEditing(null); setNewCode(''); setNewName('') }}>Zrušiť</button>
                    </div>
                  </div>
                )}
                {costItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>
                    Zatiaľ žiadne nákladové položky. {user?.role === 'admin' && 'Pridaj prvú tlačidlom hore.'}
                  </div>
                ) : (
                  <div>{renderTree(null)}</div>
                )}
              </div>
            </div>
          )}

          {tab === 'contracts' && (
            <div className="card">
              {contracts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>
                  K tomuto projektu nie sú žiadne zmluvy
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Číslo zmluvy</th>
                        <th>Typ</th>
                        <th>Zmluvná strana</th>
                        <th>Predmet</th>
                        <th>Platnosť do</th>
                        <th style={{ textAlign: 'right' }}>Hodnota</th>
                        <th>Stav</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map(c => (
                        <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/zmluvy/${c.id}`)}>
                          <td><span style={{ fontWeight: 600, color: 'var(--brand-red)' }}>{c.contract_number}</span></td>
                          <td style={{ fontSize: 12 }}>{CONTRACT_TYPE_LABELS[c.contract_type]}</td>
                          <td>{c.counterparty}</td>
                          <td style={{ maxWidth: 200 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</div>
                          </td>
                          <td style={{ color: 'var(--text2)', fontSize: 12 }}>{fmtDate(c.valid_to)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{c.value ? fmtMoney(c.value, c.currency) : '–'}</td>
                          <td><ContractStatusBadge status={c.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pravá strana: detail projektu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><h3 className="card-title">Detail projektu</h3></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {project.address && (
                <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <MapPin size={14} /> {project.address}
                </div>
              )}
              {project.investor && (
                <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <UserIcon size={14} /> {project.investor}
                </div>
              )}
              {(project.start_date || project.end_date) && (
                <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <Calendar size={14} /> {fmtDate(project.start_date)} – {fmtDate(project.end_date)}
                </div>
              )}
              {project.budget != null && (
                <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <DollarSign size={14} /> Rozpočet: {fmtMoney(project.budget, project.currency)}
                </div>
              )}
              {project.description && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  {project.description}
                </div>
              )}
              {project.foremen && project.foremen.length > 0 && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Stavbyvedúci:</div>
                  {project.foremen.map(f => (
                    <div key={f.id}>· {f.full_name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="card-title">Súhrn</h3></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text2)' }}>Objednávky:</span>
                <span style={{ fontWeight: 500 }}>{orders.length} ks · {fmtMoney(ordersTotal, project.currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text2)' }}>Zmluvy:</span>
                <span style={{ fontWeight: 500 }}>{contracts.length} ks · {fmtMoney(contractsTotal, project.currency)}</span>
              </div>
              {project.budget != null && project.budget > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text2)' }}>Čerpanie z rozpočtu:</span>
                  <span style={{ fontWeight: 600 }}>
                    {(((ordersTotal + contractsTotal) / project.budget) * 100).toFixed(1)} %
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
