# ZOMULL — Stav projektu a poznámky k pokračovaniu

Posledná aktualizácia: 28. mája 2026

Tento dokument je súhrnom doterajšej práce na aplikácii ZOMULL — systém správy objednávok a zmlúv pre stavebnú firmu. Slúži ako brieffing pre ďalšiu pracovnú reláciu, aby sa dalo nadviazať bez straty kontextu.

---

## 1. Stack a architektúra

**Backend** — FastAPI (Python 3.11) + SQLAlchemy + PostgreSQL
- Adresár: `backend/`
- Vstupný bod: `app/main.py`
- Modely: `app/models/models.py`
- Schémy (Pydantic): `app/schemas/schemas.py`
- API routery: `app/api/{auth,users,orders,contracts,projects,suppliers,settings}.py`
- Bezpečnosť (JWT, role): `app/core/security.py`
- Konfigurácia: `app/core/config.py`
- Generovanie PDF: `app/services/pdf_generator.py` (reportlab)
- Seed admin skript: `seed_admin.py`

**Frontend** — React 18 + TypeScript + Vite
- Adresár: `frontend/`
- Stránky: `src/pages/` (DashboardPage, OrdersPage, OrderDetailPage, CreateOrderPage, ContractsPage, ContractDetailPage, CreateContractPage, ApprovePage, ProjectsPage, ProjectDetailPage, SuppliersPage, UsersPage, SettingsPage, LoginPage)
- Komponenty: `src/components/` (Sidebar, StatusBadge)
- Typy: `src/types/index.ts`
- API služby: `src/services/documentService.ts`, `api.ts`
- Context: `src/context/AuthContext.tsx`
- Routing: `src/App.tsx`

**Deployment** — Docker Compose (3 kontajnery)
- `docker-compose.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile` + `nginx.conf` + `docker-entrypoint.sh`
- Railway configy: `backend/railway.toml`, `frontend/railway.toml`

---

## 2. Spustenie

```powershell
cd "C:\Users\cicakj\Desktop\claude ZOMULL\ZOMULL"
docker compose up --build -d
docker compose exec backend python seed_admin.py
```

Po spustení:
- Frontend: `http://localhost:3001`
- Backend API: `http://localhost:8001/api`
- Backend health: `http://localhost:8001/api/health`
- Swagger docs: `http://localhost:8001/docs`
- DB port nie je vystavený (komunikácia len internou Docker sieťou)

Prvý admin: `admin@zomull.sk` / `admin123` (po prvom prihlásení zmeň heslo).

**Porty zámerne 3001/8001** — aby ZOMULL nekolidoval s FAMULL bežiacim na 3000/8000.

---

## 3. Doména a roly

ZOMULL spravuje objednávky a zmluvy pre stavebnú firmu.

**Roly:**
- `admin` — plné práva
- `ekonom` — vytvára objednávky a zmluvy, spravuje dodávateľov
- `foreman` (stavbyvedúci) — schvaľuje objednávky do limitu, vytvára objednávky (od poslednej iterácie)
- `director` (riaditeľ) — schvaľuje objednávky nad limit, schvaľuje zmluvy

**Workflow objednávok:**
1. Vytvorenie (môže admin, ekonom, foreman, director)
2. Číslo objednávky **automatické**: `OBJ-{kód_projektu}-{0001}` (per projekt) alebo `OBJ-{rok}-{0001}` (bez projektu)
3. Status `pending_foreman` → stavbyvedúci schváli/zamietne
4. Ak suma > **500 EUR** (limit) → `pending_director` → riaditeľ schváli/zamietne
5. Inak → `approved` priamo po stavbyvedúcom
6. Po `approved` možno vygenerovať PDF tlačivo

**Workflow zmlúv:**
1. Vytvorenie (admin, ekonom) — číslo automatické: `ZML-{kód_projektu}-{0001}`
2. Status `pending_approval` → paralelné schvaľovanie: stavbyvedúci + ekonóm + riaditeľ (všetci traja musia schváliť)
3. Po všetkých schváleniach → `approved`

---

## 4. Implementované funkcie (po fáze 1)

✅ **Autentifikácia** — JWT, login, role-based prístup

✅ **Projekty** — vytváranie, edit, priradenie stavbyvedúcich; detail projektu s 3 záložkami (Objednávky / Zmluvy / Nákladové položky), prelinkovanie z karty projektu

✅ **Dodávatelia** — CRUD, status (approved/blacklisted/new)

✅ **Objednávky** — vytvorenie cez formulár alebo nahratím PDF, schvaľovanie, audit log, filter podľa projektu a stavu

✅ **Zmluvy** — vytvorenie cez formulár alebo nahratím PDF, paralelné schvaľovanie, audit log, filter podľa projektu a stavu

✅ **Používatelia** — CRUD (admin), deaktivácia, hard delete

✅ **Automatické číslovanie** — OBJ/ZML s kódom projektu, poradové číslo per projekt

✅ **Údaje vlastnej firmy (Objednávateľ)** — singleton v Nastaveniach, predvyplnenie v OBJ s možnosťou prepísať per OBJ. Polia: názov, IČO, DIČ, IČ DPH, adresa, banka, IBAN, SWIFT, email, telefón, kontaktná osoba.

✅ **DPH** — per OBJ jedna sadzba (23/19/5/0/iné), checkbox platca/neplatca, auto-výpočet netto/DPH/brutto, uložené `vat_amount`. Limit 500 EUR sa porovnáva s brutto sumou.

✅ **PDF tlačivo objednávky** — reportlab, manuálne tlačidlo "Vygenerovať PDF" v detaile OBJ (povolené pre ktorékoľvek prihláseného, ale len ak status='approved'). PDF obsahuje hlavičku, údaje obidvoch strán, projekt + nákladovú položku, položky, rozpis cien, podpisové polia.

✅ **Nákladové položky projektu (hierarchický strom)** — per projekt definovateľné položky s rodičovsko-detskou väzbou (napr. 01 Materiál → 01.01 Cement). Editor stromu v detaile projektu. Pri vytváraní OBJ sa dropdown s plochým zoznamom (s odsadením podľa hierarchie) zobrazí po výbere projektu. Položka sa zobrazuje aj v detaile OBJ a v PDF tlačive.

✅ **Schvaľovanie** — stránka `/schvalenie` zobrazuje OBJ a zmluvy čakajúce na schválenie pre prihláseného používateľa.

✅ **Dashboard** — prehľad počtov a stavov

✅ **Nastavenia** — Údaje firmy, Schvaľovacie pravidlá (limity), Priradenie stavbyvedúcich k projektom

---

## 5. Štruktúra dát (najdôležitejšie tabuľky)

```
users               (admin, ekonom, foreman, director)
projects            (názov, kód, adresa, investor, dátumy, rozpočet, foremen M:N)
project_cost_items  (id, project_id, parent_id, code, name, sort_order) — hierarchia
suppliers           (názov, IČO, DIČ, adresa, status)
orders              (číslo auto, sumy s DPH, buyer_*, cost_item_id, vat_rate, status, foreman/director schvalovatelia)
order_items         (popis, množstvo, jed.cena, celkom — netto)
contracts           (typ, zmluvná strana, sumy, paralelné schvaľovanie)
audit_logs          (kto/čo/kedy pri OBJ a zmluvách)
approval_rules      (pravidlá limitov)
company_info        (singleton — údaje vlastnej firmy)
app_settings        (kľúč-hodnota, voľné)
```

Schéma DPH na Order: `total_amount` je brutto (s DPH). `vat_amount` uložené. Netto = `total_amount - vat_amount`.

---

## 6. Migrácie a databáza

Aplikácia používa **idempotentné ALTER TABLE** v `app/main.py` (`_run_migrations()`), ktoré pribežne pridávajú nové stĺpce do `orders`:
- `buyer_name`, `buyer_ico`, `buyer_dic`, `buyer_ic_dph`, `buyer_address`
- `is_vat_payer`, `vat_rate`, `vat_amount`
- `cost_item_id` (FK → project_cost_items)

`Base.metadata.create_all()` vytvorí nové tabuľky (CompanyInfo, ProjectCostItem) automaticky pri štarte.

Pre úplne čistú DB:
```powershell
docker compose down -v   # POZOR: zmaže DB volume!
docker compose up --build -d
docker compose exec backend python seed_admin.py
```

---

## 7. Opravené chyby počas implementácie

- `frontend/nginx.conf` — port 80 (predtým 8080), odstránený hardcoded Railway host header z FAMULL projektu
- `frontend/Dockerfile` — kopíruje nginx.conf ako `default.conf.template` (matchuje entrypoint)
- TypeScript chyby v `ApprovePage.tsx` a `ContractDetailPage.tsx` — referencovali neexistujúce polia `c.foreman_id` namiesto `c.foreman_approver?.id`, plus type guard pre `.filter(Boolean)` na ne-iterable null
- Port konflikt s FAMULL — ZOMULL presunutý na 3001/8001
- DB port mapping odstránený (zbytočne kolidoval s lokálnym Postgres-om)
- `seed_admin.py` — pridaný skript pre vytvorenie prvého admina (registrácia cez API ide len cez existujúceho admina)

---

## 8. Otvorené body / potenciálne ďalšie kroky

Tu sú návrhy na ďalšie features, ktoré by sa mohli hodiť:

**Krátko:**
- [ ] Filter objednávok podľa **nákladovej položky** v OrdersPage
- [ ] Súhrn objednávok per nákladová položka v detaile projektu (koľko sa už vyčerpalo na danú kategóriu)
- [ ] Export zoznamu objednávok do Excelu / CSV
- [ ] Vyhľadávanie globálne (napr. cez topbar)

**Strednodobé:**
- [ ] PDF tlačivo pre **zmluvy** (analogicky ako pre OBJ)
- [ ] Email notifikácie pri zmene stavu (čaká na schválenie, schválené, zamietnuté)
- [ ] Možnosť exportu projektu so všetkými OBJ/ZML do ZIP
- [ ] História zmien (kto, kedy, čo zmenil) — okrem audit_log na akcie

**Veľké:**
- [ ] Šablóna nákladových položiek (default v Nastaveniach, ktorá sa kopíruje pri novom projekte) — odmietnuté v poslednej iterácii, ale môže sa hodiť neskôr
- [ ] Generovanie pre celý projekt: sumár výdavkov, porovnanie s rozpočtom, exporty
- [ ] Mobilná verzia / responsive doladenie
- [ ] Lokalizácia (zatiaľ len SK, ale pripravené pre EN)

**Production-ready:**
- [ ] Zmeniť `SECRET_KEY` na bezpečnú náhodnú hodnotu
- [ ] Zmeniť heslá v DB (defaultne `vase_heslo`)
- [ ] HTTPS + reverse proxy konfigurácia
- [ ] Backup DB stratégia (pg_dump cron)
- [ ] Logovanie do súboru / monitoring
- [ ] Alembic migrácie namiesto manuálnych ALTER (keď bude veľa zmien)

---

## 9. Tipy pre ďalšiu reláciu s Claudom

Aby Claude rýchlo nadviazal:

1. **Spomeň tento súbor** — "Pozri ZOMULL_PROGRESS.md, pokračujeme tam kde sme skončili"
2. **Aktuálny stav** — porty 3001/8001, FAMULL beží paralelne na 3000/8000
3. **Sandbox má limity** — Claude nedokáže spúšťať `docker compose` na tvojom Windows počítači. Musíš to spustiť ty a poslať mu výstup ak niečo padne.
4. **Sandbox má blokovaný PyPI a npm registry** — Claude nedokáže lokálne testovať build, ale Docker build na tvojom stroji funguje. Aplikácia má `compileall` a Claude vie skontrolovať Python syntax v sandboxe.
5. **TypeScript chyby** sa odhalia až pri `docker compose up --build`. Posielaj Claudovi log z buildu ak niečo padne — z error riadkov vie hneď opraviť.

---

## 10. Často používané príkazy

```powershell
# Spustenie / reštart
cd "C:\Users\cicakj\Desktop\claude ZOMULL\ZOMULL"
docker compose up --build -d

# Logy
docker compose logs -f backend
docker compose logs -f frontend

# Vypnutie (zachová dáta)
docker compose down

# Vypnutie + zmazanie DB
docker compose down -v

# Seed admina (po prvom spustení alebo po zmazaní DB)
docker compose exec backend python seed_admin.py

# Vstup do backend kontajnera
docker compose exec backend bash

# Stav kontajnerov
docker compose ps
```

---

## 11. Posledná pozícia v kóde / čo bolo dokončené

Posledná dokončená fáza (28. máj 2026):

1. ✅ Automatické číslovanie OBJ a zmlúv (per projekt)
2. ✅ "Vytvoril" predvyplnené v formulári
3. ✅ Workflow: limit znížený na 500 EUR, OBJ môžu vytvárať všetky roly
4. ✅ Údaje vlastnej firmy (objednávateľ) v Nastaveniach + prefill v OBJ
5. ✅ DPH (per OBJ, dropdown sadzieb + manuálne, rozpis netto/DPH/brutto)
6. ✅ Generovanie PDF tlačiva objednávky (reportlab)
7. ✅ Hierarchické nákladové položky per projekt + výber pri OBJ

**Build sa naposledy úspešne ukončil bez TypeScript chýb.** Frontend aj backend obrazy sa postavili a kontajnery bežia.

---

## 12. Kontaktné údaje a credentials (DEV)

- Admin login: `admin@zomull.sk` / `admin123` (zmeň po prvom prihlásení)
- DB: PostgreSQL 16 — user `zomull` / pass `vase_heslo` / db `zomull`
- DB nie je vystavená na host, len internou Docker sieťou ako `db:5432`
- SECRET_KEY v compose: `zomull-tajny-kluc-zmente-v-produkcii` (TREBA ZMENIŤ pred produkciou)

---

*Tento dokument si môžeš ďalej upravovať, ako sa projekt vyvíja.*
