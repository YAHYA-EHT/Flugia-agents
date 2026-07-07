"""
server.py — MCP Server E-Reputation · Flugia
Port : 8001

Outils actifs (GET/PATCH) :
  fetch_reviews, get_statistics, get_negative_reviews,
  get_negative_analysis, get_negative_analysis_stats,
  get_status, get_notifications, get_notifications_activity,
  mark_notification_read

Outils commentés — NE PAS ACTIVER AVANT VALIDATION PROD (POST + n8n) :
  retrigger_ai_responses, bulk_action_reviews, bulk_generate_ai_responses,
  publish_ai_response, trigger_negative_analysis, start_feature,
  n8n_generate_review_response, n8n_analyze_reviews, n8n_collect_reviews
"""

import asyncio
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
import json
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from mcp_servers.e_reputation import api_client as api

# ─────────────────────────────────────────────
app = Server("flugia-e-reputation")
# ─────────────────────────────────────────────


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [

        # ── OUTILS ACTIFS ─────────────────────────────────────────

        Tool(
            name="fetch_reviews",
            description=(
                "Récupère les avis clients depuis la plateforme E-Reputation Flugia. "
                "Utiliser quand l'utilisateur demande à voir ses avis, ses commentaires clients, "
                "ou veut filtrer par plateforme ou note."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "platform": {
                        "type": "string",
                        "enum": ["all", "google", "trustpilot"],
                        "default": "all",
                        "description": "Plateforme source des avis"
                    },
                    "rating": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 5,
                        "description": "Filtrer par note. Laisser vide si pas de filtre."
                    },
                    "limit": {
                        "type": "integer",
                        "default": 20,
                        "maximum": 100,
                        "description": "Nombre d'avis à retourner, défaut 20"
                    }
                },
                "required": []
            }
        ),

        Tool(
            name="get_statistics",
            description=(
                "Retourne les statistiques globales de réputation : score moyen, "
                "nombre total d'avis, répartition positifs/négatifs, tendances sur 7 et 30 jours. "
                "Utiliser pour l'Overview ou quand l'utilisateur demande un bilan global, "
                "son score, ou combien d'avis il a reçu cette semaine."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),

        Tool(
            name="get_negative_reviews",
            description=(
                "Récupère uniquement les avis négatifs de l'entreprise. "
                "Utiliser quand l'utilisateur parle d'avis négatifs, de problèmes clients, "
                "veut générer des réponses aux négatifs, ou veut savoir ce qui se passe mal."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),

        Tool(
            name="get_negative_analysis",
            description=(
                "Analyse détaillée des avis négatifs : problèmes récurrents détectés, "
                "catégories de plaintes, sévérité, avis urgents. "
                "Utiliser pour Problem Analysis ou quand l'utilisateur veut comprendre "
                "les causes ou analyser les problèmes."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),

        Tool(
            name="get_negative_analysis_stats",
            description=(
                "Statistiques chiffrées sur les avis négatifs : taux de négativité, "
                "taux de résolution, tendance. "
                "Utiliser pour des chiffres précis sur les négatifs ou pour compléter l'analyse."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),

        Tool(
            name="get_status",
            description=(
                "Vérifie l'état de connexion Google Business Profile et la configuration "
                "du compte E-Reputation. "
                "Utiliser si l'utilisateur demande si son compte est bien configuré "
                "ou si une action échoue à cause d'un compte non connecté."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),

        Tool(
            name="get_notifications",
            description=(
                "Liste les notifications E-Reputation : nouveaux avis, réponses publiées, alertes. "
                "Utiliser quand l'utilisateur demande ses notifications ou ses alertes récentes."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),

        Tool(
            name="get_notifications_activity",
            description=(
                "Historique d'activité des notifications : évolution jour par jour. "
                "Utiliser pour montrer la tendance d'activité ou l'historique des alertes."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),

        Tool(
            name="mark_notification_read",
            description=(
                "Marque une notification spécifique comme lue. "
                "Utiliser quand l'utilisateur dit qu'il a vu une notification "
                "ou demande à la marquer comme lue."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "notification_id": {
                        "type": "integer",
                        "description": "ID de la notification à marquer comme lue"
                    }
                },
                "required": ["notification_id"]
            }
        ),

        # ── OUTILS COMMENTÉS — POST FLUGIA API ───────────────────
        # ⚠️  NE PAS DÉCOMMENTER AVANT VALIDATION PROD
        # Pour activer : décommenter le Tool() + le elif dans call_tool()

        # Tool(
        #     name="retrigger_ai_responses",
        #     description=(
        #         "Relance la génération IA de réponses pour les avis sans réponse. "
        #         "Utiliser quand l'utilisateur veut que l'IA génère des réponses en masse "
        #         "pour tous ses avis en attente."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "review_ids": {
        #                 "type": "array",
        #                 "items": {"type": "integer"},
        #                 "description": "IDs des avis ciblés. Laisser vide pour tous les avis en attente."
        #             }
        #         },
        #         "required": []
        #     }
        # ),

        # Tool(
        #     name="bulk_action_reviews",
        #     description=(
        #         "Actions en masse sur les avis : marquer, archiver, changer le statut. "
        #         "Utiliser quand l'utilisateur veut agir sur plusieurs avis en même temps."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "review_ids": {
        #                 "type": "array",
        #                 "items": {"type": "integer"},
        #                 "description": "IDs des avis à traiter"
        #             },
        #             "action": {
        #                 "type": "string",
        #                 "description": "Action à effectuer (ex: 'mark_read', 'archive', 'change_status')"
        #             }
        #         },
        #         "required": ["review_ids", "action"]
        #     }
        # ),

        # Tool(
        #     name="bulk_generate_ai_responses",
        #     description=(
        #         "Génère des réponses IA en masse pour une liste d'avis spécifiques. "
        #         "Utiliser quand l'utilisateur veut préparer des réponses pour plusieurs avis."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "review_ids": {
        #                 "type": "array",
        #                 "items": {"type": "integer"},
        #                 "description": "IDs des avis pour lesquels générer des réponses"
        #             }
        #         },
        #         "required": ["review_ids"]
        #     }
        # ),

        # Tool(
        #     name="publish_ai_response",
        #     description=(
        #         "Publie une réponse IA sur Google Business Profile. "
        #         "⚠️ Action irréversible — publie directement sur Google. "
        #         "Utiliser uniquement quand l'utilisateur confirme explicitement vouloir publier."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "review_id": {
        #                 "type": "integer",
        #                 "description": "ID de l'avis"
        #             },
        #             "response_id": {
        #                 "type": "integer",
        #                 "description": "ID de la réponse IA à publier"
        #             }
        #         },
        #         "required": ["review_id", "response_id"]
        #     }
        # ),

        # Tool(
        #     name="trigger_negative_analysis",
        #     description=(
        #         "Déclenche une nouvelle analyse complète des avis négatifs. "
        #         "Utiliser quand l'utilisateur veut forcer une actualisation de l'analyse."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "force_refresh": {
        #                 "type": "boolean",
        #                 "default": False,
        #                 "description": "Forcer le recalcul même si une analyse récente existe"
        #             }
        #         },
        #         "required": []
        #     }
        # ),

        # Tool(
        #     name="start_feature",
        #     description=(
        #         "Active la fonctionnalité E-Reputation pour un compte. "
        #         "⚠️ Action d'activation — utiliser uniquement lors du onboarding."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "company_id": {
        #                 "type": "string",
        #                 "description": "ID de l'entreprise"
        #             },
        #             "google_location_id": {
        #                 "type": "string",
        #                 "description": "ID de la localisation Google Business"
        #             }
        #         },
        #         "required": ["company_id", "google_location_id"]
        #     }
        # ),

        # Tool(
        #     name="submit_reply",
        #     description=(
        #         "Soumet une réponse rédigée par David dans le système Flugia avec statut draft. "
        #         "La réponse apparaît dans E-Reputation → Reviews pour validation avant publication Google. "
        #         "Utiliser quand l'utilisateur veut envoyer une réponse à un avis sans la publier immédiatement. "
        #         "⚠️  Endpoint à créer côté Laravel avant d'activer."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "review_id": {
        #                 "type": "integer",
        #                 "description": "ID de l'avis auquel répondre"
        #             },
        #             "response_text": {
        #                 "type": "string",
        #                 "description": "Texte de la réponse rédigée par David"
        #             }
        #         },
        #         "required": ["review_id", "response_text"]
        #     }
        # ),

        # ── OUTILS COMMENTÉS — WEBHOOKS N8N ──────────────────────
        # ⚠️  NE PAS DÉCOMMENTER AVANT VALIDATION PROD

        # Tool(
        #     name="n8n_generate_review_response",
        #     description=(
        #         "Déclenche le workflow n8n de génération de réponse IA pour un avis spécifique. "
        #         "Utiliser quand l'utilisateur veut générer une réponse via le workflow n8n existant."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "review_id": {
        #                 "type": "integer",
        #                 "description": "ID de l'avis"
        #             },
        #             "review_text": {
        #                 "type": "string",
        #                 "description": "Texte de l'avis"
        #             },
        #             "author": {
        #                 "type": "string",
        #                 "description": "Nom de l'auteur de l'avis"
        #             },
        #             "rating": {
        #                 "type": "integer",
        #                 "description": "Note de l'avis (1-5)"
        #             }
        #         },
        #         "required": ["review_id", "review_text", "author", "rating"]
        #     }
        # ),

        # Tool(
        #     name="n8n_analyze_reviews",
        #     description=(
        #         "Déclenche le workflow n8n d'analyse complète des avis. "
        #         "Utiliser quand l'utilisateur veut une analyse approfondie via le workflow n8n."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {},
        #         "required": []
        #     }
        # ),

        # Tool(
        #     name="n8n_collect_reviews",
        #     description=(
        #         "Déclenche la collecte manuelle des avis depuis Google Business via n8n. "
        #         "Utiliser quand l'utilisateur veut forcer une synchronisation immédiate des avis."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {},
        #         "required": []
        #     }
        # ),

    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:

    try:
        # Nettoyer les valeurs null sur tous les arguments
        clean = {k: v for k, v in arguments.items() if v is not None}

        # ── OUTILS ACTIFS ─────────────────────────────────────────

        if name == "fetch_reviews":
            result = await api.get_reviews(
                platform=clean.get("platform", "all"),
                rating=clean.get("rating"),
                limit=clean.get("limit", 20)
            )

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
            result = await api.mark_notification_read(
                notification_id=clean["notification_id"]
            )

        # ── OUTILS COMMENTÉS — POST FLUGIA API ───────────────────
        # ⚠️  NE PAS DÉCOMMENTER AVANT VALIDATION PROD
        # Pour activer : décommenter le elif + décommenter le Tool() dans list_tools()
        #                + décommenter la fonction dans api_client.py

        # elif name == "retrigger_ai_responses":
        #     result = await api.retrigger_ai_responses(
        #         review_ids=clean.get("review_ids")
        #     )

        # elif name == "bulk_action_reviews":
        #     result = await api.bulk_action_reviews(
        #         review_ids=clean["review_ids"],
        #         action=clean["action"],
        #         payload=clean.get("payload", {})
        #     )

        # elif name == "bulk_generate_ai_responses":
        #     result = await api.bulk_generate_ai_responses(
        #         review_ids=clean["review_ids"]
        #     )

        # elif name == "publish_ai_response":
        #     result = await api.publish_ai_response(
        #         review_id=clean["review_id"],
        #         response_id=clean["response_id"]
        #     )

        # elif name == "trigger_negative_analysis":
        #     result = await api.trigger_negative_analysis(
        #         force_refresh=clean.get("force_refresh", False)
        #     )

        # elif name == "start_feature":
        #     result = await api.start_feature(
        #         company_id=clean["company_id"],
        #         google_location_id=clean["google_location_id"]
        #     )

        # elif name == "submit_reply":
        #     # ⚠️  Endpoint POST /api/e-reputation/{id}/reply à créer côté Laravel avant d'activer
        #     result = await api.submit_reply(
        #         review_id=clean["review_id"],
        #         response_text=clean["response_text"]
        #     )

        # ── OUTILS COMMENTÉS — WEBHOOKS N8N ──────────────────────
        # ⚠️  NE PAS DÉCOMMENTER AVANT VALIDATION PROD

        # elif name == "n8n_generate_review_response":
        #     result = await api.n8n_generate_review_response(
        #         review_id=clean["review_id"],
        #         review_text=clean["review_text"],
        #         author=clean["author"],
        #         rating=clean["rating"]
        #     )

        # elif name == "n8n_analyze_reviews":
        #     result = await api.n8n_analyze_reviews()

        # elif name == "n8n_collect_reviews":
        #     result = await api.n8n_collect_reviews()

        else:
            result = {"error": f"Outil inconnu : {name}"}

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except Exception as e:
        error = {"error": str(e), "tool": name, "arguments": arguments}
        return [TextContent(type="text", text=json.dumps(error, ensure_ascii=False))]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())