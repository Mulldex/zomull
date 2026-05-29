import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { contractService, projectService, supplierService, userService } from '../services/documentService'
import type { Project, Supplier, User } from '../types'
import { CONTRACT_TYPE_LABELS, CURRENCY_OPTIONS, ROLE_LABELS } from '../types'
import { useAuth } from '../context/AuthContext'

export default function CreateContractPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  const [contractNumber, setContractNumber] = useState('')
  const [contractType, setContractType] = useState('zmluva_o_dielo')
  const [counterparty, setCounterparty] = useState('')
  const [subject, setSubject] = useState('')
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [signDate, setSignDate] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [foremanId, setForemanId] = useState('')
  const [notes, setNotes] = useState('')
  const [foremen, setForemen] = useState<User[]>([])

  useEffect(() => {
    Promise.all([projectService.list(), supplierService.list(), userService.list()])
      .then(([p, s, u]) => {
        setProjects(p); setSuppliers(s)
        setForemen(u.filter(x => x.role === 'foreman' && x.is_active))
      })
      .catch(() => {})
  }, [])

  // Pri zmene projektu predvyplň foreman podľa projektu (ak je priradený)
  useEffect(() => {
    if (!projectId) return
    const p = projects.find(p => p.id === +projectId)
    if (p?.foremen && p.foremen.length > 0) {
      setForemanId(String(p.foremen[0].id))
    }
  }, [projectId, projects])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!counterparty || !subject) {
      toast.error('Vyplňte povinné polia')
      return
    }
    setLoading(true)
    try {
      const toISO = (d: string) => d ? new Date(d).toISOString() : null

      if (pdfFile) {
        const fd = new FormData()
        // contract_number sa generuje na backende automaticky
        fd.append('contract_type', contractType)
        fd.append('counterparty', counterparty)
        fd.append('subject', subject)
        if (value) fd.append('value', value)
        fd.append('currency', currency)
        if (signDate) fd.append('sign_date', toISO(signDate)!)
        if (validFrom) fd.append('valid_from', toISO(validFrom)!)
        if (validTo) fd.append('valid_to', toISO(validTo)!)
        if (supplierId) fd.append('supplier_id', supplierId)
        if (projectId) fd.append('project_id', projectId)
        if (notes) fd.append('notes', notes)
        fd.append('file', pdfFile)
        const contract = await contractService.upload(fd)
        toast.success('Zmluva s PDF bola vytvorená')
        navigate(`/zmluvy/${contract.id}`)
      } else {
        const contract = await contractService.create({
          // contract_number sa generuje na backende
          contract_type: contractType,
          counterparty,
          subject,
          value: value ? +value : null,
          currency,
          sign_date: toISO(signDate),
          valid_from: toISO(validFrom),
          valid_to: toISO(validTo),
          supplier_id: supplierId ? +supplierId : null,
          project_id: projectId ? +projectId : null,
          foreman_id: foremanId ? +foremanId : null,
          notes: notes || null,
        })
        toast.success('Zmluva bola vytvorená a odoslaná na schválenie')
        navigate(`/zmluvy/${contract.id}`)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri vytváraní zmluvy')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-content">
      <div className="card" style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="card-header">
          <h3 className="card-title">Nová zmluva</h3>
          <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Zmluva bude odoslaná na paralelné schválenie stavbyvedúcim, ekonómom a riaditeľom
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Číslo zmluvy</label>
                <input
                  value="Vygeneruje sa automaticky podľa projektu"
                  disabled
                  style={{ color: 'var(--text3)', fontStyle: 'italic' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Typ zmluvy *</label>
                <select value={contractType} onChange={e => setContractType(e.target.value)}>
                  {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Vytvoril</label>
                <input
                  value={user ? `${user.full_name} (${ROLE_LABELS[user.role]})` : ''}
                  disabled
                  style={{ color: 'var(--text2)' }}
                />
              </div>
              <div className="form-group" />
            </div>

            <div className="form-group">
              <label className="form-label">Zmluvná strana *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={supplierId} onChange={e => {
                  setSupplierId(e.target.value)
                  const s = suppliers.find(s => s.id === +e.target.value)
                  if (s) setCounterparty(s.name)
                }} style={{ width: 220, flex: 'none' }}>
                  <option value="">-- Zo zoznamu --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="Alebo zadajte manuálne" style={{ flex: 1 }} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Predmet zmluvy *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Napr. Realizácia stavebných prác..." required />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Hodnota zmluvy</label>
                <input type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Mena</label>
                <select value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCY_OPTIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label">Dátum podpisu</label>
                <input type="date" value={signDate} onChange={e => setSignDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Platnosť od</label>
                <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Platnosť do</label>
                <input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Projekt / stavba</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                  <option value="">-- Bez projektu --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Stavbyvedúci (1. schvaľovateľ)</label>
                <select value={foremanId} onChange={e => setForemanId(e.target.value)}>
                  <option value="">-- Automaticky (z projektu / prvý dostupný) --</option>
                  {foremen.map(f => <option key={f.id} value={f.id}>{f.full_name}</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Po vytvorení zmluvy ide na schválenie tomuto stavbyvedúcemu, potom riaditeľovi.
                </div>
              </div>
            </div>

            {/* PDF upload */}
            <div className="form-group">
              <label className="form-label">Príloha PDF (voliteľné)</label>
              <div className="upload-zone" onClick={() => document.getElementById('pdf-input')?.click()}>
                {pdfFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={20} color="var(--brand-red)" />
                    <span>{pdfFile.name}</span>
                    <button type="button" onClick={e => { e.stopPropagation(); setPdfFile(null) }}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <>
                    <Upload size={24} style={{ margin: '0 auto 8px', display: 'block', color: 'var(--text3)' }} />
                    <div>Kliknite pre výber PDF zmluvy</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Max 20 MB</div>
                  </>
                )}
              </div>
              <input id="pdf-input" type="file" accept=".pdf" style={{ display: 'none' }}
                onChange={e => setPdfFile(e.target.files?.[0] || null)} />
            </div>

            <div className="form-group">
              <label className="form-label">Poznámky</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Voliteľné poznámky..." />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/zmluvy')}>Zrušiť</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Ukladám...</> : 'Vytvoriť zmluvu'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
