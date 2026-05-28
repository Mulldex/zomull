from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime,
    ForeignKey, Text, Enum as SAEnum, Table
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    admin = "admin"
    ekonom = "ekonom"           # Ekonóm (nahradil accountant)
    pripravar = "pripravar"     # Prípravár (rovnaké CRUD práva ako ekonóm)
    foreman = "foreman"         # Stavbyvedúci
    director = "director"       # Riaditeľ


class SupplierStatus(str, enum.Enum):
    approved = "approved"
    blacklisted = "blacklisted"
    new = "new"


class OrderStatus(str, enum.Enum):
    new = "new"
    pending_foreman = "pending_foreman"     # Čaká na stavbyvedúceho
    pending_director = "pending_director"   # Čaká na riaditeľa (nad limit)
    approved = "approved"
    rejected = "rejected"


class ContractType(str, enum.Enum):
    zmluva_o_dielo = "zmluva_o_dielo"
    ramcova = "ramcova"
    kupna = "kupna"
    ina = "ina"


class ContractStatus(str, enum.Enum):
    new = "new"
    pending_approval = "pending_approval"   # Paralelné schvaľovanie
    approved = "approved"
    rejected = "rejected"


# ── Association tables ────────────────────────────────────────────────────────

project_foreman = Table(
    "project_foreman",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
)


# ── Models ────────────────────────────────────────────────────────────────────

class Supplier(Base):
    __tablename__ = "suppliers"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(200), nullable=False, index=True)
    ico            = Column(String(20), nullable=True, unique=True)
    dic            = Column(String(20), nullable=True)
    address        = Column(String(300), nullable=True)
    email          = Column(String(200), nullable=True)
    phone          = Column(String(50), nullable=True)
    contact_person = Column(String(150), nullable=True)
    status         = Column(SAEnum(SupplierStatus), default=SupplierStatus.new)
    note           = Column(Text, nullable=True)
    is_vat_payer   = Column(Boolean, default=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())

    orders    = relationship("Order", back_populates="supplier_ref")
    contracts = relationship("Contract", back_populates="supplier_ref")


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    full_name       = Column(String(150), nullable=False)
    email           = Column(String(200), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(SAEnum(UserRole), nullable=False, default=UserRole.ekonom)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    created_orders    = relationship("Order", back_populates="creator",
                                     foreign_keys="Order.created_by")
    foreman_orders    = relationship("Order", back_populates="foreman",
                                     foreign_keys="Order.foreman_id")
    director_orders   = relationship("Order", back_populates="director",
                                     foreign_keys="Order.director_id")

    created_contracts  = relationship("Contract", back_populates="creator",
                                      foreign_keys="Contract.created_by")
    foreman_contracts  = relationship("Contract", back_populates="foreman_approver",
                                      foreign_keys="Contract.foreman_id")
    ekonom_contracts   = relationship("Contract", back_populates="ekonom_approver",
                                      foreign_keys="Contract.ekonom_id")
    director_contracts = relationship("Contract", back_populates="director_approver",
                                      foreign_keys="Contract.director_id")

    audit_logs = relationship("AuditLog", back_populates="user")
    projects   = relationship("Project", secondary=project_foreman, back_populates="foremen")


class Project(Base):
    __tablename__ = "projects"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(200), nullable=False)
    code        = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    address     = Column(String(300), nullable=True)     # Adresa / miesto stavby
    investor    = Column(String(200), nullable=True)     # Investor / objednávateľ
    start_date  = Column(DateTime, nullable=True)        # Dátum začatia
    end_date    = Column(DateTime, nullable=True)        # Dátum ukončenia
    budget      = Column(Float, nullable=True)           # Rozpočet projektu
    currency    = Column(String(10), default="EUR")
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    orders    = relationship("Order", back_populates="project")
    contracts = relationship("Contract", back_populates="project")
    foremen   = relationship("User", secondary=project_foreman, back_populates="projects")


class OrderItem(Base):
    __tablename__ = "order_items"

    id          = Column(Integer, primary_key=True, index=True)
    order_id    = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    description = Column(String(500), nullable=False)
    quantity    = Column(Float, nullable=False, default=1)
    unit        = Column(String(50), nullable=True)        # ks, m², m, kg...
    unit_price  = Column(Float, nullable=False, default=0)
    total_price = Column(Float, nullable=False, default=0)

    order = relationship("Order", back_populates="items")


class Order(Base):
    __tablename__ = "orders"

    id            = Column(Integer, primary_key=True, index=True)
    order_number  = Column(String(100), unique=True, index=True, nullable=False)
    order_date    = Column(DateTime, nullable=False)
    subject       = Column(String(500), nullable=False)

    supplier_id   = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    supplier_name = Column(String(200), nullable=False)

    total_amount  = Column(Float, nullable=False)   # brutto = s DPH (alebo bez DPH ak je_vat_payer=False)
    currency      = Column(String(10), default="EUR")

    # DPH
    is_vat_payer  = Column(Boolean, default=True)   # počíta sa DPH?
    vat_rate      = Column(Float, default=23.0)     # sadzba % (default 23)
    vat_amount    = Column(Float, default=0.0)      # suma DPH (vypočítaná, uložená)

    project_id    = Column(Integer, ForeignKey("projects.id"), nullable=True)
    cost_item_id  = Column(Integer, ForeignKey("project_cost_items.id", ondelete="SET NULL"), nullable=True, index=True)
    notes         = Column(Text, nullable=True)

    # Objednávateľ – naša firma (default z CompanyInfo, edit. per OBJ)
    buyer_name    = Column(String(200), nullable=True)
    buyer_ico     = Column(String(20), nullable=True)
    buyer_dic     = Column(String(20), nullable=True)
    buyer_ic_dph  = Column(String(20), nullable=True)
    buyer_address = Column(String(300), nullable=True)

    # Kontaktná osoba objednávateľa (per OBJ – mení sa prípad od prípadu)
    buyer_contact_person = Column(String(150), nullable=True)
    buyer_contact_phone  = Column(String(50), nullable=True)
    buyer_contact_email  = Column(String(150), nullable=True)

    # Podmienky dodania a platby
    delivery_date    = Column(DateTime, nullable=True)       # Termín dodania (dátum)
    delivery_note    = Column(Text, nullable=True)            # Poznámka k termínu
    delivery_place   = Column(String(300), nullable=True)     # Miesto dodania
    payment_due_days = Column(Integer, nullable=True)         # Splatnosť faktúry v dňoch
    payment_method   = Column(String(50), nullable=True)      # Bankový prevod / Hotovosť
    retention_percent = Column(Float, nullable=True)          # Zádržné v %
    warranty_months  = Column(Integer, nullable=True)         # Záruka v mesiacoch
    penalty_text     = Column(Text, nullable=True)            # Zmluvná pokuta (text)
    general_note     = Column(Text, nullable=True)            # Voľná poznámka

    # PDF – môže byť nahraté alebo vygenerované
    pdf_path      = Column(String(500), nullable=True)
    pdf_filename  = Column(String(255), nullable=True)

    # Schvaľovanie
    status            = Column(SAEnum(OrderStatus), default=OrderStatus.new)
    rejection_reason  = Column(Text, nullable=True)
    requires_director = Column(Boolean, default=False)   # True ak suma > limit

    foreman_id        = Column(Integer, ForeignKey("users.id"), nullable=True)
    director_id       = Column(Integer, ForeignKey("users.id"), nullable=True)
    foreman_approved_at = Column(DateTime, nullable=True)

    created_by  = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    # Vzťahy
    project      = relationship("Project", back_populates="orders")
    cost_item    = relationship("ProjectCostItem", back_populates="orders")
    supplier_ref = relationship("Supplier", back_populates="orders")
    creator      = relationship("User", back_populates="created_orders",
                                foreign_keys=[created_by])
    foreman      = relationship("User", back_populates="foreman_orders",
                                foreign_keys=[foreman_id])
    director     = relationship("User", back_populates="director_orders",
                                foreign_keys=[director_id])
    items        = relationship("OrderItem", back_populates="order",
                                cascade="all, delete-orphan")
    audit_logs   = relationship("AuditLog", back_populates="order",
                                foreign_keys="AuditLog.order_id")


class Contract(Base):
    __tablename__ = "contracts"

    id              = Column(Integer, primary_key=True, index=True)
    contract_number = Column(String(100), unique=True, index=True, nullable=False)
    contract_type   = Column(SAEnum(ContractType), nullable=False)
    counterparty    = Column(String(300), nullable=False)   # Zmluvná strana
    subject         = Column(String(500), nullable=False)
    value           = Column(Float, nullable=True)
    currency        = Column(String(10), default="EUR")
    sign_date       = Column(DateTime, nullable=True)
    valid_from      = Column(DateTime, nullable=True)
    valid_to        = Column(DateTime, nullable=True)

    supplier_id     = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    project_id      = Column(Integer, ForeignKey("projects.id"), nullable=True)
    notes           = Column(Text, nullable=True)

    pdf_path        = Column(String(500), nullable=True)
    pdf_filename    = Column(String(255), nullable=True)

    # Stav
    status           = Column(SAEnum(ContractStatus), default=ContractStatus.new)
    rejection_reason = Column(Text, nullable=True)

    # Paralelné schvaľovanie – každý schvaľuje nezávisle
    foreman_approved    = Column(Boolean, default=False)
    ekonom_approved     = Column(Boolean, default=False)
    director_approved   = Column(Boolean, default=False)
    foreman_approved_at  = Column(DateTime, nullable=True)
    ekonom_approved_at   = Column(DateTime, nullable=True)
    director_approved_at = Column(DateTime, nullable=True)

    # Priradení schvaľovatelia
    foreman_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    ekonom_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    director_id  = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_by  = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    # Vzťahy
    project          = relationship("Project", back_populates="contracts")
    supplier_ref     = relationship("Supplier", back_populates="contracts")
    creator          = relationship("User", back_populates="created_contracts",
                                    foreign_keys=[created_by])
    foreman_approver = relationship("User", back_populates="foreman_contracts",
                                    foreign_keys=[foreman_id])
    ekonom_approver  = relationship("User", back_populates="ekonom_contracts",
                                    foreign_keys=[ekonom_id])
    director_approver = relationship("User", back_populates="director_contracts",
                                     foreign_keys=[director_id])
    audit_logs       = relationship("AuditLog", back_populates="contract",
                                    foreign_keys="AuditLog.contract_id")


class ApprovalRule(Base):
    """Nastavenie limitu pre schvaľovanie objednávok."""
    __tablename__ = "approval_rules"

    id            = Column(Integer, primary_key=True, index=True)
    max_amount    = Column(Float, nullable=True)      # None = neobmedzené
    approver_role = Column(SAEnum(UserRole), nullable=False)
    label         = Column(String(200), nullable=False)
    is_active     = Column(Boolean, default=True)
    order         = Column(Integer, default=0)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id          = Column(Integer, primary_key=True, index=True)
    order_id    = Column(Integer, ForeignKey("orders.id"), nullable=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    action      = Column(String(100), nullable=False)
    detail      = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    order    = relationship("Order", back_populates="audit_logs",
                            foreign_keys=[order_id])
    contract = relationship("Contract", back_populates="audit_logs",
                            foreign_keys=[contract_id])
    user     = relationship("User", back_populates="audit_logs")


class AppSettings(Base):
    __tablename__ = "app_settings"

    id    = Column(Integer, primary_key=True)
    key   = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=False)


class OrderAttachment(Base):
    """Príloha k objednávke (napr. cenová ponuka, email, doplňujúce dokumenty)."""
    __tablename__ = "order_attachments"

    id                = Column(Integer, primary_key=True, index=True)
    order_id          = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    file_path         = Column(String(500), nullable=False)
    file_size         = Column(Integer, nullable=True)
    mime_type         = Column(String(150), nullable=True)
    label             = Column(String(150), nullable=True)   # napr. "Cenová ponuka"
    uploaded_by       = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at       = Column(DateTime(timezone=True), server_default=func.now())

    order  = relationship("Order", backref="attachments")
    uploader = relationship("User", foreign_keys=[uploaded_by])


class ProjectCostItem(Base):
    """
    Nákladová položka projektu — hierarchická (parent_id self-reference).
    Príklad:
      01 Materiál
        01.01 Cement
        01.02 Tehly
      02 Práca
    """
    __tablename__ = "project_cost_items"

    id          = Column(Integer, primary_key=True, index=True)
    project_id  = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id   = Column(Integer, ForeignKey("project_cost_items.id", ondelete="CASCADE"), nullable=True, index=True)
    code        = Column(String(50), nullable=False)        # napr. "01" alebo "01.01"
    name        = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    sort_order  = Column(Integer, default=0)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    project  = relationship("Project", backref="cost_items")
    parent   = relationship("ProjectCostItem", remote_side=[id], backref="children")
    orders   = relationship("Order", back_populates="cost_item")


class CompanyInfo(Base):
    """Údaje vlastnej firmy (objednávateľ). Singleton — vždy id=1."""
    __tablename__ = "company_info"

    id             = Column(Integer, primary_key=True)
    name           = Column(String(200), nullable=False, default="")
    ico            = Column(String(20), nullable=True)
    dic            = Column(String(20), nullable=True)
    ic_dph         = Column(String(20), nullable=True)
    address        = Column(String(300), nullable=True)
    email          = Column(String(200), nullable=True)
    phone          = Column(String(50), nullable=True)
    bank_name      = Column(String(100), nullable=True)
    iban           = Column(String(50), nullable=True)
    swift          = Column(String(20), nullable=True)
    contact_person = Column(String(150), nullable=True)
    logo_path      = Column(String(500), nullable=True)
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())
