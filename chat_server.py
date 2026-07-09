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
from datetime import datetime
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
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from fastapi.responses import HTMLResponse

sys.path.append(os.path.dirname(__file__))
load_dotenv()

# Dossier pour stocker les rapports générés (téléchargeables)
REPORTS_DIR = pathlib.Path("reports")
REPORTS_DIR.mkdir(exist_ok=True)

# ── Configuration SMTP ────────────────────────────────────────
SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")       # adresse Flugia ex: david@flugia.com
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")   # mot de passe app Gmail
SMTP_FROM     = os.getenv("SMTP_FROM", "David — Flugia <david@flugia.com>")

def send_email_with_attachment(to_email: str, subject: str, body: str, file_path: str = None, file_name: str = None) -> bool:
    """Envoie un email via SMTP, avec ou sans pièce jointe. Retourne True si succès."""
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

try:
    from mcp_servers.e_reputation import api_client as api
except ImportError:
    import api_client as api

try:
    from mcp_servers.seo import api_client as seo_api
except ImportError:
    seo_api = None

try:
    from mcp_servers.sales import api_client as sales_api
except ImportError:
    sales_api = None

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

# ── Chargement du prompt John (Sales) ──────────────────────────
JOHN_MD_PATH = os.path.join(os.path.dirname(__file__), "skills", "john.md")
if os.path.exists(JOHN_MD_PATH):
    with open(JOHN_MD_PATH, "r", encoding="utf-8") as f:
        JOHN_SYSTEM_PROMPT = f.read()
else:
    JOHN_SYSTEM_PROMPT = "Tu es John, l'AI Sales Manager de Flugia. Tu n'as pas encore d'outils branchés."

# ── Prompts contextuels selon la feature ─────────────────────
# Le frontend passe context="seo"|"e_reputation"|"linkedin"|"david"
# David s adapte à la page où se trouve le client

SEO_CONTEXT = """
Tu es actuellement dans l espace SEO Content de Flugia.
Dans ce contexte, tu te concentres UNIQUEMENT sur le SEO : articles, audits, suggestions de titres, configuration.

OUTILS DISPONIBLES :
- get_blog_posts(status?, limit?) → liste les articles générés (status: draft/completed/failed/published)
- get_blog_post(post_id) → détail complet d un article
- get_title_suggestions(status?) → suggestions de titres IA (suggested=à générer, used=déjà générés)
- get_seo_audits(limit?) → liste les audits SEO
- get_seo_audit(audit_id) → détail + lien PDF d un audit
- get_seo_audit_status(audit_id) → statut d un audit en cours
- get_seo_settings() → config du compte (site, secteur, langue, brand)
- send_email(to, subject, body, file_name?) → envoyer par email

COMPORTEMENT :
- "Mes articles" / "articles en cours" → get_blog_posts()
- "Articles échoués" / "failed" → get_blog_posts(status="failed")
- "Suggestions de titres" / "idées d articles" → get_title_suggestions(status="suggested")
- "Mon dernier audit" / "résultat de l audit" → get_seo_audits() puis get_seo_audit(id)
- "Config SEO" / "mon site" / "ma langue cible" → get_seo_settings()
- "Télécharge le rapport" / "envoie l audit" → proposer le PDF via send_email ou download_url
- Enchaîner les outils si nécessaire : ex voir l audit → puis proposer d envoyer le PDF

DÉBORDEMENT :
- E-Reputation → "Je suis dans ton espace SEO. Pour les avis, accède à E-Reputation dans le menu."
- LinkedIn → "Pour ton contenu LinkedIn, accède à l espace LinkedIn dans le menu."
- Hors périmètre → orienter naturellement sans couper la conversation.
"""

EREP_CONTEXT = """
Tu es actuellement dans l espace E-Reputation de Flugia.
Dans ce contexte, tu te concentres UNIQUEMENT sur l e-reputation : avis, score, réponses, notifications, analyse.
Si le client aborde le SEO → "Je suis ici dans ton espace E-Reputation. Pour tout ce qui concerne le SEO et les articles, accède directement à SEO Content dans le menu Marketing."
Si le client aborde LinkedIn → "Pour la gestion de ton contenu LinkedIn, accède à l espace LinkedIn dans le menu Marketing."
Si le client aborde autre chose hors e-reputation → orienter naturellement vers le bon espace.
Outils disponibles dans ce contexte : fetch_reviews, get_statistics, get_negative_reviews, get_negative_analysis, get_negative_analysis_stats, get_status, get_notifications, get_notifications_activity, mark_notification_read, n8n_generate_review_response, n8n_analyze_reviews, n8n_collect_reviews, submit_reply, send_email.
"""

LINKEDIN_CONTEXT = """
Tu es actuellement dans l espace LinkedIn de Flugia.
Dans ce contexte, tu te concentres UNIQUEMENT sur LinkedIn : posts, calendrier éditorial, content studio, publication.
Si le client aborde l e-reputation → "Je suis ici dans ton espace LinkedIn. Pour tes avis et ta réputation, accède directement à E-Reputation dans le menu Marketing."
Si le client aborde le SEO → "Pour le SEO et les articles, accède à l espace SEO Content dans le menu Marketing."
Si le client aborde autre chose hors LinkedIn → orienter naturellement vers le bon espace.
Outils disponibles dans ce contexte : n8n_publish_linkedin_post, n8n_schedule_linkedin_posts, send_email.
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
    "e_reputation": [
        "fetch_reviews", "get_statistics", "get_negative_reviews",
        "get_negative_analysis", "get_negative_analysis_stats", "get_status",
        "get_notifications", "get_notifications_activity", "mark_notification_read",
        "n8n_generate_review_response", "n8n_analyze_reviews", "n8n_collect_reviews",
        "send_email"
    ],
    "seo": [
        "get_blog_posts", "get_blog_post", "get_title_suggestions",
        "get_seo_audits", "get_seo_audit", "get_seo_audit_status",
        "get_seo_settings", "n8n_generate_blog_post", "n8n_generate_seo_audit",
        "n8n_generate_title_suggestions", "n8n_regenerate_blog_post",
        "update_blog_post", "reject_title_suggestion", "send_email"
    ],
    "linkedin": [
        "n8n_publish_linkedin_post", "n8n_schedule_linkedin_posts", "send_email"
    ],
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
                    }
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
                        "description": "Nom du fichier à joindre si applicable (ex: rapport_e_reputation_abc123.pdf). Laisser vide si pas de pièce jointe.",
                        "default": ""
                    }
                },
                "required": ["to_email", "subject", "body"]
            }
        }
    }
]

# ── Outils Sales (John) — Prospecting + Campaigns ─────────────
SALES_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_lead_lists",
            "description": "Liste toutes les listes de leads (prospects) de la société. Appeler pour toute question sur les listes de prospects existantes.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_lead_list_details",
            "description": "Détail d'une liste de leads spécifique, avec les leads qu'elle contient.",
            "parameters": {
                "type": "object",
                "properties": {
                    "list_id": {"type": "integer", "description": "ID de la liste de leads"}
                },
                "required": ["list_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_leads",
            "description": (
                "Récupère les leads (prospects) enrichis de la société, avec filtres optionnels. "
                "Appeler pour toute question sur les prospects, leur nombre, leur qualité, ou pour en chercher un précis."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {"type": "string", "description": "Recherche par nom, entreprise ou email"},
                    "industry": {"type": "string", "description": "Filtrer par secteur d'activité"},
                    "min_score": {"type": "number", "description": "Score minimum de qualification du lead"},
                    "per_page": {"type": "integer", "default": 20}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_prospecting_status",
            "description": "Statut de la feature Prospecting pour la société (active, en attente de configuration, etc.)",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_campaigns",
            "description": (
                "Liste les campagnes d'outreach/prospection par email. Appeler pour toute question sur les campagnes en cours, "
                "leur statut, ou pour avoir une vue d'ensemble du pipeline commercial."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["draft", "active", "paused", "completed", "archived"],
                               "description": "Filtrer par statut de campagne"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_campaign",
            "description": "Détail complet d'une campagne d'outreach : contacts, statut d'envoi, statistiques.",
            "parameters": {
                "type": "object",
                "properties": {
                    "campaign_id": {"type": "integer", "description": "ID de la campagne"}
                },
                "required": ["campaign_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_campaign_statistics",
            "description": (
                "Statistiques agrégées de toutes les campagnes : nombre total, campagnes actives, contacts, "
                "emails envoyés, taux de réponse. Appeler pour un bilan global de la prospection."
            ),
            "parameters": {"type": "object", "properties": {}}
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
                result = await seo_api.n8n_generate_blog_post(
                    title=clean["title"],
                    keywords=clean.get("keywords", []),
                    language=clean.get("language", "fr"),
                    title_suggestion_id=clean.get("title_suggestion_id")
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
                result = await seo_api.n8n_regenerate_blog_post(
                    post_id=clean["post_id"]
                )
                if result.get("success"):
                    result["info"] = (
                        f"Régénération de l article {clean['post_id']} lancée — "
                        "status passera de failed à processing puis completed via n8n."
                    )
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

        # ── Outils Sales (John) ──────────────────────────────────
        elif name == "get_lead_lists":
            if sales_api:
                result = await sales_api.get_lead_lists()
            else:
                result = {"error": "Module Sales non disponible"}
        elif name == "get_lead_list_details":
            if sales_api:
                result = await sales_api.get_lead_list_details(list_id=clean["list_id"])
            else:
                result = {"error": "Module Sales non disponible"}
        elif name == "get_leads":
            if sales_api:
                result = await sales_api.get_leads(**clean)
            else:
                result = {"error": "Module Sales non disponible"}
        elif name == "get_prospecting_status":
            if sales_api:
                result = await sales_api.get_prospecting_status()
            else:
                result = {"error": "Module Sales non disponible"}
        elif name == "get_campaigns":
            if sales_api:
                result = await sales_api.get_campaigns(**clean)
            else:
                result = {"error": "Module Sales non disponible"}
        elif name == "get_campaign":
            if sales_api:
                result = await sales_api.get_campaign(campaign_id=clean["campaign_id"])
            else:
                result = {"error": "Module Sales non disponible"}
        elif name == "get_campaign_statistics":
            if sales_api:
                result = await sales_api.get_campaign_statistics()
            else:
                result = {"error": "Module Sales non disponible"}

        else:
            result = {"error": f"Outil inconnu: {name}"}
        return result
    except Exception as e:
        return {"error": str(e), "tool": name}


app = FastAPI(title="Flugia — David Agent API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Servir les rapports générés via /reports/{filename}
app.mount("/reports", StaticFiles(directory="reports"), name="reports")


class ChatRequest(BaseModel):
    message: str
    history: list = []
    context: str = "david"  # "david" | "e_reputation" | "seo" | "linkedin"
    agent: str = "david"    # "david" | "john" — quel agent traite ce message


@app.get("/", response_class=HTMLResponse)
def read_dashboard():
    with open("dashboard.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/marketing", response_class=HTMLResponse)
def read_marketing():
    with open("david_frontend.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/sales", response_class=HTMLResponse)
def read_sales():
    with open("john_frontend.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/health")
async def health():
    return {"status": "ok", "agent": "David", "mode": api.MODE}


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
            recent_history = req.history[-6:] if len(req.history) > 6 else req.history

            if req.agent == "john":
                # John — persona + outils Sales (leads + campagnes)
                system_prompt = JOHN_SYSTEM_PROMPT
                context_tools = SALES_TOOLS
            else:
                # System prompt adapté au contexte de la feature (David)
                context = req.context if req.context in CONTEXT_PROMPTS else "david"
                context_addon = CONTEXT_PROMPTS[context]
                system_prompt = DAVID_SYSTEM_PROMPT + (f"\n{context_addon}" if context_addon else "")
                context_tools = get_tools_for_context(context)

            messages = [{"role": "system", "content": system_prompt}]
            for h in recent_history:
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