import { useEffect, useState } from 'react'
import { supplierService } from '../services/documentService'
import type { Supplier } from '../types'
import toast from 'react-hot-toast'
import { Plus, CheckCircle, XCircle, Building2, Search } from 'lucide-react'

type SupplierStatus = 'approved' | 'blacklisted' | 'new'

const STATUS_LABELS: Record<SupplierStatus, string> = {
  approved: 'Overený', blacklisted: 'Blacklist', new: 'Nový',
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', ico: '', dic: '', ic_dph: '', address: '', email: '',
    phone: '', contact_person: '', status: 'new' as SupplierStatus,
    note: '', is_vat_payer: true,
  })

  const load = async () => {
    setLoading(true)
    try { setSuppliers(await supplierService.list()) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const filtered = suppliers.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.ico || '').includes(search)
    const matchStatus = !statusFilter || s.status === statusFilter
    return matchSearch && matchStatus
  })

  const openCreate = () => {
    setEditSupplier(null)
    setForm({ name: '', ico: '', dic: '', ic_dph: '', address: '', email: '', phone: '', contact_person: '', status: 'new', note: '', is_vat_payer: true })
    setShowModal(true)
  }
  const openEdit = (s: Supplier) => {
    setEditSupplier(s)
    setForm({ name: s.name, ico: s.ico || '', dic: s.dic || '', ic_dph: s.ic_dph || '', address: s.address || '', email: s.email || '', phone: s.phone || '', contact_person: s.contact_person || '', status: s.status as SupplierStatus, note: s.note || '', is_vat_payer: s.is_vat_payer })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editSupplier) {
        await supplierService.update(editSupplier.id, form)
        toast.success('Dodávateľ aktualizovaný')
      } else {
        await supplierService.create(form)
        toast.success('Dodávateľ pridaný')
      }
      setShowModal(false); load()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Chyba') }
    finally { setSaving(false) }
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  return (
    <div className="page-content">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hľadať podľa názvu, IČO..." style={{ paddingLeft: 32 }} />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 150 }}>
              <option value="">Všetky stavy</option>
              <option value="approved">Overení</option>
              <option value="new">Noví</option>
              <option value="blacklisted">Blacklist</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={14} /> Pridať dodávateľa</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title"><Building2 size={15} /> Dodávatelia <span className="badge">{filtered.length}</span></h3>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" style={{ width: 24, height: 24 }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>Žiadni dodávatelia</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Názov</th><th>IČO</th><th>DIČ</th><th>Kontakt</th><th>DPH</th><th>Stav</th><th>Akcie</th></tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>
                      {s.name}
                      {s.note && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.note.slice(0, 50)}</div>}
                    </td>
                    <td>{s.ico || '–'}</td>
                    <td>{s.dic || '–'}</td>
                    <td>
                      {s.contact_person && <div style={{ fontSize: 12 }}>{s.contact_person}</div>}
                      {s.email && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.email}</div>}
                      {s.phone && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.phone}</div>}
                    </td>
                    <td>
                      {s.is_vat_payer
                        ? <span style={{ fontSize: 11, background: 'var(--green-light)', color: 'var(--green)', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>Platiteľ</span>
                        : <span style={{ fontSize: 11, background: 'var(--brand-red-light)', color: 'var(--brand-red)', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>Neplatiteľ</span>
                      }
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                        background: s.status === 'approved' ? 'var(--green-light)' : s.status === 'blacklisted' ? 'var(--brand-red-light)' : 'var(--blue-light)',
                        color: s.status === 'approved' ? 'var(--green)' : s.status === 'blacklisted' ? 'var(--brand-red)' : 'var(--blue)',
                      }}>{STATUS_LABELS[s.status as SupplierStatus]}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Upraviť</button>
                        {s.status !== 'approved' && (
                          <button className="btn btn-ghost btn-sm" title="Overiť" onClick={async () => { await supplierService.update(s.id, { status: 'approved' }); load() }}>
                            <CheckCircle size={12} style={{ color: 'var(--green)' }} />
                          </button>
                        )}
                        {s.status !== 'blacklisted' && (
                          <button className="btn btn-ghost btn-sm" title="Blacklist" onClick={async () => { await supplierService.update(s.id, { status: 'blacklisted' }); load() }}>
                            <XCircle size={12} style={{ color: 'var(--brand-red)' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h3>{editSupplier ? 'Upraviť dodávateľa' : 'Nový dodávateľ'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group"><label className="form-label">Názov firmy *</label><input required value={form.name} onChange={set('name')} placeholder="Stavmat s.r.o." /></div>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">IČO</label><input value={form.ico} onChange={set('ico')} placeholder="12345678" /></div>
                <div className="form-group"><label className="form-label">DIČ</label><input value={form.dic} onChange={set('dic')} placeholder="2023456789" /></div>
                <div className="form-group"><label className="form-label">IČ DPH</label><input value={form.ic_dph} onChange={set('ic_dph')} placeholder="SK2023456789" /></div>
              </div>
              <div className="form-group"><label className="form-label">Adresa</label><input value={form.address} onChange={set('address')} placeholder="Ulica 1, 010 01 Mesto" /></div>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Email</label><input type="email" value={form.email} onChange={set('email')} /></div>
                <div className="form-group"><label className="form-label">Telefón</label><input value={form.phone} onChange={set('phone')} /></div>
              </div>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Kontaktná osoba</label><input value={form.contact_person} onChange={set('contact_person')} /></div>
                <div className="form-group"><label className="form-label">Stav</label>
                  <select value={form.status} onChange={set('status')}>
                    <option value="new">Nový</option><option value="approved">Overený</option><option value="blacklisted">Blacklist</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, display: 'flex' }}>
                <input type="checkbox" id="vat" checked={form.is_vat_payer} onChange={e => setForm(f => ({ ...f, is_vat_payer: e.target.checked }))} style={{ width: 'auto' }} />
                <label htmlFor="vat" className="form-label" style={{ marginBottom: 0 }}>Platiteľ DPH</label>
              </div>
              <div className="form-group"><label className="form-label">Poznámka</label><textarea value={form.note} onChange={set('note')} /></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Zrušiť</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null} {editSupplier ? 'Uložiť' : 'Pridať'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
