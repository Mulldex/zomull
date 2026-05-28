"""
Seed skript pre vytvorenie prvého admin používateľa.

Použitie (v Docker):
    docker compose exec backend python seed_admin.py

Voliteľné premenné prostredia:
    ADMIN_EMAIL     (default: admin@zomull.sk)
    ADMIN_PASSWORD  (default: admin123)
    ADMIN_NAME      (default: Administrátor)
"""
import os
import sys

from app.core.database import SessionLocal, engine, Base
from app.core.security import hash_password
from app.models.models import User, UserRole


def main() -> int:
    # Pre istotu vytvoríme tabuľky (ak ešte neexistujú)
    Base.metadata.create_all(bind=engine)

    email = os.getenv("ADMIN_EMAIL", "admin@zomull.sk")
    password = os.getenv("ADMIN_PASSWORD", "admin123")
    full_name = os.getenv("ADMIN_NAME", "Administrátor")

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"[seed_admin] Používateľ {email} už existuje (id={existing.id}, role={existing.role}).")
            return 0

        any_admin = db.query(User).filter(User.role == UserRole.admin).first()
        if any_admin:
            print(f"[seed_admin] Admin už v databáze existuje: {any_admin.email}. Nový sa nevytvára.")
            return 0

        user = User(
            full_name=full_name,
            email=email,
            hashed_password=hash_password(password),
            role=UserRole.admin,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        print("[seed_admin] Admin úspešne vytvorený:")
        print(f"  email:    {user.email}")
        print(f"  meno:     {user.full_name}")
        print(f"  rola:     {user.role}")
        print(f"  heslo:    {password}  (zmeň ho po prvom prihlásení!)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
