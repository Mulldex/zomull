import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, FileText, ArrowLeft, Trash2, Upload, Check, X, Paperclip, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { contractService } from '../services/documentService'
import type { Contract } from '../types'
import { useAuth } from '../context/AuthContext'
import { ContractStatusBadge } from '../components/ui/StatusBadge'
import { CONTRACT_TYPE_LABELS } from '../types'
import { format } from 'date-fns'
import { sk } from 'date-fns/locale'

function fmt(d: string) {
  try { return format(new Date(d), 'd. M. yyyy HH:mm', { locale: sk }) } catch { return d }
}
function fmtDate(d?: string) {
  if (!d) return '–'
  try { return format(new Date(d), 'd. M. yyyy', { locale: sk }) } catch { return d }
}
function fmtMoney(v: number, c = 'EUR') {
  return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(v)
}

function ApproverRow({ label, user, approved, approvedAt }: { label: string; user?: { full_name: string } | null; approved: boolean; approvedAt?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: approved ? 'var(--green-light)' : 'var(--surface2)',
        color: approved ? 'var(--green)' : 'var(--text3)',
      }}>
        {approved ? <Check size={14} /> : <X size={14} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          {user?.full_name || '–'}{approvedAt ? ` · ${fmtDate(approvedAt)}` : ''}
        </div>
      </div>
    </div>
  )
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [rejecting, setRejecting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [attachmentLabel, setAttachmentLabel] = useState('Zmluva o dielo')
  const [attachmentUploading, setAttachmentUploading] = useState(false)

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!contract || !e.target.files?.[0]) return
    const f = e.target.files[0]
    e.target.value = ''
    setAttachmentUploading(true)
    try {
      await contractService.uploadAttachment(contract.id, f, attachmentLabel || undefined)
      toast.success('Príloha nahratá')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri nahrávaní prílohy')
    } finally { setAttachmentUploading(false) }
  }

  const handleAttachmentDelete = async (attId: number, name: string) => {
    if (!contract || !confirm(`Zmazať prílohu "${name}"?`)) return
    try {
      await contractService.deleteAttachment(contract.id, attId)
      toast.success('Príloha zmazaná')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri mazaní')
    }
  }

  const handleAttachmentDownload = async (attId: number, name: string) => {
    if (!contract) return
    try {
      await contractService.downloadAttachment(contract.id, attId, name)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri sťahovaní')
    }
  }

  const fmtFileSize = (bytes?: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const load = async () => {
    if (!id) return
    setLoading(true)
    try { setContract(await contractService.get(+id)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  const myApprovalDone = () => {
    if (!contract || !user) return false
    if (user.role === 'foreman') return contract.foreman_approved
    if (user.role === 'ekonom') return contract.ekonom_approved
    if (user.role === 'director') return contract.director_approved
    return false
  }

  const canApprove = () => {
    if (!contract || !user) return false
    if (contract.status !== 'pending_approval') return false
    if (user.role === 'admin') return true
    if (user.role === 'foreman') return contract.foreman_approver?.id === user.id && !contract.foreman_approved
    if (user.role === 'ekonom') return contract.ekonom_approver?.id === user.id && !contract.ekonom_approved
    if (user.role === 'director') return contract.director_approver?.id === user.id && !contract.director_approved
    return false
  }

  const handleApprove = async () => {
    if (!contract) return
    setSubmitting(true)
    try {
      await contractService.approve(contract.id, { approved: true })
      toast.success('Schválené')
      load()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Chyba') }
    finally { setSubmitting(false) }
  }

  const handleReject = async () => {
    if (!contract || !rejectionReason) { toast.error('Zadajte dôvod zamietnutia'); return }
    setSubmitting(true)
    try {
      await contractService.approve(contract.id, { approved: false, rejection_reason: rejectionReason })
      toast.success('Zmluva zamietnutá')
      setRejecting(false)
      load()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Chyba') }
    finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!contract || !confirm('Naozaj vymazať zmluvu?')) return
    await contractService.delete(contract.id)
    toast.success('Zmluva vymazaná')
    navigate('/zmluvy')
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!contract || !e.target.files?.[0]) return
    const fd = new FormData()
    fd.append('file', e.target.files[0])
    try {
      await contractService.attachPdf(contract.id, fd)
      toast.success('PDF priložené')
      load()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Chyba') }
  }

  if (loading) return <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><span className="spinner" style={{ width: 28, height: 28 }} /></div>
  if (!contract) return <div className="page-content"><div className="alert alert-error">Zmluva nenájdená</div></div>

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/zmluvy')}><ArrowLeft size={14} /></button>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{contract.contract_number}</h2>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>{CONTRACT_TYPE_LABELS[contract.contract_type]} · {contract.counterparty}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ContractStatusBadge status={contract.status} />
          {user?.role === 'admin' && (
            <button className="btn btn-ghost btn-sm" onClick={handleDelete} style={{ color: 'var(--brand-red)' }}><Trash2 size={14} /></button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><h3 className="card-title">Základné údaje</h3></div>
            <div className="card-body">
              <div className="detail-grid">
                {[
                  ['Predmet', contract.subject],
                  ['Zmluvná strana', contract.counterparty],
                  ['Typ', CONTRACT_TYPE_LABELS[contract.contract_type]],
                  ['Hodnota', contract.value ? fmtMoney(contract.value, contract.currency) : '–'],
                  ['Dátum podpisu', fmtDate(contract.sign_date)],
                  ['Platnosť od', fmtDate(contract.valid_from)],
                  ['Platnosť do', fmtDate(contract.valid_to)],
                  ['Projekt', contract.project?.name || '–'],
                  ['Vytvoril', contract.creator?.full_name],
                  contract.notes ? ['Poznámky', contract.notes] : null,
                ].filter((x): x is [string, string] => x !== null).map(([label, val]) => (
                  <div key={label as string} className="detail-row">
                    <span className="detail-label">{label}</span>
                    <span className="detail-value">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Prílohy k zmluve (Word, Excel, PDF, MSG, EML) */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><Paperclip size={15} /> Prílohy k zmluve</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={attachmentLabel}
                  onChange={e => setAttachmentLabel(e.target.value)}
                  placeholder="Popis (napr. Zmluva o dielo)"
                  style={{ width: 200, fontSize: 12, padding: '4px 8px' }}
                />
                {(user?.role === 'admin' || user?.role === 'ekonom' || user?.role === 'pripravar' || user?.role === 'foreman' || user?.role === 'director') && (
                  <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                    <Upload size={13} /> {attachmentUploading ? 'Nahrávam…' : 'Pridať prílohu'}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.msg,.eml,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.7z,.txt,.rtf,.odt,.ods"
                      style={{ display: 'none' }}
                      onChange={handleAttachmentUpload}
                      disabled={attachmentUploading}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="card-body">
              {(contract.attachments && contract.attachments.length > 0) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {contract.attachments.map(att => (
                    <div key={att.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                      background: 'var(--surface)',
                    }}>
                      <Paperclip size={14} color="var(--text3)" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {att.original_filename}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {att.label && <><strong style={{ color: 'var(--brand-red)' }}>{att.label}</strong> · </>}
                          {fmtFileSize(att.file_size)}
                          {att.uploader && <> · {att.uploader.full_name}</>}
                          {' · '}{fmtDate(att.uploaded_at)}
                        </div>
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => handleAttachmentDownload(att.id, att.original_filename)} title="Stiahnuť">
                        <Download size={13} />
                      </button>
                      {(user?.role === 'admin' || user?.role === 'ekonom' || user?.role === 'pripravar') && (
                        <button type="button" className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--brand-red)' }}
                          onClick={() => handleAttachmentDelete(att.id, att.original_filename)} title="Zmazať">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text3)', fontSize: 13, padding: '4px 0' }}>
                  Žiadne prílohy. Nahraj vyplnenú zmluvu o dielo (Word/PDF), emaily z Outlooku alebo iné dokumenty.
                </div>
              )}
            </div>
          </div>

        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><h3 className="card-title">Stav schvaľovania</h3></div>
            <div className="card-body">
              <ApproverRow label="Stavbyvedúci" user={contract.foreman_approver} approved={contract.foreman_approved} approvedAt={contract.foreman_approved_at} />
              <ApproverRow label="Ekonóm" user={contract.ekonom_approver} approved={contract.ekonom_approved} approvedAt={contract.ekonom_approved_at} />
              <ApproverRow label="Riaditeľ" user={contract.director_approver} approved={contract.director_approved} approvedAt={contract.director_approved_at} />

              {contract.rejection_reason && (
                <div className="alert alert-error" style={{ fontSize: 12, marginTop: 12 }}>
                  <strong>Dôvod zamietnutia:</strong> {contract.rejection_reason}
                </div>
              )}

              {myApprovalDone() && (
                <div className="alert alert-success" style={{ fontSize: 12, marginTop: 12 }}>
                  <CheckCircle size={14} /> Vy ste už schválili túto zmluvu.
                </div>
              )}

              {canApprove() && !rejecting && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleApprove} disabled={submitting}>
                    <CheckCircle size={14} /> Schváliť
                  </button>
                  <button className="btn btn-danger" onClick={() => setRejecting(true)} disabled={submitting}>
                    <XCircle size={14} /> Zamietnuť
                  </button>
                </div>
              )}

              {rejecting && (
                <div style={{ marginTop: 12 }}>
                  <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Dôvod zamietnutia..." style={{ marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-danger btn-sm" onClick={handleReject} disabled={submitting}>Potvrdiť zamietnutie</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(false)}>Zrušiť</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {contract.audit_logs && contract.audit_logs.length > 0 && (
            <div className="card">
              <div className="card-header"><h3 className="card-title">História</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {contract.audit_logs.map(log => (
                    <div key={log.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 500 }}>{log.action}</span>
                        <span style={{ color: 'var(--text3)' }}>{fmt(log.created_at)}</span>
                      </div>
                      {log.user && <div style={{ color: 'var(--text2)', marginTop: 2 }}>{log.user.full_name}</div>}
                      {log.detail && <div style={{ color: 'var(--text3)', marginTop: 2 }}>{log.detail}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
