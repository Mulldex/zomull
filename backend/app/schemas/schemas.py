from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    admin = "admin"
    ekonom = "ekonom"
    pripravar = "pripravar"
    foreman = "foreman"
    director = "director"
    konatel = "konatel"


class OrderStatus(str, Enum):
    new = "new"
    pending_foreman = "pending_foreman"
    pending_director = "pending_director"
    approved = "approved"
    rejected = "rejected"


class ContractType(str, Enum):
    zmluva_o_dielo = "zmluva_o_dielo"
    ramcova = "ramcova"
    kupna = "kupna"
    ina = "ina"


class ContractStatus(str, Enum):
    new = "new"
    pending_approval = "pending_approval"
    approved = "approved"
    rejected = "rejected"


# ── AUTH ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ── USER ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.ekonom

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 8:
            raise ValueError("Heslo musí mať aspoň 8 znakov")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── PROJECT ───────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    address: Optional[str] = None
    investor: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    budget: Optional[float] = None
    currency: str = "EUR"
    is_active: bool = True


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    investor: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    budget: Optional[float] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    address: Optional[str]
    investor: Optional[str]
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    budget: Optional[float]
    currency: str
    is_active: bool
    foremen: List[UserOut] = []

    class Config:
        from_attributes = True


# ── SUPPLIER ──────────────────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    name: str
    ico: Optional[str] = None
    dic: Optional[str] = None
    ic_dph: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_person: Optional[str] = None
    note: Optional[str] = None
    is_vat_payer: bool = True


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    ico: Optional[str] = None
    dic: Optional[str] = None
    ic_dph: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_person: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None
    is_vat_payer: Optional[bool] = None


class SupplierOut(BaseModel):
    id: int
    name: str
    ico: Optional[str]
    dic: Optional[str]
    ic_dph: Optional[str] = None
    address: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    contact_person: Optional[str]
    status: str
    note: Optional[str]
    is_vat_payer: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── ORDER ITEM ────────────────────────────────────────────────────────────────

class OrderItemCreate(BaseModel):
    description: str
    quantity: float = 1
    unit: Optional[str] = None
    unit_price: float = 0
    total_price: float = 0


class OrderItemOut(BaseModel):
    id: int
    description: str
    quantity: float
    unit: Optional[str]
    unit_price: float
    total_price: float

    class Config:
        from_attributes = True


# ── ORDER ─────────────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    order_number: Optional[str] = None  # automaticky generované, ak nie je zadané
    order_date: datetime
    subject: str
    supplier_name: str
    supplier_id: Optional[int] = None
    total_amount: float
    currency: str = "EUR"
    project_id: Optional[int] = None
    notes: Optional[str] = None
    items: List[OrderItemCreate] = []
    # Objednávateľ (naša firma) – ak prázdne, doplní sa z CompanyInfo
    buyer_name: Optional[str] = None
    buyer_ico: Optional[str] = None
    buyer_dic: Optional[str] = None
    buyer_ic_dph: Optional[str] = None
    buyer_address: Optional[str] = None
    # DPH
    is_vat_payer: bool = True
    vat_rate: float = 23.0      # 23 / 19 / 5 / 0 alebo iné
    vat_amount: float = 0.0     # ak je 0 a is_vat_payer, dopočíta backend
    # Nákladová položka projektu
    cost_item_id: Optional[int] = None
    # Kontaktná osoba objednávateľa
    buyer_contact_person: Optional[str] = None
    buyer_contact_phone: Optional[str] = None
    buyer_contact_email: Optional[str] = None
    # Podmienky dodania a platby
    delivery_date: Optional[datetime] = None
    delivery_note: Optional[str] = None
    delivery_place: Optional[str] = None
    payment_due_days: Optional[int] = None
    payment_method: Optional[str] = None
    retention_percent: Optional[float] = None
    warranty_months: Optional[int] = None
    penalty_text: Optional[str] = None
    general_note: Optional[str] = None

    @field_validator("total_amount")
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Suma musí byť kladné číslo")
        return v


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    rejection_reason: Optional[str] = None


class AuditLogOut(BaseModel):
    id: int
    action: str
    detail: Optional[str]
    created_at: datetime
    user: Optional[UserOut]

    class Config:
        from_attributes = True


class OrderOut(BaseModel):
    id: int
    order_number: str
    order_date: datetime
    subject: str
    supplier_name: str
    supplier_ref: Optional[SupplierOut]
    total_amount: float
    currency: str
    notes: Optional[str]
    pdf_path: Optional[str]
    pdf_filename: Optional[str]
    status: OrderStatus
    rejection_reason: Optional[str]
    requires_director: bool
    project: Optional[ProjectOut]
    creator: UserOut
    foreman: Optional[UserOut]
    director: Optional[UserOut]
    foreman_approved_at: Optional[datetime]
    items: List[OrderItemOut] = []
    audit_logs: List[AuditLogOut] = []
    created_at: datetime
    updated_at: Optional[datetime]
    # Objednávateľ (naša firma)
    buyer_name: Optional[str] = None
    buyer_ico: Optional[str] = None
    buyer_dic: Optional[str] = None
    buyer_ic_dph: Optional[str] = None
    buyer_address: Optional[str] = None
    # DPH
    is_vat_payer: bool = True
    vat_rate: float = 23.0
    vat_amount: float = 0.0
    # Nákladová položka projektu
    cost_item_id: Optional[int] = None
    cost_item: Optional["CostItemOut"] = None
    # Kontaktná osoba objednávateľa
    buyer_contact_person: Optional[str] = None
    buyer_contact_phone: Optional[str] = None
    buyer_contact_email: Optional[str] = None
    # Podmienky dodania a platby
    delivery_date: Optional[datetime] = None
    delivery_note: Optional[str] = None
    delivery_place: Optional[str] = None
    payment_due_days: Optional[int] = None
    payment_method: Optional[str] = None
    retention_percent: Optional[float] = None
    warranty_months: Optional[int] = None
    penalty_text: Optional[str] = None
    general_note: Optional[str] = None
    attachments: List["OrderAttachmentOut"] = []

    class Config:
        from_attributes = True


# ── ORDER ATTACHMENT ──────────────────────────────────────────────────────────

class OrderAttachmentOut(BaseModel):
    id: int
    original_filename: str
    file_size: Optional[int]
    mime_type: Optional[str]
    label: Optional[str]
    uploaded_at: datetime
    uploader: Optional[UserOut] = None

    class Config:
        from_attributes = True


# ── PROJECT COST ITEMS ───────────────────────────────────────────────────────

class CostItemBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0


class CostItemCreate(CostItemBase):
    pass


class CostItemUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None


class CostItemOut(CostItemBase):
    id: int
    project_id: int

    class Config:
        from_attributes = True


# ── COMPANY INFO ──────────────────────────────────────────────────────────────

class CompanyInfoBase(BaseModel):
    name: str = ""
    ico: Optional[str] = None
    dic: Optional[str] = None
    ic_dph: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    swift: Optional[str] = None
    contact_person: Optional[str] = None
    logo_path: Optional[str] = None


class CompanyInfoOut(CompanyInfoBase):
    id: int
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CompanyInfoUpdate(CompanyInfoBase):
    pass


# ── CONTRACT ──────────────────────────────────────────────────────────────────

class ContractCreate(BaseModel):
    contract_number: Optional[str] = None  # automaticky generované, ak nie je zadané
    contract_type: ContractType
    counterparty: str
    subject: str
    value: Optional[float] = None
    currency: str = "EUR"
    sign_date: Optional[datetime] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    supplier_id: Optional[int] = None
    project_id: Optional[int] = None
    notes: Optional[str] = None


class ContractUpdate(BaseModel):
    contract_number: Optional[str] = None
    contract_type: Optional[ContractType] = None
    counterparty: Optional[str] = None
    subject: Optional[str] = None
    value: Optional[float] = None
    currency: Optional[str] = None
    sign_date: Optional[datetime] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    supplier_id: Optional[int] = None
    project_id: Optional[int] = None
    notes: Optional[str] = None


class ContractApprovalUpdate(BaseModel):
    approved: bool
    rejection_reason: Optional[str] = None


class ContractOut(BaseModel):
    id: int
    contract_number: str
    contract_type: ContractType
    counterparty: str
    subject: str
    value: Optional[float]
    currency: str
    sign_date: Optional[datetime]
    valid_from: Optional[datetime]
    valid_to: Optional[datetime]
    notes: Optional[str]
    pdf_path: Optional[str]
    pdf_filename: Optional[str]
    status: ContractStatus
    rejection_reason: Optional[str]
    foreman_approved: bool
    ekonom_approved: bool
    director_approved: bool
    foreman_approved_at: Optional[datetime]
    ekonom_approved_at: Optional[datetime]
    director_approved_at: Optional[datetime]
    project: Optional[ProjectOut]
    supplier_ref: Optional[SupplierOut]
    creator: UserOut
    foreman_approver: Optional[UserOut]
    ekonom_approver: Optional[UserOut]
    director_approver: Optional[UserOut]
    audit_logs: List[AuditLogOut] = []
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── APPROVAL RULES ────────────────────────────────────────────────────────────

class ApprovalRuleOut(BaseModel):
    id: int
    max_amount: Optional[float]
    approver_role: UserRole
    label: str
    is_active: bool
    order: int

    class Config:
        from_attributes = True


TokenResponse.model_rebuild()
