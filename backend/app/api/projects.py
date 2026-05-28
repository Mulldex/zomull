from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.models import Project, User, UserRole, ProjectCostItem
from app.schemas.schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut,
    CostItemCreate, CostItemUpdate, CostItemOut,
)

router = APIRouter()


@router.get("/", response_model=List[ProjectOut])
def list_projects(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Project)
    if active_only:
        q = q.filter(Project.is_active == True)
    return q.order_by(Project.name).all()


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Projekt nenájdený")
    return project


@router.post("/", response_model=ProjectOut)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if db.query(Project).filter(Project.code == payload.code).first():
        raise HTTPException(400, "Kód projektu už existuje")
    project = Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Projekt nenájdený")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/foremen/{user_id}", response_model=ProjectOut)
def assign_foreman(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Projekt nenájdený")
    user = db.query(User).filter(User.id == user_id, User.role == UserRole.foreman).first()
    if not user:
        raise HTTPException(404, "Stavbyvedúci nenájdený")
    if user not in project.foremen:
        project.foremen.append(user)
        db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}/foremen/{user_id}", response_model=ProjectOut)
def remove_foreman(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Projekt nenájdený")
    user = db.query(User).filter(User.id == user_id).first()
    if user and user in project.foremen:
        project.foremen.remove(user)
        db.commit()
    db.refresh(project)
    return project


# ── NÁKLADOVÉ POLOŽKY PROJEKTU ────────────────────────────────────────────────

@router.get("/{project_id}/cost-items", response_model=List[CostItemOut])
def list_cost_items(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Plochý zoznam všetkých nákladových položiek projektu (na FE sa zostaví strom)."""
    if not db.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(404, "Projekt nenájdený")
    items = (
        db.query(ProjectCostItem)
        .filter(ProjectCostItem.project_id == project_id)
        .order_by(ProjectCostItem.sort_order, ProjectCostItem.code)
        .all()
    )
    return items


@router.post("/{project_id}/cost-items", response_model=CostItemOut)
def create_cost_item(
    project_id: int,
    payload: CostItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if not db.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(404, "Projekt nenájdený")
    if payload.parent_id:
        parent = db.query(ProjectCostItem).filter(
            ProjectCostItem.id == payload.parent_id,
            ProjectCostItem.project_id == project_id,
        ).first()
        if not parent:
            raise HTTPException(400, "Nadradená položka neexistuje v tomto projekte")
    item = ProjectCostItem(project_id=project_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{project_id}/cost-items/{item_id}", response_model=CostItemOut)
def update_cost_item(
    project_id: int,
    item_id: int,
    payload: CostItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    item = db.query(ProjectCostItem).filter(
        ProjectCostItem.id == item_id,
        ProjectCostItem.project_id == project_id,
    ).first()
    if not item:
        raise HTTPException(404, "Položka nenájdená")
    # ochrana proti vlastnému rodičovi
    if payload.parent_id and payload.parent_id == item.id:
        raise HTTPException(400, "Položka nemôže byť svojim vlastným rodičom")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{project_id}/cost-items/{item_id}")
def delete_cost_item(
    project_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    item = db.query(ProjectCostItem).filter(
        ProjectCostItem.id == item_id,
        ProjectCostItem.project_id == project_id,
    ).first()
    if not item:
        raise HTTPException(404, "Položka nenájdená")
    db.delete(item)  # cascade vymaže aj deti aj odpojí orders.cost_item_id
    db.commit()
    return {"message": "Položka vymazaná"}
