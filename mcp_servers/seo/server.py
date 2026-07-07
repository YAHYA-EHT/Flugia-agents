"""
server.py — MCP Server SEO Content
Même architecture qu'E-Reputation.
"""

import asyncio
import json
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

try:
    from mcp_servers.seo import api_client as api
except ImportError:
    import api_client as api

server = Server("flugia-seo")

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_blog_posts",
            description=(
                "Liste les articles SEO générés. "
                "Appeler pour voir les articles publiés, en cours ou échoués. "
                "Filtre optionnel par status : draft, completed, failed, published."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["draft", "completed", "failed", "published"],
                        "description": "Filtrer par statut. Laisser vide pour tous les articles."
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Nombre d'articles à retourner (défaut 20)",
                        "default": 20
                    }
                }
            }
        ),
        Tool(
            name="get_blog_post",
            description=(
                "Récupère le détail complet d'un article SEO par son ID. "
                "Appeler quand le client veut voir le contenu d'un article spécifique."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "post_id": {
                        "type": "integer",
                        "description": "ID de l'article SEO"
                    }
                },
                "required": ["post_id"]
            }
        ),
        Tool(
            name="get_title_suggestions",
            description=(
                "Récupère les suggestions de titres générées par l'IA. "
                "Appeler pour voir les idées d'articles suggérés, utilisés ou disponibles. "
                "Filtre optionnel par status : suggested (disponibles), used (déjà générés)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["suggested", "used"],
                        "description": "suggested = disponibles à générer, used = déjà générés"
                    }
                }
            }
        ),
        Tool(
            name="get_seo_audits",
            description=(
                "Liste les audits SEO du compte. "
                "Appeler pour voir l'historique des audits, leur statut et les domaines audités."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Nombre d'audits à retourner (défaut 20)",
                        "default": 20
                    }
                }
            }
        ),
        Tool(
            name="get_seo_audit",
            description=(
                "Récupère le détail complet d'un audit SEO par son ID, "
                "incluant le rapport et le lien PDF."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "audit_id": {
                        "type": "integer",
                        "description": "ID de l'audit SEO"
                    }
                },
                "required": ["audit_id"]
            }
        ),
        Tool(
            name="get_seo_audit_status",
            description=(
                "Vérifie le statut d'un audit SEO en cours. "
                "Appeler pour savoir si un audit est terminé, en cours ou échoué."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "audit_id": {
                        "type": "integer",
                        "description": "ID de l'audit SEO"
                    }
                },
                "required": ["audit_id"]
            }
        ),
        Tool(
            name="get_seo_settings",
            description=(
                "Récupère la configuration SEO du compte : site web, secteur, "
                "langue cible, région, brand styles. "
                "Appeler pour connaître le contexte du client avant de générer du contenu."
            ),
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),

        # ── WORKFLOWS N8N — commentés, activer après validation ──

        # Tool(
        #     name="n8n_generate_blog_post",
        #     description=(
        #         "Génère un nouvel article SEO via le workflow n8n. "
        #         "Appeler quand le client demande de créer un article sur un sujet donné. "
        #         "⚠️ Workflow long (plusieurs minutes) — informer le client d'attendre."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "title": {
        #                 "type": "string",
        #                 "description": "Titre ou sujet de l'article à générer"
        #             },
        #             "keywords": {
        #                 "type": "array",
        #                 "items": {"type": "string"},
        #                 "description": "Mots-clés cibles pour l'article SEO"
        #             },
        #             "language": {
        #                 "type": "string",
        #                 "description": "Langue de l'article (défaut: fr)",
        #                 "default": "fr"
        #             }
        #         },
        #         "required": ["title", "keywords"]
        #     }
        # ),

        # Tool(
        #     name="n8n_generate_title_suggestions",
        #     description=(
        #         "Déclenche la génération IA de nouvelles suggestions de titres d'articles. "
        #         "Appeler quand le client veut de nouvelles idées d'articles à créer."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "target_region": {
        #                 "type": "string",
        #                 "description": "Région cible (ex: be, fr, nl)",
        #                 "default": "be"
        #             },
        #             "language": {
        #                 "type": "string",
        #                 "description": "Langue des suggestions (défaut: fr)",
        #                 "default": "fr"
        #             }
        #         }
        #     }
        # ),

        # Tool(
        #     name="n8n_generate_seo_audit",
        #     description=(
        #         "Déclenche un nouvel audit SEO complet via SE Ranking + n8n. "
        #         "⚠️ Workflow long (10-30 min) — nécessite Google Search Console connecté."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "domain": {
        #                 "type": "string",
        #                 "description": "Domaine à auditer (ex: elavi.com)"
        #             },
        #             "region": {
        #                 "type": "string",
        #                 "description": "Région cible (ex: be, fr, nl)",
        #                 "default": "be"
        #             },
        #             "language": {
        #                 "type": "string",
        #                 "description": "Langue de l'audit",
        #                 "default": "fr"
        #             }
        #         },
        #         "required": ["domain"]
        #     }
        # ),

        # Tool(
        #     name="n8n_regenerate_blog_post",
        #     description=(
        #         "Régénère un article existant dont la génération a échoué (status=failed). "
        #         "Appeler quand le client veut relancer la génération d'un article raté."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "post_id": {
        #                 "type": "integer",
        #                 "description": "ID de l'article à régénérer"
        #             }
        #         },
        #         "required": ["post_id"]
        #     }
        # ),

        # ── COMMENTÉ — validation requise ────────────────────────

        # Tool(
        #     name="publish_blog_post",
        #     description=(
        #         "Publie un article sur la plateforme liée. "
        #         "⚠️ Action irréversible — publier sur le site du client."
        #     ),
        #     inputSchema={
        #         "type": "object",
        #         "properties": {
        #             "post_id": {"type": "integer"}
        #         },
        #         "required": ["post_id"]
        #     }
        # ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    try:
        clean = {k: v for k, v in arguments.items() if v is not None}

        if name == "get_blog_posts":
            result = await api.get_blog_posts(
                status=clean.get("status"),
                limit=clean.get("limit", 20)
            )
        elif name == "get_blog_post":
            result = await api.get_blog_post(
                post_id=clean["post_id"]
            )
        elif name == "get_title_suggestions":
            result = await api.get_title_suggestions(
                status=clean.get("status")
            )
        elif name == "get_seo_audits":
            result = await api.get_seo_audits(
                limit=clean.get("limit", 20)
            )
        elif name == "get_seo_audit":
            result = await api.get_seo_audit(
                audit_id=clean["audit_id"]
            )
        elif name == "get_seo_audit_status":
            result = await api.get_seo_audit_status(
                audit_id=clean["audit_id"]
            )
        elif name == "get_seo_settings":
            result = await api.get_seo_settings()

        # ── Workflows n8n — décommenter après validation ─────────

        # elif name == "n8n_generate_blog_post":
        #     result = await api.n8n_generate_blog_post(
        #         title=clean["title"],
        #         keywords=clean["keywords"],
        #         language=clean.get("language", "fr")
        #     )
        # elif name == "n8n_generate_title_suggestions":
        #     result = await api.n8n_generate_title_suggestions(
        #         target_region=clean.get("target_region", "be"),
        #         language=clean.get("language", "fr")
        #     )
        # elif name == "n8n_generate_seo_audit":
        #     result = await api.n8n_generate_seo_audit(
        #         domain=clean["domain"],
        #         region=clean.get("region", "be"),
        #         language=clean.get("language", "fr")
        #     )
        # elif name == "n8n_regenerate_blog_post":
        #     result = await api.n8n_regenerate_blog_post(
        #         post_id=clean["post_id"]
        #     )

        # elif name == "publish_blog_post":
        #     result = await api.publish_blog_post(post_id=clean["post_id"])

        else:
            result = {"error": f"Outil inconnu: {name}"}

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]

    except Exception as e:
        return [TextContent(type="text", text=json.dumps({"error": str(e), "tool": name}))]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())