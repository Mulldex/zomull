import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Upload, FileText, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { orderService, projectService, supplierService, companyService, costItemService } from '../services/documentService'
import type { Project, Supplier, CostItem } from '../types'
import { CURRENCY_OPTIONS, ROLE_LABELS, VAT_RATES_SK } from '../types'
import { useAuth } from '../context/AuthContext'

interface Item {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
}

export default function CreateOrderPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'form' | 'upload'>('form')
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  // Form fields — order_number generuje backend automaticky
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [subject, setSubject] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [projectId, setProjectId] = useState('')
  const [costItems, setCostItems] = useState<CostItem[]>([])
  const [costItemId, setCostItemId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Item[]>([
    { description: '', quantity: 1, unit: 'ks', unit_price: 0, total_price: 0 }
  ])

  // Objednávateľ (naša firma) — predvyplnené z Nastavenia → Údaje vašej firmy
  const [buyerName, setBuyerName] = useState('')
  const [buyerIco, setBuyerIco] = useState('')
  const [buyerDic, setBuyerDic] = useState('')
  const [buyerIcDph, setBuyerIcDph] = useState('')
  const [buyerAddress, setBuyerAddress] = useState('')
  const [showBuyerEdit, setShowBuyerEdit] = useState(false)

  // DPH
  const [isVatPayer, setIsVatPayer] = useState(true)
  const [vatRate, setVatRate] = useState(23)
  const [vatCustom, setVatCustom] = useState(false)

  // Kontaktná osoba objednávateľa (per OBJ)
  const [buyerContactPerson, setBuyerContactPerson] = useState('')
  const [buyerContactPhone, setBuyerContactPhone] = useState('')
  const [buyerContactEmail, setBuyerContactEmail] = useState('')

  // Podmienky dodania a platby
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [deliveryPlace, setDeliveryPlace] = useState('')
  const [paymentDueDays, setPaymentDueDays] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Bankový prevod')
  const [retentionPercent, setRetentionPercent] = useState('')
  const [warrantyMonths, setWarrantyMonths] = useState('')
  const [penaltyText, setPenaltyText] = useState('')
  const [generalNote, setGeneralNote] = useState('')

  // Načítaj nákladové položky pri zmene projektu
  useEffect(() => {
    if (!projectId) { setCostItems([]); setCostItemId(''); return }
    costItemService.list(+projectId).then(setCostItems).catch(() => setCostItems([]))
    setCostItemId('')
  }, [projectId])

  // Výpočty (netto je súčet položiek; brutto = netto * (1 + sadzba/100))
  const netto = items.reduce((s, i) => s + Number(i.total_price || 0), 0)
  const vatAmount = isVatPayer ? +(netto * (vatRate / 100)).toFixed(2) : 0
  const brutto = +(netto + vatAmount).toFixed(2)

  useEffect(() => {
    Promise.all([
      projectService.list(),
      supplierService.list(),
      companyService.get().catch(() => null),
    ]).then(([p, s, c]) => {
      setProjects(p); setSuppliers(s)
      if (c) {
        setBuyerName(c.name || '')
        setBuyerIco(c.ico || '')
        setBuyerDic(c.dic || '')
        setBuyerIcDph(c.ic_dph || '')
        setBuyerAddress(c.address || '')
        if (c.contact_person) setBuyerContactPerson(c.contact_person)
        if (c.phone) setBuyerContactPhone(c.phone)
        if (c.email) setBuyerContactEmail(c.email)
      }
    })
  }, [])

  const updateItem = (idx: number, field: keyof Item, val: string | number) => {
    setItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: val }
      if (field === 'quantity' || field === 'unit_price') {
        next[idx].total_price = Number(next[idx].quantity) * Number(next[idx].unit_price)
      }
      return next
    })
  }

  // Synchronizuj brutto total do totalAmount (kompatibilita so submitom)
  useEffect(() => { setTotalAmount(String(brutto)) }, [brutto])

  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unit: 'ks', unit_price: 0, total_price: 0 }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject || !supplierName || !totalAmount) {
      toast.error('Vyplňte povinné polia')
      return
    }
    setLoading(true)
    try {
      if (mode === 'upload' && pdfFile) {
        const fd = new FormData()
        // order_number sa generuje na backende
        fd.append('order_date', new Date(orderDate).toISOString())
        fd.append('subject', subject)
        fd.append('supplier_name', supplierName)
        fd.append('total_amount', totalAmount)
        fd.append('currency', currency)
        if (projectId) fd.append('project_id', projectId)
        if (supplierId) fd.append('supplier_id', supplierId)
        if (notes) fd.append('notes', notes)
        if (buyerName)    fd.append('buyer_name', buyerName)
        if (buyerIco)     fd.append('buyer_ico', buyerIco)
        if (buyerDic)     fd.append('buyer_dic', buyerDic)
        if (buyerIcDph)   fd.append('buyer_ic_dph', buyerIcDph)
        if (buyerAddress) fd.append('buyer_address', buyerAddress)
        if (costItemId)   fd.append('cost_item_id', costItemId)
        fd.append('is_vat_payer', String(isVatPayer))
        fd.append('vat_rate', String(vatRate))
        fd.append('file', pdfFile)
        const order = await orderService.upload(fd)
        toast.success('Objednávka s PDF bola vytvorená')
        navigate(`/objednavky/${order.id}`)
      } else {
        const order = await orderService.create({
          // order_number sa generuje na backende
          order_date: new Date(orderDate).toISOString(),
          subject,
          supplier_name: supplierName,
          supplier_id: supplierId ? +supplierId : null,
          total_amount: +totalAmount,
          currency,
          project_id: projectId ? +projectId : null,
          notes: notes || null,
          buyer_name: buyerName || null,
          buyer_ico: buyerIco || null,
          buyer_dic: buyerDic || null,
          buyer_ic_dph: buyerIcDph || null,
          buyer_address: buyerAddress || null,
          is_vat_payer: isVatPayer,
          vat_rate: vatRate,
          vat_amount: vatAmount,
          cost_item_id: costItemId ? +costItemId : null,
          buyer_contact_person: buyerContactPerson || null,
          buyer_contact_phone: buyerContactPhone || null,
          buyer_contact_email: buyerContactEmail || null,
          delivery_date: deliveryDate ? new Date(deliveryDate).toISOString() : null,
          delivery_note: deliveryNote || null,
          delivery_place: deliveryPlace || null,
          payment_due_days: paymentDueDays ? +paymentDueDays : null,
          payment_method: paymentMethod || null,
          retention_percent: retentionPercent ? +retentionPercent : null,
          warranty_months: warrantyMonths ? +warrantyMonths : null,
          penalty_text: penaltyText || null,
          general_note: generalNote || null,
          items: mode === 'form' ? items.filter(i => i.description).map(i => ({
            ...i,
            quantity: +i.quantity,
            unit_price: +i.unit_price,
            total_price: +i.total_price,
          })) : [],
        })
        toast.success('Objednávka bola vytvorená a odoslaná na schválenie')
        navigate(`/objednavky/${order.id}`)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Chyba pri vytváraní objednávky')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-content">
      <div className="card" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="card-header">
          <h3 className="card-title">Nová objednávka</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn btn-sm ${mode === 'form' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('form')} type="button"
            >
              <FileText size={14} /> Vytvoriť formulárom
            </button>
            <button
              className={`btn btn-sm ${mode === 'upload' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('upload')} type="button"
            >
              <Upload size={14} /> Nahrať PDF
            </button>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Číslo objednávky</label>
                <input
                  value="Vygeneruje sa automaticky podľa projektu"
                  disabled
                  style={{ color: 'var(--text3)', fontStyle: 'italic' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Dátum objednávky *</label>
                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} required />
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

            {/* Objednávateľ — naša firma (predvyplnené z Nastavení) */}
            <div style={{ background: 'var(--surface2)', padding: 14, borderRadius: 'var(--radius)', marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showBuyerEdit ? 12 : 0 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    <Building2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Objednávateľ
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {buyerName
                      ? <><strong>{buyerName}</strong>{buyerIco && <span style={{ color: 'var(--text2)' }}> · IČO {buyerIco}</span>}{buyerAddress && <span style={{ color: 'var(--text2)' }}> · {buyerAddress}</span>}</>
                      : <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Údaje firmy nie sú nastavené – nastav ich v Nastaveniach</span>
                    }
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowBuyerEdit(v => !v)}
                >
                  {showBuyerEdit ? 'Skryť' : 'Upraviť pre túto OBJ'}
                </button>
              </div>
              {showBuyerEdit && (
                <>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Názov objednávateľa</label>
                      <input value={buyerName} onChange={e => setBuyerName(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">IČO</label>
                      <input value={buyerIco} onChange={e => setBuyerIco(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">DIČ</label>
                      <input value={buyerDic} onChange={e => setBuyerDic(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">IČ DPH</label>
                      <input value={buyerIcDph} onChange={e => setBuyerIcDph(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Adresa</label>
                    <input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} />
                  </div>
                </>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Predmet objednávky *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Napr. Dodávka stavebného materiálu" required />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Dodávateľ *</label>
                <select value={supplierId} onChange={e => {
                  setSupplierId(e.target.value)
                  const s = suppliers.find(s => s.id === +e.target.value)
                  if (s) setSupplierName(s.name)
                }}>
                  <option value="">-- Vyberte dodávateľa --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {!supplierId && (
                  <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
                    placeholder="Alebo zadajte manuálne" style={{ marginTop: 6 }} />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Projekt / stavba</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                  <option value="">-- Bez projektu --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
              </div>
            </div>

            {/* Nákladová položka — len ak je vybraný projekt a má položky */}
            {projectId && (
              <div className="form-group">
                <label className="form-label">Nákladová položka projektu</label>
                {costItems.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0', fontStyle: 'italic' }}>
                    Tento projekt nemá definované nákladové položky. Pridaj ich v detaile projektu (záložka „Nákladové položky“).
                  </div>
                ) : (
                  <select value={costItemId} onChange={e => setCostItemId(e.target.value)}>
                    <option value="">-- Nepriradené --</option>
                    {(() => {
                      // Zostav strom: rodičia → deti, plochý zoznam s odsadením
                      const byParent: Record<string, CostItem[]> = {}
                      costItems.forEach(i => {
                        const k = String(i.parent_id ?? '')
                        ;(byParent[k] = byParent[k] || []).push(i)
                      })
                      const out: JSX.Element[] = []
                      const walk = (parentId: number | null, depth: number) => {
                        const list = byParent[String(parentId ?? '')] || []
                        list.sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
                        list.forEach(item => {
                          out.push(
                            <option key={item.id} value={item.id}>
                              {' '.repeat(depth * 4)}{item.code} — {item.name}
                            </option>
                          )
                          walk(item.id, depth + 1)
                        })
                      }
                      walk(null, 0)
                      return out
                    })()}
                  </select>
                )}
              </div>
            )}

            {/* DPH a mena */}
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Sadzba DPH</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={vatCustom ? 'custom' : String(vatRate)}
                    onChange={e => {
                      if (e.target.value === 'custom') { setVatCustom(true) }
                      else { setVatCustom(false); setVatRate(Number(e.target.value)) }
                    }}
                    style={{ flex: 1 }}
                    disabled={!isVatPayer}
                  >
                    {VAT_RATES_SK.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    <option value="custom">Iná sadzba…</option>
                  </select>
                  {vatCustom && (
                    <input
                      type="number" step="0.01" min="0" max="100"
                      value={vatRate}
                      onChange={e => setVatRate(Number(e.target.value))}
                      style={{ width: 90 }}
                      placeholder="%"
                      disabled={!isVatPayer}
                    />
                  )}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
                  <input type="checkbox" checked={isVatPayer} onChange={e => setIsVatPayer(e.target.checked)} />
                  Sme platca DPH (DPH sa pripočítava k cene)
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Mena</label>
                <select value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCY_OPTIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Položky – len pri forme */}
            {mode === 'form' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label className="form-label" style={{ margin: 0 }}>Položky objednávky</label>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
                    <Plus size={14} /> Pridať položku
                  </button>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <table className="table" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th>Popis</th>
                        <th style={{ width: 80 }}>Množstvo</th>
                        <th style={{ width: 70 }}>MJ</th>
                        <th style={{ width: 110 }}>Jedn. cena</th>
                        <th style={{ width: 110 }}>Celkom</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td><input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Popis položky" /></td>
                          <td><input type="number" step="0.001" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                          <td><input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="ks" /></td>
                          <td><input type="number" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} /></td>
                          <td><input type="number" step="0.01" value={item.total_price} onChange={e => updateItem(idx, 'total_price', e.target.value)} readOnly style={{ background: 'var(--surface2)' }} /></td>
                          <td>
                            {items.length > 1 && (
                              <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rozpis cien */}
            <div style={{
              background: 'var(--surface2)',
              padding: '14px 18px',
              borderRadius: 'var(--radius)',
              marginBottom: 18,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 16,
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cena bez DPH</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{netto.toFixed(2)} {currency}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  DPH {isVatPayer ? `(${vatRate}%)` : '(neplatca)'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{vatAmount.toFixed(2)} {currency}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cena s DPH</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand-red)' }}>{brutto.toFixed(2)} {currency}</div>
              </div>
            </div>

            {/* PDF upload */}
            {mode === 'upload' && (
              <div className="form-group">
                <label className="form-label">PDF objednávky *</label>
                <div className="upload-zone" onClick={() => document.getElementById('pdf-input')?.click()}>
                  {pdfFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileText size={20} color="var(--brand-red)" />
                      <span>{pdfFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={24} style={{ margin: '0 auto 8px', display: 'block', color: 'var(--text3)' }} />
                      <div>Kliknite pre výber PDF súboru</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Max 20 MB</div>
                    </>
                  )}
                </div>
                <input id="pdf-input" type="file" accept=".pdf" style={{ display: 'none' }}
                  onChange={e => setPdfFile(e.target.files?.[0] || null)} />
              </div>
            )}

            {/* Kontaktná osoba objednávateľa (per OBJ) */}
            <div style={{ background: 'var(--surface2)', padding: 14, borderRadius: 'var(--radius)', marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Kontaktná osoba (za objednávateľa)
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Meno a funkcia</label>
                  <input value={buyerContactPerson} onChange={e => setBuyerContactPerson(e.target.value)}
                    placeholder="Napr. Ing. Marek Kollár — stavbyvedúci" />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefón</label>
                  <input value={buyerContactPhone} onChange={e => setBuyerContactPhone(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">E-mail</label>
                <input type="email" value={buyerContactEmail} onChange={e => setBuyerContactEmail(e.target.value)} />
              </div>
            </div>

            {/* Podmienky dodania a platby */}
            <div style={{ borderTop: '2px solid var(--brand-red)', paddingTop: 14, marginTop: 8, marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                Podmienky dodania a platby
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Termín dodania</label>
                  <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Miesto dodania</label>
                  <input value={deliveryPlace} onChange={e => setDeliveryPlace(e.target.value)}
                    placeholder="Stavenisko – adresa" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Poznámka k termínu</label>
                <input value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)}
                  placeholder="Napr. postupne podľa harmonogramu, koordinovať 24 hod vopred" />
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Splatnosť faktúry (dní)</label>
                  <input type="number" min="0" value={paymentDueDays} onChange={e => setPaymentDueDays(e.target.value)}
                    placeholder="napr. 30" />
                </div>
                <div className="form-group">
                  <label className="form-label">Spôsob platby</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    <option value="Bankový prevod">Bankový prevod</option>
                    <option value="Hotovosť">Hotovosť</option>
                    <option value="Iné">Iné</option>
                  </select>
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Zádržné (%)</label>
                  <input type="number" step="0.01" min="0" max="100" value={retentionPercent}
                    onChange={e => setRetentionPercent(e.target.value)} placeholder="napr. 10" />
                </div>
                <div className="form-group">
                  <label className="form-label">Záruka (mesiacov)</label>
                  <input type="number" min="0" value={warrantyMonths}
                    onChange={e => setWarrantyMonths(e.target.value)} placeholder="napr. 24" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Zmluvná pokuta</label>
                <input value={penaltyText} onChange={e => setPenaltyText(e.target.value)}
                  placeholder="Napr. 0,05 % z hodnoty objednávky za každý deň omeškania" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Voľná poznámka (zobrazí sa v PDF)</label>
                <textarea value={generalNote} onChange={e => setGeneralNote(e.target.value)}
                  placeholder="Napr. Faktúru zasielajte na faktury@mulldex.sk" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Poznámky (interné, nepôjdu do PDF)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Interné poznámky..." />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/objednavky')}>Zrušiť</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Ukladám...</> : 'Vytvoriť objednávku'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
