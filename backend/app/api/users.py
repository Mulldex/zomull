from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user, require_role, hash_password
from app.models.models import User, UserRole, Order, Contract, AuditLog
from app.schemas.schemas import UserCreate, UserUpdate, UserOut

router = APIRouter()


@router.get("/", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    return db.query(User).order_by(User.full_name).all()


@router.post("/", response_model=UserOut)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email je už registrovaný")
    user = User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Používateľ nenájdený")
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "password":
            user.hashed_password = hash_password(value)
        else:
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Používateľ nenájdený")
    if user.id == current_user.id:
        raise HTTPException(400, "Nemôžete deaktivovať samého seba")
    user.is_active = False
    db.commit()
    return {"message": "Používateľ deaktivovaný"}


@router.delete("/{user_id}/hard")
def hard_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.models.models import OrderAttachment, ContractAttachment
    from sqlalchemy import text as sql_text

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Používateľ nenájdený")
    if user.id == current_user.id:
        raise HTTPException(400, "Nemôžete vymazať samého seba")

    # Skontroluj, či má používateľ vytvorené OBJ alebo zmluvy (created_by je nullable=False)
    created_orders = db.query(Order).filter(Order.created_by == user_id).count()
    created_contracts = db.query(Contract).filter(Contract.created_by == user_id).count()
    if created_orders > 0 or created_contracts > 0:
        raise HTTPException(
            400,
            f"Nemožno vymazať: používateľ vytvoril {created_orders} OBJ a {created_contracts} zmlúv. "
            f"Najskôr zmaž/preraď tieto záznamy alebo používateľa iba deaktivuj."
        )

    # Odopni nullable referencie
    db.query(Order).filter(Order.foreman_id == user_id).update({"foreman_id": None})
    db.query(Order).filter(Order.director_id == user_id).update({"director_id": None})
    db.query(Contract).filter(Contract.foreman_id == user_id).update({"foreman_id": None})
    db.query(Contract).filter(Contract.ekonom_id == user_id).update({"ekonom_id": None})
    db.query(Contract).filter(Contract.director_id == user_id).update({"director_id": None})
    db.query(Contract).filter(Contract.rejected_by_id == user_id).update({"rejected_by_id": None})
    db.query(AuditLog).filter(AuditLog.user_id == user_id).update({"user_id": None})

    # Prílohy — uploaded_by je nullable
    db.query(OrderAttachment).filter(OrderAttachment.uploaded_by == user_id).update({"uploaded_by": None})
    db.query(ContractAttachment).filter(ContractAttachment.uploaded_by == user_id).update({"uploaded_by": None})

    # M:N project_foreman — odstráň všetky priradenia
    db.execute(sql_text("DELETE FROM project_foreman WHERE user_id = :uid"), {"uid": user_id})

    db.delete(user)
    db.commit()
    return {"message": "Používateľ natvrdo vymazaný"}
