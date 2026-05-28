import { useEffect, useState } from 'react'
import { userService } from '../services/documentService'
import type { User, UserRole } from '../types'
import { ROLE_LABELS } from '../types'
import toast from 'react-hot-toast'
import { UserPlus, UserX, Trash2, AlertTriangle, KeyRound } from 'lucide-react'

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
const avatarColors: Record<UserRole, string> = {
  admin: 'red', ekonom: 'green', pripravar: 'green', foreman: 'amber', director: '',
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'ekonom' as UserRole })

  const load = () => userService.list().then(setUsers).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await userService.create(form)
      toast.success('Používateľ vytvorený')
      setShowModal(false)
      setForm({ full_name: '', email: '', password: '', role: 'ekonom' })
      load()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Chyba') }
    finally { setSaving(false) }
  }

  const handleDeactivate = async (u: User) => {
    if (!confirm(`Deaktivovať používateľa ${u.full_name}?`)) return
    try { await userService.deactivate(u.id); toast.success('Deaktivovaný'); load() }
    catch { toast.error('Chyba') }
  }

  const handleHardDelete = async () => {
    if (!confirmDelete) return
    try {
      await userService.hardDelete(confirmDelete.id)
      toast.success(`${confirmDelete.full_name} vymazaný`)
      setConfirmDelete(null); load()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Chyba') }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPasswordUser || newPassword.length < 6) { toast.error('Min. 6 znakov'); return }
    try {
      await userService.update(resetPasswordUser.id, { password: newPassword })
      toast.success('Heslo zmenené')
      setResetPasswordUser(null); setNewPassword('')
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Chyba') }
  }

  if (loading) return <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><span className="spinner" style={{ width: 24, height: 24 }} /></div>

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><UserPlus size={15} /> Pridať používateľa</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {users.map(u => (
          <div key={u.id} className="card" style={{ opacity: u.is_active ? 1 : 0.5 }}>
            <div className="card-body">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <div className={`avatar ${avatarColors[u.role]}`}>{initials(u.full_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500,
                  background: u.role === 'admin' ? 'var(--brand-red-light)' : (u.role === 'ekonom' || u.role === 'pripravar') ? 'var(--green-light)' : u.role === 'foreman' ? 'var(--amber-light)' : 'var(--blue-light)',
                  color: u.role === 'admin' ? 'var(--brand-red)' : (u.role === 'ekonom' || u.role === 'pripravar') ? 'var(--green)' : u.role === 'foreman' ? 'var(--amber)' : 'var(--blue)',
                }}>{ROLE_LABELS[u.role]}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" title="Zmeniť heslo" onClick={() => { setResetPasswordUser(u); setNewPassword('') }}><KeyRound size={13} /></button>
                  {u.is_active && <button className="btn btn-ghost btn-sm" title="Deaktivovať" onClick={() => handleDeactivate(u)}><UserX size={13} /></button>}
                  <button className="btn btn-ghost btn-sm" title="Vymazať" style={{ color: 'var(--brand-red)' }} onClick={() => setConfirmDelete(u)}><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h3>Nový používateľ</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group"><label className="form-label">Celé meno *</label><input required value={form.full_name} onChange={set('full_name')} placeholder="Ján Novák" /></div>
              <div className="form-group"><label className="form-label">Email *</label><input required type="email" value={form.email} onChange={set('email')} /></div>
              <div className="form-group">
                <label className="form-label">Rola *</label>
                <select value={form.role} onChange={set('role')}>
                  <option value="ekonom">Ekonóm</option>
                  <option value="pripravar">Prípravár</option>
                  <option value="foreman">Stavbyvedúci</option>
                  <option value="director">Riaditeľ</option>
                  <option value="admin">Administrátor</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Heslo *</label><input required type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 znakov" /></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Zrušiť</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <UserPlus size={14} />} Vytvoriť
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetPasswordUser && (
        <div className="modal-overlay" onClick={() => setResetPasswordUser(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <h3>Zmeniť heslo – {resetPasswordUser.full_name}</h3>
            <form onSubmit={handleResetPassword}>
              <div className="form-group"><label className="form-label">Nové heslo *</label><input required type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 znakov" autoFocus minLength={6} /></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setResetPasswordUser(null)}>Zrušiť</button>
                <button type="submit" className="btn btn-primary"><KeyRound size={13} /> Uložiť</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}><AlertTriangle size={22} color="var(--brand-red)" /><h3 style={{ margin: 0 }}>Vymazať používateľa</h3></div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Naozaj <strong>natvrdo vymazať</strong> <strong>{confirmDelete.full_name}</strong>? Táto akcia je nezvratná.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Zrušiť</button>
              <button className="btn btn-danger" onClick={handleHardDelete}><Trash2 size={13} /> Vymazať</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
