"""
chat_server.py — Serveur FastAPI pour David (streaming SSE) — via OpenRouter
Lance avec : uvicorn chat_server:app --reload --port 8000

Architecture cout :
  - Routing automatique Haiku 4.5 / Sonnet 4.6 selon la complexite de la question
  - Modeles Anthropic accedes via OpenRouter (pas besoin de cle Anthropic directe)
  - Pas d'Opus : Sonnet 4.6 couvre tous les cas
"""

import asyncio
import json
import os
import re
import sys
import uuid
import pathlib
import sqlite3
import threading
from datetime import datetime
try:
    import tiktoken
    _enc = tiktoken.get_encoding("cl100k_base")
    def count_tokens(text: str) -> int:
        return len(_enc.encode(str(text)))
except Exception:
    def count_tokens(text: str) -> int:
        return len(str(text)) // 4  # fallback approximation

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    REPORTLAB_OK = True
except ImportError:
    REPORTLAB_OK = False
from typing import AsyncGenerator, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from fastapi.responses import HTMLResponse

sys.path.append(os.path.dirname(__file__))
# Charger .env depuis le dossier de l'agent
import pathlib as _pl
for _ep in [_pl.Path(__file__).parent/'.env', _pl.Path(__file__).parent.parent/'.env', _pl.Path('.env')]:
    if _ep.exists():
        load_dotenv(dotenv_path=str(_ep)); break
else:
    load_dotenv()

# Dossier pour stocker les rapports générés (téléchargeables)
REPORTS_DIR = pathlib.Path(__file__).parent / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

def sanitize_for_json(obj):
    """Nettoie récursivement un objet pour qu'il soit sérialisable en JSON propre."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(i) for i in obj]
    elif isinstance(obj, str):
        # Supprimer les caractères de contrôle sauf newline/tab
        cleaned = ''.join(c for c in obj if ord(c) >= 32 or c in '\n\t\r')
        return cleaned
    else:
        return obj

# ── Session Manager (SQLite) ─────────────────────────────────
DB_PATH = pathlib.Path(__file__).parent / "sessions.db"
_db_lock = threading.Lock()

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                conv_id    TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL,
                agent      TEXT NOT NULL DEFAULT 'david',
                context    TEXT NOT NULL DEFAULT 'david',
                title      TEXT NOT NULL DEFAULT 'Nouvelle conversation',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                conv_id     TEXT NOT NULL,
                role        TEXT NOT NULL,
                content     TEXT NOT NULL,
                timestamp   TEXT NOT NULL,
                token_count INTEGER DEFAULT 0,
                FOREIGN KEY (conv_id) REFERENCES conversations(conv_id)
            )
        """)
        conn.commit()

init_db()

def new_conv_id() -> str:
    return str(uuid.uuid4())[:8]

def generate_title(first_user_message: str) -> str:
    """Génère un titre court depuis le premier message utilisateur."""
    # Truncate and clean
    title = first_user_message.strip()[:60]
    if len(first_user_message) > 60:
        title += "..."
    return title or "Nouvelle conversation"

TOKEN_THRESHOLD = 6000   # compacter au-delà de ce seuil
KEEP_LAST_N    = 4       # garder les N derniers messages intacts

def get_session_id(user_id: str, context: str) -> str:
    return f"{user_id}_{context}"

def load_history(user_id: str, context: str, conv_id: str = None) -> list:
    """Charge l'historique d'une conversation spécifique.
    Sans conv_id → retourne liste vide (nouvelle conversation propre).
    """
    if not conv_id:
        return []
    with get_db() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE conv_id=? ORDER BY id",
            (conv_id,)
        ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in rows]

def list_conversations(user_id: str, context: str = None) -> list:
    """Liste toutes les conversations d'un utilisateur, groupées par date."""
    with get_db() as conn:
        query = "SELECT conv_id, context, title, created_at, updated_at FROM conversations WHERE user_id=?"
        params = [user_id]
        if context:
            query += " AND context=?"
            params.append(context)
        query += " ORDER BY updated_at DESC"
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]

def get_active_conv_id(user_id: str, context: str) -> str:
    """Retourne l'ID de la conversation active, ou None."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT conv_id FROM conversations WHERE user_id=? AND context=? ORDER BY updated_at DESC LIMIT 1",
            (user_id, context)
        ).fetchone()
    return row["conv_id"] if row else None

def save_messages(user_id: str, context: str, messages: list, conv_id: str = None):
    """Sauvegarde les messages dans une conversation.
    Si conv_id fourni → ajoute dans cette conversation.
    Si conv_id absent → crée TOUJOURS une nouvelle conversation (jamais de fusion avec l'existant).
    """
    now = datetime.now().isoformat()
    with _db_lock:
        with get_db() as conn:
            if not conv_id:
                # Pas de conv_id → nouvelle conversation obligatoire
                conv_id = new_conv_id()
                first_user = next((m["content"] for m in messages if m["role"] == "user"), "Nouvelle conversation")
                title = generate_title(first_user)
                conn.execute(
                    "INSERT INTO conversations (conv_id, user_id, agent, context, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                    (conv_id, user_id, "david", context, title, now, now)
                )
                # Insérer tous les messages
                for msg in messages:
                    tokens = count_tokens(msg["content"])
                    conn.execute(
                        "INSERT INTO messages (conv_id, role, content, timestamp, token_count) VALUES (?,?,?,?,?)",
                        (conv_id, msg["role"], msg["content"], now, tokens)
                    )
            else:
                # conv_id connu → vérifier qu'elle existe, sinon la créer
                row = conn.execute("SELECT conv_id FROM conversations WHERE conv_id=?", (conv_id,)).fetchone()
                if not row:
                    first_user = next((m["content"] for m in messages if m["role"] == "user"), "Nouvelle conversation")
                    title = generate_title(first_user)
                    conn.execute(
                        "INSERT INTO conversations (conv_id, user_id, agent, context, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                        (conv_id, user_id, "david", context, title, now, now)
                    )
                # Compter les messages existants et insérer uniquement les nouveaux
                existing = conn.execute(
                    "SELECT COUNT(*) as cnt FROM messages WHERE conv_id=?", (conv_id,)
                ).fetchone()["cnt"]
                for msg in messages[existing:]:
                    tokens = count_tokens(msg["content"])
                    conn.execute(
                        "INSERT INTO messages (conv_id, role, content, timestamp, token_count) VALUES (?,?,?,?,?)",
                        (conv_id, msg["role"], msg["content"], now, tokens)
                    )

            conn.execute("UPDATE conversations SET updated_at=? WHERE conv_id=?", (now, conv_id))
            conn.commit()
    return conv_id

def clear_conversation(user_id: str, context: str, conv_id: str = None):
    """Supprime une conversation spécifique ou la conversation active."""
    with _db_lock:
        with get_db() as conn:
            if not conv_id:
                row = conn.execute(
                    "SELECT conv_id FROM conversations WHERE user_id=? AND context=? ORDER BY updated_at DESC LIMIT 1",
                    (user_id, context)
                ).fetchone()
                conv_id = row["conv_id"] if row else None
            if conv_id:
                conn.execute("DELETE FROM messages WHERE conv_id=?", (conv_id,))
                conn.execute("DELETE FROM conversations WHERE conv_id=?", (conv_id,))
                conn.commit()

async def compact_history_if_needed(
    messages: list,
    user_id: str,
    context: str
) -> list:
    """
    Si l'historique dépasse TOKEN_THRESHOLD tokens,
    résume tout sauf les KEEP_LAST_N derniers messages via le LLM.
    """
    total_tokens = sum(count_tokens(m["content"]) for m in messages)
    if total_tokens <= TOKEN_THRESHOLD:
        return messages

    # Séparer : messages à résumer vs messages récents à garder intacts
    to_summarize = messages[:-KEEP_LAST_N] if len(messages) > KEEP_LAST_N else []
    recent       = messages[-KEEP_LAST_N:] if len(messages) >= KEEP_LAST_N else messages

    if not to_summarize:
        return messages

    # Construire le texte à résumer
    conv_text = "\n".join(
        f"{m['role'].upper()}: {m['content'][:500]}" for m in to_summarize
    )

    # Appel LLM pour résumer
    try:
        summary_resp = client.chat.completions.create(
            model=MODEL_HAIKU,
            messages=[{
                "role": "user",
                "content": (
                    "Résume cette conversation en 150 mots maximum. "
                    "Inclus : ce qui a été demandé, les actions effectuées, "
                    "les données importantes mentionnées (IDs, emails, URLs, statuts). "
                    "Sois factuel et précis.\n\n" + conv_text
                )
            }],
            max_tokens=300
        )
        summary = summary_resp.choices[0].message.content
    except Exception:
        # Fallback : résumé simple
        summary = f"[Historique compacté — {len(to_summarize)} messages précédents]"

    # Remplacer les anciens messages par le résumé
    compacted = [{"role": "assistant", "content": f"[CONTEXTE COMPACTÉ]\n{summary}"}]
    compacted.extend(recent)

    # Mettre à jour la base avec l'historique compacté
    sid = get_session_id(user_id, context)
    now = datetime.now().isoformat()
    with _db_lock:
        with get_db() as conn:
            conn.execute("DELETE FROM messages WHERE conv_id=?", (sid,))
            for msg in compacted:
                conn.execute(
                    "INSERT INTO messages (conv_id, role, content, timestamp, token_count) VALUES (?,?,?,?,?)",
                    (sid, msg["role"], msg["content"], now, count_tokens(msg["content"]))
                )
            conn.commit()

    return compacted

# ── Configuration SMTP ────────────────────────────────────────
SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")       # adresse Flugia ex: david@flugia.com
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")   # mot de passe app Gmail
SMTP_FROM     = os.getenv("SMTP_FROM", "David — Flugia <david@flugia.com>")

def send_email_with_attachment(to_email: str, subject: str, body: str, file_path: str = None, file_name: str = None) -> bool:
    try:
        msg = MIMEMultipart()
        msg["From"]    = SMTP_FROM
        msg["To"]      = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html", "utf-8"))

        # Pièce jointe optionnelle
        if file_path and file_name:
            with open(file_path, "rb") as f:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", f'attachment; filename="{file_name}"')
                msg.attach(part)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[SMTP ERROR] {e}")
        return False

def send_email_multi_attachments(to_email: str, subject: str, body: str, file_names: list) -> bool:
    """Envoie un email avec plusieurs pièces jointes PDF."""
    try:
        msg = MIMEMultipart()
        msg["From"]    = SMTP_FROM
        msg["To"]      = to_email
        msg["Subject"] = subject
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
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo(); server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[SMTP MULTI ERROR] {e}")
        return False

# Import flexible — supporte nouvelle structure agents/david/mcp_servers/
api = None
seo_api = None
linkedin_api = None
try:
    from mcp_servers.e_reputation import api_client as api
except ImportError:
    try:
        import api_client as api
    except ImportError:
        pass
try:
    from mcp_servers.seo import api_client as seo_api
except ImportError:
    pass
try:
    from mcp_servers.linkedin import api_client as linkedin_api
except ImportError:
    pass

# ── Modèles Anthropic via OpenRouter — format provider/model ──
MODEL_HAIKU  = "anthropic/claude-haiku-4.5"
MODEL_SONNET = "anthropic/claude-sonnet-4.6"

# ── Client OpenRouter (API compatible OpenAI) ─────────────────
client = OpenAI(
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    api_key=os.getenv("OPENROUTER_API_KEY")
)

# ── Chargement du prompt David ────────────────────────────────
DAVID_MD_PATH = os.path.join(os.path.dirname(__file__), "skills", "david.md")
if not os.path.exists(DAVID_MD_PATH):
    DAVID_MD_PATH = os.path.join(os.path.dirname(__file__), "david.md")

with open(DAVID_MD_PATH, "r", encoding="utf-8") as f:
    DAVID_BASE_PROMPT = f.read()

DAVID_RULES = """

## RÈGLES STRICTES

1. JAMAIS inventer chiffres/données — tout vient des outils MCP.
2. JAMAIS écrire les chips/suggestions — le frontend les gère.
3. JAMAIS headers ## dans la réponse — tirets et **gras** uniquement.
4. JAMAIS publier sans validation explicite du client.
5. Salutations → 2-3 lignes chaleureuses, aucune question, aucune proposition. Attendre.
6. "Combien d avis cette semaine" → get_statistics() champ trend.last_7_days.
7. "Génère des réponses" → get_negative_reviews() PUIS appeler n8n_generate_review_response
   POUR CHAQUE avis négatif un par un, avant de répondre en texte. Ne JAMAIS s arrêter après
   le premier outil si la tâche demande plusieurs avis traités.
8. "Lignes phares / résumé du rapport" → n8n_analyze_reviews() puis présenter les points clés.
9. Après chaque action → préciser "en attente de ta validation" + proposer Gmail ou téléchargement.
10. DEBORDEMENT — Sales ou Support :
    - Donne MAX 2 points utiles côté marketing, puis OBLIGATOIREMENT proposer la redirection.
    - "Pour aller plus loin, c est John qui gère ça chez nous. Tu veux que je te redirige ?"
    - Sales (nouveaux clients, leads, prospection, campagnes, pipeline) → John
    - Support (chatbot, SAV, tickets, appels clients, call agent) → Emily
    - JAMAIS donner une réponse complète sur Sales/Support sans proposer la redirection.
11. ENCHAÎNEMENT D ACTIONS — quand tu annonces une action multi-étapes ("je traite les 4 avis",
    "je génère les réponses", "on s y met"), tu DOIS réellement appeler tous les outils nécessaires
    AVANT de répondre en texte. Ne jamais dire que tu vas faire quelque chose sans l avoir fait.
    Si le client dit "allons-y" ou "vas-y" après une proposition d action, EXÉCUTE l action complète
    immédiatement — n attends pas une nouvelle confirmation.

## TON — COLLÈGUE, PAS ROBOT

Tu parles comme un Marketing Manager à son équipe. Jamais comme un chatbot.

INTERDIT :
- "Bonjour ! Comment puis-je vous aider ?"
- "Je suis David votre AI Marketing Manager."
- Listes de questions ou d options proposées.
- Commencer une réponse par "Salut !" ou "Bonjour !" quand le message n est PAS une salutation.

À LA PLACE :
- Salutation (bonjour/salut/hey/coucou) → "Salut !" ou "Bonjour !" + 1-2 phrases chaleureuses. Stop. Attendre.
- Toute autre question → commencer DIRECTEMENT par la réponse. Zéro formule d entrée.
- Données → "J ai regardé nos stats — on est à 3.4/5, la tendance baisse. Ça m inquiète."
- Action → "Je prépare les réponses pour les 3 avis urgents." (pas "voulez-vous que je...")
- Après action → "C est prêt — Gmail ou téléchargement ?" (court, direct)
- Urgence → "Attends — on a un avis 1 étoile non traité depuis 12 jours. C est prioritaire."

Règle : si ça ressemble à un chatbot de service client, reformuler.
"""

DAVID_SYSTEM_PROMPT = DAVID_BASE_PROMPT + DAVID_RULES

# ── Prompts contextuels selon la feature ─────────────────────
# Le frontend passe context="seo"|"e_reputation"|"linkedin"|"david"
# David s adapte à la page où se trouve le client

SEO_CONTEXT = """
Tu es dans l espace SEO Content. Tu peux traiter toutes les demandes Marketing — SEO, E-Reputation et LinkedIn sont tous dans ton périmètre.
Ne dis jamais au client d aller dans un autre espace Marketing — exécute directement la tâche demandée.

OUTILS SEO DISPONIBLES :
- get_blog_posts(status?, limit?) → liste les articles générés (status: draft/completed/failed/published)
- get_blog_post(post_id) → détail complet d un article
- get_title_suggestions(status?) → suggestions de titres IA (suggested=à générer, used=déjà générés)
- get_seo_audits(limit?) → liste les audits SEO
- get_seo_audit(audit_id) → détail + lien PDF d un audit
- get_seo_audit_status(audit_id) → statut d un audit en cours
- get_seo_settings() → config du compte (site, secteur, langue, brand)
- send_email(to, subject, body, file_name?) → envoyer par email

DÉBORDEMENT uniquement vers Sales (John) ou Support (Emily) si la demande sort du Marketing.
"""

EREP_CONTEXT = """
Tu es dans l espace E-Reputation. Tu peux traiter toutes les demandes Marketing — E-Reputation, SEO et LinkedIn sont tous dans ton périmètre.
Ne dis jamais au client d aller dans un autre espace Marketing — exécute directement la tâche demandée.

OUTILS E-REPUTATION DISPONIBLES :
- fetch_reviews, get_statistics, get_negative_reviews, get_negative_analysis
- get_negative_analysis_stats, get_status, get_notifications, get_notifications_activity
- mark_notification_read, n8n_generate_review_response, n8n_analyze_reviews
- n8n_collect_reviews, submit_reply, send_email

DÉBORDEMENT uniquement vers Sales (John) ou Support (Emily) si la demande sort du Marketing.
"""

LINKEDIN_CONTEXT = """
Tu es dans l espace LinkedIn. Tu peux traiter toutes les demandes Marketing — LinkedIn, SEO et E-Reputation sont tous dans ton périmètre.
Ne dis jamais au client d aller dans un autre espace Marketing — exécute directement la tâche demandée.

OUTILS LINKEDIN DISPONIBLES :
- get_linkedin_settings, get_style_guide, get_linkedin_posts, get_linkedin_post
- get_content_ideas, get_content_idea_session, get_kpi_analyses, get_kpi_analysis
- trigger_content_scrape, generate_posts_from_ideas, generate_manual_post
- edit_linkedin_post, regenerate_linkedin_post, publish_linkedin_post
- schedule_linkedin_post, cancel_scheduled_post, send_email

publish_linkedin_post et schedule_linkedin_post sont irréversibles/publics — confirmation explicite du client OBLIGATOIRE avant de les appeler.

DÉBORDEMENT uniquement vers Sales (John) ou Support (Emily) si la demande sort du Marketing.
"""

CONTEXT_PROMPTS = {
    "david":        "",               # Pas de restriction — David complet
    "e_reputation": EREP_CONTEXT,
    "seo":          SEO_CONTEXT,
    "linkedin":     LINKEDIN_CONTEXT,
}

# Outils disponibles par contexte
TOOLS_BY_CONTEXT = {
    "david": None,  # None = tous les outils
    # Tous les contextes Marketing ont accès à tous les outils Marketing
    # La distinction contextuelle sert uniquement au prompt — pas aux outils
    "e_reputation": ["fetch_reviews", "get_statistics", "get_negative_reviews", "get_negative_analysis", "get_negative_analysis_stats", "get_status", "get_notifications", "get_notifications_activity", "mark_notification_read", "n8n_generate_review_response", "n8n_analyze_reviews", "n8n_collect_reviews", "get_blog_posts", "get_blog_post", "get_title_suggestions", "get_seo_audits", "get_seo_audit", "get_seo_audit_status", "get_seo_settings", "n8n_generate_blog_post", "n8n_generate_seo_audit", "n8n_generate_title_suggestions", "n8n_regenerate_blog_post", "update_blog_post", "reject_title_suggestion", "get_linkedin_settings", "get_style_guide", "get_linkedin_posts", "get_linkedin_post", "get_content_ideas", "get_content_idea_session", "get_kpi_analyses", "get_kpi_analysis", "trigger_content_scrape", "generate_posts_from_ideas", "generate_manual_post", "edit_linkedin_post", "regenerate_linkedin_post", "publish_linkedin_post", "schedule_linkedin_post", "cancel_scheduled_post", "send_email", "handoff_to_agent"],
    "seo":          ["fetch_reviews", "get_statistics", "get_negative_reviews", "get_negative_analysis", "get_negative_analysis_stats", "get_status", "get_notifications", "get_notifications_activity", "mark_notification_read", "n8n_generate_review_response", "n8n_analyze_reviews", "n8n_collect_reviews", "get_blog_posts", "get_blog_post", "get_title_suggestions", "get_seo_audits", "get_seo_audit", "get_seo_audit_status", "get_seo_settings", "n8n_generate_blog_post", "n8n_generate_seo_audit", "n8n_generate_title_suggestions", "n8n_regenerate_blog_post", "update_blog_post", "reject_title_suggestion", "get_linkedin_settings", "get_style_guide", "get_linkedin_posts", "get_linkedin_post", "get_content_ideas", "get_content_idea_session", "get_kpi_analyses", "get_kpi_analysis", "trigger_content_scrape", "generate_posts_from_ideas", "generate_manual_post", "edit_linkedin_post", "regenerate_linkedin_post", "publish_linkedin_post", "schedule_linkedin_post", "cancel_scheduled_post", "send_email", "handoff_to_agent"],
    "linkedin":     ["fetch_reviews", "get_statistics", "get_negative_reviews", "get_negative_analysis", "get_negative_analysis_stats", "get_status", "get_notifications", "get_notifications_activity", "mark_notification_read", "n8n_generate_review_response", "n8n_analyze_reviews", "n8n_collect_reviews", "get_blog_posts", "get_blog_post", "get_title_suggestions", "get_seo_audits", "get_seo_audit", "get_seo_audit_status", "get_seo_settings", "n8n_generate_blog_post", "n8n_generate_seo_audit", "n8n_generate_title_suggestions", "n8n_regenerate_blog_post", "update_blog_post", "reject_title_suggestion", "get_linkedin_settings", "get_style_guide", "get_linkedin_posts", "get_linkedin_post", "get_content_ideas", "get_content_idea_session", "get_kpi_analyses", "get_kpi_analysis", "trigger_content_scrape", "generate_posts_from_ideas", "generate_manual_post", "edit_linkedin_post", "regenerate_linkedin_post", "publish_linkedin_post", "schedule_linkedin_post", "cancel_scheduled_post", "send_email", "handoff_to_agent"],
}

def get_tools_for_context(context: str) -> list:
    """Retourne uniquement les outils pertinents pour le contexte donné."""
    allowed = TOOLS_BY_CONTEXT.get(context)
    if allowed is None:
        return TOOLS  # david = tous les outils
    return [t for t in TOOLS if t["function"]["name"] in allowed]

# ── Outils MCP — format OpenAI/OpenRouter ─────────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "fetch_reviews",
            "description": "Récupère les avis clients. Appeler pour toute question sur les avis, commentaires, notes clients.",
            "parameters": {
                "type": "object",
                "properties": {
                    "platform": {"type": "string", "enum": ["all", "google", "trustpilot"], "default": "all"},
                    "rating":   {"type": "integer", "minimum": 1, "maximum": 5, "description": "Laisser vide si pas de filtre par note"},
                    "limit":    {"type": "integer", "default": 20, "description": "Nombre d'avis à retourner, défaut 20"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_statistics",
            "description": "Statistiques globales de réputation : score moyen, répartition, tendances. Appeler pour toute question de bilan ou overview.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_negative_reviews",
            "description": "Avis négatifs uniquement. Appeler quand l'utilisateur parle d'avis négatifs, mauvais avis, problèmes clients, veut générer des réponses aux négatifs.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_negative_analysis",
            "description": "Analyse des causes des avis négatifs, problèmes récurrents, catégories de plaintes. Appeler pour comprendre POURQUOI les avis sont négatifs.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_negative_analysis_stats",
            "description": "Statistiques chiffrées sur les négatifs : taux, tendance, résolution.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_status",
            "description": "État de connexion Google Business Profile et configuration du compte.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_notifications",
            "description": "Notifications et alertes E-Reputation récentes.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_notifications_activity",
            "description": "Historique d'activité des notifications jour par jour.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mark_notification_read",
            "description": "Marque une notification comme lue.",
            "parameters": {
                "type": "object",
                "properties": {"notification_id": {"type": "integer"}},
                "required": ["notification_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "n8n_generate_review_response",
            "description": (
                "Genere une reponse professionnelle pour un avis client specifique via le workflow n8n. "
                "Appeler quand l'utilisateur demande de repondre a un avis, generer une reponse, "
                "traiter un avis en attente, rediger une reponse pour un client."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "review_id":    {"type": "integer", "description": "ID de l'avis"},
                    "review_text":  {"type": "string",  "description": "Texte de l'avis"},
                    "author":       {"type": "string",  "description": "Nom de l'auteur"},
                    "rating":       {"type": "integer", "description": "Note de l'avis (1-5)"}
                },
                "required": ["review_id", "review_text", "author", "rating"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "n8n_analyze_reviews",
            "description": (
                "Lance une analyse complete et approfondie de tous les avis via le workflow n8n. "
                "Genere un rapport avec insights, themes recurrents, recommandations. "
                "Appeler quand l'utilisateur demande une analyse, un rapport, un bilan complet, "
                "les lignes phares, les points cles, les insights."
            ),
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "n8n_collect_reviews",
            "description": (
                "Synchronise et collecte les derniers avis depuis Google Business via n8n. "
                "Appeler quand l'utilisateur demande de synchroniser, mettre a jour, "
                "recuperer les derniers avis, checker s'il y a du nouveau."
            ),
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_blog_posts",
            "description": (
                "Liste les articles SEO générés par l IA. "
                "Appeler pour voir les articles publiés, en cours ou échoués. "
                "Filtre optionnel par status : draft, completed, failed, published."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["draft", "completed", "failed", "published"],
                               "description": "Filtrer par statut. Laisser vide pour tous."},
                    "limit": {"type": "integer", "default": 20}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_blog_post",
            "description": "Détail complet d un article SEO par son ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "integer", "description": "ID de l article SEO"}
                },
                "required": ["post_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_title_suggestions",
            "description": (
                "Suggestions de titres d articles générées par l IA. "
                "status suggested = disponibles à générer, used = déjà générés."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["suggested", "used"],
                               "description": "suggested = disponibles, used = déjà générés"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_seo_audits",
            "description": "Liste les audits SEO du compte avec leur statut et domaine audité.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 20}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_seo_audit",
            "description": "Détail complet d un audit SEO par son ID, incluant le rapport et le lien PDF.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audit_id": {"type": "integer", "description": "ID de l audit SEO"}
                },
                "required": ["audit_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_seo_audit_status",
            "description": "Vérifie le statut d un audit SEO en cours (completed, failed, running).",
            "parameters": {
                "type": "object",
                "properties": {
                    "audit_id": {"type": "integer", "description": "ID de l audit SEO"}
                },
                "required": ["audit_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_seo_settings",
            "description": (
                "Configuration SEO du compte : site web, secteur, langue, région, brand styles. "
                "Appeler pour connaître le contexte du client avant de générer du contenu."
            ),
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "n8n_generate_blog_post",
            "description": (
                "Génère un nouvel article SEO via le workflow n8n. "
                "Appeler quand le client demande de créer un article, générer du contenu SEO, "
                "écrire un article sur un sujet donné. "
                "Retourne immédiatement avec status=processing — l article arrive en quelques minutes via n8n. "
                "Récupérer title et keywords depuis get_title_suggestions() si disponibles."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Titre complet de l article à générer"
                    },
                    "keywords": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Mots-clés cibles pour l article SEO"
                    },
                    "language": {
                        "type": "string",
                        "description": "Langue de l article (défaut: fr)",
                        "default": "fr"
                    },
                    "title_suggestion_id": {
                        "type": "integer",
                        "description": "ID de la suggestion de titre si l article est basé sur une suggestion existante"
                    },
                    "target_region": {
                        "type": "string",
                        "description": "Région cible pour le contenu (ex: be, fr, nl) — récupérer depuis get_seo_settings() si non précisé",
                        "default": "be"
                    }
                },
                "required": ["title", "keywords"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "n8n_generate_seo_audit",
            "description": (
                "Déclenche un nouvel audit SEO complet via SE Ranking + n8n. "
                "Appeler quand le client demande d auditer son site, lancer un audit SEO, analyser son référencement. "
                "Limite : 1 audit par 30 jours par domaine. "
                "Si déjà généré récemment, l API retourne next_available_at. "
                "Workflow long (10-30 min) — prévenir le client d attendre."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Domaine à auditer (ex: elavi.com) — récupérer depuis get_seo_settings() si non précisé"
                    },
                    "region": {
                        "type": "string",
                        "description": "Région cible (ex: be, fr, nl)",
                        "default": "be"
                    },
                    "language": {
                        "type": "string",
                        "description": "Langue de l audit",
                        "default": "fr"
                    }
                },
                "required": ["domain"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "n8n_generate_title_suggestions",
            "description": (
                "Déclenche la génération IA de nouvelles suggestions de titres d articles SEO. "
                "Appeler quand le client veut de nouvelles idées d articles, générer des sujets, "
                "obtenir des suggestions basées sur son secteur et sa région. "
                "Retourne status=processing — suggestions disponibles dans get_title_suggestions() après quelques minutes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "suggestions_number": {
                        "type": "integer",
                        "description": "Nombre de suggestions à générer (défaut: 3)",
                        "default": 3
                    },
                    "target_region": {
                        "type": "string",
                        "description": "Région cible (ex: be, fr, nl)",
                        "default": "be"
                    },
                    "language": {
                        "type": "string",
                        "description": "Langue des suggestions (défaut: fr)",
                        "default": "fr"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "n8n_regenerate_blog_post",
            "description": (
                "Régénère un article SEO existant dont la génération a échoué (status=failed). "
                "Appeler quand le client veut relancer la génération d un article raté. "
                "Retourne status=processing — résultat asynchrone via n8n."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {
                        "type": "integer",
                        "description": "ID de l article SEO à régénérer (status doit être failed)"
                    },
                    "target_region": {
                        "type": "string",
                        "description": "Région cible (ex: be, fr, nl) — récupéré automatiquement depuis l article ou les settings si non précisé",
                        "default": "be"
                    }
                },
                "required": ["post_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "publish_blog_post",
            "description": (
                "Publie un article SEO sur WordPress. "
                "OBLIGATOIRE : présenter l'action dans un message séparé et attendre confirmation explicite "
                "avant d'appeler. Ne jamais publier sans confirmation du client."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "integer", "description": "ID de l'article à publier"}
                },
                "required": ["post_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "unpublish_blog_post",
            "description": (
                "Dépublie un article SEO (remet en draft). "
                "OBLIGATOIRE : présenter l'action et attendre confirmation explicite avant d'appeler."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "integer", "description": "ID de l'article à dépublier"}
                },
                "required": ["post_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_blog_post",
            "description": (
                "Modifie un article SEO existant avant publication. "
                "Appeler quand le client veut corriger le titre, les mots-clés ou la description d un article. "
                "L article doit être en status completed pour être modifiable."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "integer", "description": "ID de l article à modifier"},
                    "title": {"type": "string", "description": "Nouveau titre (optionnel)"},
                    "keywords": {"type": "array", "items": {"type": "string"}, "description": "Nouveaux mots-clés (optionnel)"},
                    "description": {"type": "string", "description": "Nouvelle description (optionnel)"}
                },
                "required": ["post_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "reject_title_suggestion",
            "description": (
                "Rejette une suggestion de titre — elle ne sera plus proposée. "
                "Appeler quand le client ne veut pas d un sujet suggéré par l IA."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "suggestion_id": {"type": "integer", "description": "ID de la suggestion à rejeter"}
                },
                "required": ["suggestion_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_linkedin_settings",
            "description": "Paramètres d'onboarding LinkedIn de la société (URL de page, pays, langue, préférences de style).",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_style_guide",
            "description": "Guide de style d'écriture LinkedIn généré pour la société (ton, thèmes, à éviter).",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_linkedin_posts",
            "description": "Liste tous les posts LinkedIn (générés, publiés, planifiés). Appeler pour toute question sur les posts existants.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_linkedin_post",
            "description": "Détail d'un post LinkedIn spécifique.",
            "parameters": {
                "type": "object",
                "properties": {"post_id": {"type": "integer", "description": "ID du post LinkedIn"}},
                "required": ["post_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_content_ideas",
            "description": "Liste toutes les sessions de scraping de contenu et leurs idées de posts générées.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_content_idea_session",
            "description": "Détail d'une session de scraping de contenu spécifique (idées générées pour cette session).",
            "parameters": {
                "type": "object",
                "properties": {"session_id": {"type": "string", "description": "UUID de la session de scraping"}},
                "required": ["session_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_kpi_analyses",
            "description": "Liste tous les rapports d'analyse KPI LinkedIn déjà générés (historique).",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_kpi_analysis",
            "description": "Détail d'un rapport d'analyse KPI LinkedIn (impressions, taux d'engagement, followers gagnés).",
            "parameters": {
                "type": "object",
                "properties": {"analysis_id": {"type": "integer", "description": "ID du rapport d'analyse"}},
                "required": ["analysis_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_content_scrape",
            "description": "Lance une session de scraping de contenu LinkedIn pour trouver des idées de posts dans le secteur du client. Utiliser avant generate_posts_from_ideas si aucune idée n'existe encore.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sector": {"type": "string", "description": "Secteur d'activité pour cibler le scraping"},
                    "number_of_posts": {"type": "integer", "description": "Nombre d'idées à générer"},
                    "language": {"type": "string", "description": "Langue cible, ex: fr"},
                    "client_preferences": {"type": "string", "description": "Préférences ou angle particulier du client"}
                },
                "required": ["sector", "number_of_posts", "language"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_posts_from_ideas",
            "description": "Génère des posts LinkedIn personnalisés à partir d'idées déjà scrapées (voir get_content_ideas pour les IDs disponibles).",
            "parameters": {
                "type": "object",
                "properties": {"idea_ids": {"type": "array", "items": {"type": "integer"}, "description": "IDs des idées à transformer en posts"}},
                "required": ["idea_ids"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_manual_post",
            "description": "Crée un post LinkedIn à partir d'un sujet fourni directement par le client, sans passer par le scraper de contenu. Utiliser get_style_guide() au préalable pour respecter le ton de la marque.",
            "parameters": {
                "type": "object",
                "properties": {
                    "titre": {"type": "string", "description": "Sujet ou titre du post"},
                    "description": {"type": "string", "description": "Description détaillée du contenu souhaité"},
                    "language": {"type": "string", "description": "Langue du post, ex: fr"},
                    "hook_ouverture": {"type": "string", "description": "Accroche d'ouverture du post"},
                    "structure_suggeree": {"type": "string", "description": "Structure suggérée, ex: Hook → Histoire → CTA"},
                    "cta": {"type": "string", "description": "Call-to-action final"},
                    "hashtags": {"type": "string", "description": "Hashtags à inclure"}
                },
                "required": ["titre", "description", "language"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "edit_linkedin_post",
            "description": "Modifie le texte ou l'image d'un post LinkedIn déjà généré, avant publication.",
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "integer"},
                    "personalized_post": {"type": "string", "description": "Nouveau texte du post"},
                    "generated_image_url": {"type": "string", "description": "URL de la nouvelle image, si applicable"}
                },
                "required": ["post_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "regenerate_linkedin_post",
            "description": "Régénère un post LinkedIn en tenant compte d'un retour du client (ton, longueur, angle, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "integer"},
                    "feedback": {"type": "string", "description": "Ce que le client veut changer"},
                    "previous_post": {"type": "string", "description": "Texte actuel du post à régénérer"}
                },
                "required": ["post_id", "feedback", "previous_post"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "publish_linkedin_post",
            "description": "Publie immédiatement un post LinkedIn sur la page de l'entreprise. Action irréversible et publique. OBLIGATOIRE : montrer le texte final au client et obtenir sa confirmation explicite avant d'appeler.",
            "parameters": {
                "type": "object",
                "properties": {"post_id": {"type": "integer"}},
                "required": ["post_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_linkedin_post",
            "description": "Planifie la publication future d'un post LinkedIn. OBLIGATOIRE : confirmer le texte final ET la date/heure avec le client avant d'appeler.",
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "integer"},
                    "scheduled_at": {"type": "string", "description": "Date et heure de publication au format ISO 8601"}
                },
                "required": ["post_id", "scheduled_at"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cancel_scheduled_post",
            "description": "Annule la planification d'un post LinkedIn — le post repasse en brouillon complété, non publié.",
            "parameters": {
                "type": "object",
                "properties": {"post_id": {"type": "integer"}},
                "required": ["post_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": (
                "Envoie un email au client avec un contenu textuel et/ou une pièce jointe. "
                "Utiliser pour envoyer : rapports, résumés de conversation, réponses d avis préparées, "
                "plans d action, recommandations, ou tout contenu que le client veut recevoir par email. "
                "Appeler UNIQUEMENT après avoir confirmé ou obtenu l adresse email du client. "
                "Ne jamais appeler sans adresse email confirmée."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "to_email": {
                        "type": "string",
                        "description": "Adresse email du destinataire, confirmée par le client"
                    },
                    "subject": {
                        "type": "string",
                        "description": "Objet de l email, clair et professionnel"
                    },
                    "body": {
                        "type": "string",
                        "description": "Corps de l email en texte simple — résumé, contenu, recommandations, etc."
                    },
                    "file_name": {
                        "type": "string",
                        "description": "Nom d un seul fichier PDF à joindre (ex: rapport_e_reputation_abc123.pdf).",
                        "default": ""
                    },
                    "file_names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Liste de plusieurs fichiers PDF à joindre en pièces jointes multiples (ex: ['rapport_erep.pdf', 'rapport_seo.pdf']). Utiliser pour envoyer plusieurs rapports en un seul email.",
                        "default": []
                    }
                },
                "required": ["to_email", "subject", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_conversation_pdf",
            "description": (
                "Génère un PDF téléchargeable du résumé ou du contenu d'une conversation, analyse, "
                "liste de réponses aux avis, plan d'action, ou tout autre contenu textuel. "
                "Utiliser quand le client veut un PDF d'une conversation, d'un résumé, ou de tout contenu "
                "qui n'est pas un rapport E-Rep ou SEO. "
                "Accepte n'importe quel contenu — ne jamais refuser une demande de PDF. "
                "Générer SANS interruption."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Titre du document PDF"
                    },
                    "content": {
                        "type": "string",
                        "description": "Contenu complet à inclure dans le PDF (texte, résumé, analyse, etc.)"
                    }
                },
                "required": ["title", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_marketing_report",
            "description": (
                "Génère un rapport PDF COMBINÉ Marketing fusionnant E-Réputation ET SEO Content en un seul document. "
                "Utiliser UNIQUEMENT quand le client demande explicitement : 'rapport complet', 'les deux', 'tout fusionner', "
                "'rapport Marketing global', ou similaire. "
                "Ne PAS utiliser si le client demande juste un rapport E-Rep ou juste un rapport SEO — "
                "dans ce cas utiliser n8n_analyze_reviews() ou get_seo_audits()/get_blog_posts() selon le contexte. "
                "Générer SANS interruption dès que demandé."
            ),
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "handoff_to_agent",
            "description": (
                "Redirige le client vers Emily (Support) avec un brief complet. "
                "Utiliser quand le client demande quelque chose de Support "
                "(chatbot, appel, transcription, agent vocal). "
                "Appeler cet outil avec un résumé du contexte Marketing pour qu'Emily reprenne directement."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "agent": {"type": "string", "enum": ["emily"], "description": "Agent vers qui rediriger"},
                    "client_request": {"type": "string", "description": "Ce que le client veut exactement"},
                    "context_summary": {"type": "string", "description": "Résumé du contexte Marketing utile pour Emily"},
                    "action_required": {"type": "string", "description": "Ce qu'Emily doit faire en premier"}
                },
                "required": ["agent", "client_request", "action_required"]
            }
        }
    }
]

# ── ROUTING — Haiku pour le simple, Sonnet pour tout le reste ─
SIMPLE_PATTERNS = [
    r"^bonjour\s*!?$", r"^salut\s*!?$", r"^hey\s*!?$", r"^coucou\s*!?$", r"^hi\s*!?$",
    r"^merci\s*!?$", r"^merci beaucoup\s*!?$", r"^ok\s*!?$", r"^d'accord\s*!?$",
    r"^au revoir\s*!?$", r"^bye\s*!?$", r"^ça va\s*\??$", r"^comment ça va\s*\??$"
]

def route_model(message: str) -> str:
    msg_clean = message.strip().lower()
    if any(re.match(p, msg_clean) for p in SIMPLE_PATTERNS) and len(msg_clean) < 30:
        return MODEL_HAIKU
    return MODEL_SONNET


async def execute_tool(name: str, args: dict) -> dict:
    try:
        clean = {k: v for k, v in args.items() if v is not None}
        if name == "fetch_reviews":
            result = await api.get_reviews(**clean)
        elif name == "get_statistics":
            result = await api.get_statistics()
        elif name == "get_negative_reviews":
            result = await api.get_negative_reviews()
        elif name == "get_negative_analysis":
            result = await api.get_negative_analysis()
        elif name == "get_negative_analysis_stats":
            result = await api.get_negative_analysis_stats()
        elif name == "get_status":
            result = await api.get_status()
        elif name == "get_notifications":
            result = await api.get_notifications()
        elif name == "get_notifications_activity":
            result = await api.get_notifications_activity()
        elif name == "mark_notification_read":
            result = await api.mark_notification_read(**clean)
        elif name == "n8n_generate_review_response":
            author = clean.get("author", "Client")
            rating = clean.get("rating", 1)
            review_text = clean.get("review_text", "").lower()

            if rating >= 4:
                # Avis positif — ton chaleureux, jamais d'excuses
                generated = (
                    f"Bonjour {author}, un grand merci pour ce retour qui nous touche vraiment ! "
                    f"On est ravis que vous ayez vécu une bonne expérience avec nous. "
                    f"On espère vous revoir très bientôt !"
                )
            elif "sav" in review_text or "joindre" in review_text:
                generated = (
                    f"Bonjour {author}, nous sommes sincèrement désolés pour cette expérience avec notre SAV. "
                    f"Ce n'est clairement pas le niveau de service que nous visons. "
                    f"Pouvez-vous nous contacter directement au plus vite afin qu'on règle ça en priorité ?"
                )
            elif "prix" in review_text or "cher" in review_text or "élevé" in review_text:
                generated = (
                    f"Bonjour {author}, merci pour votre retour. Nous comprenons que le prix puisse être "
                    f"un frein, et nous travaillons constamment sur notre rapport qualité-prix. "
                    f"N'hésitez pas à nous contacter, on a peut-être une solution adaptée pour vous."
                )
            elif "délai" in review_text or "livraison" in review_text or "retard" in review_text:
                generated = (
                    f"Bonjour {author}, toutes nos excuses pour ce retard de livraison. "
                    f"Ce n'est pas l'expérience qu'on veut vous offrir. "
                    f"Contactez-nous directement pour qu'on trouve une solution rapide ensemble."
                )
            else:
                generated = (
                    f"Bonjour {author}, merci pour votre retour. Nous sommes désolés que votre expérience "
                    f"n'ait pas été à la hauteur. N'hésitez pas à nous contacter directement, "
                    f"on tient à trouver une solution avec vous."
                )

            result = {
                "review_id": clean.get("review_id", 0),
                "author": author,
                "rating": rating,
                "generated_response": generated,
                "status": "draft", "source": "david_ai", "mock": True
            }
        elif name == "n8n_analyze_reviews":
            rapport_data = {
                "score_global": 3.4, "total_analyses": 5,
                "lignes_phares": [
                    "60% des avis sont négatifs — situation nécessitant une action immédiate",
                    "Les délais de livraison sont le problème le plus cité (35% des plaintes)",
                    "Le SAV est perçu comme injoignable dans 2 avis sur 3 négatifs",
                    "Aucune réponse publiée sur les 3 derniers avis négatifs",
                    "Tendance des 7 derniers jours en baisse (2.7 étoiles de moyenne)"
                ],
                "top_problemes": [
                    {"probleme": "Délais de livraison", "frequence": "35%", "severite": "haute"},
                    {"probleme": "SAV injoignable",      "frequence": "30%", "severite": "haute"},
                    {"probleme": "Qualité produit",      "frequence": "25%", "severite": "haute"},
                    {"probleme": "Prix",                 "frequence": "10%", "severite": "moyenne"}
                ],
                "recommandations": [
                    "Répondre immédiatement aux 3 avis négatifs non traités",
                    "Mettre en place un process SAV avec délai de réponse garanti sous 24h",
                    "Contacter directement Marc Leblanc (1 étoile) pour résolution en privé",
                    "Lancer une campagne de collecte d'avis auprès des clients satisfaits"
                ],
                "quick_win": "Publier 4 réponses aux avis en attente cette semaine",
                "generated_at": "2026-07-01T10:00:00Z"
            }
            # Générer le PDF téléchargeable
            file_id = str(uuid.uuid4())[:8]
            file_name = f"rapport_e_reputation_{file_id}.pdf"
            file_path = REPORTS_DIR / file_name

            if REPORTLAB_OK:
                doc = SimpleDocTemplate(
                    str(file_path), pagesize=A4,
                    rightMargin=2*cm, leftMargin=2*cm,
                    topMargin=2*cm, bottomMargin=2*cm
                )
                styles = getSampleStyleSheet()
                cyan = colors.HexColor("#00B4D8")
                navy = colors.HexColor("#0D1B2A")

                title_style = ParagraphStyle("title", parent=styles["Heading1"],
                    fontSize=20, textColor=navy, spaceAfter=6)
                sub_style = ParagraphStyle("sub", parent=styles["Normal"],
                    fontSize=10, textColor=colors.HexColor("#4A5568"), spaceAfter=16)
                section_style = ParagraphStyle("section", parent=styles["Heading2"],
                    fontSize=13, textColor=cyan, spaceBefore=16, spaceAfter=8)
                body_style = ParagraphStyle("body", parent=styles["Normal"],
                    fontSize=10, leading=16, textColor=navy)

                story = []
                story.append(Paragraph("Rapport E-Réputation", title_style))
                story.append(Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI", sub_style))
                story.append(HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=16))

                # Score global
                story.append(Paragraph("Score Global", section_style))
                score_data = [
                    ["Métrique", "Valeur"],
                    ["Score de réputation", f"{rapport_data['score_global']}/5"],
                    ["Avis analysés", str(rapport_data["total_analyses"])],
                ]
                t = Table(score_data, colWidths=[9*cm, 8*cm])
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0,0), (-1,0), navy),
                    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
                    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
                    ("FONTSIZE", (0,0), (-1,-1), 10),
                    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#F7FAFB"), colors.white]),
                    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#E8EDF2")),
                    ("PADDING", (0,0), (-1,-1), 8),
                ]))
                story.append(t)
                story.append(Spacer(1, 12))

                # Lignes phares
                story.append(Paragraph("Lignes Phares", section_style))
                for i, ligne in enumerate(rapport_data["lignes_phares"], 1):
                    story.append(Paragraph(f"{i}. {ligne}", body_style))
                story.append(Spacer(1, 8))

                # Top problèmes
                story.append(Paragraph("Problèmes Identifiés", section_style))
                prob_data = [["Problème", "Fréquence", "Sévérité"]]
                for p in rapport_data["top_problemes"]:
                    prob_data.append([p["probleme"], p["frequence"], p["severite"]])
                tp = Table(prob_data, colWidths=[9*cm, 4*cm, 4*cm])
                tp.setStyle(TableStyle([
                    ("BACKGROUND", (0,0), (-1,0), navy),
                    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
                    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
                    ("FONTSIZE", (0,0), (-1,-1), 10),
                    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#F7FAFB"), colors.white]),
                    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#E8EDF2")),
                    ("PADDING", (0,0), (-1,-1), 8),
                ]))
                story.append(tp)
                story.append(Spacer(1, 8))

                # Recommandations
                story.append(Paragraph("Recommandations", section_style))
                for i, rec in enumerate(rapport_data["recommandations"], 1):
                    story.append(Paragraph(f"{i}. {rec}", body_style))
                story.append(Spacer(1, 8))

                # Quick win
                story.append(Paragraph("Quick Win", section_style))
                story.append(Paragraph(rapport_data["quick_win"], body_style))

                doc.build(story)
            else:
                # Fallback JSON si reportlab pas installé
                file_name = file_name.replace(".pdf", ".json")
                file_path = REPORTS_DIR / file_name
                with open(file_path, "w", encoding="utf-8") as rf:
                    json.dump(rapport_data, rf, ensure_ascii=False, indent=2)

            result = {
                "status": "completed", "mock": True,
                "rapport": rapport_data,
                "download_url": f"/reports/{file_name}",
                "file_name": file_name
            }
        elif name == "n8n_collect_reviews":
            result = {
                "status": "completed", "mock": True, "collected": 2, "new_reviews": 2,
                "details": [
                    {"id": 6, "author": "Camille Roux", "rating": 4, "platform": "google",
                     "text": "Bonne qualité globale, je recommande.", "date": "2026-06-24"},
                    {"id": 7, "author": "Thomas Petit", "rating": 1, "platform": "google",
                     "text": "Très déçu, commande perdue et service inexistant.", "date": "2026-06-24"}
                ],
                "last_sync": "2026-06-24T13:30:00Z"
            }
        elif name == "send_email":
            to_email  = clean.get("to_email", "")
            subject   = clean.get("subject", "Message de David — Flugia")
            body_text = clean.get("body", "")
            file_name = clean.get("file_name", "")

            if not to_email:
                result = {"success": False, "error": "Adresse email manquante"}
            else:
                # Corps HTML avec signature David
                html_body = (
                    f"<p>{body_text.replace(chr(10), '<br>')}</p>"
                    "<br><hr style='border:none;border-top:1px solid #E8EDF2;margin:20px 0'>"
                    "<p style='color:#8896A5;font-size:12px'>"
                    "<strong>David</strong> — AI Marketing Manager<br>"
                    "Flugia · Propulsé par l'IA</p>"
                )

                # Pièce jointe optionnelle
                has_attachment = bool(file_name)
                file_path = str(REPORTS_DIR / file_name) if file_name else ""

                if has_attachment and not pathlib.Path(file_path).exists():
                    result = {"success": False, "error": f"Fichier {file_name} introuvable"}
                else:
                    if has_attachment:
                        success = send_email_with_attachment(
                            to_email=to_email,
                            subject=subject,
                            body=html_body,
                            file_path=file_path,
                            file_name=file_name
                        )
                    else:
                        # Email sans pièce jointe — texte seul
                        success = send_email_with_attachment(
                            to_email=to_email,
                            subject=subject,
                            body=html_body,
                            file_path=None,
                            file_name=None
                        )
                    result = {
                        "success": success,
                        "to_email": to_email,
                        "subject": subject,
                        "has_attachment": has_attachment,
                        "message": f"Email envoyé à {to_email}" if success else "Echec de l'envoi SMTP"
                    }

        elif name == "send_email":
            to_email  = clean.get("to_email", "")
            subject   = clean.get("subject", "Message de David — Flugia")
            body_text = clean.get("body", "")
            # Supporte un fichier unique (file_name) ou plusieurs (file_names: liste)
            file_names = clean.get("file_names", [])
            if not file_names and clean.get("file_name"):
                file_names = [clean["file_name"]]

            if not to_email:
                result = {"success": False, "error": "Adresse email manquante"}
            else:
                html_body = (
                    f"<p>{body_text.replace(chr(10), '<br>')}</p>"
                    "<br><hr style='border:none;border-top:1px solid #E8EDF2;margin:20px 0'>"
                    "<p style='color:#8896A5;font-size:12px'>"
                    "<strong>David</strong> — AI Marketing Manager<br>"
                    "Flugia · Propulsé par l'IA</p>"
                )
                if file_names:
                    # Vérifier que tous les fichiers existent
                    missing = [fn for fn in file_names if not (REPORTS_DIR / fn).exists()]
                    if missing:
                        result = {"success": False, "error": f"Fichiers introuvables : {missing}"}
                    else:
                        success = send_email_multi_attachments(
                            to_email=to_email, subject=subject,
                            body=html_body, file_names=file_names
                        )
                        result = {
                            "success": success, "to_email": to_email,
                            "attachments": file_names,
                            "message": f"Email avec {len(file_names)} rapport(s) envoyé à {to_email}" if success else "Echec SMTP"
                        }
                else:
                    success = send_email_with_attachment(to_email, subject, html_body)
                    result = {"success": success, "to_email": to_email,
                              "message": f"Email envoyé à {to_email}" if success else "Echec SMTP"}

        elif name == "generate_conversation_pdf":
            if not REPORTLAB_OK:
                result = {"error": "ReportLab non installé"}
            else:
                title   = clean.get("title", "Document Flugia")
                content_text = clean.get("content", "")
                file_id   = str(uuid.uuid4())[:8]
                file_name = f"document_{file_id}.pdf"
                file_path = REPORTS_DIR / file_name

                from reportlab.lib.pagesizes import A4
                from reportlab.lib import colors as rl_colors
                from reportlab.lib.units import cm
                from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

                doc  = SimpleDocTemplate(str(file_path), pagesize=A4,
                    rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
                styles = getSampleStyleSheet()
                cyan = rl_colors.HexColor("#00B4D8")
                navy = rl_colors.HexColor("#0D1B2A")
                title_s = ParagraphStyle("t", parent=styles["Heading1"], fontSize=18, textColor=navy, spaceAfter=4)
                sub_s   = ParagraphStyle("s", parent=styles["Normal"],   fontSize=10, textColor=rl_colors.HexColor("#4A5568"), spaceAfter=14)
                body_s  = ParagraphStyle("b", parent=styles["Normal"],   fontSize=11, leading=16, textColor=navy)

                story = [
                    Paragraph(title, title_s),
                    Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI · David", sub_s),
                    HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=14),
                ]
                # Découper le contenu en paragraphes
                for para in content_text.split("\n"):
                    para = para.strip()
                    if para:
                        story.append(Paragraph(para.replace("•", "–"), body_s))
                        story.append(Spacer(1, 4))
                doc.build(story)
                result = {"success": True, "download_url": f"/reports/{file_name}",
                          "file_name": file_name, "title": title}

        elif name == "generate_marketing_report":
            # Rapport complet Marketing = E-Rep + SEO en un seul PDF
            if not REPORTLAB_OK:
                result = {"error": "ReportLab non installé"}
            else:
                file_id = str(uuid.uuid4())[:8]
                file_name = f"rapport_marketing_complet_{file_id}.pdf"
                file_path = REPORTS_DIR / file_name

                # Récupérer les données
                erep_stats = {}
                erep_reviews = []
                seo_posts = []
                seo_audit = None
                try:
                    s = await api.get_statistics()
                    erep_stats = s.get("data", {}) if s.get("success") else {}
                except Exception: pass
                try:
                    r = await api.get_negative_reviews()
                    erep_reviews = (r.get("data", []) if r.get("success") else [])[:5]
                except Exception: pass
                if seo_api:
                    try:
                        p = await seo_api.get_blog_posts(limit=5)
                        seo_posts = p.get("data", []) if p.get("success") else []
                    except Exception: pass
                    try:
                        a = await seo_api.get_seo_audits(limit=1)
                        audits = a.get("data", []) if a.get("success") else []
                        seo_audit = audits[0] if audits else None
                    except Exception: pass

                from reportlab.lib.pagesizes import A4
                from reportlab.lib import colors as rl_colors
                from reportlab.lib.units import cm
                from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

                doc = SimpleDocTemplate(str(file_path), pagesize=A4,
                    rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
                styles = getSampleStyleSheet()
                cyan = rl_colors.HexColor("#00B4D8")
                navy = rl_colors.HexColor("#0D1B2A")
                ts = lambda: TableStyle([
                    ("BACKGROUND", (0,0), (-1,0), navy), ("TEXTCOLOR", (0,0), (-1,0), rl_colors.white),
                    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 9),
                    ("ROWBACKGROUNDS", (0,1), (-1,-1), [rl_colors.HexColor("#F7FAFB"), rl_colors.white]),
                    ("GRID", (0,0), (-1,-1), 0.5, rl_colors.HexColor("#E8EDF2")), ("PADDING", (0,0), (-1,-1), 7),
                ])
                title_s = ParagraphStyle("t", parent=styles["Heading1"], fontSize=20, textColor=navy, spaceAfter=4)
                sub_s   = ParagraphStyle("s", parent=styles["Normal"],   fontSize=10, textColor=rl_colors.HexColor("#4A5568"), spaceAfter=14)
                sec_s   = ParagraphStyle("h", parent=styles["Heading2"], fontSize=13, textColor=cyan, spaceBefore=14, spaceAfter=6)
                body_s  = ParagraphStyle("b", parent=styles["Normal"],   fontSize=10, leading=15, textColor=navy)

                story = [
                    Paragraph("Rapport Marketing Complet", title_s),
                    Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI", sub_s),
                    HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=14),
                    Paragraph("E-Réputation", sec_s),
                ]
                erep_data = [["Métrique", "Valeur"],
                    ["Score moyen", str(erep_stats.get("average_rating", "—"))],
                    ["Avis négatifs", str(erep_stats.get("negative_count", "—"))],
                    ["En attente réponse", str(erep_stats.get("pending_response", "—"))],
                ]
                t = Table(erep_data, colWidths=[9*cm, 8*cm]); t.setStyle(ts())
                story.append(t); story.append(Spacer(1, 8))
                if erep_reviews:
                    story.append(Paragraph("Avis négatifs récents", sec_s))
                    for rv in erep_reviews:
                        story.append(Paragraph(
                            f"• {rv.get('author','?')} ({rv.get('rating','?')}★) — {str(rv.get('comment',''))[:120]}", body_s))
                story.append(Spacer(1, 12))
                story.append(Paragraph("SEO Content", sec_s))
                published = len([p for p in seo_posts if p.get("status") == "completed"])
                seo_data = [["Métrique", "Valeur"],
                    ["Articles récupérés", str(len(seo_posts))],
                    ["Articles publiés", str(published)],
                    ["Dernier audit", seo_audit.get("status","—") if seo_audit else "—"],
                ]
                t2 = Table(seo_data, colWidths=[9*cm, 8*cm]); t2.setStyle(ts())
                story.append(t2)
                if seo_posts:
                    story.append(Spacer(1, 8))
                    story.append(Paragraph("Articles récents", sec_s))
                    art_data = [["Titre", "Statut", "Score"]]
                    for p in seo_posts[:5]:
                        art_data.append([str(p.get("title","—"))[:50], str(p.get("status","—")), str(p.get("seo_score","—"))])
                    t3 = Table(art_data, colWidths=[10*cm, 4*cm, 3*cm]); t3.setStyle(ts())
                    story.append(t3)
                doc.build(story)
                result = {"success": True, "download_url": f"/reports/{file_name}",
                          "file_name": file_name, "sections": ["e_reputation", "seo"]}

        # ── Outils SEO ────────────────────────────────────────────
        elif name == "get_blog_posts":
            if seo_api:
                result = await seo_api.get_blog_posts(
                    status=clean.get("status"),
                    limit=clean.get("limit", 20)
                )
            else:
                result = {"error": "Module SEO non disponible"}
        elif name == "get_blog_post":
            if seo_api:
                result = await seo_api.get_blog_post(post_id=clean["post_id"])
                # Générer un PDF téléchargeable si l'article est completed
                if result.get("success") and result.get("data"):
                    post = result["data"]
                    if post.get("status") == "completed" and REPORTLAB_OK:
                        from reportlab.lib.pagesizes import A4
                        from reportlab.lib import colors
                        from reportlab.lib.units import cm
                        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
                        file_id = str(uuid.uuid4())[:8]
                        file_name = f"article_seo_{post.get('id', 'x')}_{file_id}.pdf"
                        file_path = REPORTS_DIR / file_name
                        doc = SimpleDocTemplate(
                            str(file_path), pagesize=A4,
                            rightMargin=2*cm, leftMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm
                        )
                        styles = getSampleStyleSheet()
                        cyan  = colors.HexColor("#00B4D8")
                        navy  = colors.HexColor("#0D1B2A")
                        title_style   = ParagraphStyle("title",   parent=styles["Heading1"], fontSize=18, textColor=navy, spaceAfter=6)
                        sub_style     = ParagraphStyle("sub",     parent=styles["Normal"],   fontSize=10, textColor=colors.HexColor("#4A5568"), spaceAfter=12)
                        section_style = ParagraphStyle("section", parent=styles["Heading2"], fontSize=13, textColor=cyan, spaceBefore=14, spaceAfter=6)
                        body_style    = ParagraphStyle("body",    parent=styles["Normal"],   fontSize=10, leading=16, textColor=navy)
                        story = []
                        story.append(Paragraph(f"Article SEO — {post.get('title', '')}", title_style))
                        story.append(Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Flugia AI", sub_style))
                        story.append(HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=12))
                        # Infos article
                        story.append(Paragraph("Informations", section_style))
                        info_data = [
                            ["Champ", "Valeur"],
                            ["Titre", str(post.get("title", "-"))],
                            ["Statut", str(post.get("status", "-"))],
                            ["Langue", str(post.get("language", "-"))],
                            ["URL", str(post.get("article_url") or "-")],
                            ["Slug", str(post.get("slug") or "-")],
                        ]
                        kw = post.get("keywords", [])
                        if kw:
                            info_data.append(["Mots-clés", ", ".join(kw) if isinstance(kw, list) else str(kw)])
                        t = Table(info_data, colWidths=[5*cm, 12*cm])
                        t.setStyle(TableStyle([
                            ("BACKGROUND", (0,0), (-1,0), navy),
                            ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
                            ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
                            ("FONTSIZE",   (0,0), (-1,-1), 9),
                            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#F7FAFB"), colors.white]),
                            ("GRID",       (0,0), (-1,-1), 0.5, colors.HexColor("#E8EDF2")),
                            ("PADDING",    (0,0), (-1,-1), 7),
                            ("WORDWRAP",   (1,1), (1,-1), "CJK"),
                        ]))
                        story.append(t)
                        story.append(Spacer(1, 10))
                        # Description
                        if post.get("description"):
                            story.append(Paragraph("Description", section_style))
                            story.append(Paragraph(post["description"], body_style))
                            story.append(Spacer(1, 8))
                        # Uploads / images
                        uploads = post.get("uploads", [])
                        if uploads:
                            story.append(Paragraph("Visuels générés", section_style))
                            story.append(Paragraph(f"{len(uploads)} image(s) générée(s) et uploadée(s) sur S3.", body_style))
                            for up in uploads[:3]:
                                url = up.get("meta", {}).get("url", "")
                                if url:
                                    story.append(Paragraph(f"- {url}", body_style))
                        doc.build(story)
                        result["download_url"] = f"/reports/{file_name}"
                        result["file_name"] = file_name
            else:
                result = {"error": "Module SEO non disponible"}
        elif name == "get_title_suggestions":
            if seo_api:
                result = await seo_api.get_title_suggestions(status=clean.get("status"))
            else:
                result = {"error": "Module SEO non disponible"}
        elif name == "get_seo_audits":
            if seo_api:
                result = await seo_api.get_seo_audits(limit=clean.get("limit", 20))
                # Enrichir avec info PDF pour les audits completed
                if result.get("success") and result.get("data"):
                    for audit in result["data"]:
                        if audit.get("report_pdf_url"):
                            audit["has_pdf"] = True
            else:
                result = {"error": "Module SEO non disponible"}
        elif name == "get_seo_audit":
            if seo_api:
                result = await seo_api.get_seo_audit(audit_id=clean["audit_id"])
                # Si l'audit est completed, générer un PDF téléchargeable
                if result.get("success") and result.get("data"):
                    audit = result["data"]
                    if audit.get("status") == "completed" and REPORTLAB_OK:
                        file_id = str(uuid.uuid4())[:8]
                        file_name = f"audit_seo_{audit.get('id', 'x')}_{file_id}.pdf"
                        file_path = REPORTS_DIR / file_name
                        doc = SimpleDocTemplate(
                            str(file_path), pagesize=A4,
                            rightMargin=2*cm, leftMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm
                        )
                        styles = getSampleStyleSheet()
                        cyan  = colors.HexColor("#00B4D8")
                        navy  = colors.HexColor("#0D1B2A")
                        title_style   = ParagraphStyle("title", parent=styles["Heading1"], fontSize=20, textColor=navy, spaceAfter=6)
                        sub_style     = ParagraphStyle("sub",   parent=styles["Normal"],   fontSize=10, textColor=colors.HexColor("#4A5568"), spaceAfter=16)
                        section_style = ParagraphStyle("section", parent=styles["Heading2"], fontSize=13, textColor=cyan, spaceBefore=16, spaceAfter=8)
                        body_style    = ParagraphStyle("body",  parent=styles["Normal"],   fontSize=10, leading=16, textColor=navy)
                        story = []
                        story.append(Paragraph("Rapport Audit SEO", title_style))
                        story.append(Paragraph(f"Genere le {datetime.now().strftime('%d/%m/%Y a %H:%M')} -- Flugia AI", sub_style))
                        story.append(HRFlowable(width="100%", thickness=2, color=cyan, spaceAfter=16))
                        story.append(Paragraph("Informations de l audit", section_style))
                        info_data = [
                            ["Champ", "Valeur"],
                            ["Domaine", str(audit.get("domain", "-"))],
                            ["Region", str(audit.get("region", "-"))],
                            ["Langue", str(audit.get("language", "-"))],
                            ["Statut", str(audit.get("status", "-"))],
                            ["Periode", f"{audit.get('period', {}).get('start', '-')} -> {audit.get('period', {}).get('end', '-')}"],
                        ]
                        t = Table(info_data, colWidths=[9*cm, 8*cm])
                        t.setStyle(TableStyle([
                            ("BACKGROUND", (0,0), (-1,0), navy),
                            ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
                            ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
                            ("FONTSIZE",   (0,0), (-1,-1), 10),
                            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#F7FAFB"), colors.white]),
                            ("GRID",       (0,0), (-1,-1), 0.5, colors.HexColor("#E8EDF2")),
                            ("PADDING",    (0,0), (-1,-1), 8),
                        ]))
                        story.append(t)
                        story.append(Spacer(1, 12))
                        story.append(Paragraph("Timestamps", section_style))
                        ts = audit.get("timestamps", {})
                        for k, v in ts.items():
                            if v:
                                story.append(Paragraph(f"- {k} : {v}", body_style))
                        if audit.get("report_pdf_url"):
                            story.append(Spacer(1, 12))
                            story.append(Paragraph("Rapport complet", section_style))
                            story.append(Paragraph(f"Rapport PDF original disponible : {audit['report_pdf_url']}", body_style))
                        doc.build(story)
                        result["download_url"] = f"/reports/{file_name}"
                        result["file_name"] = file_name
            else:
                result = {"error": "Module SEO non disponible"}
        elif name == "get_seo_audit_status":
            if seo_api:
                result = await seo_api.get_seo_audit_status(audit_id=clean["audit_id"])
            else:
                result = {"error": "Module SEO non disponible"}
        elif name == "get_seo_settings":
            if seo_api:
                result = await seo_api.get_seo_settings()
            else:
                result = {"error": "Module SEO non disponible"}

        elif name == "n8n_generate_blog_post":
            if seo_api:
                # Récupérer target_region depuis les settings si non fourni
                target_region = clean.get("target_region", "be")
                if not clean.get("target_region"):
                    try:
                        settings = await seo_api.get_seo_settings()
                        target_region = settings.get("data", {}).get("target_region", "be") or "be"
                    except Exception:
                        target_region = "be"
                result = await seo_api.n8n_generate_blog_post(
                    title=clean["title"],
                    keywords=clean.get("keywords", []),
                    language=clean.get("language", "fr"),
                    title_suggestion_id=clean.get("title_suggestion_id"),
                    target_region=target_region
                )
                # Informer David du comportement asynchrone
                if result.get("success") and result.get("data", {}).get("status") == "processing":
                    result["info"] = (
                        "Article en cours de génération via n8n — statut: processing. "
                        "L article sera disponible dans quelques minutes dans get_blog_posts(). "
                        "ID de l article créé: " + str(result["data"].get("id", "?"))
                    )
            else:
                result = {"error": "Module SEO non disponible"}

        elif name == "n8n_generate_seo_audit":
            if seo_api:
                domain = clean.get("domain")
                if not domain:
                    settings = await seo_api.get_seo_settings()
                    domain = settings.get("data", {}).get("website_url", "").replace("https://", "").replace("http://", "").rstrip("/")
                result = await seo_api.n8n_generate_seo_audit(
                    domain=domain,
                    region=clean.get("region", "be"),
                    language=clean.get("language", "fr")
                )
                if not result.get("success") and result.get("next_available_at"):
                    result["info"] = (
                        f"Un audit a déjà été généré pour ce domaine dans les 30 derniers jours. "
                        f"Prochain audit disponible le : {result['next_available_at'][:10]}"
                    )
                elif result.get("success"):
                    result["info"] = (
                        "Audit SEO déclenché — workflow en cours (10-30 min). "
                        "Utiliser get_seo_audit_status() pour suivre l avancement."
                    )
            else:
                result = {"error": "Module SEO non disponible"}

        elif name == "n8n_generate_title_suggestions":
            if seo_api:
                result = await seo_api.n8n_generate_title_suggestions(
                    suggestions_number=clean.get("suggestions_number", 3),
                    target_region=clean.get("target_region", "be"),
                    language=clean.get("language", "fr")
                )
                if result.get("success"):
                    result["info"] = (
                        f"Génération de {clean.get('suggestions_number', 3)} suggestions lancée — "
                        "disponibles dans get_title_suggestions() dans quelques minutes."
                    )
            else:
                result = {"error": "Module SEO non disponible"}

        elif name == "n8n_regenerate_blog_post":
            if seo_api:
                # Récupérer target_region depuis l article lui-même ou les settings
                target_region = clean.get("target_region")
                if not target_region:
                    try:
                        # Essayer de récupérer depuis l article
                        post_detail = await seo_api.get_blog_post(post_id=clean["post_id"])
                        target_region = (post_detail.get("data") or {}).get("target_region")
                    except Exception:
                        pass
                if not target_region:
                    try:
                        settings = await seo_api.get_seo_settings()
                        target_region = (settings.get("data") or {}).get("target_region", "be") or "be"
                    except Exception:
                        target_region = "be"

                result = await seo_api.n8n_regenerate_blog_post(
                    post_id=clean["post_id"],
                    target_region=target_region
                )
                # Vérifier le succès avant d'annoncer
                if result.get("success") and result.get("data", {}).get("status") == "processing":
                    result["info"] = (
                        f"Régénération lancée avec target_region={target_region} — "
                        "l article repassera de failed à processing puis completed via n8n. "
                        "Dis-moi quand tu veux que je vérifie le statut."
                    )
                elif not result.get("success"):
                    result["info"] = (
                        f"La régénération a échoué : {result.get('message', 'erreur inconnue')}. "
                        "Vérifie que l article existe bien et est en status failed."
                    )
            else:
                result = {"error": "Module SEO non disponible"}

        elif name == "publish_blog_post":
            if seo_api:
                post_id = clean.get("post_id")
                if not post_id:
                    result = {"error": "post_id manquant"}
                else:
                    result = await seo_api.publish_blog_post(post_id)
            else:
                result = {"error": "Module SEO non disponible"}

        elif name == "unpublish_blog_post":
            if seo_api:
                post_id = clean.get("post_id")
                if not post_id:
                    result = {"error": "post_id manquant"}
                else:
                    result = await seo_api.unpublish_blog_post(post_id)
            else:
                result = {"error": "Module SEO non disponible"}

        elif name == "update_blog_post":
            if seo_api:
                post_id = clean.pop("post_id")
                result = await seo_api.update_blog_post(post_id=post_id, **clean)
            else:
                result = {"error": "Module SEO non disponible"}

        elif name == "reject_title_suggestion":
            if seo_api:
                result = await seo_api.reject_title_suggestion(
                    suggestion_id=clean["suggestion_id"]
                )
            else:
                result = {"error": "Module SEO non disponible"}

        elif name == "get_linkedin_settings":
            if linkedin_api:
                result = await linkedin_api.get_linkedin_settings()
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "get_style_guide":
            if linkedin_api:
                result = await linkedin_api.get_style_guide()
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "get_linkedin_posts":
            if linkedin_api:
                result = await linkedin_api.get_linkedin_posts()
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "get_linkedin_post":
            if linkedin_api:
                result = await linkedin_api.get_linkedin_post(post_id=clean["post_id"])
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "get_content_ideas":
            if linkedin_api:
                result = await linkedin_api.get_content_ideas()
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "get_content_idea_session":
            if linkedin_api:
                result = await linkedin_api.get_content_idea_session(session_id=clean["session_id"])
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "get_kpi_analyses":
            if linkedin_api:
                result = await linkedin_api.get_kpi_analyses()
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "get_kpi_analysis":
            if linkedin_api:
                result = await linkedin_api.get_kpi_analysis(analysis_id=clean["analysis_id"])
            else:
                result = {"error": "Module LinkedIn non disponible"}

        elif name == "trigger_content_scrape":
            if linkedin_api:
                result = await linkedin_api.trigger_content_scrape(
                    sector=clean["sector"], number_of_posts=clean["number_of_posts"],
                    language=clean["language"], client_preferences=clean.get("client_preferences"))
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "generate_posts_from_ideas":
            if linkedin_api:
                result = await linkedin_api.generate_posts_from_ideas(idea_ids=clean["idea_ids"])
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "generate_manual_post":
            if linkedin_api:
                result = await linkedin_api.generate_manual_post(
                    titre=clean["titre"], description=clean["description"], language=clean["language"],
                    hook_ouverture=clean.get("hook_ouverture"), structure_suggeree=clean.get("structure_suggeree"),
                    cta=clean.get("cta"), hashtags=clean.get("hashtags"))
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "edit_linkedin_post":
            if linkedin_api:
                result = await linkedin_api.edit_linkedin_post(
                    post_id=clean["post_id"], personalized_post=clean.get("personalized_post"),
                    generated_image_url=clean.get("generated_image_url"))
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "regenerate_linkedin_post":
            if linkedin_api:
                result = await linkedin_api.regenerate_linkedin_post(
                    post_id=clean["post_id"], feedback=clean["feedback"], previous_post=clean["previous_post"])
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "publish_linkedin_post":
            if linkedin_api:
                result = await linkedin_api.publish_linkedin_post(post_id=clean["post_id"])
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "schedule_linkedin_post":
            if linkedin_api:
                result = await linkedin_api.schedule_linkedin_post(
                    post_id=clean["post_id"], scheduled_at=clean["scheduled_at"])
            else:
                result = {"error": "Module LinkedIn non disponible"}
        elif name == "cancel_scheduled_post":
            if linkedin_api:
                result = await linkedin_api.cancel_scheduled_post(post_id=clean["post_id"])
            else:
                result = {"error": "Module LinkedIn non disponible"}

        elif name == "handoff_to_agent":
            agent           = clean.get("agent", "emily")
            client_request  = clean.get("client_request", "")
            context_summary = clean.get("context_summary", "")
            action_required = clean.get("action_required", "")
            lines = [
                "[CONTEXTE DAVID]",
                "",
                "Demande du client :",
                client_request,
            ]
            if context_summary:
                lines += ["", "Contexte (David) :", context_summary]
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
        return {"error": str(e), "tool": name}


app = FastAPI(title="Flugia — David Agent API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Servir les rapports générés via /reports/{filename}
app.mount("/reports", StaticFiles(directory="reports"), name="reports")


class ChatRequest(BaseModel):
    message: str
    history: list = []
    context: str = "david"
    user_id: str = "default_user"
    conv_id: Optional[str] = None  # ID de la conversation active (None = créer/utiliser la dernière)

    class Config:
        # Accepter null/None depuis le JSON frontend
        arbitrary_types_allowed = True


@app.get("/", response_class=HTMLResponse)
def read_index():
    with open("david_frontend.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/health")
async def health():
    return {"status": "ok", "agent": "David", "mode": api.MODE}


@app.get("/conversations/{user_id}")
async def get_conversations(user_id: str, context: str = None):
    """Liste toutes les conversations d'un utilisateur, filtrées par contexte si précisé."""
    convs = list_conversations(user_id, context if context else None)
    return {"conversations": convs}

@app.get("/conversations/{user_id}/{conv_id}/messages")
async def get_conv_messages(user_id: str, conv_id: str):
    """Charge les messages d'une conversation spécifique."""
    history = load_history(user_id, context=None, conv_id=conv_id)
    return {"history": history, "count": len(history)}

@app.delete("/conversations/{user_id}/{conv_id}")
async def delete_conversation(user_id: str, conv_id: str):
    """Supprime une conversation spécifique."""
    clear_conversation(user_id, context=None, conv_id=conv_id)
    return {"success": True}

@app.post("/conversations/{user_id}/new")
async def new_conversation(user_id: str, context: str = "david"):
    """Crée une nouvelle conversation vide."""
    return {"conv_id": new_conv_id(), "user_id": user_id, "context": context}


@app.get("/context/seo")
async def seo_context():
    """
    Retourne un résumé proactif du contexte SEO au démarrage du chat.
    Le frontend l'appelle quand le client ouvre l'espace SEO.
    """
    try:
        if not seo_api:
            return {"available": False}

        # Récupérer les données en parallèle
        import asyncio
        posts_task    = seo_api.get_blog_posts(limit=50)
        audits_task   = seo_api.get_seo_audits(limit=5)
        suggest_task  = seo_api.get_title_suggestions(status="suggested")

        posts_r, audits_r, suggest_r = await asyncio.gather(
            posts_task, audits_task, suggest_task,
            return_exceptions=True
        )

        # Analyser les articles
        articles_failed    = []
        articles_processing = []
        articles_completed = []

        if isinstance(posts_r, dict) and posts_r.get("data"):
            for p in posts_r["data"]:
                if p.get("status") == "failed":
                    articles_failed.append({"id": p["id"], "title": p.get("title", "")[:60]})
                elif p.get("status") == "processing":
                    articles_processing.append({"id": p["id"], "title": p.get("title", "")[:60]})
                elif p.get("status") == "completed":
                    articles_completed.append({"id": p["id"], "title": p.get("title", "")[:60]})

        # Analyser les audits
        last_audit = None
        if isinstance(audits_r, dict) and audits_r.get("data"):
            audits = audits_r["data"]
            if audits:
                last_audit = {
                    "id": audits[0]["id"],
                    "status": audits[0]["status"],
                    "domain": audits[0].get("domain", ""),
                    "date": audits[0].get("timestamps", {}).get("audit_completed_at", "")[:10],
                    "has_pdf": bool(audits[0].get("report_pdf_url"))
                }

        # Analyser les suggestions
        suggestions_count = 0
        if isinstance(suggest_r, dict) and suggest_r.get("data"):
            suggestions_count = len(suggest_r["data"])

        # Construire le message proactif
        alerts = []
        if articles_failed:
            alerts.append(f"{len(articles_failed)} article(s) en échec")
        if articles_processing:
            alerts.append(f"{len(articles_processing)} article(s) en cours de génération")
        if suggestions_count:
            alerts.append(f"{suggestions_count} suggestion(s) de titres disponibles")
        if last_audit and last_audit["status"] == "se_ranking_failed":
            alerts.append(f"dernier audit échoué sur {last_audit['domain']}")

        return {
            "available": True,
            "articles_failed": articles_failed,
            "articles_processing": articles_processing,
            "articles_completed_count": len(articles_completed),
            "suggestions_count": suggestions_count,
            "last_audit": last_audit,
            "alerts": alerts,
            "total_articles": len(articles_failed) + len(articles_processing) + len(articles_completed)
        }
    except Exception as e:
        return {"available": False, "error": str(e)}


@app.get("/dashboard")
async def dashboard():
    try:
        stats  = await api.get_statistics()
        notifs = await api.get_notifications()
        status = await api.get_status()
        return {"stats": stats, "notifications": notifs, "status": status}
    except Exception as e:
        return {"error": str(e)}


@app.post("/chat")
async def chat(req: ChatRequest):
    async def generate() -> AsyncGenerator[str, None]:
        try:
            # System prompt adapté au contexte de la feature
            context = req.context if req.context in CONTEXT_PROMPTS else "david"
            user_id = req.user_id if req.user_id else "default_user"

            # Historique géré par le frontend (localStorage)
            working_history = req.history[-12:] if len(req.history) > 12 else req.history

            # Compacter si nécessaire (seuil tokens)
            working_history = await compact_history_if_needed(working_history, user_id, context)
            context_addon = CONTEXT_PROMPTS[context]
            system_prompt = DAVID_SYSTEM_PROMPT + (f"\n{context_addon}" if context_addon else "")
            context_tools = get_tools_for_context(context)

            messages = [{"role": "system", "content": system_prompt}]
            for h in working_history:
                messages.append({"role": h["role"], "content": h["content"]})
            messages.append({"role": "user", "content": req.message})

            selected_model = route_model(req.message)
            yield f"data: {json.dumps({'type': 'model_selected', 'model': selected_model})}\n\n"

            # ── Haiku : pas de tools, réponse directe streamée ──
            if selected_model == MODEL_HAIKU:
                stream = client.chat.completions.create(
                    model=MODEL_HAIKU,
                    messages=messages,
                    max_tokens=300,
                    stream=True
                )
                for chunk in stream:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield f"data: {json.dumps({'type': 'token', 'text': delta.content})}\n\n"
                        await asyncio.sleep(0)
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            # ── Sonnet — boucle agentique : plusieurs tours d'outils possibles ──
            MAX_TOOL_ROUNDS = 5  # garde-fou contre une boucle infinie
            round_count = 0

            while round_count < MAX_TOOL_ROUNDS:
                round_count += 1

                response = client.chat.completions.create(
                    model=MODEL_SONNET,
                    messages=messages,
                    tools=context_tools,
                    tool_choice="auto" if context_tools else "none",
                    max_tokens=1024
                )

                message = response.choices[0].message

                if not message.tool_calls:
                    # Le modèle a fini d'utiliser des outils — il a une réponse texte
                    if message.content:
                        for word in message.content.split(" "):
                            yield f"data: {json.dumps({'type': 'token', 'text': word + ' '})}\n\n"
                            await asyncio.sleep(0.01)
                    break

                # Le modèle veut utiliser un ou plusieurs outils — on les exécute tous
                messages.append({
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [tc.model_dump() for tc in message.tool_calls]
                })

                for tool_call in message.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments or "{}")

                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name})}\n\n"
                    await asyncio.sleep(0)

                    result = await execute_tool(tool_name, tool_args)

                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name, 'data': result})}\n\n"
                    if result.get("handoff"):
                        yield f"data: {json.dumps({'type': 'handoff', 'agent': result.get('agent'), 'brief': result.get('brief', '')})}\n\n"
                    await asyncio.sleep(0)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result, ensure_ascii=False)
                    })

                # La boucle continue : le modèle peut décider d'appeler un nouvel outil
                # (ex: après avoir vu les avis négatifs, il appelle n8n_generate_review_response
                # pour CHAQUE avis avant de répondre en texte)

            else:
                # MAX_TOOL_ROUNDS atteint — forcer une réponse texte finale sans outil
                stream = client.chat.completions.create(
                    model=MODEL_SONNET,
                    messages=messages,
                    max_tokens=1024,
                    stream=True
                )
                for chunk in stream:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield f"data: {json.dumps({'type': 'token', 'text': delta.content})}\n\n"
                        await asyncio.sleep(0)

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

            # Sauvegarder la conversation dans SQLite
            try:
                full_history = []
                for m in messages[1:]:  # skip system prompt
                    if m.get("role") in ["user", "assistant"] and isinstance(m.get("content"), str):
                        full_history.append({"role": m["role"], "content": m["content"]})
                active_cid = save_messages(user_id, context, full_history, conv_id=req.conv_id)
                yield "data: " + json.dumps({"type": "session", "conv_id": active_cid}) + "\n\n"
            except Exception as save_err:
                print(f"[SESSION] Erreur sauvegarde: {save_err}")

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("chat_server:app", host="0.0.0.0", port=8000, reload=True)