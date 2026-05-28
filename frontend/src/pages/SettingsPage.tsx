import { useEffect, useState } from 'react'
import { settingsService, projectService, userService, companyService } from '../services/documentService'
import type { ApprovalRule, Project, User, CompanyInfo } from '../types'
import toast from 'react-hot-toast'
import { Save, Plus, Users, X, Check, Building2, Image as ImageIcon, Trash2 } from 'lucide-react'
import api from '../services/api'

const EMPTY_COMPANY: CompanyInfo = {
  name: '', ico: '', dic: '', ic_dph: '', address: '',
  email: '', phone: '', bank_name: '', iban: '', swift: '', contact_person: '',
  logo_path: null,
}

export default function SettingsPage() {
  const [rules, setRules] = useState<ApprovalRule[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [foremen, setForemen] = useState<User[]>([])
  const [saving, setSaving] = useState(false)
  const [assignModal, setAssignModal] = useState<Project | null>(null)
  const [selectedForemen, setSelectedForemen] = useState<number[]>([])
  const [assignSaving, setAssignSaving] = useState(false)

  const [company, setCompany] = useState<CompanyInfo>(EMPTY_COMPANY)
  const [companySaving, setCompanySaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)

  const load = async () => {
    const [r, p, u, c] = await Promise.all([
      settingsService.getApprovalRules(),
      projectService.list(false),
      userService.list(),
      companyService.get().catch(() => EMPTY_COMPANY),
    ])
    setRules(r)
    setProjects(p)
    setForemen(u.filter(u => u.role === 'foreman' && u.is_active))
    setCompany({ ...EMPTY_COMPANY, ...c })
  }
  useEffect(() => { load() }, [])

  const saveCompany = async () => {
    setCompanySaving(true)
    try {
      const saved = await companyService.update(company)
      setCompany({ ...EMPTY_COMPANY, ...saved })
      toast.success('Údaje firmy uložené')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri ukladaní')
    } finally { setCompanySaving(false) }
  }

  const setC = (field: keyof CompanyInfo, val: string) =>
    setCompany(prev => ({ ...prev, [field]: val }))

  const uploadLogo = async (file: File) => {
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post<CompanyInfo>('/settings/company/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setCompany({ ...EMPTY_COMPANY, ...data })
      toast.success('Logo nahrané')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri nahrávaní loga')
    } finally { setLogoUploading(false) }
  }

  const deleteLogo = async () => {
    if (!confirm('Naozaj zmazať logo?')) return
    setLogoUploading(true)
    try {
      const { data } = await api.delete<CompanyInfo>('/settings/company/logo')
      setCompany({ ...EMPTY_COMPANY, ...data })
      toast.success('Logo zmazané')
    } catch { toast.error('Chyba') }
    finally { setLogoUploading(false) }
  }

  const saveRules = async () => {
    setSaving(true)
    try {
      await settingsService.resetApprovalRules(rules.map(r => ({
        max_amount: r.max_amount,
        approver_role: r.approver_role,
        label: r.label || '',
      })))
      toast.success('Pravidlá uložené')
    } catch { toast.error('Chyba') }
    finally { setSaving(false) }
  }

  const openAssign = (project: Project) => {
    setAssignModal(project)
    setSelectedForemen((project.foremen || []).map(f => f.id))
  }

  const toggleForeman = (id: number) =>
    setSelectedForemen(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])

  const saveAssignment = async () => {
    if (!assignModal) return
    setAssignSaving(true)
    try {
      // Najprv odstrán všetkých, potom pridaj vybraných
      const current = (assignModal.foremen || []).map(f => f.id)
      for (const id of current) {
        if (!selectedForemen.includes(id))
          await api.delete(`/projects/${assignModal.id}/foremen/${id}`)
      }
      for (const id of selectedForemen) {
        if (!current.includes(id))
          await api.post(`/projects/${assignModal.id}/foremen/${id}`)
      }
      toast.success('Stavbyvedúci priradení')
      setAssignModal(null); load()
    } catch { toast.error('Chyba') }
    finally { setAssignSaving(false) }
  }

  return (
    <div className="page-content">
      {/* Údaje vašej firmy (objednávateľ) */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title"><Building2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Údaje vašej firmy (objednávateľ)</h3>
          <button className="btn btn-primary btn-sm" onClick={saveCompany} disabled={companySaving}>
            <Save size={14} /> {companySaving ? 'Ukladám...' : 'Uložiť'}
          </button>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Tieto údaje sa automaticky predvyplnia v každej novej objednávke ako objednávateľ. V jednotlivej objednávke ich možno upraviť.
          </p>

          {/* Logo */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20, padding: 14, background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
            <div style={{ width: 140, height: 60, border: '1px dashed var(--border2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', overflow: 'hidden' }}>
              {company.logo_path
                ? <img src={`/uploads/${company.logo_path.split(/[\\/]/).pop()}`} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <ImageIcon size={28} color="var(--text3)" />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Logo firmy</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
                PNG alebo JPG, max 5 MB. Použije sa v PDF tlačivách objednávok.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                  <ImageIcon size={13} /> {logoUploading ? 'Nahrávam…' : 'Vybrať súbor'}
                  <input type="file" accept="image/png,image/jpeg,image/jpg" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} disabled={logoUploading} />
                </label>
                {company.logo_path && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--brand-red)' }}
                    onClick={deleteLogo} disabled={logoUploading}>
                    <Trash2 size={13} /> Zmazať
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Názov firmy *</label>
              <input value={company.name || ''} onChange={e => setC('name', e.target.value)} placeholder="napr. ZOMULL s.r.o." />
            </div>
            <div className="form-group">
              <label className="form-label">Kontaktná osoba</label>
              <input value={company.contact_person || ''} onChange={e => setC('contact_person', e.target.value)} />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">IČO</label>
              <input value={company.ico || ''} onChange={e => setC('ico', e.target.value)} placeholder="12345678" />
            </div>
            <div className="form-group">
              <label className="form-label">DIČ</label>
              <input value={company.dic || ''} onChange={e => setC('dic', e.target.value)} placeholder="2023456789" />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">IČ DPH</label>
              <input value={company.ic_dph || ''} onChange={e => setC('ic_dph', e.target.value)} placeholder="SK2023456789" />
            </div>
            <div className="form-group">
              <label className="form-label">Telefón</label>
              <input value={company.phone || ''} onChange={e => setC('phone', e.target.value)} placeholder="+421 ..." />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Adresa sídla</label>
            <input value={company.address || ''} onChange={e => setC('address', e.target.value)} placeholder="Ulica, mesto, PSČ" />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" value={company.email || ''} onChange={e => setC('email', e.target.value)} />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Banka</label>
              <input value={company.bank_name || ''} onChange={e => setC('bank_name', e.target.value)} placeholder="napr. Tatra banka" />
            </div>
            <div className="form-group">
              <label className="form-label">IBAN</label>
              <input value={company.iban || ''} onChange={e => setC('iban', e.target.value)} placeholder="SK..." />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">SWIFT / BIC</label>
            <input value={company.swift || ''} onChange={e => setC('swift', e.target.value)} placeholder="TATRSKBX" />
          </div>
        </div>
      </div>

      {/* Schvaľovacie pravidlá objednávok */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">Pravidlá schvaľovania objednávok</h3>
          <button className="btn btn-primary btn-sm" onClick={saveRules} disabled={saving}>
            <Save size={14} /> {saving ? 'Ukladám...' : 'Uložiť'}
          </button>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Pravidlá pre objednávky – do limitu schvaľuje stavbyvedúci, nad limit aj riaditeľ. Zmluvy sa vždy posielajú na paralelné schválenie všetkým trom (stavbyvedúci + ekonóm + riaditeľ).
          </p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 14 }}>
            <table className="table" style={{ marginBottom: 0 }}>
              <thead>
                <tr><th>Poradie</th><th>Max. suma (€)</th><th>Schvaľovateľ</th><th>Popis</th><th></th></tr>
              </thead>
              <tbody>
                {rules.map((rule, i) => (
                  <tr key={rule.id}>
                    <td style={{ color: 'var(--text3)', fontWeight: 600 }}>#{i + 1}</td>
                    <td>
                      <input type="number" min="0" placeholder="(bez limitu)"
                        value={rule.max_amount ?? ''}
                        onChange={e => setRules(rs => rs.map((r, idx) =>
                          idx === i ? { ...r, max_amount: e.target.value ? Number(e.target.value) : null } : r
                        ))} style={{ width: 130 }} />
                    </td>
                    <td>
                      <select value={rule.approver_role}
                        onChange={e => setRules(rs => rs.map((r, idx) =>
                          idx === i ? { ...r, approver_role: e.target.value as any } : r
                        ))} style={{ width: 160 }}>
                        <option value="foreman">Stavbyvedúci</option>
                        <option value="director">Riaditeľ</option>
                        <option value="admin">Administrátor</option>
                      </select>
                    </td>
                    <td>
                      <input value={rule.label}
                        onChange={e => setRules(rs => rs.map((r, idx) =>
                          idx === i ? { ...r, label: e.target.value } : r
                        ))} placeholder="Popis pravidla" style={{ width: 200 }} />
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--brand-red)' }}
                        onClick={() => setRules(rs => rs.filter((_, idx) => idx !== i))}>Odstrániť</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost btn-sm"
            onClick={() => setRules(rs => [...rs, { id: Date.now(), max_amount: null, approver_role: 'director', label: '', is_active: true, order: rs.length }])}>
            <Plus size={13} /> Pridať pravidlo
          </button>
        </div>
      </div>

      {/* Projekty – priradenie stavbyvedúcich */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Projekty – priradenie stavbyvedúcich</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>Názov projektu</th><th>Kód</th><th>Adresa</th><th>Investor</th><th>Stavbyvedúci</th><th>Stav</th><th>Akcie</th></tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td><code style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>{p.code}</code></td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.address || '–'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.investor || '–'}</td>
                  <td>
                    {(p.foremen && p.foremen.length > 0)
                      ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {p.foremen.map(f => <span key={f.id} style={{ fontSize: 11, background: 'var(--amber-light)', color: 'var(--amber)', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>{f.full_name}</span>)}
                      </div>
                      : <span style={{ color: 'var(--text3)', fontSize: 12 }}>Nepriradený</span>}
                  </td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: p.is_active ? 'var(--green-light)' : 'var(--brand-red-light)', color: p.is_active ? 'var(--green)' : 'var(--brand-red)' }}>
                      {p.is_active ? 'Aktívny' : 'Uzavretý'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openAssign(p)}><Users size={13} /> Priradiť</button>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>Žiadne projekty – pridajte ich v sekcii Projekty</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {assignModal && (
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Priradiť stavbyvedúcich</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setAssignModal(null)}><X size={14} /></button>
            </div>
            <div style={{ background: 'var(--surface2)', padding: '8px 12px', borderRadius: 'var(--radius)', marginBottom: 14, fontSize: 13 }}>
              <strong>{assignModal.name}</strong> ({assignModal.code})
            </div>
            {foremen.length === 0 ? (
              <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>Žiadni stavbyvedúci v systéme</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {foremen.map(f => (
                  <div key={f.id} onClick={() => toggleForeman(f.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 'var(--radius)',
                    border: `1.5px solid ${selectedForemen.includes(f.id) ? 'var(--brand-red)' : 'var(--border)'}`,
                    background: selectedForemen.includes(f.id) ? 'var(--brand-red-light)' : 'var(--surface)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ width: 22, height: 22, borderRadius: 4, border: `1.5px solid ${selectedForemen.includes(f.id) ? 'var(--brand-red)' : 'var(--border2)'}`, background: selectedForemen.includes(f.id) ? 'var(--brand-red)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selectedForemen.includes(f.id) && <Check size={13} color="#fff" />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{f.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{f.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setAssignModal(null)}>Zrušiť</button>
              <button className="btn btn-primary" onClick={saveAssignment} disabled={assignSaving}>
                {assignSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Check size={14} />} Uložiť
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
