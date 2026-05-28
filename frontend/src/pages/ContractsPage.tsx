import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { contractService, projectService } from '../services/documentService'
import type { Contract, Project } from '../types'
import { ContractStatusBadge } from '../components/ui/StatusBadge'
import { CONTRACT_TYPE_LABELS } from '../types'
import { format } from 'date-fns'
import { sk } from 'date-fns/locale'

function fmt(d?: string) {
  if (!d) return '–'
  try { return format(new Date(d), 'd. M. yyyy', { locale: sk }) } catch { return d }
}
function fmtMoney(v: number, c = 'EUR') {
  return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(v)
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [c, p] = await Promise.all([
        contractService.list({ status: statusFilter || undefined, project_id: projectFilter ? +projectFilter : undefined, search: search || undefined }),
        projectService.list(),
      ])
      setContracts(c)
      setProjects(p)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter, projectFilter])
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load() }

  return (
    <div className="page-content">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hľadať podľa čísla, zmluvnej strany..." style={{ paddingLeft: 32 }} />
              </div>
              <button type="submit" className="btn btn-primary btn-sm"><Search size={14} /></button>
            </form>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 180 }}>
              <option value="">Všetky stavy</option>
              <option value="new">Nová</option>
              <option value="pending_approval">Čaká na schválenie</option>
              <option value="approved">Schválená</option>
              <option value="rejected">Zamietnutá</option>
            </select>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
              <option value="">Všetky projekty</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Zmluvy <span className="badge">{contracts.length}</span></h3>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <span className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : contracts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>Žiadne zmluvy sa nenašli</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Číslo zmluvy</th>
                  <th>Typ</th>
                  <th>Zmluvná strana</th>
                  <th>Predmet</th>
                  <th>Projekt</th>
                  <th>Platnosť do</th>
                  <th style={{ textAlign: 'right' }}>Hodnota</th>
                  <th>Stav</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/zmluvy/${c.id}`}>
                    <td><span style={{ fontWeight: 600, color: 'var(--brand-red)' }}>{c.contract_number}</span></td>
                    <td style={{ fontSize: 12 }}>{CONTRACT_TYPE_LABELS[c.contract_type]}</td>
                    <td>{c.counterparty}</td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</div>
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{c.project?.name || '–'}</td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{fmt(c.valid_to)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{c.value ? fmtMoney(c.value, c.currency) : '–'}</td>
                    <td><ContractStatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
