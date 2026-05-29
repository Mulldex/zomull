export type UserRole = 'admin' | 'ekonom' | 'pripravar' | 'foreman' | 'director'

export type OrderStatus = 'new' | 'pending_foreman' | 'pending_director' | 'approved' | 'rejected'
export type ContractStatus = 'new' | 'pending_approval' | 'approved' | 'rejected'
export type ContractType = 'zmluva_o_dielo' | 'ramcova' | 'kupna' | 'ina'

export interface User {
  id: number
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface Project {
  id: number
  name: string
  code: string
  description?: string
  address?: string
  investor?: string
  start_date?: string
  end_date?: string
  budget?: number
  currency: string
  is_active: boolean
  foremen?: User[]
}

export interface Supplier {
  id: number
  name: string
  ico?: string
  dic?: string
  ic_dph?: string
  address?: string
  email?: string
  phone?: string
  contact_person?: string
  status: string
  note?: string
  is_vat_payer: boolean
  created_at: string
}

export interface AuditLog {
  id: number
  action: string
  detail: string | null
  created_at: string
  user: User | null
}

export interface OrderItem {
  id: number
  description: string
  quantity: number
  unit?: string
  unit_price: number
  total_price: number
}

export interface Order {
  id: number
  order_number: string
  order_date: string
  subject: string
  supplier_name: string
  supplier_ref?: Supplier
  total_amount: number
  currency: string
  notes?: string
  pdf_path?: string
  pdf_filename?: string
  status: OrderStatus
  rejection_reason?: string
  requires_director: boolean
  project?: Project
  creator: User
  foreman?: User
  director?: User
  foreman_approved_at?: string
  items: OrderItem[]
  audit_logs?: AuditLog[]
  created_at: string
  updated_at?: string
  // Objednávateľ (naša firma)
  buyer_name?: string
  buyer_ico?: string
  buyer_dic?: string
  buyer_ic_dph?: string
  buyer_address?: string
  // DPH
  is_vat_payer?: boolean
  vat_rate?: number
  vat_amount?: number
  // Nákladová položka
  cost_item_id?: number | null
  cost_item?: CostItem | null
  // Kontaktná osoba objednávateľa (per OBJ)
  buyer_contact_person?: string | null
  buyer_contact_phone?: string | null
  buyer_contact_email?: string | null
  // Podmienky dodania a platby
  delivery_date?: string | null
  delivery_note?: string | null
  delivery_place?: string | null
  payment_due_days?: number | null
  payment_method?: string | null
  retention_percent?: number | null
  warranty_months?: number | null
  penalty_text?: string | null
  general_note?: string | null
  attachments?: OrderAttachment[]
}

export interface OrderAttachment {
  id: number
  original_filename: string
  file_size?: number | null
  mime_type?: string | null
  label?: string | null
  uploaded_at: string
  uploader?: User | null
}

export interface CostItem {
  id: number
  project_id: number
  parent_id?: number | null
  code: string
  name: string
  description?: string | null
  sort_order: number
}

export const VAT_RATES_SK = [
  { value: 23, label: '23 % (základná)' },
  { value: 19, label: '19 % (znížená)' },
  { value: 5,  label: '5 % (osobitne znížená)' },
  { value: 0,  label: '0 % (oslobodené)' },
]

export interface CompanyInfo {
  id?: number
  name: string
  ico?: string | null
  dic?: string | null
  ic_dph?: string | null
  address?: string | null
  email?: string | null
  phone?: string | null
  bank_name?: string | null
  iban?: string | null
  swift?: string | null
  contact_person?: string | null
  logo_path?: string | null
  updated_at?: string | null
}

export interface Contract {
  id: number
  contract_number: string
  contract_type: ContractType
  counterparty: string
  subject: string
  value?: number
  currency: string
  sign_date?: string
  valid_from?: string
  valid_to?: string
  notes?: string
  pdf_path?: string
  pdf_filename?: string
  status: ContractStatus
  rejection_reason?: string
  foreman_approved: boolean
  ekonom_approved: boolean
  director_approved: boolean
  foreman_approved_at?: string
  ekonom_approved_at?: string
  director_approved_at?: string
  project?: Project
  supplier_ref?: Supplier
  creator: User
  foreman_approver?: User
  ekonom_approver?: User
  director_approver?: User
  audit_logs?: AuditLog[]
  created_at: string
  updated_at?: string
}

export interface ApprovalRule {
  id: number
  max_amount: number | null
  approver_role: UserRole
  label: string
  is_active: boolean
  order: number
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: User
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrátor',
  ekonom: 'Ekonóm',
  pripravar: 'Prípravár',
  foreman: 'Stavbyvedúci',
  director: 'Riaditeľ',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Nová',
  pending_foreman: 'Čaká – stavbyvedúci',
  pending_director: 'Čaká – riaditeľ',
  approved: 'Schválená',
  rejected: 'Zamietnutá',
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  new: 'Nová',
  pending_approval: 'Čaká na schválenie',
  approved: 'Schválená',
  rejected: 'Zamietnutá',
}

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  zmluva_o_dielo: 'Zmluva o dielo',
  ramcova: 'Rámcová zmluva',
  kupna: 'Kúpna zmluva',
  ina: 'Iná zmluva',
}

export const CURRENCY_OPTIONS = ['EUR', 'CZK', 'USD']
