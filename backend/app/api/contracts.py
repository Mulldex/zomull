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
    Contract, ContractStatus, User, AuditLog,
    UserRole, Project, ContractAttachment
)
from app.schemas.schemas import ContractCreate, ContractUpdate, ContractApprovalUpdate, ContractOut, ContractAttachmentOut, ContractResendRequest

router = APIRouter()


def _assign_approvers(db: Session, contract: Contract, project_id: Optional[int], foreman_id_from_payload: Optional[int] = None):
    """Priradí schvaľovateľov k zmluve (postupný workflow: foreman → director)."""
    # 1. Stavbyvedúci — priorita:
    #    a) explicitne zo payload (tvorca ho ručne vybral)
    #    b) z projektu (foremen)
    #    c) prvý aktívny stavbyvedúci v systéme (fallback)
    if foreman_id_from_payload:
        u = db.query(User).filter(
            User.id == foreman_id_from_payload,
            User.role == UserRole.foreman,
            User.is_active == True,
        ).first()
        if u:
            contract.foreman_id = u.id
    if not contract.foreman_id and project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project and project.foremen:
            contract.foreman_id = project.foremen[0].id
    if not contract.foreman_id:
        foreman = db.query(User).filter(
            User.role == UserRole.foreman, User.is_active == True
        ).first()
        if foreman:
            contract.foreman_id = foreman.id

    # 2. Riaditeľ — neviazať na konkrétneho. Pri schválení sa zaznamená kto.
    # Director_id zostane None kým niekto z aktívnych riaditeľov neschváli.


def _log(db: Session, contract_id: int, user_id: Optional[int], action: str, detail: str = None):
    db.add(AuditLog(contract_id=contract_id, user_id=user_id, action=action, detail=detail))
    db.commit()


def _check_all_approved(db: Session, contract: Contract):
    """Legacy: ostáva pre kompatibilitu so starým paralelným workflowom."""
    if contract.foreman_approved and contract.ekonom_approved and contract.director_approved:
        contract.status = ContractStatus.approved
        _log(db, contract.id, None, "schválená", "Všetci schvaľovatelia schválili")


def _generate_contract_number(db: Session, project_id: Optional[int]) -> str:
    """
    Generuje číslo zmluvy vo formáte:
      - s projektom:    ZML-{kód_projektu}-{NNNN}   napr. ZML-P-2026-01-0001
      - bez projektu:   ZML-{rok}-{NNNN}            napr. ZML-2026-0011
    Poradové číslo sa počíta v rámci projektu (alebo rok-globálne ak nie je projekt).
    """
    year = datetime.utcnow().year
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            prefix = f"ZML-{project.code}-"
            count = (
                db.query(Contract)
                .filter(Contract.project_id == project_id)
                .count()
            )
            return f"{prefix}{count + 1:04d}"
    prefix = f"ZML-{year}-"
    count = (
        db.query(Contract)
        .filter(Contract.project_id.is_(None), Contract.contract_number.like(f"{prefix}%"))
        .count()
    )
    return f"{prefix}{count + 1:04d}"


# ── Zoznam zmlúv ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ContractOut])
def list_contracts(
    status: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Contract)

    # Filtrovanie podľa role:
    #  - admin, ekonom, pripravar, konatel — vidia VŠETKY
    #  - foreman — vidí len zmluvy kde je on stavbyvedúcim
    #  - director — vidí všetky pending_director (ktokoľvek môže schváliť) + tie ktoré on schválil/zamietol
    if current_user.role == UserRole.foreman:
        q = q.filter(Contract.foreman_id == current_user.id)
    elif current_user.role == UserRole.director:
        q = q.filter(
            (Contract.status == ContractStatus.pending_director) |
            (Contract.director_id == current_user.id)
        )

    if status:
        statuses = [s.strip() for s in status.split(',')]
        q = q.filter(Contract.status.in_(statuses))
    if project_id:
        q = q.filter(Contract.project_id == project_id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            Contract.contract_number.ilike(like) |
            Contract.counterparty.ilike(like) |
            Contract.subject.ilike(like)
        )

    return q.order_by(Contract.created_at.desc()).all()


@router.get("/{contract_id}", response_model=ContractOut)
def get_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Zmluva nenájdená")
    return contract


# ── Vytvorenie zmluvy (metadata) ──────────────────────────────────────────────

@router.post("/", response_model=ContractOut)
def create_contract(
    payload: ContractCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar", "foreman")),
):
    contract_number = payload.contract_number or _generate_contract_number(db, payload.project_id)
    if db.query(Contract).filter(Contract.contract_number == contract_number).first():
        contract_number = _generate_contract_number(db, payload.project_id)

    contract = Contract(
        contract_number=contract_number,
        contract_type=payload.contract_type,
        counterparty=payload.counterparty,
        subject=payload.subject,
        value=payload.value,
        currency=payload.currency,
        sign_date=payload.sign_date,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        supplier_id=payload.supplier_id,
        project_id=payload.project_id,
        notes=payload.notes,
        status=ContractStatus.pending_foreman,   # 1. krok: čaká na stavbyvedúceho
        created_by=current_user.id,
    )
    _assign_approvers(db, contract, payload.project_id, payload.foreman_id)
    db.add(contract)
    db.commit()
    db.refresh(contract)
    _log(db, contract.id, current_user.id, "vytvorená",
         f"Zmluva vytvorená: {contract.contract_number}")
    return contract


# ── Vytvorenie zmluvy s PDF ───────────────────────────────────────────────────

@router.post("/upload", response_model=ContractOut)
async def create_contract_with_pdf(
    contract_number: Optional[str] = Form(None),
    contract_type: str = Form(...),
    counterparty: str = Form(...),
    subject: str = Form(...),
    value: Optional[float] = Form(None),
    currency: str = Form("EUR"),
    sign_date: Optional[str] = Form(None),
    valid_from: Optional[str] = Form(None),
    valid_to: Optional[str] = Form(None),
    supplier_id: Optional[int] = Form(None),
    project_id: Optional[int] = Form(None),
    notes: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar", "foreman")),
):
    if not contract_number:
        contract_number = _generate_contract_number(db, project_id)
    if db.query(Contract).filter(Contract.contract_number == contract_number).first():
        contract_number = _generate_contract_number(db, project_id)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf"]:
        raise HTTPException(400, "Povolené sú len PDF súbory")
    filename = f"contract_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"Súbor je príliš veľký (max {settings.MAX_FILE_SIZE_MB} MB)")
    with open(filepath, "wb") as f:
        f.write(content)

    def parse_dt(s):
        return datetime.fromisoformat(s) if s else None

    contract = Contract(
        contract_number=contract_number,
        contract_type=contract_type,
        counterparty=counterparty,
        subject=subject,
        value=value,
        currency=currency,
        sign_date=parse_dt(sign_date),
        valid_from=parse_dt(valid_from),
        valid_to=parse_dt(valid_to),
        supplier_id=supplier_id,
        project_id=project_id,
        notes=notes,
        pdf_path=filepath,
        pdf_filename=file.filename,
        status=ContractStatus.pending_foreman,
        created_by=current_user.id,
    )
    _assign_approvers(db, contract, project_id, None)
    db.add(contract)
    db.commit()
    db.refresh(contract)
    _log(db, contract.id, current_user.id, "vytvorená s PDF",
         f"Zmluva s PDF: {contract.contract_number}")
    return contract


@router.post("/{contract_id}/pdf", response_model=ContractOut)
async def attach_pdf(
    contract_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar", "foreman")),
):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Zmluva nenájdená")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf"]:
        raise HTTPException(400, "Povolené sú len PDF súbory")
    filename = f"contract_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    if contract.pdf_path and os.path.exists(contract.pdf_path):
        os.remove(contract.pdf_path)
    contract.pdf_path = filepath
    contract.pdf_filename = file.filename
    db.commit()
    db.refresh(contract)
    _log(db, contract.id, current_user.id, "PDF priložené", file.filename)
    return contract


@router.get("/{contract_id}/pdf")
def get_contract_pdf(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract or not contract.pdf_path:
        raise HTTPException(404, "PDF nenájdené")
    if not os.path.exists(contract.pdf_path):
        raise HTTPException(404, "Súbor neexistuje na disku")
    return FileResponse(contract.pdf_path, media_type="application/pdf",
                        filename=contract.pdf_filename or "zmluva.pdf")


# ── Paralelné schvaľovanie zmlúv ─────────────────────────────────────────────

@router.patch("/{contract_id}/approve", response_model=ContractOut)
def approve_contract(
    contract_id: int,
    payload: ContractApprovalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Postupný workflow: pending_foreman → pending_director → approved.
    Zamietnutie kdekoľvek → returned_for_rework (tvorca môže pri opätovnom odoslaní voliť odkiaľ pokračovať)."""
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Zmluva nenájdená")

    now = datetime.utcnow()

    # Zamietnutie — kdekoľvek
    if not payload.approved:
        if current_user.role not in (UserRole.foreman, UserRole.director, UserRole.admin):
            raise HTTPException(403, "Nemáte oprávnenie zamietnuť zmluvu")
        if contract.status not in (ContractStatus.pending_foreman, ContractStatus.pending_director, ContractStatus.pending_approval):
            raise HTTPException(400, "Zmluva nie je v stave čakania na schválenie")

        # Určí stage podľa aktuálneho stavu / roly
        if current_user.role == UserRole.foreman or contract.status == ContractStatus.pending_foreman:
            contract.last_rejected_stage = "foreman"
        elif current_user.role == UserRole.director or contract.status == ContractStatus.pending_director:
            contract.last_rejected_stage = "director"
        else:
            contract.last_rejected_stage = "foreman"

        contract.status = ContractStatus.returned_for_rework
        contract.rejection_reason = payload.rejection_reason
        contract.rejected_by_id = current_user.id
        contract.rejected_at = now
        # Ak zamietol riaditeľ pri pending_director, zaznamenáme aj kto schvaľoval (director_id)
        if current_user.role == UserRole.director:
            contract.director_id = current_user.id
        _log(db, contract.id, current_user.id, "vrátená na prepracovanie",
             f"{current_user.role.value} ({contract.last_rejected_stage}): {payload.rejection_reason}")
        db.commit()
        db.refresh(contract)
        return contract

    # Schválenie — postupné
    # 1. Pending foreman → Pending director
    if contract.status == ContractStatus.pending_foreman:
        if current_user.role == UserRole.foreman and contract.foreman_id != current_user.id:
            raise HTTPException(403, "Túto zmluvu má schváliť iný stavbyvedúci")
        if current_user.role not in (UserRole.foreman, UserRole.admin):
            raise HTTPException(403, "V tomto stave môže schváliť len stavbyvedúci")
        contract.foreman_approved = True
        contract.foreman_approved_at = now
        contract.status = ContractStatus.pending_director
        _log(db, contract.id, current_user.id, "schválená stavbyvedúcim",
             "Postúpené riaditeľovi")
        db.commit()
        db.refresh(contract)
        return contract

    # 2. Pending director → Approved (ktorýkoľvek aktívny riaditeľ)
    if contract.status == ContractStatus.pending_director:
        if current_user.role not in (UserRole.director, UserRole.admin):
            raise HTTPException(403, "V tomto stave môže schváliť len riaditeľ")
        contract.director_id = current_user.id   # zaznamenáme kto schválil
        contract.director_approved = True
        contract.director_approved_at = now
        contract.status = ContractStatus.approved
        _log(db, contract.id, current_user.id, "schválená riaditeľom",
             f"Schválil {current_user.full_name}")
        db.commit()
        db.refresh(contract)
        return contract

    # Legacy paralelný stav alebo iný — admin override
    if contract.status == ContractStatus.pending_approval and current_user.role == UserRole.admin:
        contract.foreman_approved = True
        contract.ekonom_approved = True
        contract.director_approved = True
        contract.foreman_approved_at = now
        contract.ekonom_approved_at = now
        contract.director_approved_at = now
        contract.status = ContractStatus.approved
        _log(db, contract.id, current_user.id, "schválená adminom (legacy)", None)
        db.commit()
        db.refresh(contract)
        return contract

    raise HTTPException(400, f"Zmluvu nemožno schváliť v stave: {contract.status}")


@router.post("/{contract_id}/resend", response_model=ContractOut)
def resend_contract(
    contract_id: int,
    payload: ContractResendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Opätovné odoslanie zmluvy na schválenie po prepracovaní.
    - from_start=True → znova od začiatku (pending_foreman, resetnúť schválenia)
    - from_start=False → rovno k tomu kto zamietol (pending_{last_rejected_stage})"""
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Zmluva nenájdená")
    if contract.status != ContractStatus.returned_for_rework:
        raise HTTPException(400, "Zmluvu možno opätovne odoslať len zo stavu 'Vrátená na prepracovanie'")
    if current_user.id != contract.created_by and current_user.role != UserRole.admin:
        raise HTTPException(403, "Iba tvorca alebo admin môže znovu odoslať")

    if payload.from_start:
        contract.status = ContractStatus.pending_foreman
        contract.foreman_approved = False
        contract.foreman_approved_at = None
        contract.director_approved = False
        contract.director_approved_at = None
        detail = "Od začiatku"
    else:
        stage = contract.last_rejected_stage or "foreman"
        if stage == "director":
            contract.status = ContractStatus.pending_director
        else:
            contract.status = ContractStatus.pending_foreman
            contract.foreman_approved = False
            contract.foreman_approved_at = None
        detail = f"Od miesta zamietnutia ({stage})"

    contract.rejection_reason = None
    contract.rejected_by_id = None
    contract.rejected_at = None
    contract.last_rejected_stage = None

    _log(db, contract.id, current_user.id, "znova odoslaná na schválenie", detail)
    db.commit()
    db.refresh(contract)
    return contract


# ── Úprava metadát ────────────────────────────────────────────────────────────

@router.patch("/{contract_id}", response_model=ContractOut)
def update_contract(
    contract_id: int,
    payload: ContractUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar", "foreman")),
):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Zmluva nenájdená")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(contract, field, value)
    db.commit()
    db.refresh(contract)
    _log(db, contract.id, current_user.id, "upravená", None)
    return contract


# ── Mazanie ───────────────────────────────────────────────────────────────────

@router.delete("/{contract_id}")
def delete_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Zmluva nenájdená")
    if contract.pdf_path and os.path.exists(contract.pdf_path):
        os.remove(contract.pdf_path)
    db.delete(contract)
    db.commit()
    return {"message": "Zmluva vymazaná"}


# ── Prílohy k zmluvám (Word, Excel, PDF, MSG/EML, obrázky) ────────────────────

ALLOWED_CONTRACT_ATT_EXTS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".csv",
    ".msg", ".eml", ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".zip", ".rar", ".7z", ".txt", ".rtf", ".odt", ".ods",
}

CONTRACT_MIME_BY_EXT = {
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


@router.get("/{contract_id}/attachments", response_model=List[ContractAttachmentOut])
def list_contract_attachments(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Zmluva nenájdená")
    return contract.attachments


@router.post("/{contract_id}/attachments", response_model=ContractAttachmentOut)
async def upload_contract_attachment(
    contract_id: int,
    file: UploadFile = File(...),
    label: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar", "foreman", "director")),
):
    """Nahrať prílohu k zmluve (Word, Excel, PDF, .msg/.eml, obrázky)."""
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Zmluva nenájdená")

    original = file.filename or "subor"
    ext = os.path.splitext(original)[1].lower()
    if ext not in ALLOWED_CONTRACT_ATT_EXTS:
        allowed = ", ".join(sorted(ALLOWED_CONTRACT_ATT_EXTS))
        raise HTTPException(400, f"Nepodporovaný formát. Povolené: {allowed}")

    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"Súbor je príliš veľký (max {settings.MAX_FILE_SIZE_MB} MB)")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_name = f"contract_{contract_id}_att_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, safe_name)
    with open(filepath, "wb") as f:
        f.write(content)

    att = ContractAttachment(
        contract_id=contract_id,
        original_filename=original,
        file_path=filepath,
        file_size=len(content),
        mime_type=CONTRACT_MIME_BY_EXT.get(ext, file.content_type or "application/octet-stream"),
        label=label,
        uploaded_by=current_user.id,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    _log(db, contract_id, current_user.id, "Príloha zmluvy nahratá", f"{label or '—'}: {original}")
    return att


@router.get("/{contract_id}/attachments/{attachment_id}")
def download_contract_attachment(
    contract_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(ContractAttachment).filter(
        ContractAttachment.id == attachment_id,
        ContractAttachment.contract_id == contract_id,
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


@router.delete("/{contract_id}/attachments/{attachment_id}")
def delete_contract_attachment(
    contract_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "ekonom", "pripravar", "foreman", "director")),
):
    att = db.query(ContractAttachment).filter(
        ContractAttachment.id == attachment_id,
        ContractAttachment.contract_id == contract_id,
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
    _log(db, contract_id, current_user.id, "Príloha zmluvy zmazaná", original)
    return {"ok": True}
