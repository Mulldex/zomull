import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MapPin, User, Calendar, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectService } from '../services/documentService'
import type { Project } from '../types'
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

export default function ProjectsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)

  // Form
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [investor, setInvestor] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setProjects(await projectService.list(false)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openEdit = (p: Project) => {
    setEditProject(p)
    setName(p.name); setCode(p.code); setDescription(p.description || ''); setAddress(p.address || '')
    setInvestor(p.investor || ''); setStartDate(p.start_date?.slice(0, 10) || ''); setEndDate(p.end_date?.slice(0, 10) || '')
    setBudget(p.budget?.toString() || ''); setCurrency(p.currency)
    setShowForm(true)
  }

  const resetForm = () => { setShowForm(false); setEditProject(null); setName(''); setCode(''); setDescription(''); setAddress(''); setInvestor(''); setStartDate(''); setEndDate(''); setBudget(''); setCurrency('EUR') }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name, code, description: description || null, address: address || null,
        investor: investor || null, start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
        budget: budget ? +budget : null, currency,
      }
      if (editProject) {
        await projectService.update(editProject.id, payload)
        toast.success('Projekt aktualizovaný')
      } else {
        await projectService.create({ ...payload, is_active: true })
        toast.success('Projekt vytvorený')
      }
      resetForm(); load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba')
    } finally { setSaving(false) }
  }

  return (
    <div className="page-content">
      {user?.role === 'admin' && !showForm && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Nový projekt</button>
        </div>
      )}

      {showForm && (
        <div className="card" style={{ maxWidth: 760, marginBottom: 20 }}>
          <div className="card-header">
            <h3 className="card-title">{editProject ? 'Upraviť projekt' : 'Nový projekt'}</h3>
          </div>
          <div className="card-body">
            <form onSubmit={handleSave}>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Názov projektu *</label>
                  <input value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Kód projektu *</label>
                  <input value={code} onChange={e => setCode(e.target.value)} placeholder="P-2026-01" required disabled={!!editProject} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Adresa / miesto stavby</label>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Ulica, mesto" />
              </div>
              <div className="form-group">
                <label className="form-label">Investor / objednávateľ</label>
                <input value={investor} onChange={e => setInvestor(e.target.value)} />
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Dátum začatia</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Dátum ukončenia</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Rozpočet projektu</label>
                  <input type="number" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Mena</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}>
                    {['EUR', 'CZK', 'USD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Popis</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={resetForm}>Zrušiť</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Ukladám...</> : 'Uložiť projekt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><span className="spinner" style={{ width: 24, height: 24 }} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {projects.map(p => (
            <div
              key={p.id}
              className="card"
              style={{ opacity: p.is_active ? 1 : 0.6, cursor: 'pointer' }}
              onClick={() => navigate(`/projekty/${p.id}`)}
            >
              <div className="card-header">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{p.code}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {!p.is_active && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Neaktívny</span>}
                  {user?.role === 'admin' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => { e.stopPropagation(); openEdit(p) }}
                    >
                      Upraviť
                    </button>
                  )}
                </div>
              </div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                {p.address && <div style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}><MapPin size={13} /> {p.address}</div>}
                {p.investor && <div style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}><User size={13} /> {p.investor}</div>}
                {(p.start_date || p.end_date) && (
                  <div style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                    <Calendar size={13} /> {fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                  </div>
                )}
                {p.budget && (
                  <div style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text2)' }}>
                    <DollarSign size={13} /> {fmtMoney(p.budget, p.currency)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Žiadne projekty</div>
          )}
        </div>
      )}
    </div>
  )
}
