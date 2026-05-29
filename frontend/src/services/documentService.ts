import api from './api'
import type { TokenResponse, User, Order, OrderAttachment, Contract, ContractAttachment, Project, Supplier, ApprovalRule, CompanyInfo, CostItem } from '../types'

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authService = {
  login: async (email: string, password: string): Promise<TokenResponse> => {
    const form = new URLSearchParams()
    form.append('username', email)
    form.append('password', password)
    const { data } = await api.post<TokenResponse>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return data
  },
  me: async (): Promise<User> => {
    const { data } = await api.get<User>('/auth/me')
    return data
  },
}

// ── Orders ────────────────────────────────────────────────────────────────────
export const orderService = {
  list: async (params?: { status?: string; project_id?: number; search?: string }): Promise<Order[]> => {
    const { data } = await api.get<Order[]>('/orders/', { params })
    return data
  },
  get: async (id: number): Promise<Order> => {
    const { data } = await api.get<Order>(`/orders/${id}`)
    return data
  },
  create: async (payload: any): Promise<Order> => {
    const { data } = await api.post<Order>('/orders/', payload)
    return data
  },
  upload: async (formData: FormData): Promise<Order> => {
    const { data } = await api.post<Order>('/orders/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  generatePdf: async (id: number): Promise<Order> => {
    const { data } = await api.post<Order>(`/orders/${id}/generate-pdf`)
    return data
  },
  attachPdf: async (id: number, formData: FormData): Promise<Order> => {
    const { data } = await api.post<Order>(`/orders/${id}/pdf`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  approve: async (id: number, payload: { status: string; rejection_reason?: string }): Promise<Order> => {
    const { data } = await api.patch<Order>(`/orders/${id}/approve`, payload)
    return data
  },
  getPdfUrl: (id: number) => `/api/orders/${id}/pdf`,
  openPdf: async (id: number, filename?: string): Promise<void> => {
    // Stiahne PDF s autentifikáciou cez axios a otvorí ho v novom okne ako blob
    const resp = await api.get(`/orders/${id}/pdf`, { responseType: 'blob' })
    const blob = new Blob([resp.data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) {
      // Fallback: stiahnutie cez <a download>
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `objednavka_${id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/orders/${id}`)
  },
  // Prílohy k objednávke
  listAttachments: async (id: number): Promise<OrderAttachment[]> => {
    const { data } = await api.get<OrderAttachment[]>(`/orders/${id}/attachments`)
    return data
  },
  uploadAttachment: async (id: number, file: File, label?: string): Promise<OrderAttachment> => {
    const fd = new FormData()
    fd.append('file', file)
    if (label) fd.append('label', label)
    const { data } = await api.post<OrderAttachment>(`/orders/${id}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  downloadAttachment: async (id: number, attId: number, filename: string): Promise<void> => {
    const resp = await api.get(`/orders/${id}/attachments/${attId}`, { responseType: 'blob' })
    const ct = resp.headers['content-type']
    const blob = new Blob([resp.data], { type: typeof ct === 'string' ? ct : 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  },
  deleteAttachment: async (id: number, attId: number): Promise<void> => {
    await api.delete(`/orders/${id}/attachments/${attId}`)
  },
}

// ── Contracts ─────────────────────────────────────────────────────────────────
export const contractService = {
  list: async (params?: { status?: string; project_id?: number; search?: string }): Promise<Contract[]> => {
    const { data } = await api.get<Contract[]>('/contracts/', { params })
    return data
  },
  get: async (id: number): Promise<Contract> => {
    const { data } = await api.get<Contract>(`/contracts/${id}`)
    return data
  },
  create: async (payload: any): Promise<Contract> => {
    const { data } = await api.post<Contract>('/contracts/', payload)
    return data
  },
  upload: async (formData: FormData): Promise<Contract> => {
    const { data } = await api.post<Contract>('/contracts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  attachPdf: async (id: number, formData: FormData): Promise<Contract> => {
    const { data } = await api.post<Contract>(`/contracts/${id}/pdf`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  approve: async (id: number, payload: { approved: boolean; rejection_reason?: string }): Promise<Contract> => {
    const { data } = await api.patch<Contract>(`/contracts/${id}/approve`, payload)
    return data
  },
  update: async (id: number, payload: any): Promise<Contract> => {
    const { data } = await api.patch<Contract>(`/contracts/${id}`, payload)
    return data
  },
  getPdfUrl: (id: number) => `/api/contracts/${id}/pdf`,
  delete: async (id: number): Promise<void> => {
    await api.delete(`/contracts/${id}`)
  },
  // Prílohy k zmluvám
  listAttachments: async (id: number): Promise<ContractAttachment[]> => {
    const { data } = await api.get<ContractAttachment[]>(`/contracts/${id}/attachments`)
    return data
  },
  uploadAttachment: async (id: number, file: File, label?: string): Promise<ContractAttachment> => {
    const fd = new FormData()
    fd.append('file', file)
    if (label) fd.append('label', label)
    const { data } = await api.post<ContractAttachment>(`/contracts/${id}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  downloadAttachment: async (id: number, attId: number, filename: string): Promise<void> => {
    const resp = await api.get(`/contracts/${id}/attachments/${attId}`, { responseType: 'blob' })
    const ct = resp.headers['content-type']
    const blob = new Blob([resp.data], { type: typeof ct === 'string' ? ct : 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  },
  deleteAttachment: async (id: number, attId: number): Promise<void> => {
    await api.delete(`/contracts/${id}/attachments/${attId}`)
  },
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const userService = {
  list: async (): Promise<User[]> => {
    const { data } = await api.get<User[]>('/users/')
    return data
  },
  create: async (payload: any): Promise<User> => {
    const { data } = await api.post<User>('/users/', payload)
    return data
  },
  update: async (id: number, payload: any): Promise<User> => {
    const { data } = await api.patch<User>(`/users/${id}`, payload)
    return data
  },
  deactivate: async (id: number): Promise<void> => {
    await api.delete(`/users/${id}`)
  },
  hardDelete: async (id: number): Promise<void> => {
    await api.delete(`/users/${id}/hard`)
  },
}

// ── Projects ──────────────────────────────────────────────────────────────────
export const projectService = {
  list: async (activeOnly = true): Promise<Project[]> => {
    const { data } = await api.get<Project[]>('/projects/', { params: { active_only: activeOnly } })
    return data
  },
  get: async (id: number): Promise<Project> => {
    const { data } = await api.get<Project>(`/projects/${id}`)
    return data
  },
  create: async (payload: any): Promise<Project> => {
    const { data } = await api.post<Project>('/projects/', payload)
    return data
  },
  update: async (id: number, payload: any): Promise<Project> => {
    const { data } = await api.patch<Project>(`/projects/${id}`, payload)
    return data
  },
}

// ── Suppliers ─────────────────────────────────────────────────────────────────
export const supplierService = {
  list: async (): Promise<Supplier[]> => {
    const { data } = await api.get<Supplier[]>('/suppliers/')
    return data
  },
  create: async (payload: any): Promise<Supplier> => {
    const { data } = await api.post<Supplier>('/suppliers/', payload)
    return data
  },
  update: async (id: number, payload: any): Promise<Supplier> => {
    const { data } = await api.patch<Supplier>(`/suppliers/${id}`, payload)
    return data
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/suppliers/${id}`)
  },
}

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingsService = {
  getApprovalRules: async (): Promise<ApprovalRule[]> => {
    const { data } = await api.get<ApprovalRule[]>('/settings/approval-rules')
    return data
  },
  resetApprovalRules: async (rules: { max_amount: number | null; approver_role: string; label: string }[]): Promise<void> => {
    await api.post('/settings/approval-rules/reset', rules)
  },
}

// ── Nákladové položky projektu ────────────────────────────────────────────────
export const costItemService = {
  list: async (projectId: number): Promise<CostItem[]> => {
    const { data } = await api.get<CostItem[]>(`/projects/${projectId}/cost-items`)
    return data
  },
  create: async (projectId: number, payload: Partial<CostItem>): Promise<CostItem> => {
    const { data } = await api.post<CostItem>(`/projects/${projectId}/cost-items`, payload)
    return data
  },
  update: async (projectId: number, id: number, payload: Partial<CostItem>): Promise<CostItem> => {
    const { data } = await api.patch<CostItem>(`/projects/${projectId}/cost-items/${id}`, payload)
    return data
  },
  delete: async (projectId: number, id: number): Promise<void> => {
    await api.delete(`/projects/${projectId}/cost-items/${id}`)
  },
}

// ── Company (Objednávateľ = naša firma) ───────────────────────────────────────
export const companyService = {
  get: async (): Promise<CompanyInfo> => {
    const { data } = await api.get<CompanyInfo>('/settings/company')
    return data
  },
  update: async (payload: CompanyInfo): Promise<CompanyInfo> => {
    const { data } = await api.put<CompanyInfo>('/settings/company', payload)
    return data
  },
}
