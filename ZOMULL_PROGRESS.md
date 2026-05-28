# ZOMULL — Stav projektu a poznámky k pokračovaniu

Posledná aktualizácia: **28. mája 2026 — verzia 2 (po deploye na Railway)**

Tento dokument je súhrnom doterajšej práce na aplikácii ZOMULL — systém správy objednávok a zmlúv pre stavebnú firmu Mulldex s.r.o. Slúži ako brieffing pre ďalšiu pracovnú reláciu, aby sa dalo nadviazať bez straty kontextu.

---

## 0. KĽÚČOVÉ ODKAZY (production)

- **Aplikácia (frontend):** https://zomull.up.railway.app
- **Backend API:** https://zomull-production.up.railway.app/api
- **GitHub repo:** https://github.com/Mulldex/zomull (private)
- **Railway project:** sunny-balance (Mulldex's Hobby)
  - Services: `zomull` (backend), `calm-curiosity` (frontend), `Postgres`

**Default admin (auto-seeded pri prvom štarte):**
- Email: `admin@zomull.sk`
- Heslo: `admin123` *(treba zmeniť po prvom prihlásení!)*

---

## 1. Stack a architektúra

**Backend** — FastAPI (Python 3.11) + SQLAlchemy + PostgreSQL
- Adresár: `backend/`
- Vstupný bod: `app/main.py` (obsahuje aj `_run_migrations()` a `_seed_default_admin()`)
- Modely: `app/models/models.py`
- Schémy (Pydantic): `app/schemas/schemas.py`
- API routery: `app/api/{auth,users,orders,contracts,projects,suppliers,settings}.py`
- Bezpečnosť (JWT, role): `app/core/security.py`
- Konfigurácia: `app/core/config.py`
- Generovanie PDF: `app/services/pdf_generator.py` (reportlab)
- Seed admin skript: `seed_admin.py` *(záložne, primárne sa seedne v main.py)*

**Frontend** — React 18 + TypeScript + Vite
- Adresár: `frontend/`
- Stránky: `src/pages/` (DashboardPage, OrdersPage, OrderDetailPage, CreateOrderPage, ContractsPage, ContractDetailPage, CreateContractPage, ApprovePage, ProjectsPage, ProjectDetailPage, SuppliersPage, UsersPage, SettingsPage, LoginPage)
- Komponenty: `src/components/` (Sidebar, StatusBadge)
- Typy: `src/types/index.ts`
- API služby: `src/services/documentService.ts`, `api.ts`
- Context: `src/context/AuthContext.tsx`
- Routing: `src/App.tsx`

**Deployment**
- Lokálne: Docker Compose (3 kontajnery)
  - `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` + `nginx.conf` + `docker-entrypoint.sh`
- Produkcia: Railway (Dockerfile builder)
  - `backend/railway.toml`, `frontend/railway.toml`
  - **Pozor:** Backend Dockerfile používa **shell formu CMD** (`CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`) — iba tak Railway expanduje `$PORT`.
  - Frontend `nginx.conf` má **`listen 8080`** (Railway default port) a **hardkódovaný Host header** `zomull-production.up.railway.app` v proxy_pass.

---

## 2. Spustenie

### Lokálne (Docker)

```powershell
cd "C:\Users\cicakj\Desktop\claude ZOMULL\ZOMULL"
docker compose up --build -d
# Admin sa seedne automaticky pri prvom štarte
```

Po spustení:
- Frontend: `http://localhost:3001`
- Backend API: `http://localhost:8001/api`
- Backend health: `http://localhost:8001/api/health`
- Swagger docs: `http://localhost:8001/docs`

Porty zámerne 3001/8001 — aby ZOMULL nekolidoval s FAMULL bežiacim na 3000/8000.

### Produkcia (Railway)

- Auto-deploy z GitHub `main` vetvy — stačí `git push` a Railway sa o všetko postará.
- Environment variables sú nastavené v Railway dashboard:
  - **Backend (`zomull` service):**
    - `DATABASE_URL = ${{Postgres.DATABASE_URL}}`
    - `SECRET_KEY = <dlhý random string>`
    - `ALLOWED_ORIGINS = ["https://zomull.up.railway.app","https://calm-curiosity-production-f99e.up.railway.app","http://localhost:3001","http://localhost:5173"]` *(JSON array!)*
    - `PORT = 8000`
  - **Frontend (`calm-curiosity` service):**
    - `BACKEND_URL = https://zomull-production.up.railway.app`

---

## 3. Doména a roly

ZOMULL spravuje objednávky a zmluvy pre stavebnú firmu Mulldex s.r.o.

### Roly

- `admin` — plné práva
- `ekonom` — vytvára objednávky a zmluvy, spravuje dodávateľov
- `pripravar` — **NOVÉ:** rovnaké CRUD práva ako ekonom (nemôže schvaľovať)
- `foreman` (stavbyvedúci) — schvaľuje objednávky do limitu, vytvára objednávky
- `director` (riaditeľ) — schvaľuje objednávky nad limit, schvaľuje zmluvy

### Workflow objednávok

1. Vytvorenie (môže admin, ekonom, pripravar, foreman, director)
2. Číslo objednávky automatické: `OBJ-{kód_projektu}-{0001}` (per projekt) alebo `OBJ-{rok}-{0001}` (bez projektu)
3. Status `pending_foreman` → stavbyvedúci schváli/zamietne
4. Ak suma > 500 EUR (limit) → `pending_director` → riaditeľ schváli/zamietne
5. Inak → `approved` priamo po stavbyvedúcom
6. Po `approved` možno vygenerovať PDF tlačivo

### Workflow zmlúv

1. Vytvorenie (admin, ekonom, pripravar) — číslo automatické: `ZML-{kód_projektu}-{0001}`
2. Status `pending_approval` → paralelné schvaľovanie: stavbyvedúci + ekonóm + riaditeľ (všetci traja musia schváliť)
3. Po všetkých schváleniach → `approved`

---

## 4. Implementované funkcie

### Fáza 1 (pôvodná)
- ✅ Autentifikácia — JWT, login, role-based prístup
- ✅ Projekty — vytváranie, edit, priradenie stavbyvedúcich; detail projektu s 3 záložkami
- ✅ Dodávatelia — CRUD, status (approved/blacklisted/new), IČO/DIČ/adresa
- ✅ Objednávky — formulár alebo nahratie PDF, schvaľovanie, audit log
- ✅ Zmluvy — paralelné schvaľovanie, audit log
- ✅ Používatelia — CRUD (admin), deaktivácia, hard delete
- ✅ Automatické číslovanie OBJ/ZML
- ✅ Údaje firmy v Nastaveniach + DPH per OBJ + nákladové položky projektu

### Fáza 2 (28. mája 2026)
- ✅ **Nový PDF generator podľa Alt A vzoru** (Mulldex brand: čierna + červená + biela)
  - Podporuje OBJ s DPH aj bez DPH
  - Hardkódovaný text *"Potvrdená objednávka je nevyhnutnou prílohou k fakturácii..."*
  - Podpisové polia s priestorom 32 mm na pečiatku + podpis
  - Poradie: Dátum → Za objednávateľa/dodávateľa (bold) → meno → priestor → línia → Pečiatka a podpis (malé sivé)
  - `KeepTogether` — podpisový blok sa nikdy nerozdelí cez 2 strany
  - DejaVu fonty pre slovenskú diakritiku (`registerFontFamily` aby aj `<b>` použilo DejaVu-Bold)
  - Fallback: ak `order.buyer_*` polia chýbajú, vezme sa z `CompanyInfo`
- ✅ **Logo upload** v Nastaveniach (PNG/JPG, max 5 MB) — uloží sa do `uploads/`, použije sa v PDF
- ✅ **Nová rola Prípravár** (`pripravar`) — rovnaké CRUD práva ako ekonóm
- ✅ **Nové polia v OBJ** (sekcia "Podmienky dodania a platby"):
  - Termín dodania (dátum + voľná poznámka)
  - Miesto dodania
  - Splatnosť faktúry (dní)
  - Spôsob platby (Bankový prevod / Hotovosť / Iné)
  - Zádržné (%)
  - Záruka (mesiacov)
  - Zmluvná pokuta (voľný text)
  - Voľná poznámka (zobrazí sa v PDF)
- ✅ **Kontaktná osoba objednávateľa** (per OBJ, prepisovateľná)
- ✅ **Prílohy k objednávke** — viacero súborov v rôznych formátoch:
  - PDF, DOC, DOCX, XLS, XLSX, XLSM, CSV
  - MSG (Outlook), EML (email)
  - PNG, JPG, JPEG, GIF, WEBP (obrázky)
  - ZIP, RAR, 7Z, TXT, RTF, ODT, ODS
  - Každá príloha má popis (napr. "Cenová ponuka"), veľkosť, kto/kedy nahral
  - Tabuľka: `order_attachments`, endpointy: `GET/POST/DELETE /orders/{id}/attachments`
- ✅ **Auto-seed default admina** pri prvom štarte (volá sa v `main.py`)
- ✅ **Fix PDF link auth** (401) — PDF sa otvára cez blob+axios s JWT tokenom namiesto priameho `<a>` linku
- ✅ **PDF fonty v Dockerfile** — `fonts-dejavu-core` + `fonts-dejavu-extra`

### Deployment (28. mája 2026)
- ✅ Push do GitHub (repo Mulldex/zomull)
- ✅ Railway projekt vytvorený: `sunny-balance`
  - Postgres database
  - `zomull` backend service (root: `backend`)
  - `calm-curiosity` frontend service (root: `frontend`)
- ✅ Frontend doména: **zomull.up.railway.app** (port 8080)
- ✅ Backend doména: **zomull-production.up.railway.app** (port 8000)
- ✅ Healthchecks: backend `/api/health`, frontend `/`

---

## 5. Štruktúra dát (najdôležitejšie tabuľky)

```
users               (admin, ekonom, pripravar, foreman, director)
projects            (názov, kód, adresa, investor, dátumy, rozpočet, foremen M:N)
project_cost_items  (hierarchia s parent_id, code, name)
suppliers           (názov, IČO, DIČ, adresa, status, is_vat_payer)
orders              (číslo auto, sumy s DPH, buyer_*, cost_item_id, vat_rate, status,
                     buyer_contact_*, delivery_*, payment_*, retention_percent,
                     warranty_months, penalty_text, general_note)
order_items         (popis, množstvo, jed.cena, celkom — netto)
order_attachments   (file_path, original_filename, mime_type, label, uploaded_by)
contracts           (typ, zmluvná strana, sumy, paralelné schvaľovanie)
audit_logs          (kto/čo/kedy pri OBJ a zmluvách)
approval_rules      (pravidlá limitov)
company_info        (singleton — údaje vlastnej firmy + logo_path)
app_settings        (kľúč-hodnota, voľné)
```

---

## 6. Migrácie a databáza

Aplikácia používa idempotentné `ALTER TABLE` v `app/main.py` (`_run_migrations()`).

Pribudli stĺpce do `orders`:
- `buyer_contact_person`, `buyer_contact_phone`, `buyer_contact_email`
- `delivery_date`, `delivery_note`, `delivery_place`
- `payment_due_days`, `payment_method`, `retention_percent`, `warranty_months`
- `penalty_text`, `general_note`

A do `company_info`:
- `logo_path`

Plus **`ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'pripravar'`** — beží v separate connection s AUTOCOMMIT izoláciou (lebo PostgreSQL nedovolí ALTER TYPE v transakcii).

`Base.metadata.create_all()` vytvorí novú tabuľku `order_attachments` automaticky.

---

## 7. Opravené chyby počas implementácie (verzia 2)

1. **Diakritika v bold texte** — `registerFontFamily('DejaVu', bold='DejaVu-Bold')` aby `<b>` v Paragraph nedefaultilo na Helvetica-Bold.
2. **PDF link 401** — priamy `<a href>` nepošle JWT token, treba blob+axios fetch.
3. **Podpisový blok sa rozdeľoval cez 2 strany** — wrap do `KeepTogether`.
4. **Buyer prázdny v PDF** — fallback z `CompanyInfo` keď `order.buyer_*` polia chýbajú.
5. **Railway shell expansion** — `CMD ["uvicorn", ...]` (JSON array) neexpanduje `$PORT`, treba shell formu: `CMD uvicorn ... --port ${PORT:-8000}`.
6. **Railway port 8080** — Railway healthcheck očakáva default 8080, nie 80. Nginx `listen 8080` + Generated Domain target port 8080.
7. **Pydantic ALLOWED_ORIGINS** — `List[str]` v config očakáva JSON array, nie `*` string. Railway Variables musí byť `["https://...","http://localhost:3001"]`.
8. **Frontend nginx Host header** — pri proxy_pass cez Railway router treba hardkódovať `proxy_set_header Host zomull-production.up.railway.app`, inak Railway router nepozná cieľ.

---

## 8. Otvorené body / TODO pre ďalšiu reláciu

### Najbližšia priorita

- 🔲 **Pridať rolu `konateľ` (read-only)** — vidí všetky OBJ a zmluvy, ale nemôže nič vytvárať/editovať/schvaľovať. **TO ISTÉ aj v FAMULL.**
  - Backend: pridať `konatel = "konatel"` do `UserRole` enum (models.py + schemas.py)
  - Migrácia: `ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'konatel'`
  - `require_role(...)` — konatel NEMÁ byť v žiadnom CRUD endpoint
  - GET endpointy pre OBJ/zmluvy — povoliť aj konateľovi (cez `get_current_user`)
  - Frontend: typy, ROLE_LABELS, App.tsx canCreate, UsersPage select
  - Žiadna karta Vytvoriť/Edit tlačidlá pre konateľa
- 🔲 **Po deploye otestovať** všetky novinky (logo upload, prílohy, nová rola pripravar)
- 🔲 **Zmeniť default admin heslo** (`admin123`)
- 🔲 **Vyplniť CompanyInfo** v Nastaveniach (MULLDEX údaje)
- 🔲 **Nahrať Mulldex logo** v Nastaveniach

### Krátko

- 🔲 Filter objednávok podľa nákladovej položky v OrdersPage
- 🔲 Súhrn objednávok per nákladová položka v detaile projektu (koľko sa už vyčerpalo)
- 🔲 Export zoznamu objednávok do Excelu / CSV
- 🔲 Globálne vyhľadávanie (topbar)

### Strednodobé

- 🔲 PDF tlačivo pre zmluvy (analogicky ako pre OBJ)
- 🔲 Email notifikácie pri zmene stavu (čaká na schválenie, schválené, zamietnuté)
- 🔲 Možnosť exportu projektu so všetkými OBJ/ZML do ZIP
- 🔲 História zmien (kto, kedy, čo zmenil)

### Veľké

- 🔲 Šablóna nákladových položiek (default v Nastaveniach, kopírovaná pri novom projekte)
- 🔲 Generovanie pre celý projekt: sumár výdavkov, porovnanie s rozpočtom
- 🔲 Mobilná verzia / responsive doladenie
- 🔲 Alembic migrácie namiesto manuálnych ALTER (keď bude veľa zmien)

### Production-ready (nice to have)

- 🔲 Backup DB stratégia (pg_dump cron alebo Railway built-in)
- 🔲 Custom doména (mulldex.sk alebo iné)
- 🔲 Logovanie do externého service (Sentry, atď.)
- 🔲 Rate limiting na API endpointy

---

## 9. Tipy pre ďalšiu reláciu s Claudom

1. **Pošli mu tento súbor** — "Pozri ZOMULL_PROGRESS.md, pokračujeme tam kde sme skončili"
2. **Pracovný workflow**:
   - Lokálne zmeny → `docker compose up --build -d` → test
   - Keď ide o produkciu → `git push` → Railway auto-deploy
3. **Sandbox limity** — Claude nedokáže spúšťať `docker compose` ani `git push` na Windows. Posiela návrhy, ty ich spúšťaš.
4. **Bash mount v sandboxe je STALE** — Claude vidí cez Read tool (Windows priamo) aktuálne súbory, ale cez bash vidí staršie kópie. Pri syntax checkoch sa nedaj zmiasť.
5. **TypeScript build chyby** — odhalia sa pri `docker compose up --build`. Posielaj logy.
6. **Railway debugging** — keď build na Railway padne, pozri sa do `Deploy Logs` na exact error.

---

## 10. Často používané príkazy

### Lokálny vývoj

```powershell
cd "C:\Users\cicakj\Desktop\claude ZOMULL\ZOMULL"
docker compose up --build -d
docker compose logs -f backend
docker compose logs -f frontend
docker compose down            # zachová DB
docker compose down -v         # zmaže DB volume!
docker compose ps              # stav kontajnerov
```

### Git workflow

```powershell
cd "C:\Users\cicakj\Desktop\claude ZOMULL\ZOMULL"
git add .
git commit -m "Popis zmien"
git push                       # Railway auto-deploy
git log --oneline -10
```

### Railway

- Dashboard: https://railway.com/project/d6a16c93-e3cd-42d0-ad8f-0bff992aa961
- Logs: klikni service → Deployments → View Logs
- Restart service: cez 3 bodky v Deployments → Redeploy

---

## 11. Zhrnutie poslednej relácie (28. máj 2026 — verzia 2)

**Hlavné dosiahnutia:**

1. ✅ **Nový PDF tlačivo (Alt A)** podľa Mulldex brandu — fonty s diakritikou, KeepTogether podpisy
2. ✅ **Logo upload** v Nastaveniach + použitie v PDF
3. ✅ **Nová rola Prípravár** (CRUD práva ako ekonom)
4. ✅ **Podmienky dodania a platby** ako nová sekcia OBJ (termín, miesto, splatnosť, zádržné, záruka, pokuta, poznámka)
5. ✅ **Prílohy k objednávke** — multi-file upload (PDF, doc, xlsx, msg, eml, obrázky)
6. ✅ **Auto-seed admina** pri prvom štarte backendu
7. ✅ **Deploy na Railway** — frontend `zomull.up.railway.app`, backend `zomull-production.up.railway.app`, Postgres

**Otvorené (pokračujeme nabudúce):**

- Rola `konatel` (read-only) v ZOMULL + FAMULL
- Otestovať novinky v produkcii
- Vyplniť CompanyInfo + nahrať logo cez UI

---

## 12. Kontaktné údaje a credentials

### Production (Railway)

- **Aplikácia:** https://zomull.up.railway.app
- **Admin login:** `admin@zomull.sk` / `admin123` *(zmeň po prvom prihlásení!)*

### Lokálny vývoj (Docker)

- **Frontend:** http://localhost:3001
- **Backend:** http://localhost:8001/api
- **Admin login:** rovnaký (`admin@zomull.sk` / `admin123`)
- **PostgreSQL:** user `zomull` / pass `vase_heslo` / db `zomull` (iba interná Docker sieť)

### GitHub

- Repo: https://github.com/Mulldex/zomull (private)
- Default branch: `main`
- Auto-deploy: pri každom push do `main`

### Mulldex firma (pre referenciu)

- IČO: 46 982 621
- DIČ: 2023702373
- IČ DPH: SK2023702373
- Adresa: Popradská 58/D, 040 11 Košice
- IBAN: SK69 0200 0000 0034 5303 8558 (VÚB)
- Web: https://www.mulldex.sk
- Email pre faktúry: faktury@mulldex.sk
