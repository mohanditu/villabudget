"""Build Villa_Monthly_Budget_v2.xlsx  (pro-rata leave, Nov-2026 start).

Usage: python build_villa_v2.py <output.xlsx>
"""
import sys
import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as CL
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule, CellIsRule
from openpyxl.comments import Comment

OUT = sys.argv[1]

# ----------------------------------------------------------------- constants
START = dt.date(2026, 11, 1)
NM = 50                      # member slots
M0 = 5                       # Members: first data row
T0, TN = 14, 14 + NM - 1     # month tab member rows 14..63
TT = TN + 1                  # month tab total row 64
LL0, LLN = 7, 306            # Leave Log data rows
EX0, EXN = 7, 1006           # Expenses data rows
TR0, TRN = 7, 206            # Transfers data rows
NCYC = 24
D0 = 11                      # Dashboard: first cycle row
HC0 = 11                     # Leave Log: first helper column (K)
MS0 = 5                      # Member Summary first data row

MEMBERS = ["Vinay Kharayat", "Mohan Singh", "Shubham Dubey", "Gourav Pandey",
           "Sandeep Sharma", "Sajid Ali", "Vishnu Kaldate", "Mohseen Sheikh",
           "Aftab Sheikh", "Sourav Kature", "Sundar Sharma", "Siddhant Tayade",
           "Ashu Bhardwaj"]


def add_months(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    return dt.date(d.year + y, m + 1, 1)


MONTHS = [add_months(START, i) for i in range(12)]
TABS = [d.strftime("%b-%y") for d in MONTHS]          # Nov-26 ... Oct-27


def hc(k):
    """Leave Log helper column letter for cycle k (0..23)."""
    return CL(HC0 + k)


HC_FIRST, HC_LAST = hc(0), hc(NCYC - 1)                 # K .. AH

# ------------------------------------------------------------------- styles
NAVY, GREY_HDR, INPUT_FILL = "1F3B4D", "D9D9D9", "FFF2CC"
NUM = '#,##0.00;\\-#,##0.00;"-"'
INT = '0;\\-0;"-"'
DATE = "dd\\-mmm\\-yyyy"
SHORT = "dd\\-mmm"
thin = Side(style="thin", color="D9D9D9")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)


def font(sz=10, b=False, col="000000", i=False):
    return Font(name="Arial", size=sz, bold=b, color=col, italic=i)


def fill(c):
    return PatternFill("solid", fgColor=c)


def put(ws, ref, value=None, *, f=None, fl=None, nf=None, al=None, border=False):
    c = ws[ref]
    if value is not None:
        c.value = value
    c.font = f or font()
    if fl:
        c.fill = fill(fl)
    if nf:
        c.number_format = nf
    if al:
        c.alignment = al
    if border:
        c.border = BOX
    return c


CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
TOPWRAP = Alignment(vertical="top", wrap_text=True)


def hdr(ws, ref, text, sz=10):
    return put(ws, ref, text, f=font(sz, True, "FFFFFF"), fl=NAVY, al=CENTER, border=True)


def sub(ws, ref, text):
    return put(ws, ref, text, f=font(9, True), fl=GREY_HDR, al=CENTER, border=True)


def inp(ws, ref, value=None, nf=None):
    return put(ws, ref, value, f=font(10, False, "0000FF"), fl=INPUT_FILL, nf=nf, border=True)


def calc(ws, ref, value, nf=None, b=False, fl=None):
    return put(ws, ref, value, f=font(10, b), nf=nf, fl=fl, border=True)


def title(ws, text, sz=16, merge=None):
    put(ws, "A1", text, f=font(sz, True, NAVY), al=Alignment(horizontal="left", vertical="center"))
    ws.row_dimensions[1].height = 28
    if merge:
        ws.merge_cells(merge)


def note(ws, ref, text, merge=None, height=None):
    put(ws, ref, text, f=font(9, False, "595959", True), al=LEFT)
    if merge:
        ws.merge_cells(merge)
    if height:
        ws.row_dimensions[ws[ref].row].height = height


def widths(ws, d):
    for k, v in d.items():
        ws.column_dimensions[k].width = v


RED_TXT = font(10, True, "C00000")
GREEN_TXT = font(10, True, "00843D")


def cf_owes(ws, rng, first):
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f"AND(ISNUMBER({first}),{first}>0.004)"], font=RED_TXT))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f"AND(ISNUMBER({first}),{first}<-0.004)"], font=GREEN_TXT))


# ----------------------------------------------------------------- workbook
wb = Workbook()
ws_guide = wb.active
ws_guide.title = "Guide"
ws_dash = wb.create_sheet("Dashboard")
ws_ms = wb.create_sheet("Member Summary")
ws_set = wb.create_sheet("Settings")
ws_mem = wb.create_sheet("Members")
ws_ll = wb.create_sheet("Leave Log")
ws_exp = wb.create_sheet("Expenses")
ws_tr = wb.create_sheet("Transfers")
ws_tabs = [wb.create_sheet(t) for t in TABS]

for ws, col in [(ws_guide, "7F7F7F"), (ws_dash, NAVY), (ws_ms, NAVY), (ws_set, "7F7F7F"),
                (ws_mem, "BF8F00"), (ws_ll, "BF8F00"), (ws_exp, "BF8F00"), (ws_tr, "BF8F00")]:
    ws.sheet_properties.tabColor = col
for ws in ws_tabs:
    ws.sheet_properties.tabColor = "2E75B6"
for ws in wb.worksheets:
    ws.sheet_view.showGridLines = False


def name(n, ref):
    wb.defined_names[n] = DefinedName(n, attr_text=ref)


# ================================================================= Settings
ws = ws_set
title(ws, "Settings", merge="A1:C1")
note(ws, "A2", "Yellow cells can be changed. Everything in the workbook reads from here.", merge="A2:C2")
for c, t in zip("ABC", ["Setting", "Value", "Explanation"]):
    hdr(ws, f"{c}3", t)
rows = [
    (4, "Villa name", "Our Villa", None, "Shown in the titles of the Dashboard and month tabs.", "VillaName"),
    (5, "Start month (first collection date)", START, DATE,
     "Must be the 1st of a month. Month tabs are named from this date (Nov-26 … Oct-27); if you change it, rename the month tabs to match.", "StartMonth"),
    (6, "Collection per person per cycle (AED)", 100, NUM,
     "Collected on the 1st and the 15th of every month (24 collections a year).", "Collection"),
    (7, "Decimal places for part-cycle amounts", 2, "0",
     "Leave / join / exit amounts are rounded to this many decimals. 2 = exact (93.75). 0 = whole AED (94).", "RoundDecimals"),
    (8, "Minimum days away to get leave credit", 1, "0",
     "Leaves shorter than this get no credit. Change to 3, 5 … if your villa has such a rule.", "MinLeaveDays"),
    (9, "Opening Cash balance (AED)", 1700, NUM,
     "Cash in hand on the start date. 1,700 is the villa balance on 1-Nov-2026 from your example – split it correctly between Cash and Digital.", "OpenCash"),
    (10, "Opening Digital balance (AED)", 0, NUM,
     "Bank / wallet balance on the start date (carried forward from before this file).", "OpenDigital"),
]
for r, lab, val, nf, expl, nm in rows:
    calc(ws, f"A{r}", lab)
    inp(ws, f"B{r}", val, nf).alignment = Alignment(horizontal="right")
    put(ws, f"C{r}", expl, f=font(9, False, "404040"), al=LEFT, border=True)
    name(nm, f"Settings!$B${r}")
    ws.row_dimensions[r].height = 30
ws["B9"].comment = Comment("From your example: villa balance was 1,700 AED on 1-Nov-2026. "
                           "Entered here as Cash because the split was not given – move the digital part to B10.", "Villa Budget")
hdr(ws, "A12", "Expense categories")
put(ws, "C12", "Used in the Expenses dropdown and the Dashboard breakdown. Rename or fill the empty slots as needed.",
    f=font(9, False, "404040"), al=LEFT)
for i, cat in enumerate(["Water", "Grocery", "Gas Cylinder", "Cleaning Supplies", "Electricity / Internet",
                         "Miscellaneous", None, None]):
    inp(ws, f"A{13 + i}", cat)
name("Categories", "Settings!$A$13:$A$20")
hdr(ws, "A22", "Payment modes (fixed)")
for i, v in enumerate(["Cash", "Digital"]):
    calc(ws, f"A{23 + i}", v)
name("PayModes", "Settings!$A$23:$A$24")
hdr(ws, "A26", "Transfer directions (fixed)")
for i, v in enumerate(["Cash to Digital", "Digital to Cash"]):
    calc(ws, f"A{27 + i}", v)
name("TransferTypes", "Settings!$A$27:$A$28")
widths(ws, {"A": 40, "B": 18, "C": 95})
ws.freeze_panes = "A4"

# ================================================================== Members
ws = ws_mem
title(ws, "Members", merge="A1:I1")
note(ws, "A2", "Add new people in the next empty row. Never delete, sort or move rows – payments in the month tabs are "
               "linked to each row. For someone who moves out, enter an Exit Date instead.", merge="A2:I2", height=28)
for c, t in zip("ABCDEFGHI", ["#", "Member Name", "Room / Bed", "Phone", "Join Date\n(first day)",
                              "Exit Date\n(last day)", "Opening Balance (AED)\n+ owes / − advance", "Status", "Notes"]):
    hdr(ws, f"{c}4", t)
ws.row_dimensions[4].height = 42
for i in range(NM):
    r = M0 + i
    calc(ws, f"A{r}", i + 1).alignment = Alignment(horizontal="center")
    inp(ws, f"B{r}", MEMBERS[i] if i < len(MEMBERS) else None)
    inp(ws, f"C{r}")
    inp(ws, f"D{r}")
    inp(ws, f"E{r}", None, DATE)
    inp(ws, f"F{r}", None, DATE)
    inp(ws, f"G{r}", None, NUM)
    calc(ws, f"H{r}",
         f'=IF(B{r}="","",IF(AND(F{r}<>"",F{r}<TODAY()),"Left",IF(AND(E{r}<>"",E{r}>TODAY()),"Upcoming",'
         f"IF(COUNTIFS('Leave Log'!$B${LL0}:$B${LLN},B{r},'Leave Log'!$C${LL0}:$C${LLN},\"<=\"&TODAY(),"
         f"'Leave Log'!$D${LL0}:$D${LLN},\">=\"&TODAY())>0,\"On Leave\",\"Active\"))))").alignment = CENTER
    inp(ws, f"I{r}")
name("MemberNames", f"Members!$B${M0}:$B${M0 + NM - 1}")
rng = f"H{M0}:H{M0 + NM - 1}"
ws.conditional_formatting.add(rng, FormulaRule(formula=[f'H{M0}="On Leave"'], fill=fill("FCE4D6"), font=font(10, True, "C65911")))
ws.conditional_formatting.add(rng, FormulaRule(formula=[f'H{M0}="Left"'], font=font(10, False, "A6A6A6")))
ws.conditional_formatting.add(rng, FormulaRule(formula=[f'H{M0}="Active"'], font=font(10, True, "00843D")))
ws.conditional_formatting.add(f"B{M0}:B{M0 + NM - 1}",
                              FormulaRule(formula=[f'AND(B{M0}<>"",COUNTIF($B${M0}:$B${M0 + NM - 1},B{M0})>1)'],
                                          fill=fill("FFC7CE"), font=font(10, True, "9C0006")))
dv = DataValidation(type="date", operator="between", formula1="DATE(2000,1,1)", formula2="DATE(2100,12,31)",
                    showErrorMessage=True, error="Please enter a date, e.g. 01-Nov-2026")
dv.add(f"E{M0}:F{M0 + NM - 1}")
ws.add_data_validation(dv)
dv = DataValidation(type="decimal", operator="between", formula1="-100000", formula2="100000", showErrorMessage=True)
dv.add(f"G{M0}:G{M0 + NM - 1}")
ws.add_data_validation(dv)
widths(ws, {"A": 5, "B": 24, "C": 12, "D": 16, "E": 14, "F": 14, "G": 20, "H": 11, "I": 34})
ws.freeze_panes = "C5"

# ================================================================ Dashboard (cycle dates needed by others)
ws = ws_dash
title(ws, '=VillaName&"  –  Budget Dashboard"', sz=18)
put(ws, "A2", "Period:", f=font(10, True))
put(ws, "C2", "=StartMonth", f=font(10, True), nf=DATE)
put(ws, "D2", "to", f=font(10), al=Alignment(horizontal="center"))
put(ws, "E2", "=EOMONTH(StartMonth,11)", f=font(10, True), nf=DATE)
note(ws, "G2", "All figures in AED. Nothing to type on this sheet – it updates from the other tabs.")

KPIS = [("B", "C", "CASH IN HAND", f"=O{D0 + NCYC - 1}", "after all entries so far", NUM),
        ("E", "F", "DIGITAL BALANCE", f"=P{D0 + NCYC - 1}", "bank / wallet", NUM),
        ("H", "I", "TOTAL BALANCE", f"=Q{D0 + NCYC - 1}", "cash + digital", NUM),
        ("K", "L", "PENDING DUES NOW", f"=IFERROR(INDEX(R{D0}:R{D0 + NCYC - 1},MATCH(TODAY(),D{D0}:D{D0 + NCYC - 1},1)),0)",
         "owed by members, current cycle", NUM),
        ("N", "O", "IN VILLA TODAY", f'=COUNTIF(Members!H{M0}:H{M0 + NM - 1},"Active")', "active members", "0"),
        ("Q", "R", "ON LEAVE TODAY", f'=COUNTIF(Members!H{M0}:H{M0 + NM - 1},"On Leave")', "from the Leave Log", "0")]
for a, b, lab, fml, sub_t, nf in KPIS:
    hdr(ws, f"{a}4", lab, sz=9)
    ws.merge_cells(f"{a}4:{b}4")
    put(ws, f"{a}5", fml, f=font(18, True, NAVY), fl="F2F2F2", nf=nf, al=CENTER)
    ws.merge_cells(f"{a}5:{b}5")
    put(ws, f"{a}6", sub_t, f=font(8, False, "7F7F7F", True), al=CENTER)
    ws.merge_cells(f"{a}6:{b}6")
ws.row_dimensions[5].height = 34

put(ws, "A8", "CYCLE-BY-CYCLE BALANCE   (Opening b/f  +  Collections  −  Expenses  ±  Transfers  =  Closing c/f)",
    f=font(11, True, NAVY))
ws.merge_cells("A8:S8")
for rng_, t in [("A9:F9", "CYCLE"), ("G9:H9", "OPENING (b/f)"), ("I9:J9", "COLLECTIONS"), ("K9:L9", "EXPENSES"),
                ("M9:N9", "TRANSFERS (net)"), ("O9:Q9", "CLOSING (c/f)"), ("R9:S9", "MEMBERS")]:
    a = rng_.split(":")[0]
    put(ws, a, t, f=font(9, True, "FFFFFF"), fl="404040", al=CENTER, border=True)
    ws.merge_cells(rng_)
for c, t in zip("ABCDEFGHIJKLMNOPQRS", ["#", "Month", "Cycle", "From", "To", "Members\ncharged", "Cash", "Digital",
                                        "Cash", "Digital", "Cash", "Digital", "Cash", "Digital", "Cash", "Digital",
                                        "Total", "Pending\ndues", "Leave\ncredits"]):
    sub(ws, f"{c}10", t)
ws.row_dimensions[10].height = 30

EXP = f"Expenses!$E${EX0}:$E${EXN}"
EXD = f"Expenses!$A${EX0}:$A${EXN}"
EXM = f"Expenses!$D${EX0}:$D${EXN}"
EXC = f"Expenses!$B${EX0}:$B${EXN}"
TRA = f"Transfers!$C${TR0}:$C${TRN}"
TRD = f"Transfers!$A${TR0}:$A${TRN}"
TRT = f"Transfers!$B${TR0}:$B${TRN}"
for k in range(NCYC):
    r = D0 + k
    mi, first = divmod(k, 2)[0], k % 2 == 0
    tab = f"'{TABS[mi]}'"
    rowfill = "F7F9FC"
    calc(ws, f"A{r}", k + 1, fl=rowfill).alignment = CENTER
    calc(ws, f"B{r}", f"=DATE(YEAR(StartMonth),MONTH(StartMonth)+{mi},1)", nf="mmm\\-yy", fl=rowfill)
    calc(ws, f"C{r}", "1st" if first else "15th", fl=rowfill).alignment = CENTER
    calc(ws, f"D{r}", f"=B{r}" if first else f"=B{r}+14", nf=SHORT, fl=rowfill)
    calc(ws, f"E{r}", f"=B{r}+13" if first else f"=EOMONTH(B{r},0)", nf=SHORT, fl=rowfill)
    calc(ws, f"F{r}", f'=COUNTIF({tab}!${"V" if first else "W"}${T0}:${"V" if first else "W"}${TN},">0")', nf="0",
         fl=rowfill).alignment = CENTER
    calc(ws, f"G{r}", "=OpenCash" if k == 0 else f"=O{r - 1}", nf=NUM, fl=rowfill)
    calc(ws, f"H{r}", "=OpenDigital" if k == 0 else f"=P{r - 1}", nf=NUM, fl=rowfill)
    pc, pd = ("H", "I") if first else ("O", "P")
    calc(ws, f"I{r}", f"=SUM({tab}!${pc}${T0}:${pc}${TN})", nf=NUM, fl=rowfill)
    calc(ws, f"J{r}", f"=SUM({tab}!${pd}${T0}:${pd}${TN})", nf=NUM, fl=rowfill)
    for col, mode in (("K", "Cash"), ("L", "Digital")):
        calc(ws, f"{col}{r}", f'=SUMIFS({EXP},{EXD},">="&$D{r},{EXD},"<="&$E{r},{EXM},"{mode}")', nf=NUM, fl=rowfill)
    calc(ws, f"M{r}",
         f'=SUMIFS({TRA},{TRD},">="&$D{r},{TRD},"<="&$E{r},{TRT},"Digital to Cash")'
         f'-SUMIFS({TRA},{TRD},">="&$D{r},{TRD},"<="&$E{r},{TRT},"Cash to Digital")', nf=NUM, fl=rowfill)
    calc(ws, f"N{r}", f"=-M{r}", nf=NUM, fl=rowfill)
    calc(ws, f"O{r}", f"=G{r}+I{r}-K{r}+M{r}", nf=NUM, b=True, fl="E8EEF4")
    calc(ws, f"P{r}", f"=H{r}+J{r}-L{r}+N{r}", nf=NUM, b=True, fl="E8EEF4")
    calc(ws, f"Q{r}", f"=O{r}+P{r}", nf=NUM, b=True, fl="E8EEF4")
    bal = "J" if first else "Q"
    calc(ws, f"R{r}", f'=IF(D{r}>TODAY(),"",SUMIF({tab}!${bal}${T0}:${bal}${TN},">0"))', nf=NUM, fl=rowfill)
    cr = "F" if first else "M"
    calc(ws, f"S{r}", f"=SUM({tab}!${cr}${T0}:${cr}${TN})", nf=NUM, fl=rowfill)
DL = D0 + NCYC - 1      # 34
r = DL + 1              # 35 totals
put(ws, f"B{r}", "TOTAL", f=font(10, True), fl="EDEDED", border=True)
for c in "IJKLMNS":
    calc(ws, f"{c}{r}", f"=SUM({c}{D0}:{c}{DL})", nf=NUM, b=True, fl="EDEDED")
ws.conditional_formatting.add(f"A{D0}:S{DL}", FormulaRule(formula=[f"AND($D{D0}<=TODAY(),$E{D0}>=TODAY())"],
                                                          fill=fill("DDEBF7"), font=font(10, True)))
ws.conditional_formatting.add(f"R{D0}:R{DL}", FormulaRule(formula=[f"AND(ISNUMBER(R{D0}),R{D0}>0)"], font=RED_TXT))
ws.conditional_formatting.add(f"O{D0}:Q{DL}", CellIsRule(operator="lessThan", formula=["0"], font=RED_TXT))

# Data checks
r0 = 37
put(ws, f"A{r0}", "DATA CHECKS", f=font(11, True, NAVY))
checks = [
    ("Expenses entered in the Expenses sheet", f"=SUM(Expenses!E{EX0}:E{EXN})"),
    ("Expenses counted in the cycles above", f"=K{DL + 1}+L{DL + 1}"),
    ("Expenses check", f'=IF(ABS(G{r0 + 1}-G{r0 + 2})<0.005,"✔ OK – every expense is counted",'
                       f'"⚠ CHECK – some expenses have no Date, no Paid From, or a date outside this period")'),
    ("Transfers entered in the Transfers sheet", f"=SUM(Transfers!C{TR0}:C{TRN})"),
    ("Transfers counted in the cycles above",
     f'=SUMIFS({TRA},{TRD},">="&$D${D0},{TRD},"<="&$E${DL},{TRT},"Cash to Digital")'
     f'+SUMIFS({TRA},{TRD},">="&$D${D0},{TRD},"<="&$E${DL},{TRT},"Digital to Cash")'),
    ("Transfers check", f'=IF(ABS(G{r0 + 4}-G{r0 + 5})<0.005,"✔ OK – every transfer is counted",'
                        f'"⚠ CHECK – some transfers have no Date, no Direction, or a date outside this period")'),
    ("Leave Log check", f"=IF(COUNTIF('Leave Log'!$H${LL0}:$H${LLN},\"⚠*\")=0,\"✔ OK – all leave entries are valid\","
                        f"\"⚠ CHECK – \"&COUNTIF('Leave Log'!$H${LL0}:$H${LLN},\"⚠*\")&\" leave row(s) flagged in Leave Log column H "
                        f"(overlap, missing date, outside join/exit dates or unknown name)\")"),
    ("Member names check", f'=IF(SUMPRODUCT((Members!$B${M0}:$B${M0 + NM - 1}<>"")*(COUNTIF(Members!$B${M0}:$B${M0 + NM - 1},'
                           f'Members!$B${M0}:$B${M0 + NM - 1})>1))=0,"✔ OK – no duplicate names",'
                           f'"⚠ CHECK – the same name appears twice in Members")'),
]
for i, (lab, fml) in enumerate(checks):
    rr = r0 + 1 + i
    put(ws, f"A{rr}", lab, f=font(10), al=LEFT)
    ws.merge_cells(f"A{rr}:F{rr}")
    is_text = "check" in lab.lower()
    put(ws, f"G{rr}", fml, f=font(10, is_text), nf=None if is_text else NUM)
    if is_text:
        ws.merge_cells(f"G{rr}:S{rr}")
        ws.conditional_formatting.add(f"G{rr}:S{rr}", FormulaRule(formula=[f'LEFT($G${rr},1)="⚠"'],
                                                                  fill=fill("FFC7CE"), font=font(10, True, "9C0006")))
        ws.conditional_formatting.add(f"G{rr}:S{rr}", FormulaRule(formula=[f'LEFT($G${rr},1)="✔"'],
                                                                  fill=fill("C6EFCE"), font=font(10, True, "006100")))
    else:
        ws.merge_cells(f"G{rr}:H{rr}")

# Monthly expenses by category
c0 = 48
put(ws, f"A{c0}", "MONTHLY EXPENSES BY CATEGORY", f=font(11, True, NAVY))
sub(ws, f"B{c0 + 1}", "Month")
cat_cols = [CL(3 + i) for i in range(8)]        # C..J
for i, c in enumerate(cat_cols):
    sub(ws, f"{c}{c0 + 1}", f'=IF(Settings!A{13 + i}="","",Settings!A{13 + i})')
sub(ws, f"K{c0 + 1}", "Total\nExpenses")
sub(ws, f"L{c0 + 1}", "Collected")
sub(ws, f"M{c0 + 1}", "Net\n(Collected − Expenses)")
ws.row_dimensions[c0 + 1].height = 30
for mi in range(12):
    rr = c0 + 2 + mi
    d1 = D0 + 2 * mi
    calc(ws, f"B{rr}", f"=B{d1}", nf="mmm\\-yy")
    for c in cat_cols:
        calc(ws, f"{c}{rr}", f'=IF({c}${c0 + 1}="","",SUMIFS({EXP},{EXD},">="&$B{rr},{EXD},"<="&EOMONTH($B{rr},0),{EXC},{c}${c0 + 1}))', nf=NUM)
    calc(ws, f"K{rr}", f"=SUM(C{rr}:J{rr})", nf=NUM, b=True)
    calc(ws, f"L{rr}", f"=I{d1}+J{d1}+I{d1 + 1}+J{d1 + 1}", nf=NUM)
    calc(ws, f"M{rr}", f"=L{rr}-K{rr}", nf=NUM, b=True)
rt = c0 + 14
put(ws, f"B{rt}", "TOTAL", f=font(10, True), fl="EDEDED", border=True)
for c in cat_cols + ["K", "L", "M"]:
    calc(ws, f"{c}{rt}", f"=SUM({c}{c0 + 2}:{c}{rt - 1})", nf=NUM, b=True, fl="EDEDED")
ws.conditional_formatting.add(f"M{c0 + 2}:M{rt}", CellIsRule(operator="lessThan", formula=["0"], font=RED_TXT))
widths(ws, {"A": 5, "B": 10, "C": 9, "D": 11, "E": 11, "F": 10, "G": 12, "H": 12, "I": 12, "J": 12, "K": 12,
            "L": 12, "M": 12, "N": 12, "O": 12, "P": 12, "Q": 12, "R": 12, "S": 11})
ws.freeze_panes = "A11"

# ================================================================ Leave Log
ws = ws_ll
title(ws, "Leave Log – pay only for the days present", merge="A1:I1")
note(ws, "A2", "Enter the FIRST and LAST day the person is away (both count as away). Each cycle is then charged only for the "
               "days present:  100 × days present ÷ days in that cycle. The credit appears automatically in the month tab of "
               "every cycle the leave touches – if they already paid, it is deducted from their next collection.",
     merge="A2:I2", height=40)
put(ws, "A3", "Collection per cycle (AED):", f=font(9, True))
ws.merge_cells("A3:B3")
put(ws, "C3", "=Collection", f=font(9, True), nf=NUM)
put(ws, "D3", "Minimum days:", f=font(9, True), al=Alignment(horizontal="right"))
put(ws, "E3", "=MinLeaveDays", f=font(9, True))
note(ws, "F3", "(change both in Settings)")
for c, t in zip("ABCDEFGHI", ["#", "Member", "First Day Away", "Last Day Away", "Days Away", "Eligible?",
                              "Credit (AED)\n≈ total", "Check", "Reason / Notes"]):
    hdr(ws, f"{c}6", t)
ws.row_dimensions[6].height = 32
put(ws, "J3", "cycle →", f=font(8, True, "7F7F7F"), al=Alignment(horizontal="right"))
put(ws, "J4", "starts →", f=font(8, True, "7F7F7F"), al=Alignment(horizontal="right"))
put(ws, "J5", "ends →", f=font(8, True, "7F7F7F"), al=Alignment(horizontal="right"))
put(ws, "J6", "days away in each cycle →", f=font(8, True, "7F7F7F"), al=Alignment(horizontal="right", wrap_text=True))
for k in range(NCYC):
    c = hc(k)
    mi = k // 2
    put(ws, f"{c}3", f"{TABS[mi]} {'1st' if k % 2 == 0 else '15th'}", f=font(8, True, "FFFFFF"), fl="404040", al=CENTER)
    put(ws, f"{c}4", f"=Dashboard!$D${D0 + k}", f=font(8), nf=SHORT, al=CENTER)
    put(ws, f"{c}5", f"=Dashboard!$E${D0 + k}", f=font(8), nf=SHORT, al=CENTER)
    put(ws, f"{c}6", "days", f=font(8, True), fl=GREY_HDR, al=CENTER)
    ws.column_dimensions[c].width = 8
for r in range(LL0, LLN + 1):
    calc(ws, f"A{r}", f'=IF(B{r}="","",ROW()-{LL0 - 1})').alignment = CENTER
    inp(ws, f"B{r}")
    inp(ws, f"C{r}", None, DATE)
    inp(ws, f"D{r}", None, DATE)
    calc(ws, f"E{r}", f'=IF(OR(C{r}="",D{r}=""),"",IF(D{r}<C{r},"Check dates",D{r}-C{r}+1))').alignment = CENTER
    calc(ws, f"F{r}", f'=IF(ISNUMBER(E{r}),IF(E{r}>=MinLeaveDays,"Yes","No"),"")').alignment = CENTER
    calc(ws, f"G{r}", f'=IF(F{r}="Yes",ROUND(Collection*SUMPRODUCT(${HC_FIRST}{r}:${HC_LAST}{r}/'
                      f'(${HC_FIRST}$5:${HC_LAST}$5-${HC_FIRST}$4:${HC_LAST}$4+1)),2),IF(F{r}="No",0,""))', nf=NUM)
    mrow = f"MATCH(B{r},MemberNames,0)"
    join_ = f"INDEX(Members!$E${M0}:$E${M0 + NM - 1},{mrow})"
    exit_ = f"INDEX(Members!$F${M0}:$F${M0 + NM - 1},{mrow})"
    calc(ws, f"H{r}",
         f'=IF(B{r}="",IF(OR(C{r}<>"",D{r}<>""),"⚠ Pick a name",""),'
         f'IF(OR(C{r}="",D{r}=""),"⚠ Enter both dates",'
         f'IF(D{r}<C{r},"⚠ Last day is before first day",'
         f'IF(ISNA({mrow}),"⚠ Name not found in Members",'
         f'IF(OR(AND(N({join_})>0,C{r}<{join_}),AND(N({exit_})>0,D{r}>{exit_})),"⚠ Outside join / exit dates",'
         f'IF(COUNTIFS($B${LL0}:$B${LLN},B{r},$C${LL0}:$C${LLN},"<="&D{r},$D${LL0}:$D${LLN},">="&C{r})>1,'
         f'"⚠ Overlaps another leave of this person",'
         f'IF(F{r}="No","ℹ Shorter than minimum – no credit",'
         f'IF(SUM({HC_FIRST}{r}:{HC_LAST}{r})<E{r},"ℹ Part of it is outside this file\'s 12 months","✔ OK"))))))))')
    inp(ws, f"I{r}")
    for k in range(NCYC):
        c = hc(k)
        put(ws, f"{c}{r}", f'=IF($F{r}="Yes",MAX(0,MIN($D{r},{c}$5)-MAX($C{r},{c}$4)+1),0)', f=font(8, False, "7F7F7F"),
            nf=INT, al=Alignment(horizontal="center"))
# example data from the user's message
ws[f"B{LL0}"] = "Vinay Kharayat"
ws[f"C{LL0}"] = dt.date(2026, 11, 1)
ws[f"D{LL0}"] = dt.date(2026, 11, 15)
ws[f"I{LL0}"] = "On leave, did not contribute on 1 Nov (your example)"
ws.conditional_formatting.add(f"H{LL0}:H{LLN}", FormulaRule(formula=[f'LEFT(H{LL0},1)="⚠"'],
                                                            fill=fill("FFC7CE"), font=font(10, True, "9C0006")))
ws.conditional_formatting.add(f"H{LL0}:H{LLN}", FormulaRule(formula=[f'LEFT(H{LL0},1)="✔"'], font=font(10, True, "00843D")))
ws.conditional_formatting.add(f"{HC_FIRST}{LL0}:{HC_LAST}{LLN}", CellIsRule(operator="greaterThan", formula=["0"],
                                                                            fill=fill("FCE4D6"), font=font(8, True, "C65911")))
dv = DataValidation(type="list", formula1="=MemberNames", allow_blank=True, showErrorMessage=True,
                    error="Pick a name from the Members sheet")
dv.add(f"B{LL0}:B{LLN}")
ws.add_data_validation(dv)
dv = DataValidation(type="date", operator="between", formula1="DATE(2000,1,1)", formula2="DATE(2100,12,31)",
                    showErrorMessage=True, error="Please enter a date, e.g. 01-Nov-2026")
dv.add(f"C{LL0}:D{LLN}")
ws.add_data_validation(dv)
widths(ws, {"A": 5, "B": 22, "C": 15, "D": 15, "E": 10, "F": 10, "G": 13, "H": 36, "I": 40, "J": 14})
ws.column_dimensions.group(HC_FIRST, HC_LAST, hidden=True, outline_level=1)
ws.sheet_properties.outlinePr.summaryRight = False
ws.freeze_panes = "C7"

# ================================================================= Expenses
ws = ws_exp
title(ws, "Expenses Log", merge="A1:I1")
note(ws, "A2", "One row per bill or purchase. Pick the Category and whether it was paid from Cash or Digital. "
               "Totals flow to the Dashboard and month tabs automatically.", merge="A2:I2")
put(ws, "A3", "Cash total:", f=font(9, True))
put(ws, "B3", f'=SUMIFS(E{EX0}:E{EXN},D{EX0}:D{EXN},"Cash")', f=font(9, True), nf=NUM)
put(ws, "C3", "Digital total:", f=font(9, True), al=Alignment(horizontal="right"))
put(ws, "D3", f'=SUMIFS(E{EX0}:E{EXN},D{EX0}:D{EXN},"Digital")', f=font(9, True), nf=NUM)
put(ws, "F3", "Incomplete rows:", f=font(9, True), al=Alignment(horizontal="right"))
put(ws, "G3", f'=SUMPRODUCT((E{EX0}:E{EXN}<>"")*(((A{EX0}:A{EXN}="")+(D{EX0}:D{EXN}=""))>0))', f=font(9, True))
note(ws, "H3", "(rows with an amount but no Date or Paid From are shaded red and not counted)")
for c, t in zip("ABCDEFGHI", ["Date", "Category", "Description", "Paid From", "Amount (AED)", "Paid By / Bought By",
                              "Bill / Ref No.", "Month\n(auto)", "Cycle\n(auto)"]):
    hdr(ws, f"{c}5", t)
ws.row_dimensions[5].height = 30
ex = [dt.date(2026, 11, 2), "Water", "EXAMPLE ROW – not counted. 10 × 5-gallon water bottles", "Cash", 70, "Mohan Singh", "INV-1023"]
for c, v in zip("ABCDEFG", ex):
    put(ws, f"{c}6", v, f=font(9, False, "7F7F7F", True), fl="F2F2F2", nf=DATE if c == "A" else (NUM if c == "E" else None))
for r in range(EX0, EXN + 1):
    inp(ws, f"A{r}", None, DATE)
    inp(ws, f"B{r}")
    inp(ws, f"C{r}")
    inp(ws, f"D{r}")
    inp(ws, f"E{r}", None, NUM)
    inp(ws, f"F{r}")
    inp(ws, f"G{r}")
    calc(ws, f"H{r}", f'=IF(A{r}="","",DATE(YEAR(A{r}),MONTH(A{r}),1))', nf="mmm\\-yy")
    calc(ws, f"I{r}", f'=IF(A{r}="","",IF(DAY(A{r})<15,"1st","15th"))').alignment = CENTER
ws[f"A{EX0}"] = dt.date(2026, 11, 1)
ws[f"B{EX0}"] = "Grocery"
ws[f"C{EX0}"] = "Grocery shopping (your 1-Nov example)"
ws[f"D{EX0}"] = "Cash"
ws[f"E{EX0}"] = 1154
ws[f"D{EX0}"].comment = Comment("Placeholder – change to Digital if this was paid by card / transfer.", "Villa Budget")
ws.conditional_formatting.add(f"A{EX0}:I{EXN}", FormulaRule(formula=[f'AND($E{EX0}<>"",OR($A{EX0}="",$D{EX0}=""))'],
                                                            fill=fill("FFC7CE")))
for rng_, f1 in ((f"B{EX0}:B{EXN}", "=Categories"), (f"D{EX0}:D{EXN}", '"Cash,Digital"')):
    dv = DataValidation(type="list", formula1=f1, allow_blank=True, showErrorMessage=True)
    dv.add(rng_)
    ws.add_data_validation(dv)
dv = DataValidation(type="date", operator="between", formula1="DATE(2000,1,1)", formula2="DATE(2100,12,31)", showErrorMessage=True)
dv.add(f"A{EX0}:A{EXN}")
ws.add_data_validation(dv)
widths(ws, {"A": 14, "B": 18, "C": 44, "D": 12, "E": 14, "F": 20, "G": 15, "H": 10, "I": 8})
ws.freeze_panes = "A7"

# ================================================================ Transfers
ws = ws_tr
title(ws, "Cash ↔ Digital Transfers", merge="A1:E1")
note(ws, "A2", "Use when cash is deposited into the bank / wallet (Cash to Digital) or digital money is withdrawn as cash "
               "(Digital to Cash). The total stays the same – only the split between Cash and Digital changes.",
     merge="A2:E2", height=28)
for c, t in zip("ABCDE", ["Date", "Direction", "Amount (AED)", "Done By", "Notes"]):
    hdr(ws, f"{c}5", t)
for c, v in zip("ABCDE", [dt.date(2026, 11, 5), "Cash to Digital", 1000, "Mohan Singh",
                          "EXAMPLE ROW – not counted. Deposited cash at ATM."]):
    put(ws, f"{c}6", v, f=font(9, False, "7F7F7F", True), fl="F2F2F2", nf=DATE if c == "A" else (NUM if c == "C" else None))
for r in range(TR0, TRN + 1):
    inp(ws, f"A{r}", None, DATE)
    inp(ws, f"B{r}")
    inp(ws, f"C{r}", None, NUM)
    inp(ws, f"D{r}")
    inp(ws, f"E{r}")
dv = DataValidation(type="list", formula1='"Cash to Digital,Digital to Cash"', allow_blank=True, showErrorMessage=True)
dv.add(f"B{TR0}:B{TRN}")
ws.add_data_validation(dv)
dv = DataValidation(type="date", operator="between", formula1="DATE(2000,1,1)", formula2="DATE(2100,12,31)", showErrorMessage=True)
dv.add(f"A{TR0}:A{TRN}")
ws.add_data_validation(dv)
widths(ws, {"A": 14, "B": 18, "C": 14, "D": 20, "E": 50})
ws.freeze_panes = "A7"

# =============================================================== Month tabs
NUMCOLS = "CDEFGHIJKLMNOPQ"
for mi, ws in enumerate(ws_tabs):
    k1, k2 = 2 * mi, 2 * mi + 1
    d1, d2 = D0 + k1, D0 + k2
    title(ws, '=VillaName&"  –  Collection Sheet"')
    put(ws, "J1", "=$C$2", f=font(16, True, NAVY), nf="mmmm yyyy", al=Alignment(horizontal="right"))
    ws.merge_cells("J1:Q1")
    put(ws, "B2", "1st cycle (from – to):", f=font(9, True), al=Alignment(horizontal="right"))
    put(ws, "C2", f"=DATE(YEAR(StartMonth),MONTH(StartMonth)+{mi},1)", f=font(9, True), nf=DATE)
    put(ws, "D2", "=C2+13", f=font(9, True), nf=DATE)
    put(ws, "E2", "15th cycle:", f=font(9, True), al=Alignment(horizontal="right"))
    ws.merge_cells("E2:F2")
    put(ws, "G2", "=C2+14", f=font(9, True), nf=DATE)
    put(ws, "H2", "=EOMONTH(C2,0)", f=font(9, True), nf=DATE)
    put(ws, "I2", '="Days: "&(D2-C2+1)&" / "&(H2-G2+1)', f=font(9, False, "595959", True))

    # balance summary
    hdr(ws, "B4", "BALANCE SUMMARY (AED)")
    hdr(ws, "C4", "1st CYCLE")
    ws.merge_cells("C4:E4")
    hdr(ws, "F4", "15th CYCLE")
    ws.merge_cells("F4:H4")
    for c, t in zip("CDEFGH", ["Cash", "Digital", "Total"] * 2):
        sub(ws, f"{c}5", t)
    lines = [("Opening balance (b/f)", "G", "H"), ("+ Collections", "I", "J"), ("− Expenses", "K", "L"),
             ("± Transfers", "M", "N"), ("Closing balance (c/f)", "O", "P")]
    for j, (lab, cc, dc) in enumerate(lines):
        rr = 6 + j
        bold = j in (0, 4)
        put(ws, f"B{rr}", lab, f=font(10, bold), border=True)
        for (c_cash, c_dig, c_tot), drow in ((("C", "D", "E"), d1), (("F", "G", "H"), d2)):
            calc(ws, f"{c_cash}{rr}", f"=Dashboard!{cc}{drow}", nf=NUM, b=bold)
            calc(ws, f"{c_dig}{rr}", f"=Dashboard!{dc}{drow}", nf=NUM, b=bold)
            calc(ws, f"{c_tot}{rr}", f"={c_cash}{rr}+{c_dig}{rr}", nf=NUM, b=True, fl="E8EEF4" if j == 4 else None)
    hdr(ws, "J4", "COLLECTION STATUS (AED)")
    ws.merge_cells("J4:L4")
    sub(ws, "M4", "1st")
    sub(ws, "N4", "15th")
    status = [("Members charged this cycle", f'=COUNTIF(V{T0}:V{TN},">0")', f'=COUNTIF(W{T0}:W{TN},">0")', "0"),
              ("Due after leave credits", f"=SUM(V{T0}:V{TN})", f"=SUM(W{T0}:W{TN})", NUM),
              ("Leave credits given", f"=SUM(F{T0}:F{TN})", f"=SUM(M{T0}:M{TN})", NUM),
              ("Collected (Cash + Digital)", f"=SUM(H{T0}:I{TN})", f"=SUM(O{T0}:P{TN})", NUM),
              ("Still pending (owed by members)", f'=SUMIF(J{T0}:J{TN},">0")', f'=SUMIF(Q{T0}:Q{TN},">0")', NUM),
              ("Advance held (credit to members)", f'=-SUMIF(J{T0}:J{TN},"<0")', f'=-SUMIF(Q{T0}:Q{TN},"<0")', NUM)]
    for j, (lab, f1, f2, nf) in enumerate(status):
        rr = 5 + j
        put(ws, f"J{rr}", lab, f=font(10), border=True)
        ws.merge_cells(f"J{rr}:L{rr}")
        calc(ws, f"M{rr}", f1, nf=nf, b=True)
        calc(ws, f"N{rr}", f2, nf=nf, b=True)
    ws.conditional_formatting.add("M9:N9", CellIsRule(operator="greaterThan", formula=["0.004"], font=RED_TXT))

    # member table headers
    hdr(ws, "A12", "MEMBER")
    ws.merge_cells("A12:C12")
    hdr(ws, "D12", "1st CYCLE  –  collection on the 1st")
    ws.merge_cells("D12:J12")
    hdr(ws, "K12", "15th CYCLE  –  collection on the 15th")
    ws.merge_cells("K12:Q12")
    hdr(ws, "R12", "")
    heads = ["#", "Member", "Brought\nForward", "Leave\nDays", "Due", "Leave\nCredit", "Net\nPayable", "Paid\nCash",
             "Paid\nDigital", "Balance", "Leave\nDays", "Due", "Leave\nCredit", "Net\nPayable", "Paid\nCash",
             "Paid\nDigital", "Balance\nc/f", "Remarks"]
    for c, t in zip("ABCDEFGHIJKLMNOPQR", heads):
        sub(ws, f"{c}13", t)
    for c, t in zip("TUVW", ["helper: days as member (1st)", "helper: days as member (15th)",
                             "helper: net due (1st)", "helper: net due (15th)"]):
        put(ws, f"{c}13", t, f=font(8, True, "7F7F7F"), fl="F2F2F2", al=CENTER)
    ws.row_dimensions[13].height = 32

    prev = f"'{TABS[mi - 1]}'" if mi else None
    h1, h2 = hc(k1), hc(k2)
    LLB = f"'Leave Log'!$B${LL0}:$B${LLN}"
    for i in range(NM):
        r = T0 + i
        m = M0 + i
        E_ = f'IF($B{r}="","",'
        calc(ws, f"A{r}", i + 1).alignment = CENTER
        calc(ws, f"B{r}", f'=IF(Members!$B${m}="","",Members!$B${m})')
        calc(ws, f"C{r}", f"={E_}N(Members!$G${m}))" if mi == 0 else f"={E_}N({prev}!$Q{r}))", nf=NUM)
        # 1st cycle
        calc(ws, f"D{r}", f"={E_}MIN($T{r},SUMIFS('Leave Log'!${h1}${LL0}:${h1}${LLN},{LLB},$B{r})))", nf=INT)
        calc(ws, f"E{r}", f"={E_}ROUND(Collection*$T{r}/($D$2-$C$2+1),RoundDecimals))", nf=NUM)
        calc(ws, f"F{r}", f"={E_}E{r}-ROUND(Collection*($T{r}-D{r})/($D$2-$C$2+1),RoundDecimals))", nf=NUM)
        calc(ws, f"G{r}", f"={E_}C{r}+E{r}-F{r})", nf=NUM, b=True)
        put(ws, f"H{r}", None, f=font(10, False, "0000FF"), nf=NUM, border=True)
        put(ws, f"I{r}", None, f=font(10, False, "0000FF"), nf=NUM, border=True)
        calc(ws, f"J{r}", f"={E_}G{r}-H{r}-I{r})", nf=NUM)
        # 15th cycle
        calc(ws, f"K{r}", f"={E_}MIN($U{r},SUMIFS('Leave Log'!${h2}${LL0}:${h2}${LLN},{LLB},$B{r})))", nf=INT)
        calc(ws, f"L{r}", f"={E_}ROUND(Collection*$U{r}/($H$2-$G$2+1),RoundDecimals))", nf=NUM)
        calc(ws, f"M{r}", f"={E_}L{r}-ROUND(Collection*($U{r}-K{r})/($H$2-$G$2+1),RoundDecimals))", nf=NUM)
        calc(ws, f"N{r}", f"={E_}J{r}+L{r}-M{r})", nf=NUM, b=True)
        put(ws, f"O{r}", None, f=font(10, False, "0000FF"), nf=NUM, border=True)
        put(ws, f"P{r}", None, f=font(10, False, "0000FF"), nf=NUM, border=True)
        calc(ws, f"Q{r}", f"={E_}N{r}-O{r}-P{r})", nf=NUM, b=True)
        put(ws, f"R{r}", None, f=font(9, False, "0000FF"), border=True)
        # helpers
        for c, (a, b_) in (("T", ("$C$2", "$D$2")), ("U", ("$G$2", "$H$2"))):
            put(ws, f"{c}{r}", f'={E_}MAX(0,MIN(IF(Members!$F${m}="",{b_},Members!$F${m}),{b_})'
                               f'-MAX(IF(Members!$E${m}="",{a},Members!$E${m}),{a})+1))',
                f=font(8, False, "7F7F7F"), nf="0", al=Alignment(horizontal="center"))
        put(ws, f"V{r}", f'=IF($B{r}="",0,E{r}-F{r})', f=font(8, False, "7F7F7F"), nf=NUM)
        put(ws, f"W{r}", f'=IF($B{r}="",0,L{r}-M{r})', f=font(8, False, "7F7F7F"), nf=NUM)
    put(ws, f"B{TT}", "TOTAL", f=font(10, True), fl="EDEDED", border=True)
    for c in NUMCOLS:
        calc(ws, f"{c}{TT}", f"=SUM({c}{T0}:{c}{TN})", nf=INT if c in "DK" else NUM, b=True, fl="EDEDED")
    calc(ws, f"A{TT}", None, fl="EDEDED")
    calc(ws, f"R{TT}", None, fl="EDEDED")

    # conditional formatting (order matters: first match wins visually for fills)
    R_ = f"{T0}:{'{}'}{TN}"
    ws.conditional_formatting.add(f"A{T0}:R{TN}", FormulaRule(formula=[f'AND($B{T0}<>"",N($T{T0})=0,N($U{T0})=0)'],
                                                              fill=fill("F2F2F2"), font=font(10, False, "A6A6A6")))
    ws.conditional_formatting.add(f"D{T0}:F{TN}", FormulaRule(formula=[f"N($D{T0})>0"], fill=fill("FCE4D6")))
    ws.conditional_formatting.add(f"K{T0}:M{TN}", FormulaRule(formula=[f"N($K{T0})>0"], fill=fill("FCE4D6")))
    ws.conditional_formatting.add(f"H{T0}:I{TN}", FormulaRule(formula=[f'AND($B{T0}<>"",N($T{T0})>0)'], fill=fill(INPUT_FILL)))
    ws.conditional_formatting.add(f"O{T0}:P{TN}", FormulaRule(formula=[f'AND($B{T0}<>"",N($U{T0})>0)'], fill=fill(INPUT_FILL)))
    ws.conditional_formatting.add(f"R{T0}:R{TN}", FormulaRule(formula=[f'$B{T0}<>""'], fill=fill(INPUT_FILL)))
    for c in "CJQ":
        cf_owes(ws, f"{c}{T0}:{c}{TN}", f"{c}{T0}")
    for c in "GN":
        ws.conditional_formatting.add(f"{c}{T0}:{c}{TN}", FormulaRule(formula=[f"AND(ISNUMBER({c}{T0}),{c}{T0}<-0.004)"],
                                                                      font=GREEN_TXT))
    dv = DataValidation(type="decimal", operator="between", formula1="-100000", formula2="100000",
                        showErrorMessage=True, error="Enter an amount in AED (minus for a refund)")
    dv.add(f"H{T0}:I{TN}")
    dv.add(f"O{T0}:P{TN}")
    ws.add_data_validation(dv)
    widths(ws, {"A": 4, "B": 24, "C": 11, "D": 7, "E": 10, "F": 10, "G": 11, "H": 10, "I": 10, "J": 11,
                "K": 7, "L": 10, "M": 10, "N": 11, "O": 10, "P": 10, "Q": 11, "R": 26, "S": 3,
                "T": 11, "U": 11, "V": 11, "W": 11})
    ws.column_dimensions.group("T", "W", hidden=True, outline_level=1)
    ws.freeze_panes = "C14"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True

# ============================================================ Member Summary
ws = ws_ms
title(ws, "Member Summary", merge="A1:L1")
note(ws, "A2", "Each person's balance after every collection.  Red (+) = still owes the villa.  Green (−) = paid in advance / "
               "has credit.  Future cycles stay blank until their date arrives.", merge="A2:L2")
BAL0 = 9                     # column I = first cycle balance
put(ws, f"{CL(BAL0)}3", "BALANCE AFTER EACH COLLECTION CYCLE", f=font(9, True, "FFFFFF"), fl="404040", al=CENTER)
ws.merge_cells(f"{CL(BAL0)}3:{CL(BAL0 + NCYC - 1)}3")
for c, t in zip("ABCDEFGH", ["#", "Member", "Status", "Opening\nBalance", "Total Paid\n(this file)", "Leave Days\n(all)",
                             "Leave Credits\n(all)", "CURRENT\nBALANCE"]):
    hdr(ws, f"{c}4", t, sz=9)
for k in range(NCYC):
    c = CL(BAL0 + k)
    put(ws, f"{c}4", f"=Dashboard!D{D0 + k}", f=font(9, True), fl=GREY_HDR, nf=SHORT, al=CENTER, border=True)
    ws.column_dimensions[c].width = 9.5
ws.row_dimensions[4].height = 32
for i in range(NM):
    r = MS0 + i
    tr = T0 + i
    m = M0 + i
    calc(ws, f"A{r}", i + 1).alignment = CENTER
    calc(ws, f"B{r}", f'=IF(Members!$B${m}="","",Members!$B${m})')
    calc(ws, f"C{r}", f'=IF(B{r}="","",Members!$H${m})').alignment = CENTER
    calc(ws, f"D{r}", f'=IF(B{r}="","",N(Members!$G${m}))', nf=NUM)
    paid = ",".join(f"'{t}'!H{tr}:I{tr},'{t}'!O{tr}:P{tr}" for t in TABS)
    ldays = ",".join(f"'{t}'!D{tr},'{t}'!K{tr}" for t in TABS)
    lcred = ",".join(f"'{t}'!F{tr},'{t}'!M{tr}" for t in TABS)
    calc(ws, f"E{r}", f'=IF(B{r}="","",SUM({paid}))', nf=NUM)
    calc(ws, f"F{r}", f'=IF(B{r}="","",SUM({ldays}))', nf=INT)
    calc(ws, f"G{r}", f'=IF(B{r}="","",SUM({lcred}))', nf=NUM)
    first_c, last_c = CL(BAL0), CL(BAL0 + NCYC - 1)
    calc(ws, f"H{r}", f'=IF(B{r}="","",IFERROR(INDEX({first_c}{r}:{last_c}{r},MATCH(TODAY(),${first_c}$4:${last_c}$4,1)),D{r}))',
         nf=NUM, b=True)
    for k in range(NCYC):
        c = CL(BAL0 + k)
        t = TABS[k // 2]
        col = "J" if k % 2 == 0 else "Q"
        calc(ws, f"{c}{r}", f"=IF(OR($B{r}=\"\",{c}$4>TODAY()),\"\",'{t}'!{col}{tr})", nf=NUM)
rt = MS0 + NM
put(ws, f"B{rt}", "TOTAL", f=font(10, True), fl="EDEDED", border=True)
for c in "DEFG":
    calc(ws, f"{c}{rt}", f"=SUM({c}{MS0}:{c}{rt - 1})", nf=INT if c == "F" else NUM, b=True, fl="EDEDED")
calc(ws, f"H{rt}", f'=SUMIF(H{MS0}:H{rt - 1},">0")', nf=NUM, b=True, fl="EDEDED")
note(ws, f"I{rt}", "← Total currently owed by all members")
ws.merge_cells(f"I{rt}:M{rt}")
cf_owes(ws, f"H{MS0}:{CL(BAL0 + NCYC - 1)}{rt - 1}", f"H{MS0}")
ws.conditional_formatting.add(f"C{MS0}:C{rt - 1}", FormulaRule(formula=[f'C{MS0}="On Leave"'], fill=fill("FCE4D6"),
                                                               font=font(10, True, "C65911")))
widths(ws, {"A": 4, "B": 22, "C": 10, "D": 11, "E": 12, "F": 10, "G": 12, "H": 13})
ws.freeze_panes = "C5"

# ==================================================================== Guide
ws = ws_guide
widths(ws, {"A": 3, "B": 125})
put(ws, "B1", "Villa Budget – How to use this workbook (v2)", f=font(18, True, NAVY))
put(ws, "B2", '="Period: "&TEXT(StartMonth,"mmm-yyyy")&" to "&TEXT(EOMONTH(StartMonth,11),"mmm-yyyy")&'
              '"   ·   everyone pays only for the days they are in the villa"', f=font(10, False, "595959", True))
G = [
    ("h", "WHAT THIS FILE DOES"),
    ("p", "• Tracks the 100 AED collection from every member on the 1st and the 15th of each month (two cycles a month)."),
    ("p", "• Keeps two balances – CASH and DIGITAL – and carries the closing balance of every cycle forward to the next cycle."),
    ("p", "• Records every expense (Water, Grocery, Gas, Cleaning, Miscellaneous …) and every Cash ↔ Digital transfer."),
    ("p", "• Charges each person only for the days they actually stay – leave, joining mid-cycle and moving out mid-cycle are all calculated per day."),
    ("p", "• Works for any number of people (up to 50 rows) – people can join and leave at any time."),
    (None, None),
    ("h", "COLOUR KEY"),
    ("k", "Yellow cell with blue text  =  type here.   Everything else is calculated – please don't type over it."),
    ("k", "Red amount  =  member still owes the villa.     Green (minus) amount  =  member has paid in advance / has credit."),
    ("k", "Orange cells in a month tab  =  that person was on leave during the cycle.     Grey row  =  not living in the villa that month."),
    (None, None),
    ("h", "ONE-TIME SETUP"),
    ("p", "1.  Settings – check the villa name, the start month (1-Nov-2026) and the Opening Cash and Opening Digital balance. "
          "Your example balance of 1,700 AED is entered as Cash – split it correctly between Cash and Digital."),
    ("p", "2.  Members – 13 names are already entered. Add the remaining people in the next empty rows. Leave Join Date empty for "
          "people already living there. Opening Balance = anything someone already owes (+) or has paid in advance (−) before the start month."),
    (None, None),
    ("h", "ON EVERY 1st AND 15th (COLLECTION DAY)"),
    ("p", "3.  Open the month tab (e.g. Nov-26). Use the 1st CYCLE columns on the 1st and the 15th CYCLE columns on the 15th."),
    ("p", "4.  \"Net Payable\" is what each person should pay  =  Brought Forward (pending + / advance − from before)  +  Due  −  Leave Credit."),
    ("p", "5.  Type what they paid in Paid Cash or Paid Digital (or split between both). \"Balance\" shows what is still pending – it carries to the next cycle automatically."),
    (None, None),
    ("h", "WHEN SOMEONE GOES ON LEAVE  –  pay only for the days present"),
    ("p", "6.  Leave Log – pick the name and enter the FIRST and LAST day they are away (both days count as away). "
          "You can enter it before, during or after the leave."),
    ("p", "7.  Every cycle is charged by days present:   amount  =  100 × days present ÷ days in that cycle.   "
          "1st cycle = 1st–14th (14 days);  15th cycle = 15th–month end (13 to 17 days)."),
    ("p", "     Leave Credit = Due − amount for the days present.  A whole cycle away = 0 to pay;  fully present = 100."),
    ("p", "8.  If the person already paid for days they were away, their Balance turns green (advance) and is deducted "
          "automatically from their next collection."),
    ("k", "Example (already entered):  Vinay on leave 1-Nov to 15-Nov-2026, did not pay on 1 Nov."),
    ("x", "     • 1st cycle (1–14 Nov, 14 days): away all 14 days  →  Due 100.00 − Leave Credit 100.00  =  0.00 to pay."),
    ("x", "     • 15th cycle (15–30 Nov, 16 days): away 1 day (15 Nov)  →  Leave Credit 100 × 1 ÷ 16 = 6.25  →  pays 93.75."),
    ("x", "     • Had he already paid 100 on 1 Nov: Balance −100 (advance)  →  15 Nov: 93.75 − 100 = −6.25  →  pays nothing, 6.25 carried to 1 Dec."),
    ("p", "9.  Leave Log column \"Check\" warns about overlapping leaves, missing dates, dates outside join/exit, or names that are not in Members. "
          "Click the + above column K to see how many days fall in each cycle."),
    (None, None),
    ("h", "EXPENSES AND TRANSFERS"),
    ("p", "10.  Expenses – one row per bill or purchase: Date, Category, Description, Paid From (Cash or Digital), Amount. "
          "It reduces the right balance automatically. Example entered: 1-Nov-2026 Grocery 1,154 from Cash – change Paid From if it was paid digitally."),
    ("p", "11.  Transfers – when cash is deposited into the bank / wallet choose \"Cash to Digital\"; when money is withdrawn choose "
          "\"Digital to Cash\". The total stays the same."),
    (None, None),
    ("h", "PEOPLE JOINING OR MOVING OUT"),
    ("p", "12.  New person – type the name in the next empty row of Members and enter the Join Date. Their first cycle is charged "
          "only for the days they stay (100 × days ÷ days in the cycle)."),
    ("p", "13.  Person moving out – enter their Exit Date (last day staying). Collections stop after that date; the last cycle is charged per day."),
    ("k", "Never delete, sort or move rows in Members – payments in the month tabs are linked to each row. Use the Exit Date instead."),
    (None, None),
    ("h", "BALANCES AND CARRY FORWARD"),
    ("p", "• Dashboard – Cash, Digital and Total balance now, pending dues, who is in the villa / on leave today, and a cycle-by-cycle table: "
          "Opening (b/f) + Collections − Expenses ± Transfers = Closing (c/f). Each cycle's closing is the next cycle's opening."),
    ("p", "• Example: 1 Nov opening 1,700 − grocery 1,154 + collections received in the 1st cycle = 1st-cycle closing  →  becomes the 15 Nov opening."),
    ("p", "• Each month tab shows the same balance summary for its two cycles at the top, plus how much was due, credited for leave, collected and is still pending."),
    ("p", "• Member Summary – every person's balance after each cycle, total paid, leave days and leave credits."),
    ("p", "• Expenses and transfers fall into a cycle by their date (1st–14th → 1st cycle,  15th–month end → 15th cycle)."),
    (None, None),
    ("h", "GOOD TO KNOW"),
    ("p", "• Refund to a person (e.g. credit when they move out): enter a minus amount in Paid Cash or Paid Digital."),
    ("p", "• Settings → \"Decimal places\" = 2 keeps exact amounts (93.75). Set it to 0 to round part-cycle amounts to whole AED (94)."),
    ("p", "• Settings → \"Minimum days away\" = 1 gives credit for any leave. Set 3, 5 … if your villa has such a rule."),
    ("p", "• If you correct the spelling of a name in Members, correct it in the Leave Log too."),
    ("p", "• Dashboard → Data Checks warns you about incomplete expenses / transfers and problem leave entries."),
    ("p", "• New year: copy this file, clear the logs and payments, set Opening Cash / Digital to the last Closing balances and "
          "each person's Opening Balance to their Current Balance from Member Summary."),
]
r = 4
for kind, text in G:
    if kind == "h":
        put(ws, f"B{r}", text, f=font(11, True, "FFFFFF"), fl=NAVY)
        ws.row_dimensions[r].height = 20
    elif kind == "k":
        put(ws, f"B{r}", text, f=font(10, True, "7F6000"), fl="FFF2CC", al=TOPWRAP)
    elif kind == "x":
        put(ws, f"B{r}", text, f=font(10, False, "404040"), fl="FFF2CC", al=TOPWRAP)
    elif kind == "p":
        put(ws, f"B{r}", text, f=font(10), al=TOPWRAP)
    if text and len(text) > 140:
        ws.row_dimensions[r].height = 27
    r += 1

wb.calculation.fullCalcOnLoad = True
wb.active = 1          # open on the Dashboard
wb.save(OUT)
print("saved", OUT)
