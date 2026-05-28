import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_role, get_current_user
from app.core.config import settings
from app.models.models import ApprovalRule, UserRole, CompanyInfo
from app.schemas.schemas import ApprovalRuleOut, CompanyInfoOut, CompanyInfoUpdate

router = APIRouter()


def _get_or_create_company(db: Session) -> CompanyInfo:
    """Vracia singleton CompanyInfo. Ak neexistuje, vytvorí prázdny záznam."""
    company = db.query(CompanyInfo).first()
    if not company:
        company = CompanyInfo(name="")
        db.add(company)
        db.commit()
        db.refresh(company)
    return company


# ── ÚDAJE VAŠEJ FIRMY (OBJEDNÁVATEĽ) ──────────────────────────────────────────

@router.get("/company", response_model=CompanyInfoOut)
def get_company(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Každý prihlásený používateľ môže čítať údaje firmy (kvôli OBJ formuláru)."""
    return _get_or_create_company(db)


@router.put("/company", response_model=CompanyInfoOut)
def update_company(
    payload: CompanyInfoUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    """Editovať údaje firmy môže len admin."""
    company = _get_or_create_company(db)
    for field, value in payload.model_dump().items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


@router.post("/company/logo", response_model=CompanyInfoOut)
async def upload_company_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    """Nahrať logo firmy (PNG / JPG). Použije sa v PDF tlačivách."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in [".png", ".jpg", ".jpeg"]:
        raise HTTPException(400, "Povolené sú len PNG alebo JPG súbory")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Logo je príliš veľké (max 5 MB)")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"company_logo_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    company = _get_or_create_company(db)
    # Zmaž predchádzajúce logo
    if company.logo_path and os.path.exists(company.logo_path) and company.logo_path != filepath:
        try:
            os.remove(company.logo_path)
        except Exception:
            pass
    company.logo_path = filepath
    db.commit()
    db.refresh(company)
    return company


@router.delete("/company/logo", response_model=CompanyInfoOut)
def delete_company_logo(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    company = _get_or_create_company(db)
    if company.logo_path and os.path.exists(company.logo_path):
        try:
            os.remove(company.logo_path)
        except Exception:
            pass
    company.logo_path = None
    db.commit()
    db.refresh(company)
    return company


@router.get("/approval-rules", response_model=List[ApprovalRuleOut])
def get_approval_rules(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    rules = db.query(ApprovalRule).order_by(ApprovalRule.order).all()
    if not rules:
        # Predvolené pravidlá
        defaults = [
            ApprovalRule(max_amount=5000.0, approver_role=UserRole.foreman,
                         label="Stavbyvedúci (do 5 000 €)", is_active=True, order=1),
            ApprovalRule(max_amount=None, approver_role=UserRole.director,
                         label="Riaditeľ (nad 5 000 €)", is_active=True, order=2),
        ]
        for r in defaults:
            db.add(r)
        db.commit()
        rules = db.query(ApprovalRule).order_by(ApprovalRule.order).all()
    return rules


@router.post("/approval-rules/reset")
def reset_approval_rules(
    rules: List[dict],
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    db.query(ApprovalRule).delete()
    for i, rule in enumerate(rules):
        db.add(ApprovalRule(
            max_amount=rule.get("max_amount"),
            approver_role=rule.get("approver_role", "foreman"),
            label=rule.get("label", ""),
            is_active=True,
            order=i,
        ))
    db.commit()
    return {"message": "Pravidlá aktualizované"}
