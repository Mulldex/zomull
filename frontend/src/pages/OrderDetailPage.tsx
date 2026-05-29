import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, FileText, ArrowLeft, Trash2, Upload, Paperclip, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { orderService } from '../services/documentService'
import type { Order } from '../types'
import { useAuth } from '../context/AuthContext'
import { OrderStatusBadge } from '../components/ui/StatusBadge'
import { format } from 'date-fns'
import { sk } from 'date-fns/locale'

function fmt(d: string) {
  try { return format(new Date(d), 'd. M. yyyy HH:mm', { locale: sk }) } catch { return d }
}
function fmtDate(d: string) {
  try { return format(new Date(d), 'd. M. yyyy', { locale: sk }) } catch { return d }
}
function fmtMoney(v: number, c = 'EUR') {
  return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(v)
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [rejecting, setRejecting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [attachmentLabel, setAttachmentLabel] = useState('Cenová ponuka')
  const [attachmentUploading, setAttachmentUploading] = useState(false)

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!order || !e.target.files?.[0]) return
    const f = e.target.files[0]
    e.target.value = ''
    setAttachmentUploading(true)
    try {
      await orderService.uploadAttachment(order.id, f, attachmentLabel || undefined)
      toast.success('Príloha nahratá')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri nahrávaní prílohy')
    } finally { setAttachmentUploading(false) }
  }

  const handleAttachmentDelete = async (attId: number, name: string) => {
    if (!order || !confirm(`Zmazať prílohu "${name}"?`)) return
    try {
      await orderService.deleteAttachment(order.id, attId)
      toast.success('Príloha zmazaná')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri mazaní')
    }
  }

  const handleAttachmentDownload = async (attId: number, name: string) => {
    if (!order) return
    try {
      await orderService.downloadAttachment(order.id, attId, name)
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
    try {
      setOrder(await orderService.get(+id))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const canApprove = () => {
    if (!order || !user) return false
    if (user.role === 'admin') return order.status !== 'approved' && order.status !== 'rejected'
    if (user.role === 'foreman') return order.status === 'pending_foreman' && order.foreman?.id === user.id
    // Ktorýkoľvek aktívny riaditeľ môže schváliť pending_director
    if (user.role === 'director') return order.status === 'pending_director'
    return false
  }

  const handleApprove = async () => {
    if (!order) return
    setSubmitting(true)
    try {
      await orderService.approve(order.id, { status: 'approved' })
      toast.success('Objednávka schválená')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!order || !rejectionReason) { toast.error('Zadajte dôvod zamietnutia'); return }
    setSubmitting(true)
    try {
      await orderService.approve(order.id, { status: 'rejected', rejection_reason: rejectionReason })
      toast.success('Objednávka zamietnutá')
      setRejecting(false)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!order || !confirm('Naozaj vymazať objednávku?')) return
    await orderService.delete(order.id)
    toast.success('Objednávka vymazaná')
    navigate('/objednavky')
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!order || !e.target.files?.[0]) return
    const fd = new FormData()
    fd.append('file', e.target.files[0])
    try {
      await orderService.attachPdf(order.id, fd)
      toast.success('PDF priložené')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri nahrávaní PDF')
    }
  }

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )
  if (!order) return <div className="page-content"><div className="alert alert-error">Objednávka nenájdená</div></div>

  return (
    <div className="page-content">
      {/* Hlavička */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/objednavky')}><ArrowLeft size={14} /></button>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{order.order_number}</h2>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>{order.subject}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <OrderStatusBadge status={order.status} />
          {user?.role === 'admin' && (
            <button className="btn btn-ghost btn-sm" onClick={handleDelete} style={{ color: 'var(--brand-red)' }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        {/* Ľavý stĺpec */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Objednávateľ / Dodávateľ – dve karty vedľa seba */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-header"><h3 className="card-title" style={{ fontSize: 13 }}>Objednávateľ</h3></div>
              <div className="card-body" style={{ fontSize: 13 }}>
                {order.buyer_name
                  ? (
                    <>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{order.buyer_name}</div>
                      {order.buyer_address && <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{order.buyer_address}</div>}
                      {order.buyer_ico && <div style={{ color: 'var(--text2)' }}>IČO: {order.buyer_ico}</div>}
                      {order.buyer_dic && <div style={{ color: 'var(--text2)' }}>DIČ: {order.buyer_dic}</div>}
                      {order.buyer_ic_dph && <div style={{ color: 'var(--text2)' }}>IČ DPH: {order.buyer_ic_dph}</div>}
                    </>
                  )
                  : <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Údaje neuvedené</span>
                }
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3 className="card-title" style={{ fontSize: 13 }}>Dodávateľ</h3></div>
              <div className="card-body" style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{order.supplier_name}</div>
                {order.supplier_ref?.address && <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{order.supplier_ref.address}</div>}
                {order.supplier_ref?.ico && <div style={{ color: 'var(--text2)' }}>IČO: {order.supplier_ref.ico}</div>}
                {order.supplier_ref?.dic && <div style={{ color: 'var(--text2)' }}>DIČ: {order.supplier_ref.dic}</div>}
              </div>
            </div>
          </div>

          {/* Základné info */}
          <div className="card">
            <div className="card-header"><h3 className="card-title">Základné údaje</h3></div>
            <div className="card-body">
              <div className="detail-grid">
                <div className="detail-row">
                  <span className="detail-label">Dodávateľ</span>
                  <span className="detail-value">{order.supplier_name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Dátum objednávky</span>
                  <span className="detail-value">{fmtDate(order.order_date)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Projekt</span>
                  <span className="detail-value">{order.project?.name || '–'}</span>
                </div>
                {order.cost_item && (
                  <div className="detail-row">
                    <span className="detail-label">Nákladová položka</span>
                    <span className="detail-value">
                      <code style={{ color: 'var(--brand-red)', fontWeight: 600 }}>{order.cost_item.code}</code>
                      {' — '}{order.cost_item.name}
                    </span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-label">Cena bez DPH</span>
                  <span className="detail-value">
                    {fmtMoney(order.total_amount - (order.vat_amount || 0), order.currency)}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">DPH {order.is_vat_payer ? `(${order.vat_rate ?? 0}%)` : '(neplatca)'}</span>
                  <span className="detail-value">
                    {fmtMoney(order.vat_amount || 0, order.currency)}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Cena s DPH</span>
                  <span className="detail-value" style={{ fontWeight: 600, fontSize: 16, color: 'var(--brand-red)' }}>
                    {fmtMoney(order.total_amount, order.currency)}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Vytvoril</span>
                  <span className="detail-value">{order.creator?.full_name}</span>
                </div>
                {order.notes && (
                  <div className="detail-row">
                    <span className="detail-label">Poznámky</span>
                    <span className="detail-value">{order.notes}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Kontaktná osoba + Podmienky dodania a platby */}
          {(order.buyer_contact_person || order.delivery_date || order.delivery_place ||
            order.payment_due_days || order.retention_percent || order.warranty_months ||
            order.penalty_text || order.general_note) && (
            <div className="card">
              <div className="card-header"><h3 className="card-title">Podmienky dodania a platby</h3></div>
              <div className="card-body">
                <div className="detail-grid">
                  {order.buyer_contact_person && (
                    <div className="detail-row">
                      <span className="detail-label">Kontakt. osoba (objednávateľ)</span>
                      <span className="detail-value">
                        {order.buyer_contact_person}
                        {order.buyer_contact_phone && <span style={{ color: 'var(--text2)' }}> · {order.buyer_contact_phone}</span>}
                        {order.buyer_contact_email && <span style={{ color: 'var(--text2)' }}> · {order.buyer_contact_email}</span>}
                      </span>
                    </div>
                  )}
                  {order.delivery_date && (
                    <div className="detail-row">
                      <span className="detail-label">Termín dodania</span>
                      <span className="detail-value">{fmtDate(order.delivery_date)}</span>
                    </div>
                  )}
                  {order.delivery_note && (
                    <div className="detail-row">
                      <span className="detail-label">Poznámka k termínu</span>
                      <span className="detail-value">{order.delivery_note}</span>
                    </div>
                  )}
                  {order.delivery_place && (
                    <div className="detail-row">
                      <span className="detail-label">Miesto dodania</span>
                      <span className="detail-value">{order.delivery_place}</span>
                    </div>
                  )}
                  {order.payment_due_days != null && (
                    <div className="detail-row">
                      <span className="detail-label">Splatnosť</span>
                      <span className="detail-value">{order.payment_due_days} dní</span>
                    </div>
                  )}
                  {order.payment_method && (
                    <div className="detail-row">
                      <span className="detail-label">Spôsob platby</span>
                      <span className="detail-value">{order.payment_method}</span>
                    </div>
                  )}
                  {order.retention_percent != null && (
                    <div className="detail-row">
                      <span className="detail-label">Zádržné</span>
                      <span className="detail-value">{order.retention_percent} %</span>
                    </div>
                  )}
                  {order.warranty_months != null && (
                    <div className="detail-row">
                      <span className="detail-label">Záruka</span>
                      <span className="detail-value">{order.warranty_months} mesiacov</span>
                    </div>
                  )}
                  {order.penalty_text && (
                    <div className="detail-row">
                      <span className="detail-label">Zmluvná pokuta</span>
                      <span className="detail-value">{order.penalty_text}</span>
                    </div>
                  )}
                  {order.general_note && (
                    <div className="detail-row">
                      <span className="detail-label">Poznámka (v PDF)</span>
                      <span className="detail-value">{order.general_note}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Položky */}
          {order.items && order.items.length > 0 && (
            <div className="card">
              <div className="card-header"><h3 className="card-title">Položky objednávky</h3></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Popis</th>
                      <th style={{ textAlign: 'right' }}>Množstvo</th>
                      <th>MJ</th>
                      <th style={{ textAlign: 'right' }}>Jedn. cena</th>
                      <th style={{ textAlign: 'right' }}>Celkom</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map(item => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                        <td>{item.unit || '–'}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(item.unit_price, order.currency)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtMoney(item.total_price, order.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Spolu</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--brand-red)' }}>{fmtMoney(order.total_amount, order.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Prílohy k objednávke (cenové ponuky, emaily, doc/xlsx) */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><Paperclip size={15} /> Prílohy k objednávke</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={attachmentLabel}
                  onChange={e => setAttachmentLabel(e.target.value)}
                  placeholder="Popis (napr. Cenová ponuka)"
                  style={{ width: 200, fontSize: 12, padding: '4px 8px' }}
                />
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
              </div>
            </div>
            <div className="card-body">
              {(order.attachments && order.attachments.length > 0) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {order.attachments.map(att => (
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
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleAttachmentDownload(att.id, att.original_filename)}
                        title="Stiahnuť"
                      >
                        <Download size={13} />
                      </button>
                      {(user?.role === 'admin' || user?.role === 'ekonom' || user?.role === 'pripravar') && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--brand-red)' }}
                          onClick={() => handleAttachmentDelete(att.id, att.original_filename)}
                          title="Zmazať"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text3)', fontSize: 13, padding: '4px 0' }}>
                  Žiadne prílohy. Nahraj cenovú ponuku, email z Outlook (.msg/.eml), Word/Excel alebo iné dokumenty.
                </div>
              )}
            </div>
          </div>

          {/* PDF */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><FileText size={15} /> Tlačivo objednávky / Príloha PDF</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {/* Generovať PDF — len ak je objednávka schválená */}
                {order.status === 'approved' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={async () => {
                      try {
                        await orderService.generatePdf(order.id)
                        toast.success('Tlačivo objednávky vygenerované')
                        load()
                      } catch (err: any) {
                        toast.error(err.response?.data?.detail || 'Chyba pri generovaní PDF')
                      }
                    }}
                  >
                    <FileText size={14} /> {order.pdf_path ? 'Pregenerovať PDF' : 'Vygenerovať PDF'}
                  </button>
                )}
                {(user?.role === 'admin' || user?.role === 'ekonom') && (
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={14} /> Nahrať PDF
                    <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} />
                  </label>
                )}
              </div>
            </div>
            <div className="card-body">
              {order.pdf_path ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    try {
                      await orderService.openPdf(order.id, order.pdf_filename || undefined)
                    } catch (err: any) {
                      toast.error(err.response?.data?.detail || 'Chyba pri otváraní PDF')
                    }
                  }}
                >
                  <FileText size={15} /> {order.pdf_filename || 'objednavka.pdf'}
                </button>
              ) : (
                <div style={{ color: 'var(--text3)', fontSize: 13 }}>
                  {order.status === 'approved'
                    ? 'Tlačivo zatiaľ nebolo vygenerované — klikni "Vygenerovať PDF"'
                    : 'Po úplnom schválení objednávky budeš môcť vygenerovať tlačivo'
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pravý stĺpec – schvaľovanie a audit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Schvaľovanie */}
          <div className="card">
            <div className="card-header"><h3 className="card-title">Stav schvaľovania</h3></div>
            <div className="card-body">
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: 'var(--text2)' }}>Stavbyvedúci</span>
                  <span style={{ fontWeight: 500 }}>{order.foreman?.full_name || '–'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text2)' }}>Schválil</span>
                  <span>{order.foreman_approved_at ? fmtDate(order.foreman_approved_at) : '–'}</span>
                </div>
                {order.requires_director && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                      <span style={{ color: 'var(--text2)' }}>Riaditeľ</span>
                      <span style={{ fontWeight: 500 }}>{order.director?.full_name || '–'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text2)' }}>Stav</span>
                      <span>{order.status === 'approved' ? '✓ Schválené' : order.status === 'pending_director' ? 'Čaká' : '–'}</span>
                    </div>
                  </>
                )}
              </div>

              {order.rejection_reason && (
                <div className="alert alert-error" style={{ fontSize: 12 }}>
                  <strong>Dôvod zamietnutia:</strong> {order.rejection_reason}
                </div>
              )}

              {canApprove() && !rejecting && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
                  <textarea
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder="Dôvod zamietnutia..."
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-danger btn-sm" onClick={handleReject} disabled={submitting}>Potvrdiť zamietnutie</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(false)}>Zrušiť</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Audit log */}
          {order.audit_logs && order.audit_logs.length > 0 && (
            <div className="card">
              <div className="card-header"><h3 className="card-title">História</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {order.audit_logs.map(log => (
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
