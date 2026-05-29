import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.config import settings
from app.models.models import (
    Order, OrderItem, OrderStatus, User, AuditLog,
    ApprovalRule, UserRole, Project, Supplier, CompanyInfo, OrderAttachment
)
from app.schemas.schemas import OrderCreate, OrderStatusUpdate, OrderOut, OrderItemCreate, OrderAttachmentOut

router = APIRouter()


def _get_foreman(db: Session, project_id: Optional[int]) -> Optional[User]:
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project and project.foremen:
            return project.foremen[0]
    return db.query(User).filter(
        User.role == UserRole.foreman, User.is_active == True
    ).first()


def _get_director(db: Session) -> Optional[User]:
    return db.query(User).filter(
        User.role == UserRole.director, User.is_active == True
    ).first()


def _get_foreman_limit(db: Session) -> float:
    rule = db.query(ApprovalRule).filter(
        ApprovalRule.approver_role == UserRole.foreman,
        ApprovalRule.is_active == True,
    ).first()
    return rule.max_amount if rule and rule.max_amount else settings.DEFAULT_FOREMAN_LIMIT


def _log(db: Session, order_id: int, user_id: Optional[int], action: str, detail: str = None):
    db.add(AuditLog(order_id=order_id, user_id=user_id, action=action, detail=detail))
    db.commit()


def _fill_buyer_from_company(db: Session, order: Order):
    """Ak buyer_* polia nie sú zadané, doplní ich z CompanyInfo."""
    company = db.query(CompanyInfo).first()
    if not company:
        return
    if not order.buyer_name:    order.buyer_name = company.name or None
    if not order.buyer_ico:     order.buyer_ico = company.ico
    if not order.buyer_dic:     order.buyer_dic = company.dic
    if not order.buyer_ic_dph:  order.buyer_ic_dph = company.ic_dph
    if not order.buyer_address: order.buyer_address = company.address


def _compute_vat(order: Order):
    """Dopočíta vat_amount z total_amount (brutto) a vat_rate."""
    if not order.is_vat_payer or not order.vat_rate:
        order.vat_amount = 0.0
        return
    # total_amount je brutto (s DPH); subtotal = brutto / (1 + r/100)
    rate = order.vat_rate / 100.0
    subtotal = order.total_amount / (1 + rate) if rate else order.total_amount
    order.vat_amount = round(order.total_amount - subtotal, 2)


def _generate_order_number(db: Session, project_id: Optional[int]) -> str:
    """
    Generuje číslo objednávky vo formáte:
      - s projektom:    OBJ-{kód_projektu}-{NNNN}    napr. OBJ-P-2026-01-0001
      - bez projektu:   OBJ-{rok}-{NNNN}             napr. OBJ-2026-0042
    Poradové číslo sa počíta v rámci projektu (alebo rok-globálne ak nie je projekt).
    """
    year = datetime.utcnow().year
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            prefix = f"OBJ-{project.code}-"
            count = (
                db.query(Order)
                .filter(Order.project_id == project_id)
                .count()
            )
            return f"{prefix}{count + 1:04d}"
    # fallback bez projektu — globálne v rámci roka
    prefix = f"OBJ-{year}-"
    count = (
        db.query(Order)
        .filter(Order.project_id.is_(None), Order.order_number.like(f"{prefix}%"))
        .count()
    )
    return f"{prefix}{count + 1:04d}"


# ── Zoznam objednávok ─────────────────────────────────────────────────────────

@router.get("/", response_model=List[OrderOut])
def list_orders(
    status: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Order)

    if current_user.role == UserRole.foreman:
        q = q.filter(Order.foreman_id == current_user.id)
    elif current_user.role == UserRole.director:
        # Riaditeľ vidí všetky OBJ ktoré čakajú na riaditeľa (ktokoľvek môže schváliť)
        # + tie ktoré on schválil/zamietol (director_id == self)
        q = q.filter(
            (Order.status == OrderStatus.pending_director) |
            (Order.director_id == current_user.id)
        )

    if status:
        statuses = [s.strip() for s in status.split(',')]
        q = q.filter(Order.status.in_(statuses))
    if project_id:
        q = q.filter(Order.project_id == project_id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            Order.order_number.ilike(like) |
            Order.supplier_name.ilike(like) |
            Order.subject.ilike(like)
        )

    return q.order_by(Order.created_at.desc()).all()


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Objednávka nenájdená")
    return order


# ── Vytvorenie objednávky (JSON – bez PDF) ────────────────────────────────────

@router.post("/", response_model=OrderOut)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar", "foreman", "director")),
):
    # Automatické číslovanie – ak sa pošle ručne, akceptujeme (na backwards-kompatibilitu)
    order_number = payload.order_number or _generate_order_number(db, payload.project_id)
    if db.query(Order).filter(Order.order_number == order_number).first():
        # Veľmi nepravdepodobné (count + 1), ale poistka proti race-condition:
        order_number = _generate_order_number(db, payload.project_id)

    foreman_limit = _get_foreman_limit(db)
    requires_director = payload.total_amount > foreman_limit
    foreman = _get_foreman(db, payload.project_id)
    # Neviazať na konkrétneho riaditeľa — pri schválení sa zaznamená kto.
    # Slúži len ako "potenciálny" priradený riaditeľ (môže ho schváliť ktorýkoľvek aktívny).
    director = None

    order = Order(
        order_number=order_number,
        order_date=payload.order_date,
        subject=payload.subject,
        supplier_name=payload.supplier_name,
        supplier_id=payload.supplier_id,
        total_amount=payload.total_amount,
        currency=payload.currency,
        project_id=payload.project_id,
        notes=payload.notes,
        # Objednávateľ
        buyer_name=payload.buyer_name,
        buyer_ico=payload.buyer_ico,
        buyer_dic=payload.buyer_dic,
        buyer_ic_dph=payload.buyer_ic_dph,
        buyer_address=payload.buyer_address,
        # DPH
        is_vat_payer=payload.is_vat_payer,
        vat_rate=payload.vat_rate,
        vat_amount=payload.vat_amount,
        cost_item_id=payload.cost_item_id,
        # Kontaktná osoba objednávateľa
        buyer_contact_person=payload.buyer_contact_person,
        buyer_contact_phone=payload.buyer_contact_phone,
        buyer_contact_email=payload.buyer_contact_email,
        # Podmienky dodania a platby
        delivery_date=payload.delivery_date,
        delivery_note=payload.delivery_note,
        delivery_place=payload.delivery_place,
        payment_due_days=payload.payment_due_days,
        payment_method=payload.payment_method,
        retention_percent=payload.retention_percent,
        warranty_months=payload.warranty_months,
        penalty_text=payload.penalty_text,
        general_note=payload.general_note,
        status=OrderStatus.pending_foreman,
        requires_director=requires_director,
        foreman_id=foreman.id if foreman else None,
        director_id=director.id if director else None,
        created_by=current_user.id,
    )
    _fill_buyer_from_company(db, order)
    _compute_vat(order)
    db.add(order)
    db.flush()

    # Pridaj položky
    for item_data in payload.items:
        item = OrderItem(
            order_id=order.id,
            description=item_data.description,
            quantity=item_data.quantity,
            unit=item_data.unit,
            unit_price=item_data.unit_price,
            total_price=item_data.total_price,
        )
        db.add(item)

    db.commit()
    db.refresh(order)
    _log(db, order.id, current_user.id, "vytvorená",
         f"Objednávka vytvorená, suma: {order.total_amount} {order.currency}")
    return order


# ── Nahratie PDF k existujúcej objednávke alebo vytvorenie s PDF ──────────────

@router.post("/upload", response_model=OrderOut)
async def create_order_with_pdf(
    order_number: Optional[str] = Form(None),
    order_date: str = Form(...),
    subject: str = Form(...),
    supplier_name: str = Form(...),
    total_amount: float = Form(...),
    currency: str = Form("EUR"),
    project_id: Optional[int] = Form(None),
    supplier_id: Optional[int] = Form(None),
    notes: Optional[str] = Form(None),
    buyer_name: Optional[str] = Form(None),
    buyer_ico: Optional[str] = Form(None),
    buyer_dic: Optional[str] = Form(None),
    buyer_ic_dph: Optional[str] = Form(None),
    buyer_address: Optional[str] = Form(None),
    is_vat_payer: bool = Form(True),
    vat_rate: float = Form(23.0),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar", "foreman", "director")),
):
    # Automatické číslovanie
    if not order_number:
        order_number = _generate_order_number(db, project_id)
    if db.query(Order).filter(Order.order_number == order_number).first():
        order_number = _generate_order_number(db, project_id)

    # Uložiť PDF
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf"]:
        raise HTTPException(400, "Povolené sú len PDF súbory")
    filename = f"order_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"Súbor je príliš veľký (max {settings.MAX_FILE_SIZE_MB} MB)")
    with open(filepath, "wb") as f:
        f.write(content)

    order_date_parsed = datetime.fromisoformat(order_date)
    foreman_limit = _get_foreman_limit(db)
    requires_director = total_amount > foreman_limit
    foreman = _get_foreman(db, project_id)
    # Neviazať na konkrétneho riaditeľa — pri schválení sa zaznamená kto.
    # Slúži len ako "potenciálny" priradený riaditeľ (môže ho schváliť ktorýkoľvek aktívny).
    director = None

    order = Order(
        order_number=order_number,
        order_date=order_date_parsed,
        subject=subject,
        supplier_name=supplier_name,
        supplier_id=supplier_id,
        total_amount=total_amount,
        currency=currency,
        project_id=project_id,
        notes=notes,
        # Objednávateľ
        buyer_name=buyer_name,
        buyer_ico=buyer_ico,
        buyer_dic=buyer_dic,
        buyer_ic_dph=buyer_ic_dph,
        buyer_address=buyer_address,
        # DPH
        is_vat_payer=is_vat_payer,
        vat_rate=vat_rate,
        pdf_path=filepath,
        pdf_filename=file.filename,
        status=OrderStatus.pending_foreman,
        requires_director=requires_director,
        foreman_id=foreman.id if foreman else None,
        director_id=director.id if director else None,
        created_by=current_user.id,
    )
    _fill_buyer_from_company(db, order)
    _compute_vat(order)
    db.add(order)
    db.commit()
    db.refresh(order)
    _log(db, order.id, current_user.id, "vytvorená s PDF",
         f"Objednávka s PDF, suma: {order.total_amount} {order.currency}")
    return order


@router.patch("/{order_id}/approve", response_model=OrderOut)
def approve_order(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Postupný workflow: pending_foreman → pending_director (ak requires_director) → approved.
    Pri pending_director ktorýkoľvek aktívny riaditeľ môže schváliť — zaznamená sa kto."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Objednávka nenájdená")

    now = datetime.utcnow()

    # Zamietnutie kdekoľvek
    if payload.status == OrderStatus.rejected:
        if current_user.role not in (UserRole.foreman, UserRole.director, UserRole.admin):
            raise HTTPException(403, "Nemáte oprávnenie zamietnuť objednávku")
        order.status = OrderStatus.rejected
        order.rejection_reason = payload.rejection_reason
        if current_user.role == UserRole.director:
            order.director_id = current_user.id   # zaznamenáme kto zamietol
        _log(db, order.id, current_user.id, "zamietnutá",
             f"{current_user.role.value}: {payload.rejection_reason or '—'}")
        db.commit()
        db.refresh(order)
        return order

    # Schválenie — postupné
    # 1. Pending foreman → Pending director ALEBO Approved (podľa requires_director)
    if order.status == OrderStatus.pending_foreman:
        if current_user.role == UserRole.foreman and order.foreman_id != current_user.id:
            raise HTTPException(403, "Túto objednávku má schváliť iný stavbyvedúci")
        if current_user.role not in (UserRole.foreman, UserRole.admin):
            raise HTTPException(403, "V tomto stave môže schváliť len stavbyvedúci")
        order.foreman_approved_at = now
        if order.requires_director:
            order.status = OrderStatus.pending_director
            _log(db, order.id, current_user.id, "schválená stavbyvedúcim", "Postúpené riaditeľovi")
        else:
            order.status = OrderStatus.approved
            _log(db, order.id, current_user.id, "schválená stavbyvedúcim", "Finálne schválená")
        db.commit()
        db.refresh(order)
        return order

    # 2. Pending director → Approved (ktorýkoľvek riaditeľ)
    if order.status == OrderStatus.pending_director:
        if current_user.role not in (UserRole.director, UserRole.admin):
            raise HTTPException(403, "V tomto stave môže schváliť len riaditeľ")
        order.director_id = current_user.id   # zaznamenáme kto schválil
        order.status = OrderStatus.approved
        _log(db, order.id, current_user.id, "schválená riaditeľom",
             f"Schválil {current_user.full_name}")
        db.commit()
        db.refresh(order)
        return order

    raise HTTPException(400, f"Objednávku nemožno schváliť v stave: {order.status}")


@router.post("/{order_id}/pdf", response_model=OrderOut)
async def attach_pdf(
    order_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar")),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Objednávka nenájdená")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf"]:
        raise HTTPException(400, "Povolené sú len PDF súbory")
    filename = f"order_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    if order.pdf_path and os.path.exists(order.pdf_path):
        os.remove(order.pdf_path)
    order.pdf_path = filepath
    order.pdf_filename = file.filename
    db.commit()
    db.refresh(order)
    _log(db, order.id, current_user.id, "PDF priložené", file.filename)
    return order


@router.post("/{order_id}/generate-pdf", response_model=OrderOut)
def generate_pdf(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vygeneruje PDF tlačivo objednávky pomocou reportlab a uloží ho."""
    from app.services.pdf_generator import generate_order_pdf

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Objednávka nenájdená")
    if order.status != OrderStatus.approved:
        raise HTTPException(400, "PDF možno vygenerovať len pre schválenú objednávku")

    company = db.query(CompanyInfo).first()
    pdf_bytes = generate_order_pdf(order, company)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"order_generated_{order.order_number.replace('/', '_')}_{uuid.uuid4().hex[:8]}.pdf"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(pdf_bytes)

    # Zmaž starý PDF ak existuje
    if order.pdf_path and os.path.exists(order.pdf_path) and order.pdf_path != filepath:
        try:
            os.remove(order.pdf_path)
        except Exception:
            pass

    order.pdf_path = filepath
    order.pdf_filename = filename
    db.commit()
    db.refresh(order)
    _log(db, order.id, current_user.id, "PDF vygenerované", filename)
    return order


@router.get("/{order_id}/pdf")
def get_order_pdf(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or not order.pdf_path:
        raise HTTPException(404, "PDF nenájdené")
    if not os.path.exists(order.pdf_path):
        raise HTTPException(404, "Súbor neexistuje na disku")
    return FileResponse(order.pdf_path, media_type="application/pdf",
                        filename=order.pdf_filename or "objednavka.pdf")


# ── Prílohy k objednávke (cenové ponuky, emaily, doplnkové dokumenty) ─────────

ALLOWED_ATTACHMENT_EXTS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".csv",
    ".msg", ".eml", ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".zip", ".rar", ".7z", ".txt", ".rtf", ".odt", ".ods",
}

MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
    ".csv": "text/csv",
    ".msg": "application/vnd.ms-outlook",
    ".eml": "message/rfc822",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
    ".txt": "text/plain",
    ".rtf": "application/rtf",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
}


@router.get("/{order_id}/attachments", response_model=List[OrderAttachmentOut])
def list_attachments(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Objednávka nenájdená")
    return order.attachments


@router.post("/{order_id}/attachments", response_model=OrderAttachmentOut)
async def upload_attachment(
    order_id: int,
    file: UploadFile = File(...),
    label: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar", "foreman", "director")),
):
    """Nahrať prílohu k objednávke (cenová ponuka, email, doc/xlsx, atď.)."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Objednávka nenájdená")

    original = file.filename or "subor"
    ext = os.path.splitext(original)[1].lower()
    if ext not in ALLOWED_ATTACHMENT_EXTS:
        allowed = ", ".join(sorted(ALLOWED_ATTACHMENT_EXTS))
        raise HTTPException(400, f"Nepodporovaný formát. Povolené: {allowed}")

    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"Súbor je príliš veľký (max {settings.MAX_FILE_SIZE_MB} MB)")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_name = f"order_{order_id}_att_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, safe_name)
    with open(filepath, "wb") as f:
        f.write(content)

    att = OrderAttachment(
        order_id=order_id,
        original_filename=original,
        file_path=filepath,
        file_size=len(content),
        mime_type=MIME_BY_EXT.get(ext, file.content_type or "application/octet-stream"),
        label=label,
        uploaded_by=current_user.id,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    _log(db, order_id, current_user.id, "Príloha nahratá", f"{label or '—'}: {original}")
    return att


@router.get("/{order_id}/attachments/{attachment_id}")
def download_attachment(
    order_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(OrderAttachment).filter(
        OrderAttachment.id == attachment_id,
        OrderAttachment.order_id == order_id,
    ).first()
    if not att:
        raise HTTPException(404, "Príloha nenájdená")
    if not os.path.exists(att.file_path):
        raise HTTPException(404, "Súbor neexistuje na disku")
    return FileResponse(
        att.file_path,
        media_type=att.mime_type or "application/octet-stream",
        filename=att.original_filename,
    )


@router.delete("/{order_id}/attachments/{attachment_id}")
def delete_attachment(
    order_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar")),
):
    att = db.query(OrderAttachment).filter(
        OrderAttachment.id == attachment_id,
        OrderAttachment.order_id == order_id,
    ).first()
    if not att:
        raise HTTPException(404, "Príloha nenájdená")
    if att.file_path and os.path.exists(att.file_path):
        try:
            os.remove(att.file_path)
        except Exception:
            pass
    original = att.original_filename
    db.delete(att)
    db.commit()
    _log(db, order_id, current_user.id, "Príloha zmazaná", original)
    return {"ok": True}


# ── Generovanie PDF tlačiva objednávky ────────────────────────────────────────

def _can_generate_pdf(order: Order, user: User) -> bool:
    """
    Tlačivo objednávky môže vygenerovať ktokoľvek prihlásený,
    ALE iba ak objednávka prešla celým odsúhlasovacím kolečkom (status = approved).
    """
    return order.status == OrderStatus.approved


@router.post("/{order_id}/generate-pdf", response_model=OrderOut)
def generate_order_pdf_endpoint(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vygeneruje PDF tlačivo objednávky a uloží ho ako jej prílohu."""
    from app.services.pdf_generator import generate_order_pdf

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Objednávka nenájdená")

    if not _can_generate_pdf(order, current_user):
        if order.status != OrderStatus.approved:
            raise HTTPException(
                400,
                "Tlačivo môžete vygenerovať až po úplnom schválení objednávky."
            )
        raise HTTPException(
            403,
            "Nemáte oprávnenie generovať tlačivo pre túto objednávku."
        )

    # Vygeneruj PDF
    try:
        pdf_bytes = generate_order_pdf(order)
    except Exception as e:
        raise HTTPException(500, f"Chyba pri generovaní PDF: {e}")

    # Ulož do uploads/
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"objednavka_{order.order_number.replace('/', '-')}_{uuid.uuid4().hex[:6]}.pdf"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(pdf_bytes)

    # Ak už existuje staré PDF, vymaž ho
    if order.pdf_path and os.path.exists(order.pdf_path):
        try:
            os.remove(order.pdf_path)
        except OSError:
            pass

    order.pdf_path = filepath
    order.pdf_filename = f"Objednávka {order.order_number}.pdf"
    db.commit()
    db.refresh(order)
    _log(db, order.id, current_user.id, "PDF vygenerované",
         f"Vygenerované tlačivo objednávky")
    return order


# ── Schvaľovanie objednávok ───────────────────────────────────────────────────

@router.patch("/{order_id}/approve", response_model=OrderOut)
def approve_order(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Objednávka nenájdená")

    # Stavbyvedúci schvaľuje
    if (current_user.role == UserRole.foreman and
            order.status == OrderStatus.pending_foreman and
            order.foreman_id == current_user.id):

        if payload.status == OrderStatus.rejected:
            order.status = OrderStatus.rejected
            order.rejection_reason = payload.rejection_reason
            _log(db, order.id, current_user.id, "zamietnutá",
                 f"Stavbyvedúci zamietol: {payload.rejection_reason}")
        elif payload.status == OrderStatus.approved:
            order.foreman_approved_at = datetime.utcnow()
            if order.requires_director:
                order.status = OrderStatus.pending_director
                _log(db, order.id, current_user.id, "schválená stavbyvedúcim",
                     "Postúpená riaditeľovi")
            else:
                order.status = OrderStatus.approved
                _log(db, order.id, current_user.id, "schválená", "Schválená stavbyvedúcim")
        db.commit()
        db.refresh(order)
        return order

    # Riaditeľ schvaľuje
    if (current_user.role == UserRole.director and
            order.status == OrderStatus.pending_director and
            order.director_id == current_user.id):

        if payload.status == OrderStatus.rejected:
            order.status = OrderStatus.rejected
            order.rejection_reason = payload.rejection_reason
            _log(db, order.id, current_user.id, "zamietnutá",
                 f"Riaditeľ zamietol: {payload.rejection_reason}")
        elif payload.status == OrderStatus.approved:
            order.status = OrderStatus.approved
            _log(db, order.id, current_user.id, "schválená", "Schválená riaditeľom")
        db.commit()
        db.refresh(order)
        return order

    # Admin môže zmeniť stav kedykoľvek
    if current_user.role == UserRole.admin:
        order.status = payload.status
        if payload.rejection_reason:
            order.rejection_reason = payload.rejection_reason
        _log(db, order.id, current_user.id, f"stav zmenený na {payload.status.value}", "Admin")
        db.commit()
        db.refresh(order)
        return order

    raise HTTPException(403, "Nemáte oprávnenie na túto akciu")


# ── Mazanie ───────────────────────────────────────────────────────────────────

@router.delete("/{order_id}")
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Objednávka nenájdená")
    if order.pdf_path and os.path.exists(order.pdf_path):
        os.remove(order.pdf_path)
    db.delete(order)
    db.commit()
    return {"message": "Objednávka vymazaná"}
