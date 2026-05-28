from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.models import Supplier
from app.schemas.schemas import SupplierCreate, SupplierUpdate, SupplierOut

router = APIRouter()


@router.get("/", response_model=List[SupplierOut])
def list_suppliers(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return db.query(Supplier).order_by(Supplier.name).all()


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(404, "Dodávateľ nenájdený")
    return s


@router.post("/", response_model=SupplierOut)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "ekonom", "pripravar")),
):
    if payload.ico and db.query(Supplier).filter(Supplier.ico == payload.ico).first():
        raise HTTPException(400, "IČO už existuje")
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.patch("/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "ekonom", "pripravar")),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(404, "Dodávateľ nenájdený")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(supplier, field, value)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(404, "Dodávateľ nenájdený")
    db.delete(supplier)
    db.commit()
    return {"message": "Dodávateľ vymazaný"}
