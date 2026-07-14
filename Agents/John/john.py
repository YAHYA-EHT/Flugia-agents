"""
John Server — AI Sales Manager @ Flugia
Port: 8002
"""
import os, json, re, asyncio, pathlib, smtplib, uuid
from typing import AsyncGenerator, Optional
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import AsyncOpenAI
from dotenv import load_dotenv

# ── .env multi-path ───────────────────────────────────────────
for _ep in [pathlib.Path(__file__).parent/'.env',
            pathlib.Path(__file__).parent.parent/'.env',
            pathlib.Path('.env')]:
    if _ep.exists():
        load_dotenv(dotenv_path=str(_ep))
        break
else:
    load_dotenv()

# ── ReportLab (PDF) ───────────────────────────────────────────
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                     Table, TableStyle, HRFlowable)
    REPORTLAB_OK = True
    print("[John] ReportLab chargé ✓")
except ImportError as _rl_err:
    REPORTLAB_OK = False
    print(f"[John] ReportLab non disponible: {_rl_err}")

# ── Import api_client ─────────────────────────────────────────
from api_client import JohnApiClient
api = JohnApiClient()

# ── Chargement john.md ────────────────────────────────────────
for _md in [pathlib.Path(__file__).parent/"skills"/"john.md",
            pathlib.Path(__file__).parent/"john.md"]:
    if _md.exists():
        with open(_md, "r", encoding="utf-8") as _f:
            JOHN_BASE_PROMPT = _f.read()
        break
else:
    JOHN_BASE_PROMPT = "Tu es John, l'AI Sales Manager de Flugia."

# ── App ───────────────────────────────────────────────────────
app = FastAPI(title="John — AI Sales Manager")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

REPORTS_DIR = pathlib.Path(__file__).parent / "reports"
REPORTS_DIR.mkdir(exist_ok=True)
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")

# ── Clients ───────────────────────────────────────────────────
client = AsyncOpenAI(
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

MODEL_HAIKU  = "anthropic/claude-haiku-4-5"
MODEL_SONNET = "anthropic/claude-sonnet-4-6"

# ── SMTP ──────────────────────────────────────────────────────
SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM", "John — Flugia <john@flugia.com>")

def send_email_fn(to_email: str, subject: str, body: str,
                  file_path: str = None, file_name: str = None) -> bool:
    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM; msg["To"] = to_email; msg["Subject"] = subject
        msg.attach(MIMEText(body, "html", "utf-8"))
        if file_path and file_name:
            with open(file_path, "rb") as f:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", f'attachment; filename="{file_name}"')
                msg.attach(part)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.ehlo(); s.starttls(); s.login(SMTP_USER, SMTP_PASSWORD)
            s.sendmail(SMTP_USER, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[SMTP ERROR] {e}"); return False

def send_email_multi_fn(to_email: str, subject: str, body: str, file_names: list) -> bool:
    """Envoie un email avec plusieurs pièces jointes PDF."""
    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM; msg["To"] = to_email; msg["Subject"] = subject
        msg.attach(MIMEText(body, "html", "utf-8"))
        for fn in file_names:
            fp = REPORTS_DIR / fn
            if fp.exists():
                with open(fp, "rb") as f:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(f.read())
                    encoders.encode_base64(part)
                    part.add_header("Content-Disposition", f'attachment; filename="{fn}"')
                    msg.attach(part)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.ehlo(); s.starttls(); s.login(SMTP_USER, SMTP_PASSWORD)
            s.sendmail(SMTP_USER, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[SMTP MULTI ERROR] {e}"); return False

def sanitize_for_json(obj):
    if isinstance(obj, dict): return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list): return [sanitize_for_json(i) for i in obj]
    elif isinstance(obj, (str, bool, int, float)) or obj is None: return obj
    return str(obj)

# ── PDF helpers ───────────────────────────────────────────────
def _pdf_styles():
    styles = getSampleStyleSheet()
    cyan = colors.HexColor("#4cc9f0")
    navy = colors.HexColor("#0D1B2A")
    return (
        styles,
        ParagraphStyle("title",   parent=styles["Heading1"], fontSize=20, textColor=navy, spaceAfter=6),
        ParagraphStyle("sub",     parent=styles["Normal"],   fontSize=10, textColor=colors.HexColor("#4A5568"), spaceAfter=16),
        ParagraphStyle("section", parent=styles["Heading2"], fontSize=13, textColor=cyan, spaceBefore=16, spaceAfter=8),
        ParagraphStyle("body",    parent=styles["Normal"],   fontSize=10, leading=16, textColor=navy),
        cyan, navy
    )

def _table_style(navy):
    return TableStyle([
        ("BACKGROUND", (0,0), (-1,0), navy),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 10),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#F7FAFB"), colors.white]),
        ("GRID",       (0,0), (-1,-1), 0.5, colors.HexColor("#E8EDF2")),
        ("PADDING",    (0,0), (-1,-1), 8),
    ])

def generate_leads_report_pdf(lists_data: list, leads_data: list) -> tuple[str, str]:
    """Génère un PDF du rapport leads (listes + prospects enrichis)."""
    file_id   = str(uuid.uuid4())[:8]
    file_name = f"rapport_leads_{file_id}.pdf"
    file_path = str(REPORTS_DIR / file_name)
    _, title_s, sub_s, section_s, body_s, cyan, navy = _pdf_styles()
    doc = SimpleDocTemplate(file_path, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    story = [
        Paragraph("Rapport Leads & Prospects", title_s),
        Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI (John)", sub_s),
        HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=16),
        Paragraph("Listes de leads", section_s),
    ]
    if lists_data:
        data = [["Nom de la liste", "Nombre de leads"]]
        for l in lists_data:
            data.append([str(l.get("name", "-")), str(l.get("leads_count", 0))])
        t = Table(data, colWidths=[12*cm, 5*cm])
        t.setStyle(_table_style(navy))
        story.append(t)
    else:
        story.append(Paragraph("Aucune liste de leads.", body_s))

    story.append(Spacer(1, 12))
    story.append(Paragraph("Leads enrichis récents", section_s))
    if leads_data:
        data2 = [["Nom", "Entreprise", "Poste", "Email"]]
        for l in leads_data[:20]:
            name = f"{l.get('first_name','')} {l.get('last_name','')}".strip() or "-"
            data2.append([name, str(l.get("company_name","-")), str(l.get("title","-")), str(l.get("email","-"))])
        t2 = Table(data2, colWidths=[4*cm, 5*cm, 4.5*cm, 5*cm])
        t2.setStyle(_table_style(navy))
        story.append(t2)
    else:
        story.append(Paragraph("Aucun lead enrichi.", body_s))

    doc.build(story)
    return file_name, file_path

def generate_campaigns_report_pdf(campaigns_data: list, stats_data: dict) -> tuple[str, str]:
    """Génère un PDF du rapport campagnes (bilan global + détail)."""
    file_id   = str(uuid.uuid4())[:8]
    file_name = f"rapport_campaigns_{file_id}.pdf"
    file_path = str(REPORTS_DIR / file_name)
    _, title_s, sub_s, section_s, body_s, cyan, navy = _pdf_styles()
    doc = SimpleDocTemplate(file_path, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    story = [
        Paragraph("Rapport Campagnes d'Outreach", title_s),
        Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI (John)", sub_s),
        HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=16),
        Paragraph("Bilan global", section_s),
    ]
    bilan = [
        ["Indicateur", "Valeur"],
        ["Total campagnes", str(stats_data.get("total_campaigns", 0))],
        ["Campagnes actives", str(stats_data.get("total_active_campaigns", 0))],
        ["Total contacts", str(stats_data.get("total_contacts", 0))],
        ["Emails envoyés", str(stats_data.get("total_emails_sent", 0))],
        ["Réponses reçues", str(stats_data.get("total_replies", 0))],
    ]
    t = Table(bilan, colWidths=[9*cm, 8*cm])
    t.setStyle(_table_style(navy))
    story.append(t)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Détail des campagnes", section_s))
    if campaigns_data:
        data2 = [["Nom", "Statut", "Contacts", "Emails envoyés"]]
        for c in campaigns_data:
            stats = c.get("statistics", {})
            data2.append([str(c.get("name","-")), str(c.get("status","-")),
                          str(stats.get("total_contacts", 0)), str(stats.get("total_emails_sent", 0))])
        t2 = Table(data2, colWidths=[7*cm, 4*cm, 3.5*cm, 4*cm])
        t2.setStyle(_table_style(navy))
        story.append(t2)
    else:
        story.append(Paragraph("Aucune campagne.", body_s))

    doc.build(story)
    return file_name, file_path

# ── Routing modèle ────────────────────────────────────────────
SIMPLE_PATTERNS = [
    r"^bonjour\s*!?$", r"^salut\s*!?$", r"^hey\s*!?$", r"^coucou\s*!?$",
    r"^hi\s*!?$", r"^merci\s*!?$", r"^ok\s*!?$", r"^d'accord\s*!?$",
    r"^au revoir\s*!?$", r"^bye\s*!?$", r"^ça va\s*\??$", r"^comment ça va\s*\??$",
]

def route_model(message: str) -> str:
    msg_clean = message.strip().lower()
    if any(re.match(p, msg_clean) for p in SIMPLE_PATTERNS) and len(msg_clean) < 30:
        return MODEL_HAIKU
    return MODEL_SONNET

# ── Contextes ─────────────────────────────────────────────────
CONTEXT_PROMPTS = {
    "john":        "",
    "prospecting": "\n\n[FOCUS PROSPECTING : concentre-toi sur les leads et listes de prospects. Appelle get_lead_lists() en priorité si l'historique est vide.]",
    "campaigns":   "\n\n[FOCUS CAMPAIGNS : concentre-toi sur les campagnes d'outreach. Appelle get_campaigns() en priorité si l'historique est vide.]",
}

# ── Tools ─────────────────────────────────────────────────────
TOOLS_PROSPECTING = [
    {"type":"function","function":{"name":"get_lead_lists","description":"Liste toutes les listes de leads (prospects) de la société","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_lead_list_details","description":"Détail d'une liste de leads spécifique, avec les leads qu'elle contient","parameters":{"type":"object","properties":{"list_id":{"type":"integer"}},"required":["list_id"]}}},
    {"type":"function","function":{"name":"get_leads","description":"Récupère les leads (prospects) enrichis de la société, avec filtres optionnels","parameters":{"type":"object","properties":{"search":{"type":"string"},"industry":{"type":"string"},"min_score":{"type":"number"},"per_page":{"type":"integer","default":20}}}}},
    {"type":"function","function":{"name":"get_prospecting_status","description":"Statut de la feature Prospecting pour la société","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"trigger_lead_enrichment","description":"Lance l'enrichissement approfondi (deep enrichment) d'une liste de leads via le workflow n8n","parameters":{"type":"object","properties":{"person_ids":{"type":"array","items":{"type":"string"}}},"required":["person_ids"]}}},
    {"type":"function","function":{"name":"generate_leads_report","description":"Génère un rapport PDF des leads (listes + prospects enrichis)","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"send_email","description":"Envoie un email avec signature John. Supporte plusieurs pièces jointes via file_names.","parameters":{"type":"object","properties":{"to_email":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"file_name":{"type":"string","default":""},"file_names":{"type":"array","items":{"type":"string"},"description":"Plusieurs PDFs en un email","default":[]}},"required":["to_email","subject","body"]}}},
]

TOOLS_CAMPAIGNS = [
    {"type":"function","function":{"name":"get_campaigns","description":"Liste les campagnes d'outreach/prospection par email","parameters":{"type":"object","properties":{"status":{"type":"string","enum":["draft","active","paused","completed","archived"]}}}}},
    {"type":"function","function":{"name":"get_campaign","description":"Détail complet d'une campagne d'outreach : contacts, statut d'envoi, statistiques","parameters":{"type":"object","properties":{"campaign_id":{"type":"integer"}},"required":["campaign_id"]}}},
    {"type":"function","function":{"name":"get_campaign_statistics","description":"Statistiques agrégées de toutes les campagnes : total, actives, contacts, emails envoyés, taux de réponse","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"update_campaign_status","description":"Active ou met en pause une campagne. Passer à 'active' déclenche l'envoi immédiat des emails dus.","parameters":{"type":"object","properties":{"campaign_id":{"type":"integer"},"status":{"type":"string","enum":["active","paused"]}},"required":["campaign_id","status"]}}},
    {"type":"function","function":{"name":"generate_campaigns_report","description":"Génère un rapport PDF des campagnes (statuts, statistiques, contacts, emails envoyés)","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"send_email","description":"Envoie un email avec signature John. Supporte plusieurs pièces jointes via file_names.","parameters":{"type":"object","properties":{"to_email":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"file_name":{"type":"string","default":""},"file_names":{"type":"array","items":{"type":"string"},"description":"Plusieurs PDFs en un email","default":[]}},"required":["to_email","subject","body"]}}},
]

TOOLS_ALL = TOOLS_PROSPECTING + [t for t in TOOLS_CAMPAIGNS if t["function"]["name"] not in {t2["function"]["name"] for t2 in TOOLS_PROSPECTING}]
TOOLS_BY_CONTEXT = {"john": TOOLS_ALL, "prospecting": TOOLS_PROSPECTING, "campaigns": TOOLS_CAMPAIGNS}

# ── execute_tool ──────────────────────────────────────────────
async def execute_tool(name: str, args: dict) -> dict:
    try:
        clean = {k: v for k, v in args.items() if v is not None}

        # ── Prospecting ───────────────────────────────────────
        if name == "get_lead_lists":
            result = await api.get_lead_lists()
        elif name == "get_lead_list_details":
            result = await api.get_lead_list_details(list_id=clean["list_id"])
        elif name == "get_leads":
            result = await api.get_leads(**clean)
        elif name == "get_prospecting_status":
            result = await api.get_prospecting_status()
        elif name == "trigger_lead_enrichment":
            result = await api.trigger_lead_enrichment(person_ids=clean["person_ids"])
        elif name == "generate_leads_report":
            if not REPORTLAB_OK:
                result = {"success": False, "error": "reportlab non installé"}
            else:
                lists_res = await api.get_lead_lists()
                leads_res = await api.get_leads(per_page=50)
                lists_data = lists_res.get("data", []) if lists_res.get("success") else []
                leads_data = leads_res.get("data", []) if leads_res.get("success") else []
                file_name, _ = generate_leads_report_pdf(lists_data, leads_data)
                result = {
                    "success": True, "file_name": file_name, "download_url": f"/reports/{file_name}",
                    "message": f"Rapport leads généré : {len(lists_data)} liste(s), {len(leads_data)} lead(s)."
                }

        # ── Campaigns ──────────────────────────────────────────
        elif name == "get_campaigns":
            result = await api.get_campaigns(**clean)
        elif name == "get_campaign":
            result = await api.get_campaign(campaign_id=clean["campaign_id"])
        elif name == "get_campaign_statistics":
            result = await api.get_campaign_statistics()
        elif name == "update_campaign_status":
            result = await api.update_campaign_status(campaign_id=clean["campaign_id"], status=clean["status"])
        elif name == "generate_campaigns_report":
            if not REPORTLAB_OK:
                result = {"success": False, "error": "reportlab non installé"}
            else:
                camps_res = await api.get_campaigns()
                stats_res = await api.get_campaign_statistics()
                camps_data = camps_res.get("data", []) if camps_res.get("success") else []
                stats_data = stats_res.get("data", {}) if stats_res.get("success") else {}
                file_name, _ = generate_campaigns_report_pdf(camps_data, stats_data)
                result = {
                    "success": True, "file_name": file_name, "download_url": f"/reports/{file_name}",
                    "message": f"Rapport campagnes généré : {len(camps_data)} campagne(s)."
                }

        # ── Email ────────────────────────────────────────────
        elif name == "send_email":
            to_email  = clean.get("to_email", "")
            subject   = clean.get("subject", "Message de John — Flugia")
            body_text = clean.get("body", "")
            file_names = clean.get("file_names", [])
            if not file_names and clean.get("file_name"):
                file_names = [clean["file_name"]]

            if not to_email:
                result = {"success": False, "error": "Adresse email manquante — demander au client son adresse"}
            else:
                html_body = (
                    f"<p>{body_text.replace(chr(10), '<br>')}</p>"
                    "<br><hr style='border:none;border-top:1px solid #E8EDF2;margin:20px 0'>"
                    "<p style='color:#8896A5;font-size:12px'>"
                    "<strong>John</strong> — AI Sales Manager<br>"
                    "Flugia · Propulsé par l'IA</p>"
                )
                if file_names:
                    missing = [fn for fn in file_names if not (REPORTS_DIR / fn).exists()]
                    if missing:
                        result = {"success": False, "error": f"Fichiers introuvables : {missing}"}
                    else:
                        success = send_email_multi_fn(to_email, subject, html_body, file_names)
                        result = {"success": success, "to_email": to_email, "attachments": file_names,
                                  "message": f"Email avec {len(file_names)} rapport(s) envoyé à {to_email}" if success else "Erreur SMTP"}
                else:
                    success = send_email_fn(to_email, subject, html_body)
                    result = {"success": success, "to_email": to_email,
                              "message": f"Email envoyé à {to_email}" if success else "Erreur SMTP"}

        else:
            result = {"error": f"Outil inconnu: {name}"}
        return sanitize_for_json(result)
    except Exception as e:
        return {"error": str(e), "tool": name}

# ── Request model ─────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    history: list = []
    context: str = "john"
    user_id: str = "default_user"
    conv_id: Optional[str] = None

# ── /chat ─────────────────────────────────────────────────────
@app.post("/chat")
async def chat(req: ChatRequest):
    async def generate() -> AsyncGenerator[str, None]:
        try:
            context = req.context if req.context in CONTEXT_PROMPTS else "john"
            tools   = TOOLS_BY_CONTEXT.get(context, TOOLS_ALL)
            today   = datetime.now().strftime("%A %d %B %Y")
            system  = JOHN_BASE_PROMPT + f"\n\n[DATE ACTUELLE : {today}]" + CONTEXT_PROMPTS.get(context, "")

            messages = [{"role": "system", "content": system}]
            for h in (req.history[-12:] if len(req.history) > 12 else req.history):
                if h.get("role") in ("user", "assistant") and h.get("content"):
                    messages.append({"role": h["role"], "content": h["content"]})
            messages.append({"role": "user", "content": req.message})

            selected = route_model(req.message)
            yield f"data: {json.dumps({'type': 'model_selected', 'model': selected})}\n"

            # ── Haiku : réponse directe ───────────────────────
            if selected == MODEL_HAIKU:
                stream = await client.chat.completions.create(
                    model=MODEL_HAIKU, messages=messages, max_tokens=400, stream=True)
                async for chunk in stream:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield f"data: {json.dumps({'type': 'token', 'text': delta.content})}\n"
                        await asyncio.sleep(0)
                yield f"data: {json.dumps({'type': 'done'})}\n"
                return

            # ── Sonnet : boucle agentique ─────────────────────
            MAX_ROUNDS = 5
            round_count = 0

            while round_count < MAX_ROUNDS:
                round_count += 1
                response = await client.chat.completions.create(
                    model=MODEL_SONNET, messages=messages, tools=tools,
                    tool_choice="auto", max_tokens=1500)
                message = response.choices[0].message

                if not message.tool_calls:
                    if message.content:
                        for word in message.content.split(" "):
                            yield f"data: {json.dumps({'type': 'token', 'text': word + ' '})}\n"
                            await asyncio.sleep(0.01)
                    break

                messages.append({"role": "assistant", "content": message.content,
                                  "tool_calls": [tc.model_dump() for tc in message.tool_calls]})

                for tc in message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_args = json.loads(tc.function.arguments or "{}")
                    except Exception:
                        tool_args = {}

                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name})}\n"
                    await asyncio.sleep(0)
                    result = await execute_tool(tool_name, tool_args)
                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name, 'data': result})}\n"
                    await asyncio.sleep(0)

                    messages.append({"role": "tool", "tool_call_id": tc.id,
                                      "content": json.dumps(sanitize_for_json(result), ensure_ascii=False)})
            else:
                final = await client.chat.completions.create(
                    model=MODEL_SONNET, messages=messages, max_tokens=1024, stream=True)
                async for chunk in final:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield f"data: {json.dumps({'type': 'token', 'text': delta.content})}\n"
                        await asyncio.sleep(0)

            yield f"data: {json.dumps({'type': 'done'})}\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ── Dashboard endpoints ───────────────────────────────────────
@app.get("/dashboard/sales")
async def dashboard_sales():
    try:
        lists     = await api.get_lead_lists()
        leads     = await api.get_leads(per_page=5)
        campaigns = await api.get_campaigns()
        stats     = await api.get_campaign_statistics()
        return {
            "success": True,
            "lead_lists": lists.get("data", []) if lists.get("success") else [],
            "leads": leads.get("data", []) if leads.get("success") else [],
            "campaigns": campaigns.get("data", []) if campaigns.get("success") else [],
            "stats": stats.get("data", {}) if stats.get("success") else {}
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/health")
async def health():
    return {"status": "ok", "agent": "John", "port": 8002}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("john:app", host="0.0.0.0", port=8002, reload=True)