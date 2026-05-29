from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
import os
import logging

from app.core.config import settings
from app.api import auth, users, orders, contracts, projects, suppliers
from app.api import settings as settings_router
from app.core.database import engine, Base

logger = logging.getLogger("uvicorn")

Base.metadata.create_all(bind=engine)


def _run_migrations():
    """Idempotentné migrácie pre existujúce databázy – pridajú stĺpce, ak chýbajú."""
    statements = [
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_name VARCHAR(200)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_ico VARCHAR(20)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_dic VARCHAR(20)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_ic_dph VARCHAR(20)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_address VARCHAR(300)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_vat_payer BOOLEAN DEFAULT TRUE",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate FLOAT DEFAULT 23.0",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount FLOAT DEFAULT 0.0",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_item_id INTEGER REFERENCES project_cost_items(id) ON DELETE SET NULL",
        # Kontaktná osoba objednávateľa (per OBJ)
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_contact_person VARCHAR(150)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_contact_phone VARCHAR(50)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_contact_email VARCHAR(150)",
        # Podmienky dodania a platby
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date TIMESTAMP",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_note TEXT",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_place VARCHAR(300)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_days INTEGER",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_percent FLOAT",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS warranty_months INTEGER",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS penalty_text TEXT",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS general_note TEXT",
        # Company info logo
        "ALTER TABLE company_info ADD COLUMN IF NOT EXISTS logo_path VARCHAR(500)",
        # Suppliers — zvacsenie max dlzok poli + nove ic_dph pole (fix bug s dlhou DIC hodnotou)
        "ALTER TABLE suppliers ALTER COLUMN ico TYPE VARCHAR(30)",
        "ALTER TABLE suppliers ALTER COLUMN dic TYPE VARCHAR(50)",
        "ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ic_dph VARCHAR(30)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                logger.warning(f"[migrate] {stmt} -> {e}")

    # ALTER TYPE ADD VALUE musí byť mimo transakcie v PostgreSQL
    enum_alters = [
        "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'pripravar'",
        "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'konatel'",
    ]
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for stmt in enum_alters:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                logger.warning(f"[migrate-enum] {stmt} -> {e}")


_run_migrations()


def _seed_default_admin():
    """Vytvorí default admin účet pri prvom štarte (iba ak ešte žiadny admin neexistuje)."""
    try:
        from app.core.database import SessionLocal
        from app.core.security import hash_password
        from app.models.models import User, UserRole

        email = os.getenv("ADMIN_EMAIL", "admin@zomull.sk")
        password = os.getenv("ADMIN_PASSWORD", "admin123")
        full_name = os.getenv("ADMIN_NAME", "Administrátor")

        db = SessionLocal()
        try:
            existing_admin = db.query(User).filter(User.role == UserRole.admin).first()
            if existing_admin:
                logger.info(f"[seed_admin] Admin už existuje: {existing_admin.email}")
                return
            user = User(
                full_name=full_name,
                email=email,
                hashed_password=hash_password(password),
                role=UserRole.admin,
                is_active=True,
            )
            db.add(user)
            db.commit()
            logger.info(f"[seed_admin] Default admin vytvorený: {email} (heslo: {password})")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"[seed_admin] Chyba pri seedovaní admina: {e}")


_seed_default_admin()

app = FastAPI(
    title="ZOMULL API",
    description="Systém správy objednávok a zmlúv",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth.router,             prefix="/api/auth",       tags=["Autentifikácia"])
app.include_router(users.router,            prefix="/api/users",      tags=["Používatelia"])
app.include_router(orders.router,           prefix="/api/orders",     tags=["Objednávky"])
app.include_router(contracts.router,        prefix="/api/contracts",  tags=["Zmluvy"])
app.include_router(projects.router,         prefix="/api/projects",   tags=["Projekty"])
app.include_router(suppliers.router,        prefix="/api/suppliers",  tags=["Dodávatelia"])
app.include_router(settings_router.router,  prefix="/api/settings",   tags=["Nastavenia"])


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "ZOMULL", "version": "1.0.0"}
