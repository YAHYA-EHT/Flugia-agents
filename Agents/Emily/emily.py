"""
Emily Server — AI Support Manager @ Flugia
Port: 8001
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
    print("[Emily] ReportLab chargé ✓")
except ImportError as _rl_err:
    REPORTLAB_OK = False
    print(f"[Emily] ReportLab non disponible: {_rl_err}")

# ── Import api_client ─────────────────────────────────────────
from api_client import EmilyApiClient
api = EmilyApiClient()

# ── Chargement emily.md ───────────────────────────────────────
for _md in [pathlib.Path(__file__).parent/"skills"/"emily.md",
            pathlib.Path(__file__).parent/"emily.md"]:
    if _md.exists():
        with open(_md, "r", encoding="utf-8") as _f:
            EMILY_BASE_PROMPT = _f.read()
        break
else:
    EMILY_BASE_PROMPT = "Tu es Emily, l'AI Support Manager de Flugia."

# ── App ───────────────────────────────────────────────────────
app = FastAPI(title="Emily — AI Support Manager")
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
SMTP_FROM     = os.getenv("SMTP_FROM", "Emily — Flugia <emily@flugia.com>")

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

def generate_call_report_pdf(dashboard: dict, ratings, calls: list) -> tuple[str, str]:
    """Génère un PDF du rapport d'appels."""
    if not isinstance(calls, list): calls = []
    if not isinstance(ratings, list): ratings = []
    file_id   = str(uuid.uuid4())[:8]
    file_name = f"rapport_appels_{file_id}.pdf"
    file_path = str(REPORTS_DIR / file_name)
    _, title_s, sub_s, section_s, body_s, cyan, navy = _pdf_styles()
    doc = SimpleDocTemplate(file_path, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    story = [
        Paragraph("Rapport Agent Call", title_s),
        Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI", sub_s),
        HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=16),
        Paragraph("Statistiques globales", section_s),
    ]
    # Structure réelle: dashboard.analytics
    analytics = dashboard.get("analytics", {})
    agents    = dashboard.get("agents", [])
    phones    = dashboard.get("phone_numbers", [])
    data = [["Métrique", "Valeur"],
        ["Total appels",    str(analytics.get("total_calls", "—"))],
        ["Appels répondus", str(analytics.get("answered_calls", "—"))],
        ["Appels manqués",  str(analytics.get("missed_calls", "—"))],
        ["Durée moyenne",   f"{analytics.get('average_duration_seconds', analytics.get('average_duration', 0))} sec"],
        ["Agents actifs",   str(len(agents))],
        ["Numéros actifs",  str(len(phones))],
    ]
    t = Table(data, colWidths=[9*cm, 8*cm])
    t.setStyle(_table_style(navy))
    story.append(t); story.append(Spacer(1, 12))
    # Satisfaction — ratings est une liste de dicts
    if ratings:
        story.append(Paragraph("Satisfaction client", section_s))
        avg = sum(r.get("rating", 0) for r in ratings) / len(ratings)
        story.append(Paragraph(f"Note moyenne : {avg:.1f}/5 — {len(ratings)} avis", body_s))
        for r in ratings[:5]:
            name = r.get("customer_name", "Anonyme")
            note = r.get("rating", "—")
            text = str(r.get("feedback_text", ""))[:100]
            story.append(Paragraph(f"• {name} ({note}★) — {text}", body_s))
        story.append(Spacer(1, 8))
    # Appels récents — clés réelles: call_title, call_direction, duration_seconds, start_time
    if calls:
        story.append(Paragraph("Appels récents", section_s))
        call_data = [["Titre", "Direction", "Durée", "Date"]]
        for c in calls[:10]:
            dur = c.get("duration_seconds", 0) or 0
            dur_str = f"{dur//60}m{dur%60}s" if dur else "—"
            date = str(c.get("start_time", c.get("created_at", "—")))[:10]
            call_data.append([
                str(c.get("call_title", c.get("call_id", "—")))[:30],
                str(c.get("call_direction", "—")),
                dur_str, date
            ])
        tc = Table(call_data, colWidths=[7*cm, 3*cm, 3*cm, 4*cm])
        tc.setStyle(_table_style(navy))
        story.append(tc)
    doc.build(story)
    return file_name, file_path

def generate_chatbot_report_pdf(chatbots: list, stats_by_id: dict) -> tuple[str, str]:
    """Génère un PDF du rapport chatbots."""
    # S'assurer que chatbots est bien une liste
    if isinstance(chatbots, dict):
        chatbots = [chatbots]
    elif not isinstance(chatbots, list):
        chatbots = []
    file_id   = str(uuid.uuid4())[:8]
    file_name = f"rapport_chatbots_{file_id}.pdf"
    file_path = str(REPORTS_DIR / file_name)
    _, title_s, sub_s, section_s, body_s, cyan, navy = _pdf_styles()
    doc   = SimpleDocTemplate(file_path, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    story = []
    story.append(Paragraph("Rapport Chatbots", title_s))
    story.append(Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI", sub_s))
    story.append(HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=16))
    story.append(Paragraph(f"Total chatbots : {len(chatbots)}", body_s))
    story.append(Spacer(1, 12))
    for bot in chatbots:
        bot_id = bot.get("id")
        story.append(Paragraph(f"Chatbot : {bot.get('name', f'Bot #{bot_id}')}", section_s))
        info = [["Champ", "Valeur"],
                ["ID", str(bot_id)],
                ["Statut", str(bot.get("status", "—"))]]
        stats = stats_by_id.get(bot_id, {}).get("data", {})
        if stats:
            info.append(["Conversations", str(stats.get("total_conversations", "—"))])
            info.append(["Taux de résolution", f"{stats.get('resolution_rate', '—')}%"])
            info.append(["Satisfaction", f"{stats.get('satisfaction_rate', '—')}/5"])
        t = Table(info, colWidths=[7*cm, 10*cm])
        t.setStyle(_table_style(navy))
        story.append(t); story.append(Spacer(1, 10))
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
    "emily":      "",
    "chatbot":    "\n\n[FOCUS CHATBOT : concentre-toi sur les chatbots. Appelle get_chatbots() en priorité si l'historique est vide.]",
    "agent_call": "\n\n[FOCUS AGENT CALL : concentre-toi sur les agents vocaux et appels. Appelle get_call_dashboard() en priorité si l'historique est vide.]",
}

# ── Tools ─────────────────────────────────────────────────────
TOOLS_CHATBOT = [
    {"type":"function","function":{"name":"get_chatbots","description":"Liste tous les chatbots du compte avec leurs statuts et configurations","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_chatbot","description":"Détails complets d'un chatbot (configuration, statut, langue, ton)","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"get_chatbot_statistics","description":"KPIs d'un chatbot : taux de résolution, satisfaction, escalades, conversations totales","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"get_chatbot_history","description":"Historique des conversations d'un chatbot via son token public","parameters":{"type":"object","properties":{"public_token":{"type":"string"}},"required":["public_token"]}}},
    {"type":"function","function":{"name":"get_chatbot_script","description":"Script et prompt système actuel d'un chatbot","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"get_chatbot_files","description":"Fichiers de connaissance attachés à un chatbot (FAQ, docs, guides)","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"get_chatbot_notifications","description":"Notifications chatbot : escalades vers humain, nouvelles conversations, alertes","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"mark_chatbot_notification_read","description":"Marque une notification chatbot comme lue","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"retry_chatbot","description":"Relance un chatbot en erreur ou failed — à utiliser quand le statut est failed/error","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"retry_chatbot_scraping","description":"Relance le scraping du site web pour réinitialiser la base de connaissance du chatbot","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"generate_chatbot_report","description":"Génère un rapport PDF complet de tous les chatbots avec leurs statistiques","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"generate_conversation_pdf","description":"Génère un PDF de n'importe quel contenu — conversation, résumé, analyse, liste. Ne jamais refuser une demande de PDF. Générer SANS interruption.","parameters":{"type":"object","properties":{"title":{"type":"string"},"content":{"type":"string"}},"required":["title","content"]}}},
    {"type":"function","function":{"name":"generate_support_report","description":"Génère un rapport PDF complet Support combinant Chatbots ET Agent Call. Générer SANS interruption dès que demandé.","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"send_email","description":"Envoie un email avec signature Emily. Supporte plusieurs pièces jointes via file_names.","parameters":{"type":"object","properties":{"to_email":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"file_name":{"type":"string","default":""},"file_names":{"type":"array","items":{"type":"string"},"description":"Plusieurs PDFs en un email","default":[]}},"required":["to_email","subject","body"]}}},
    {"type":"function","function":{"name":"handoff_to_agent","description":"Redirige le client vers David (Marketing) avec un brief complet. Utiliser quand le client demande quelque chose de Marketing (SEO, réputation, LinkedIn, article). Consulter les données disponibles puis appeler cet outil avec un brief riche.","parameters":{"type":"object","properties":{"agent":{"type":"string","enum":["david"],"description":"Agent vers qui rediriger"},"client_request":{"type":"string","description":"Ce que le client veut exactement"},"context_summary":{"type":"string","description":"Résumé du contexte Support utile pour David"},"action_required":{"type":"string","description":"Ce que David doit faire en premier"}},"required":["agent","client_request","action_required"]}}},
]

TOOLS_AGENT_CALL = [
    {"type":"function","function":{"name":"get_agents","description":"Liste tous les agents vocaux (inbound et outbound) avec leurs configurations","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_agent","description":"Détails complets d'un agent vocal (type, langue, base de connaissance, numéro)","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"get_call_dashboard","description":"Dashboard principal : total appels, répondus, manqués, durée moyenne, balance de minutes — TOUJOURS appeler en premier pour une vue globale","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_call_dashboard_ratings","description":"Ratings et satisfaction client post-appel (note moyenne, total avis, tendance)","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_call_dashboard_calls","description":"Liste des appels récents avec statuts (completed/missed/failed/busy), durées et numéros","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_call_dashboard_call","description":"Détails complets d'un appel spécifique (transcript partiel, durée, statut, feedback)","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"get_call_analytics","description":"Analytics détaillées des appels par période (taux de décroché, durée moyenne, pics d'activité)","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_call_transcripts","description":"Liste des transcriptions d'appels disponibles avec métadonnées","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_call_transcript","description":"Transcription complète d'un appel — toujours utiliser l'ID exact de l'appel","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"get_customer_feedback","description":"Retours clients post-appel : note, commentaire, date, agent concerné","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_balance_transactions","description":"Historique des transactions de balance (minutes utilisées par appel, recharges effectuées)","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_phone_numbers","description":"Numéros de téléphone actifs du compte avec leurs assignations","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_available_phone_numbers","description":"Numéros de téléphone disponibles à l'achat","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_knowledge_bases","description":"Bases de connaissances disponibles pour les agents (contenu, date de mise à jour)","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_agent_tasks","description":"Tâches agents en attente : callbacks planifiés, follow-ups, actions post-appel","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_agent_task","description":"Détail complet d'une tâche agent","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"create_agent_task","description":"Crée une nouvelle tâche pour un agent (callback, follow-up, rappel)","parameters":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"agent_id":{"type":"integer"},"priority":{"type":"string","enum":["low","medium","high"]},"due_date":{"type":"string","description":"Date ISO8601"}},"required":["title","description","agent_id"]}}},
    {"type":"function","function":{"name":"mark_agent_task_read","description":"Marque une tâche agent comme traitée/lue","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"get_booked_meetings","description":"Réunions bookées via les agents avec statuts, participants et liens Google Meet","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"get_booked_meeting","description":"Détail complet d'une réunion bookée","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"check_availability","description":"Vérifie la disponibilité pour un créneau de réunion","parameters":{"type":"object","properties":{"date":{"type":"string","description":"Date ISO8601"},"duration_minutes":{"type":"integer","default":30}},"required":["date"]}}},
    {"type":"function","function":{"name":"get_agent_call_notifications","description":"Notifications agents vocaux : appels manqués, tâches urgentes, alertes de balance","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"mark_agent_call_notification_read","description":"Marque une notification agent call comme lue","parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
    {"type":"function","function":{"name":"generate_call_report","description":"Génère un rapport PDF téléchargeable des appels (dashboard + ratings + appels récents)","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"generate_support_report","description":"Génère un rapport PDF complet Support combinant Chatbots ET Agent Call. Générer SANS interruption dès que demandé.","parameters":{"type":"object","properties":{}}}},
    {"type":"function","function":{"name":"send_email","description":"Envoie un email avec signature Emily. Supporte plusieurs pièces jointes via file_names.","parameters":{"type":"object","properties":{"to_email":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"file_name":{"type":"string","default":""},"file_names":{"type":"array","items":{"type":"string"},"description":"Plusieurs PDFs en un email","default":[]}},"required":["to_email","subject","body"]}}},
    {"type":"function","function":{"name":"handoff_to_agent","description":"Redirige le client vers David (Marketing) avec un brief complet. Utiliser quand le client demande quelque chose de Marketing (SEO, réputation, LinkedIn, article). Consulter les données disponibles puis appeler cet outil avec un brief riche.","parameters":{"type":"object","properties":{"agent":{"type":"string","enum":["david"],"description":"Agent vers qui rediriger"},"client_request":{"type":"string","description":"Ce que le client veut exactement"},"context_summary":{"type":"string","description":"Résumé du contexte Support utile pour David"},"action_required":{"type":"string","description":"Ce que David doit faire en premier"}},"required":["agent","client_request","action_required"]}}},
]

TOOLS_ALL = TOOLS_CHATBOT + [t for t in TOOLS_AGENT_CALL if t["function"]["name"] not in {t2["function"]["name"] for t2 in TOOLS_CHATBOT}]
TOOLS_BY_CONTEXT = {"emily": TOOLS_ALL, "chatbot": TOOLS_CHATBOT, "agent_call": TOOLS_AGENT_CALL}

# ── execute_tool ──────────────────────────────────────────────
async def execute_tool(name: str, args: dict) -> dict:
    try:
        clean = {k: v for k, v in args.items() if v is not None}

        # ── Chatbot ───────────────────────────────────────────
        if name == "get_chatbots":
            result = await api.get_chatbots()
            # L'API peut retourner un dict (1 chatbot) ou une liste — on normalise
            if result.get("success") and isinstance(result.get("data"), dict):
                result["data"] = [result["data"]]
            elif result.get("success") and result.get("data") is None:
                result["data"] = []
        elif name == "get_chatbot":
            result = await api.get_chatbot(clean["id"])
        elif name == "get_chatbot_statistics":
            result = await api.get_chatbot_statistics(clean["id"])
            if not result.get("success"):
                # Endpoint pas disponible sur ce compte — on récupère les infos depuis le chatbot
                bot = await api.get_chatbot(clean["id"])
                result = {
                    "success": True,
                    "info": "Statistiques détaillées non disponibles sur ce compte — données de base du chatbot",
                    "data": {
                        "name": bot.get("data", {}).get("name"),
                        "status": bot.get("data", {}).get("status"),
                        "files_count": len(bot.get("data", {}).get("files_manifest", [])),
                    }
                }
        elif name == "get_chatbot_history":
            public_token = clean.get("public_token")
            if not public_token:
                # Récupérer le token depuis le chatbot
                bot = await api.get_chatbots()
                data = bot.get("data", {})
                if isinstance(data, dict):
                    public_token = data.get("public_token")
                elif isinstance(data, list) and data:
                    public_token = data[0].get("public_token")
            if not public_token:
                return {"success": False, "error": "Token public du chatbot introuvable"}
            result = await api.get_chatbot_history(public_token)
            # Enrichir avec résumé
            if result.get("success") and result.get("data"):
                sessions = result["data"]
                total_msgs = sum(s.get("messages_count", 0) for s in sessions)
                result["summary"] = {
                    "total_sessions": len(sessions),
                    "total_messages": total_msgs,
                    "latest_session": sessions[0].get("started_at") if sessions else None
                }
        elif name == "get_chatbot_script":
            result = await api.get_chatbot_script(clean["id"])
        elif name == "get_chatbot_files":
            result = await api.get_chatbot_files(clean["id"])
        elif name == "get_chatbot_notifications":
            result = await api.get_chatbot_notifications()
        elif name == "mark_chatbot_notification_read":
            result = await api.mark_chatbot_notification_read(clean["id"])
        elif name == "retry_chatbot":
            result = await api.retry_chatbot(clean["id"])
            if result.get("success"):
                result["info"] = "Chatbot relancé — initialisation en cours (2-5 minutes). Vérifie le statut ensuite."
        elif name == "retry_chatbot_scraping":
            result = await api.retry_chatbot_scraping(clean["id"])
            if result.get("success"):
                result["info"] = "Re-scraping du site web lancé — la base de connaissance sera mise à jour dans quelques minutes."
        elif name == "generate_call_report":
            if not REPORTLAB_OK:
                return {"error": "ReportLab non installé — pip install reportlab"}
            dash_r    = await api.get_call_dashboard()
            ratings_r = await api.get_call_dashboard_ratings()
            calls_r   = await api.get_call_dashboard_calls()
            dashboard = dash_r.get("data", {}) if isinstance(dash_r, dict) and dash_r.get("success") else {}
            ratings   = ratings_r.get("data", []) if isinstance(ratings_r, dict) and ratings_r.get("success") else []
            if not isinstance(ratings, list): ratings = []
            raw = calls_r.get("data", {}) if isinstance(calls_r, dict) and calls_r.get("success") else {}
            nested = raw.get("calls", {}) if isinstance(raw, dict) else {}
            calls  = nested.get("data", []) if isinstance(nested, dict) else []
            calls  = calls[:10]
            file_name, _ = generate_call_report_pdf(dashboard, ratings, calls)
            result = {"success": True, "download_url": f"/reports/{file_name}", "file_name": file_name}

        elif name == "generate_chatbot_report":
            if not REPORTLAB_OK:
                return {"error": "ReportLab non installé — pip install reportlab"}
            chatbots_r = await api.get_chatbots()
            print(f"[DEBUG generate_chatbot_report] chatbots_r: {chatbots_r}")
            chatbots   = chatbots_r.get("data", []) if chatbots_r.get("success") else []
            print(f"[DEBUG generate_chatbot_report] chatbots type: {type(chatbots)}, value: {chatbots}")
            if isinstance(chatbots, dict):
                chatbots = [chatbots]
            stats_by_id = {}
            for bot in chatbots[:5]:
                bid = bot.get("id")
                if bid:
                    try:
                        stats_by_id[bid] = await api.get_chatbot_statistics(bid)
                    except Exception as e:
                        print(f"[DEBUG] stats error for {bid}: {e}")
            try:
                file_name, _ = generate_chatbot_report_pdf(chatbots, stats_by_id)
                result = {"success": True, "download_url": f"/reports/{file_name}", "file_name": file_name,
                          "chatbots_count": len(chatbots)}
            except Exception as pdf_err:
                print(f"[DEBUG PDF ERROR] {pdf_err}")
                import traceback; traceback.print_exc()
                result = {"error": str(pdf_err)}

        # ── Agent Call ────────────────────────────────────────
        elif name == "get_agents":
            result = await api.get_agents()
        elif name == "get_agent":
            result = await api.get_agent(clean["id"])
        elif name == "get_call_dashboard":
            result = await api.get_call_dashboard()
            if not result.get("success"):
                return {"success": False, "info": "Dashboard Agent Call non disponible sur ce compte — feature pas encore activée. Contacte l'équipe Flugia pour l'activer."}
            # Enrichir avec alertes automatiques
            if result.get("data"):
                d = result["data"]
                total   = d.get("total_calls", 0)
                missed  = d.get("missed_calls", 0)
                balance = d.get("balance", {}).get("minutes", 999)
                alerts  = []
                if total > 0 and missed / total > 0.25:
                    alerts.append(f"ALERTE : {missed}/{total} appels manqués ({round(missed/total*100)}%)")
                if balance < 100:
                    alerts.append(f"ALERTE BALANCE : {balance} minutes restantes")
                if alerts:
                    result["alerts"] = alerts
        elif name == "get_call_dashboard_ratings":
            result = await api.get_call_dashboard_ratings()
            if result.get("success") and result.get("data"):
                data = result["data"]
                # L'API retourne une liste de ratings ou un dict
                if isinstance(data, list):
                    if data:
                        avg = sum(r.get("rating", 0) for r in data) / len(data)
                        result["average"] = round(avg, 1)
                        result["total"]   = len(data)
                        if avg < 3:
                            result["alert"] = f"CRITIQUE : satisfaction à {avg:.1f}/5"
                        elif avg < 4:
                            result["alert"] = f"ALERTE : satisfaction à {avg:.1f}/5"
                elif isinstance(data, dict):
                    avg = data.get("average", 5)
                    if avg < 3:
                        result["alert"] = f"CRITIQUE : satisfaction à {avg}/5"
                    elif avg < 4:
                        result["alert"] = f"ALERTE : satisfaction à {avg}/5"
        elif name == "get_call_dashboard_calls":
            result = await api.get_call_dashboard_calls()
            if result.get("success") and result.get("data"):
                calls   = result["data"]
                missed  = [c for c in calls if c.get("status") in ("missed", "no-answer")]
                failed  = [c for c in calls if c.get("status") == "failed"]
                if missed:
                    result["missed_count"] = len(missed)
                    result["missed_calls"] = missed[:5]
                if failed:
                    result["failed_count"] = len(failed)
        elif name == "get_call_dashboard_call":
            result = await api.get_call_dashboard_call(clean["id"])
        elif name == "get_call_analytics":
            result = await api.get_call_analytics()
        elif name == "get_call_transcripts":
            result = await api.get_call_transcripts()
        elif name == "get_call_transcript":
            result = await api.get_call_transcript(clean["id"])
            # Ajouter résumé auto si transcription longue
            if result.get("success") and result.get("data"):
                transcript = result["data"].get("transcript", "")
                if transcript and len(transcript) > 2000:
                    result["info"] = "Transcription longue — résumé des points clés recommandé avant partage par email."
        elif name == "get_customer_feedback":
            result = await api.get_customer_feedback()
            if result.get("success") and result.get("data"):
                feedbacks = result["data"]
                critical  = [f for f in feedbacks if isinstance(f.get("rating"), (int, float)) and f["rating"] <= 2]
                if critical:
                    result["critical_feedback"] = critical[:3]
                    result["alert"] = f"{len(critical)} retours critiques (note ≤ 2/5) — suivi prioritaire requis"
        elif name == "get_balance_transactions":
            result = await api.get_balance_transactions()
        elif name == "get_phone_numbers":
            result = await api.get_phone_numbers()
        elif name == "get_available_phone_numbers":
            result = await api.get_available_phone_numbers()
        elif name == "get_knowledge_bases":
            result = await api.get_knowledge_bases()
        elif name == "get_agent_tasks":
            result = await api.get_agent_tasks()
            if result.get("success") and result.get("data"):
                tasks    = result["data"]
                high     = [t for t in tasks if t.get("priority") == "high"]
                overdue  = [t for t in tasks if t.get("due_date") and t["due_date"] < datetime.now().isoformat()]
                if high:
                    result["high_priority_count"] = len(high)
                if overdue:
                    result["overdue_count"] = len(overdue)
                    result["alert"] = f"{len(overdue)} tâche(s) en retard — action immédiate requise"
        elif name == "get_agent_task":
            result = await api.get_agent_task(clean["id"])
        elif name == "create_agent_task":
            result = await api.create_agent_task(clean)
            if result.get("success"):
                result["info"] = f"Tâche créée avec priorité {clean.get('priority', 'medium')}."
        elif name == "mark_agent_task_read":
            result = await api.mark_agent_task_read(clean["id"])
        elif name == "get_booked_meetings":
            result = await api.get_booked_meetings()
            if result.get("success") and result.get("data"):
                meetings     = result["data"]
                without_meet = [m for m in meetings if not m.get("meet_link")]
                if without_meet:
                    result["without_meet_link"] = len(without_meet)
                    result["info"] = f"{len(without_meet)} réunion(s) sans lien Google Meet — utilise generate_meet_link pour les créer."
        elif name == "get_booked_meeting":
            result = await api.get_booked_meeting(clean["id"])
        elif name == "check_availability":
            result = await api.check_availability(clean)
        elif name == "get_agent_call_notifications":
            result = await api.get_agent_call_notifications()
        elif name == "mark_agent_call_notification_read":
            result = await api.mark_agent_call_notification_read(clean["id"])

        elif name == "generate_conversation_pdf":
            if not REPORTLAB_OK:
                result = {"error": "ReportLab non installé"}
            else:
                title_text   = clean.get("title", "Document Flugia")
                content_text = clean.get("content", "")
                file_id   = str(uuid.uuid4())[:8]
                file_name = f"document_{file_id}.pdf"
                file_path = str(REPORTS_DIR / file_name)
                _, title_s, sub_s, _, body_s, cyan, navy = _pdf_styles()
                doc = SimpleDocTemplate(file_path, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
                story = [
                    Paragraph(title_text, title_s),
                    Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI · Emily", sub_s),
                    HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=14),
                ]
                for para in content_text.split("\n"):
                    para = para.strip()
                    if para:
                        story.append(Paragraph(para.replace("•", "–"), body_s))
                        story.append(Spacer(1, 4))
                doc.build(story)
                result = {"success": True, "download_url": f"/reports/{file_name}",
                          "file_name": file_name, "title": title_text}

        elif name == "generate_support_report":
            if not REPORTLAB_OK:
                return {"error": "ReportLab non installé — pip install reportlab"}
            # Récupérer données chatbot
            chatbots_r = await api.get_chatbots()
            chatbots = chatbots_r.get("data", []) if chatbots_r.get("success") else []
            if isinstance(chatbots, dict): chatbots = [chatbots]
            # Récupérer données agent call
            dash_r    = await api.get_call_dashboard()
            ratings_r = await api.get_call_dashboard_ratings()
            calls_r   = await api.get_call_dashboard_calls()
            dashboard = dash_r.get("data", {}) if isinstance(dash_r, dict) and dash_r.get("success") else {}
            ratings   = ratings_r.get("data", {}) if isinstance(ratings_r, dict) and ratings_r.get("success") else {}
            raw_calls = calls_r.get("data", {}) if isinstance(calls_r, dict) and calls_r.get("success") else {}
            if isinstance(raw_calls, dict):
                calls = raw_calls.get("calls", {}).get("data", []) or raw_calls.get("data", []) or []
            elif isinstance(raw_calls, list):
                calls = raw_calls
            else:
                calls = []
            calls = calls[:5]

            file_id   = str(uuid.uuid4())[:8]
            file_name = f"rapport_support_complet_{file_id}.pdf"
            file_path = str(REPORTS_DIR / file_name)

            _, title_s, sub_s, section_s, body_s, cyan, navy = _pdf_styles()
            doc   = SimpleDocTemplate(file_path, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
            story = [
                Paragraph("Rapport Support Complet", title_s),
                Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI", sub_s),
                HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=14),
                # Section Chatbots
                Paragraph("Chatbots", section_s),
                Paragraph(f"Total chatbots : {len(chatbots)}", body_s),
                Spacer(1, 6),
            ]
            for bot in chatbots:
                bot_name = bot.get('name', f"Bot #{bot.get('id')}")
                story.append(Paragraph(f"• {bot_name} — statut : {bot.get('status','—')}", body_s))
            story.append(Spacer(1, 12))
            # Section Agent Call
            story.append(Paragraph("Agent Call", section_s))
            call_data = [["Métrique", "Valeur"],
                ["Total appels", str(dashboard.get("total_calls", "—"))],
                ["Appels répondus", str(dashboard.get("answered_calls", "—"))],
                ["Appels manqués", str(dashboard.get("missed_calls", "—"))],
                ["Durée moyenne", f"{dashboard.get('average_duration', 0)} sec"],
                ["Balance restante", f"{dashboard.get('balance', {}).get('minutes', '—')} min"],
                ["Satisfaction", f"{ratings.get('average', '—')}/5" if ratings else "—"],
            ]
            t = Table(call_data, colWidths=[9*cm, 8*cm])
            t.setStyle(_table_style(navy))
            story.append(t)
            if calls:
                story.append(Spacer(1, 8))
                story.append(Paragraph("Appels récents", section_s))
                rows = [["ID", "Statut", "Durée"]]
                for c in (calls if isinstance(calls, list) else []):
                    rows.append([str(c.get("id","—")), str(c.get("status","—")), f"{c.get('duration',0)}s"])
                tc = Table(rows, colWidths=[3*cm, 6*cm, 8*cm])
                tc.setStyle(_table_style(navy))
                story.append(tc)
            doc.build(story)
            result = {"success": True, "download_url": f"/reports/{file_name}",
                      "file_name": file_name, "sections": ["chatbot", "agent_call"]}
            if not REPORTLAB_OK:
                return {"error": "ReportLab non installé — pip install reportlab"}
            dash_r    = await api.get_call_dashboard()
            ratings_r = await api.get_call_dashboard_ratings()
            calls_r   = await api.get_call_dashboard_calls()
            dashboard = dash_r.get("data", {}) if isinstance(dash_r, dict) and dash_r.get("success") else {}
            ratings   = ratings_r.get("data", {}) if isinstance(ratings_r, dict) and ratings_r.get("success") else {}
            # L'API retourne data.calls.data (paginé) ou data directement
            # Structure réelle: data.calls.data (liste) et data.statistics
            raw = calls_r.get("data", {}) if isinstance(calls_r, dict) and calls_r.get("success") else {}
            calls = []
            if isinstance(raw, dict):
                nested = raw.get("calls", {})
                if isinstance(nested, dict):
                    calls = nested.get("data", [])
                elif isinstance(nested, list):
                    calls = nested
            elif isinstance(raw, list):
                calls = raw
            calls = calls[:10]

            # Enrichir dashboard avec les stats de l'appel
            stats = raw.get("statistics", {}) if isinstance(raw, dict) else {}
            if stats:
                dashboard["call_statistics"] = stats

            file_name, _ = generate_call_report_pdf(dashboard, ratings, calls)
            result = {"success": True, "download_url": f"/reports/{file_name}", "file_name": file_name}

        elif name == "send_email":
            to_email  = clean.get("to_email", "")
            subject   = clean.get("subject", "Message d'Emily — Flugia")
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
                    "<strong>Emily</strong> — AI Support Manager<br>"
                    "Flugia · Propulsé par l'IA</p>"
                )
                if file_names:
                    missing = [fn for fn in file_names if not (REPORTS_DIR / fn).exists()]
                    if missing:
                        result = {"success": False, "error": f"Fichiers introuvables : {missing}"}
                    else:
                        success = send_email_multi_fn(to_email, subject, html_body, file_names)
                        result = {"success": success, "to_email": to_email,
                                  "attachments": file_names,
                                  "message": f"Email avec {len(file_names)} rapport(s) envoyé à {to_email}" if success else "Erreur SMTP"}
                else:
                    success = send_email_fn(to_email, subject, html_body)
                    result = {"success": success, "to_email": to_email,
                              "message": f"Email envoyé à {to_email}" if success else "Erreur SMTP"}

        elif name == "handoff_to_agent":
            agent           = clean.get("agent", "david")
            client_request  = clean.get("client_request", "")
            context_summary = clean.get("context_summary", "")
            action_required = clean.get("action_required", "")
            lines = [
                "[CONTEXTE EMILY]",
                "",
                "Demande du client :",
                client_request,
            ]
            if context_summary:
                lines += ["", "Contexte (Emily) :", context_summary]
            lines += [
                "",
                "Action immediate :",
                action_required,
            ]
            result = {
                "success": True,
                "handoff": True,
                "agent": agent,
                "brief": "\n".join(lines),
            }

        else:
            result = {"error": f"Outil inconnu: {name}"}

        return sanitize_for_json(result)

    except Exception as e:
        import traceback; traceback.print_exc()
        return {"error": str(e), "tool": name}

# ── Request model ─────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    history: list = []
    context: str = "emily"
    user_id: str = "default_user"
    conv_id: Optional[str] = None

# ── /chat ─────────────────────────────────────────────────────
@app.post("/chat")
async def chat(req: ChatRequest):
    async def generate() -> AsyncGenerator[str, None]:
        try:
            context = req.context if req.context in CONTEXT_PROMPTS else "emily"
            tools   = TOOLS_BY_CONTEXT.get(context, TOOLS_ALL)
            today   = datetime.now().strftime("%A %d %B %Y")
            system  = EMILY_BASE_PROMPT + f"\n\n[DATE ACTUELLE : {today}]" + CONTEXT_PROMPTS.get(context, "")

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
                    if result.get("handoff"):
                        yield f"data: {json.dumps({'type': 'handoff', 'agent': result.get('agent'), 'brief': result.get('brief', '')})}\n"
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
@app.get("/dashboard/chatbot")
async def dashboard_chatbot():
    try:
        chatbots_raw = await api.get_chatbots()
        # Normaliser : l'API retourne parfois un dict (1 chatbot) au lieu d'une liste
        if isinstance(chatbots_raw.get("data"), dict):
            chatbots = [chatbots_raw["data"]]
        elif isinstance(chatbots_raw.get("data"), list):
            chatbots = chatbots_raw["data"]
        else:
            chatbots = []
        notifs   = await api.get_chatbot_notifications()
        return {"success": True,
                "chatbots": chatbots,
                "notifications": notifs.get("data", []) if isinstance(notifs, dict) else []}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/dashboard/agent-call")
async def dashboard_agent_call():
    try:
        dash    = await api.get_call_dashboard()
        ratings = await api.get_call_dashboard_ratings()
        calls   = await api.get_call_dashboard_calls()
        return {"success": True,
                "dashboard":    dash.get("data", {}) if isinstance(dash, dict) else {},
                "ratings":      ratings.get("data", {}) if isinstance(ratings, dict) else {},
                "recent_calls": (
                    calls.get("data", {}).get("calls", {}).get("data", []) or
                    calls.get("data", []) if isinstance(calls.get("data"), list)
                    else []
                )[:5]}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/health")
async def health():
    return {"status": "ok", "agent": "Emily", "port": 8001}