"""
Generovanie PDF tlačiva objednávky podľa Alt A (Mulldex branding).
Biele pozadie, čierna + červená brand farba, podpora aj pre OBJ bez DPH.
"""
import os
from io import BytesIO
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from app.models.models import Order, CompanyInfo


# ── Brand farby Mulldex ───────────────────────────────────────────────────────
RED = colors.HexColor("#D6212E")
DARK = colors.HexColor("#1c1c1c")
GREY = colors.HexColor("#666666")
LINE = colors.HexColor("#dddddd")

# ── Fonty (DejaVu kvôli slovenskej diakritike) ────────────────────────────────
FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
_FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]
_FONT_BOLD_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
]
for p in _FONT_PATHS:
    if os.path.exists(p):
        try:
            pdfmetrics.registerFont(TTFont("DejaVu", p))
            FONT = "DejaVu"
            break
        except Exception:
            pass
for p in _FONT_BOLD_PATHS:
    if os.path.exists(p):
        try:
            pdfmetrics.registerFont(TTFont("DejaVu-Bold", p))
            FONT_BOLD = "DejaVu-Bold"
            break
        except Exception:
            pass

# Registruj DejaVu ako family, aby <b>...</b> v Paragraph používalo DejaVu-Bold
# (bez tohto reportlab fallbackuje na Helvetica-Bold ktorá nemá slovenskú diakritiku)
if FONT == "DejaVu" and FONT_BOLD == "DejaVu-Bold":
    from reportlab.pdfbase.pdfmetrics import registerFontFamily
    registerFontFamily(
        "DejaVu",
        normal="DejaVu",
        bold="DejaVu-Bold",
        italic="DejaVu",
        boldItalic="DejaVu-Bold",
    )


def _st(name, size=9, bold=False, color=colors.black, align=TA_LEFT, leading=None):
    return ParagraphStyle(
        name=name,
        fontName=FONT_BOLD if bold else FONT,
        fontSize=size,
        textColor=color,
        alignment=align,
        leading=leading or size * 1.25,
    )


S_N = _st("n", 9, color=DARK)
S_NB = _st("nb", 9, bold=True, color=DARK)
S_SMALL = _st("sm", 8, color=GREY)
S_NOTE = _st("note", 8.5, color=DARK, align=TA_JUSTIFY, leading=11)
S_LEGAL = _st("legal", 7.5, color=GREY, align=TA_JUSTIFY, leading=10)


def _fmt_money(v: Optional[float], cur: str = "EUR") -> str:
    if v is None:
        v = 0.0
    sym = "€" if cur == "EUR" else cur
    return f"{v:,.2f} {sym}".replace(",", "X").replace(".", ",").replace("X", " ")


def _fmt_date(d: Optional[datetime]) -> str:
    if not d:
        return "—"
    return d.strftime("%d.%m.%Y")


def _kv_table(rows, col_widths):
    """Tabuľka kľúč-hodnota bez orámovania (label sivý, hodnota tmavá)."""
    data = []
    for k, v in rows:
        if v is None or v == "":
            v = "—"
        data.append([Paragraph(f"<b>{k}</b>", S_SMALL), Paragraph(str(v), S_N)])
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _section_header(title):
    """Nadpis sekcie: bold tmavý text + tenká červená linka pod ním."""
    p = Paragraph(f"<b>{title}</b>", _st("sh", 10, bold=True, color=DARK))
    t = Table([[p]], colWidths=[170 * mm])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 1.2, RED),
    ]))
    return t


def generate_order_pdf(order: Order, company: Optional[CompanyInfo] = None) -> bytes:
    """
    Vygeneruje PDF tlačivo objednávky podľa Alt A vzoru.

    - company: CompanyInfo (kvôli logu a kontaktom)
    - Ak order.is_vat_payer == False → rozpis cien je jediný riadok bez DPH
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title=f"Objednávka {order.order_number}",
    )

    story = []

    # ── HLAVIČKA: logo + číslo OBJ ──
    logo_path = getattr(company, "logo_path", None) if company else None
    if logo_path and os.path.exists(logo_path):
        try:
            logo_el = Image(logo_path, width=60 * mm, height=15 * mm, kind="proportional")
        except Exception:
            logo_el = Paragraph(f"<b>{order.buyer_name or 'MULLDEX s.r.o.'}</b>",
                                _st("logo", 16, bold=True, color=DARK))
    else:
        logo_el = Paragraph(f"<b>{order.buyer_name or 'MULLDEX s.r.o.'}</b>",
                            _st("logo", 16, bold=True, color=DARK))

    order_block = [
        Paragraph("<b>OBJEDNÁVKA</b>", _st("o", 14, bold=True, color=DARK, align=TA_RIGHT)),
        Paragraph(
            f'<font color="#D6212E"><b>č. {order.order_number}</b></font>',
            _st("on", 11, bold=True, align=TA_RIGHT),
        ),
        Paragraph(
            f"Dátum vystavenia: {_fmt_date(order.order_date)}",
            _st("od", 8, color=GREY, align=TA_RIGHT),
        ),
    ]
    header_t = Table([[logo_el, order_block]], colWidths=[100 * mm, 70 * mm])
    header_t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_t)
    story.append(Spacer(1, 6))

    # Oddeľovacia červená linka
    sep = Table([[" "]], colWidths=[170 * mm], rowHeights=[0.5])
    sep.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.5, RED)]))
    story.append(sep)
    story.append(Spacer(1, 12))

    # ── OBJEDNÁVATEĽ + DODÁVATEĽ ──
    # Fallback: ak chýbajú buyer_* polia v order, použij údaje z CompanyInfo (Nastavenia)
    co = company
    buyer_name    = order.buyer_name    or (co.name    if co else None)
    buyer_address = order.buyer_address or (co.address if co else None)
    buyer_ico     = order.buyer_ico     or (co.ico     if co else None)
    buyer_dic     = order.buyer_dic     or (co.dic     if co else None)
    buyer_ic_dph  = order.buyer_ic_dph  or (co.ic_dph  if co else None)

    supplier = order.supplier_ref
    sup_name = order.supplier_name
    sup_address = getattr(supplier, "address", None) if supplier else None
    sup_ico = getattr(supplier, "ico", None) if supplier else None
    sup_dic = getattr(supplier, "dic", None) if supplier else None
    sup_ic_dph = getattr(supplier, "ic_dph", None) if supplier else None
    sup_email = getattr(supplier, "email", None) if supplier else None
    sup_phone = getattr(supplier, "phone", None) if supplier else None
    sup_contact = getattr(supplier, "contact_person", None) if supplier else None
    sup_is_vat = getattr(supplier, "is_vat_payer", True) if supplier else True

    obj_block = [Paragraph("<b>OBJEDNÁVATEĽ</b>", _st("o", 9, bold=True, color=RED)), Spacer(1, 3)]
    obj_block.append(Paragraph(f"<b>{buyer_name or '—'}</b>", S_NB))
    if buyer_address:
        obj_block.append(Paragraph(buyer_address, S_N))
    if buyer_ico:
        obj_block.append(Paragraph(f"IČO: {buyer_ico}", S_N))
    if buyer_dic:
        obj_block.append(Paragraph(f"DIČ: {buyer_dic}", S_N))
    if buyer_ic_dph:
        obj_block.append(Paragraph(f"IČ DPH: {buyer_ic_dph}", S_N))
    if order.buyer_contact_person or order.buyer_contact_phone or order.buyer_contact_email:
        obj_block.append(Spacer(1, 4))
        obj_block.append(Paragraph("<b>Kontaktná osoba (za objednávateľa):</b>", S_N))
        if order.buyer_contact_person:
            obj_block.append(Paragraph(order.buyer_contact_person, S_N))
        if order.buyer_contact_phone:
            obj_block.append(Paragraph(f"Tel.: {order.buyer_contact_phone}", S_N))
        if order.buyer_contact_email:
            obj_block.append(Paragraph(f"E-mail: {order.buyer_contact_email}", S_N))

    sup_block = [Paragraph("<b>DODÁVATEĽ</b>", _st("d", 9, bold=True, color=RED)), Spacer(1, 3)]
    sup_block.append(Paragraph(f"<b>{sup_name}</b>", S_NB))
    if sup_address:
        sup_block.append(Paragraph(sup_address, S_N))
    if sup_ico:
        sup_block.append(Paragraph(f"IČO: {sup_ico}", S_N))
    if sup_dic:
        sup_block.append(Paragraph(f"DIČ: {sup_dic}", S_N))
    if sup_ic_dph:
        sup_block.append(Paragraph(f"IČ DPH: {sup_ic_dph}", S_N))
    if not sup_is_vat:
        sup_block.append(Paragraph("<i>Dodávateľ nie je platcom DPH</i>", S_SMALL))
    if sup_contact or sup_phone or sup_email:
        sup_block.append(Spacer(1, 4))
        sup_block.append(Paragraph("<b>Kontaktná osoba (za dodávateľa):</b>", S_N))
        if sup_contact:
            sup_block.append(Paragraph(sup_contact, S_N))
        if sup_phone:
            sup_block.append(Paragraph(f"Tel.: {sup_phone}", S_N))
        if sup_email:
            sup_block.append(Paragraph(f"E-mail: {sup_email}", S_N))

    parties = Table([[obj_block, sup_block]], colWidths=[85 * mm, 85 * mm])
    parties.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (0, 0), 0.4, LINE),
        ("BOX", (1, 0), (1, 0), 0.4, LINE),
        ("LINEABOVE", (0, 0), (0, 0), 2, RED),
        ("LINEABOVE", (1, 0), (1, 0), 2, RED),
    ]))
    story.append(parties)
    story.append(Spacer(1, 12))

    # ── PROJEKT ──
    project_name = order.project.name if order.project else "—"
    project_code = order.project.code if order.project else ""
    project_address = order.project.address if order.project else None
    project_investor = order.project.investor if order.project else None
    cost_item_str = (
        f"{order.cost_item.code} — {order.cost_item.name}"
        if order.cost_item else "—"
    )

    story.append(_section_header("PROJEKT / STAVBA"))
    story.append(Spacer(1, 4))
    story.append(_kv_table([
        ("Názov projektu:", project_name),
        ("Kód projektu:", project_code or "—"),
        ("Adresa stavby:", project_address or "—"),
        ("Investor:", project_investor or "—"),
        ("Nákladová položka:", cost_item_str),
    ], col_widths=[45 * mm, 125 * mm]))
    story.append(Spacer(1, 12))

    # ── PREDMET OBJEDNÁVKY ──
    story.append(_section_header("PREDMET OBJEDNÁVKY"))
    story.append(Spacer(1, 4))

    # Predmet (subject) v texte ak nie sú items
    if order.subject:
        story.append(Paragraph(f"<b>Predmet:</b> {order.subject}", S_N))
        story.append(Spacer(1, 4))

    items = list(order.items or [])
    if items:
        head = ["#", "Popis položky", "MJ", "Množstvo", "Jed. cena (€)", "Spolu (€)"]
        rows = [head]
        for i, it in enumerate(items, 1):
            qty = it.quantity or 0
            qty_str = f"{qty:,.2f}".replace(",", "X").replace(".", ",").replace("X", " ")
            rows.append([
                str(i),
                Paragraph(it.description or "", S_N),
                it.unit or "",
                qty_str,
                _fmt_money(it.unit_price, "EUR").replace(" €", ""),
                _fmt_money(it.total_price, "EUR").replace(" €", ""),
            ])
        items_t = Table(
            rows,
            colWidths=[10 * mm, 75 * mm, 15 * mm, 22 * mm, 24 * mm, 24 * mm],
            repeatRows=1,
        )
        items_t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
            ("FONTNAME", (0, 1), (-1, -1), FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (-1, -1), DARK),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
            ("ALIGN", (2, 0), (2, 0), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEBELOW", (0, 0), (-1, 0), 1.2, RED),
            ("LINEBELOW", (0, -1), (-1, -1), 0.6, DARK),
            ("LINEBELOW", (0, 1), (-1, -2), 0.2, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(items_t)
        story.append(Spacer(1, 4))

    # ── REKAPITULÁCIA SUMY ──
    if order.is_vat_payer:
        netto = (order.total_amount or 0) - (order.vat_amount or 0)
        sum_data = [
            ["", "Suma bez DPH (netto):", _fmt_money(netto, order.currency)],
            ["", f"DPH {order.vat_rate:g} %:", _fmt_money(order.vat_amount or 0, order.currency)],
            ["", "CELKOM s DPH:", _fmt_money(order.total_amount, order.currency)],
        ]
        sums = Table(sum_data, colWidths=[100 * mm, 45 * mm, 25 * mm])
        sums.setStyle(TableStyle([
            ("FONTNAME", (1, 0), (-1, 1), FONT),
            ("FONTNAME", (1, 2), (-1, 2), FONT_BOLD),
            ("FONTSIZE", (0, 0), (-1, 1), 9),
            ("FONTSIZE", (1, 2), (-1, 2), 10),
            ("TEXTCOLOR", (1, 0), (-1, 1), DARK),
            ("TEXTCOLOR", (1, 2), (-1, 2), RED),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("LINEABOVE", (1, 2), (-1, 2), 1, RED),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
    else:
        # OBJ bez DPH — jediný riadok
        sum_data = [
            ["", "CELKOM:", _fmt_money(order.total_amount, order.currency)],
        ]
        sums = Table(sum_data, colWidths=[100 * mm, 45 * mm, 25 * mm])
        sums.setStyle(TableStyle([
            ("FONTNAME", (1, 0), (-1, 0), FONT_BOLD),
            ("FONTSIZE", (1, 0), (-1, 0), 10),
            ("TEXTCOLOR", (1, 0), (-1, 0), RED),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("LINEABOVE", (1, 0), (-1, 0), 1, RED),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
    story.append(sums)
    story.append(Spacer(1, 12))

    # ── PODMIENKY DODANIA A PLATBY ──
    cond_rows = []
    if order.delivery_date:
        cond_rows.append(("Termín dodania:", _fmt_date(order.delivery_date)))
    if order.delivery_note:
        cond_rows.append(("Poznámka k termínu:", order.delivery_note))
    if order.delivery_place:
        cond_rows.append(("Miesto dodania:", order.delivery_place))
    if order.payment_due_days:
        cond_rows.append(("Splatnosť faktúry:", f"{order.payment_due_days} dní od doručenia"))
    if order.payment_method:
        cond_rows.append(("Spôsob platby:", order.payment_method))
    if order.retention_percent:
        cond_rows.append((
            "Zádržné:",
            f"{order.retention_percent:g} % zo sumy objednávky — uvoľnené po prevzatí diela bez vád a nedorobkov",
        ))
    if order.warranty_months:
        cond_rows.append(("Záruka:", f"{order.warranty_months} mesiacov od prevzatia diela"))
    if order.penalty_text:
        cond_rows.append(("Zmluvná pokuta:", order.penalty_text))
    if order.general_note:
        cond_rows.append(("Poznámka:", order.general_note))
    elif order.notes:
        cond_rows.append(("Poznámka:", order.notes))

    if cond_rows:
        story.append(_section_header("PODMIENKY DODANIA A PLATBY"))
        story.append(Spacer(1, 4))
        story.append(_kv_table(cond_rows, col_widths=[45 * mm, 125 * mm]))
        story.append(Spacer(1, 12))

    # ── DÔLEŽITÁ POZNÁMKA (fixný text) ──
    note_text = (
        '<font color="#D6212E"><b>DÔLEŽITÉ:</b></font> Potvrdená objednávka je nevyhnutnou prílohou k fakturácii. '
        'V prípade, že faktúra nebude obsahovať obojstranne potvrdenú objednávku, '
        'objednávateľ si vyhradzuje právo takúto faktúru neuhradiť, resp. vrátiť ju na doplnenie.'
    )
    note_t = Table([[Paragraph(note_text, S_NOTE)]], colWidths=[170 * mm])
    note_t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, -1), 1, RED),
        ("LINEBELOW", (0, 0), (-1, -1), 1, RED),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(note_t)
    story.append(Spacer(1, 16))

    # ── PODPISY ── Poradie: 1) Dátum  2) Za objednávateľa/dodávateľa (bold)  3) meno  4) priestor 32 mm  5) čierna línia  6) "Pečiatka a podpis" (malé sivé)
    creator_name = order.creator.full_name if order.creator else ""
    sig_data = [
        ["Dátum: ____________________", "Dátum: ____________________"],
        ["Za objednávateľa", "Za dodávateľa"],                       # bold popisy
        [order.buyer_contact_person or creator_name, ""],            # meno
        ["", ""],                                                    # priestor 32 mm na pečiatku + podpis
        ["_______________________________", "_______________________________"],  # podpisová línia
        ["Pečiatka a podpis", "Pečiatka a podpis"],                  # malá sivá pozn. tesne pod líniou
    ]
    sigs = Table(
        sig_data,
        colWidths=[85 * mm, 85 * mm],
        rowHeights=[None, None, None, 32 * mm, None, None],
    )
    sigs.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), DARK),
        ("FONTNAME", (0, 1), (-1, 1), FONT_BOLD),                    # bold "Za objednávateľa/dodávateľa"
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 4),
        ("TOPPADDING", (0, 5), (-1, 5), 0),                          # "Pečiatka a podpis" tesne pod líniou
        ("TEXTCOLOR", (0, 5), (-1, 5), GREY),
        ("FONTSIZE", (0, 5), (-1, 5), 7),
    ]))
    # Wrapnem cely podpisovy blok do KeepTogether — nesmie sa rozdelit na 2 strany
    story.append(KeepTogether(sigs))
    story.append(Spacer(1, 14))

    # ── PRÁVNE DOLOŽKY ──
    legal = Paragraph(
        "<b>Obchodné podmienky:</b> Vystavením tejto objednávky objednávateľ záväzne objednáva "
        "vyššie uvedené plnenie. Dodávateľ je povinný do 3 pracovných dní písomne potvrdiť prijatie "
        "objednávky alebo oznámiť odmietnutie. "
        "Vzťahy neupravené touto objednávkou sa riadia ust. § 409 a nasl. Obchodného zákonníka SR "
        "(zák. č. 513/1991 Zb. v platnom znení). Spory budú riešené príslušným súdom SR. "
        "Spracovanie osobných údajov sa riadi nariadením GDPR (EÚ 2016/679).",
        S_LEGAL,
    )
    legal_box = Table([[legal]], colWidths=[170 * mm])
    legal_box.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, -1), 0.3, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(legal_box)
    story.append(Spacer(1, 4))

    # ── PÄTIČKA ──
    footer = Paragraph(
        f"{order.order_number} · Vygenerované systémom ZOMULL dňa {datetime.utcnow().strftime('%d.%m.%Y')} · Strana 1/1",
        _st("foot", 7, color=GREY, align=TA_CENTER),
    )
    story.append(footer)

    doc.build(story)
    buf.seek(0)
    return buf.read()
