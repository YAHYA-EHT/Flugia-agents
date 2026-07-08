import { getRuntimeConfig, isEmbedded } from "./config";
import { ApiException, type AriaApi } from "./api";
import { tokenStorage } from "./tokenStorage";
import {
  mapAutonomy,
  mapEmailAccount,
  mapEmailContent,
  mapEmailRef,
  mapEmailRule,
  mapKnowledgeBase,
  mapKnowledgeDocument,
  mapPendingAction,
  mapReminder,
  mapUser,
  type AuthResult,
  type AutonomyLevel,
  type AutonomySetting,
  type ChatResult,
  type ConversationHistory,
  type EmailAccount,
  type EmailContent,
  type EmailRule,
  type EmailRuleAction,
  type KnowledgeBase,
  type KnowledgeDocument,
  type MessageRole,
  type PendingAction,
  type Reminder,
} from "./types";

/**
 * Real fetch-based client. Mirrors flutter_app/lib/services/api_service.dart:
 *  - Bearer auth on every non-/auth call
 *  - single refresh-and-retry on 401, then session-expired
 *  - error message read as detail -> message -> error
 */
export class ApiClient implements AriaApi {
  private get base() {
    return getRuntimeConfig().apiBaseUrl;
  }

  /** Called when refresh fails — app should route to login. */
  onSessionExpired?: () => void;

  /** Bearer token: host-injected when embedded, else local storage. */
  private async accessToken(): Promise<string | null> {
    const getter = getRuntimeConfig().getAccessToken;
    if (getter) return (await getter()) ?? null;
    return tokenStorage.access;
  }

  private async request<T>(
    path: string,
    opts: {
      method?: string;
      body?: unknown;
      auth?: boolean;
      _retried?: boolean;
    } = {},
  ): Promise<T> {
    const { method = "GET", body, auth = true } = opts;
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth) {
      const token = await this.accessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiException(
        "Could not reach the server. Is the backend running?",
      );
    }

    if (res.status === 401 && auth && !path.startsWith("/auth/") && !opts._retried) {
      // Embedded: the host owns auth — don't run our refresh flow.
      if (isEmbedded()) {
        getRuntimeConfig().onSessionExpired?.();
        this.onSessionExpired?.();
      } else if (await this.tryRefresh()) {
        return this.request<T>(path, { ...opts, _retried: true });
      } else {
        tokenStorage.clear();
        this.onSessionExpired?.();
      }
    }

    if (!res.ok) {
      throw new ApiException(await this.errorMessage(res), res.status);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async errorMessage(res: Response): Promise<string> {
    try {
      const data = await res.clone().json();
      const msg = data?.detail ?? data?.message ?? data?.error;
      if (msg) return String(msg);
    } catch {
      /* not JSON */
    }
    return `Request failed (${res.status}).`;
  }

  private async tryRefresh(): Promise<boolean> {
    const refresh = tokenStorage.refresh;
    if (!refresh) return false;
    try {
      const res = await fetch(`${this.base}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.access_token) return false;
      tokenStorage.save(data.access_token);
      return true;
    } catch {
      return false;
    }
  }

  // ---- Auth ---------------------------------------------------------------

  async googleLogin(code: string, redirectUri?: string): Promise<AuthResult> {
    const data = await this.request<Record<string, unknown>>(
      "/auth/google/login",
      {
        method: "POST",
        auth: false,
        body: {
          code,
          ...(redirectUri ? { redirect_uri: redirectUri } : {}),
        },
      },
    );
    const result: AuthResult = {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? null,
      user: mapUser(data.user),
    };
    tokenStorage.save(result.accessToken, result.refreshToken);
    return result;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const data = await this.request<Record<string, unknown>>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    const result: AuthResult = {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? null,
      user: mapUser(data.user),
    };
    tokenStorage.save(result.accessToken, result.refreshToken);
    return result;
  }

  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    const data = await this.request<Record<string, unknown>>("/auth/register", {
      method: "POST",
      auth: false,
      body: { email, password, ...(name ? { name } : {}) },
    });
    const result: AuthResult = {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? null,
      user: mapUser(data.user),
    };
    tokenStorage.save(result.accessToken, result.refreshToken);
    return result;
  }

  async me() {
    const data = await this.request<Record<string, unknown>>("/auth/me");
    return mapUser(data);
  }

  async logout(): Promise<void> {
    try {
      await this.request("/auth/logout", { method: "POST" });
    } catch {
      /* best-effort */
    } finally {
      tokenStorage.clear();
    }
  }

  // ---- Agent --------------------------------------------------------------

  async chat(args: {
    message: string;
    conversationId?: string;
    locale?: string;
    timezone?: string;
  }): Promise<ChatResult> {
    const data = await this.request<Record<string, unknown>>("/agent/chat", {
      method: "POST",
      body: {
        message: args.message,
        ...(args.conversationId
          ? { conversation_id: args.conversationId }
          : {}),
        ...(args.locale ? { locale: args.locale } : {}),
        ...(args.timezone ? { timezone: args.timezone } : {}),
      },
    });
    const refs = (data.references as unknown[]) ?? [];
    const sug = (data.suggestions as any[]) ?? [];
    return {
      reply: (data.reply as string) ?? "",
      conversationId: (data.conversation_id as string) ?? "",
      pendingAction: data.pending_action ? mapPendingAction(data.pending_action) : null,
      references: refs.length ? refs.map(mapEmailRef) : undefined,
      suggestions: sug.length
        ? sug.map((s: any) => ({
            label: s.label ?? "",
            body: s.body ?? "",
            to: s.to ?? "",
            messageId: s.message_id ?? "",
            subject: s.subject ?? "",
          }))
        : undefined,
      isAction: (data.is_action as boolean) ?? false,
      actionData: (data.action_data as import("./types").ActionData | null) ?? undefined,
    };
  }

  async chatStream(
    args: { message: string; conversationId?: string; locale?: string; timezone?: string },
    handlers: {
      onStart?: (conversationId: string) => void;
      onStatus?: (message: string) => void;
      onDelta?: (text: string) => void;
      onReset?: () => void;
    },
  ): Promise<ChatResult> {
    const token = await this.accessToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${this.base}/agent/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: args.message,
          ...(args.conversationId ? { conversation_id: args.conversationId } : {}),
          ...(args.locale ? { locale: args.locale } : {}),
          ...(args.timezone ? { timezone: args.timezone } : {}),
        }),
      });
    } catch {
      throw new ApiException("Could not reach the server. Is the backend running?");
    }

    if (res.status === 401) {
      if (isEmbedded()) getRuntimeConfig().onSessionExpired?.();
      else { tokenStorage.clear(); this.onSessionExpired?.(); }
      throw new ApiException("Session expired", 401);
    }
    if (!res.ok || !res.body) {
      throw new ApiException(await this.errorMessage(res), res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: ChatResult = {
      reply: "",
      conversationId: args.conversationId ?? "",
      pendingAction: null,
    };

    const handleEvent = (ev: Record<string, unknown>) => {
      switch (ev.type) {
        case "start":
          result.conversationId = (ev.conversation_id as string) ?? result.conversationId;
          handlers.onStart?.(result.conversationId);
          break;
        case "status":
          handlers.onStatus?.((ev.message as string) ?? "");
          break;
        case "delta":
          handlers.onDelta?.((ev.text as string) ?? "");
          break;
        case "reset":
          handlers.onReset?.();
          break;
        case "error":
          throw new ApiException((ev.message as string) ?? "Stream error");
        case "done": {
          const sug = (ev.suggestions as any[]) ?? [];
          const refs = (ev.references as unknown[]) ?? [];
          result = {
            reply: (ev.reply as string) ?? "",
            conversationId: (ev.conversation_id as string) ?? result.conversationId,
            pendingAction: ev.pending_action ? mapPendingAction(ev.pending_action as Record<string, unknown>) : null,
            references: refs.length ? refs.map(mapEmailRef) : undefined,
            suggestions: sug.length
              ? sug.map((s: any) => ({
                  label: s.label ?? "", body: s.body ?? "", to: s.to ?? "",
                  messageId: s.message_id ?? "", subject: s.subject ?? "",
                }))
              : undefined,
            isAction: (ev.is_action as boolean) ?? false,
            actionData: (ev.action_data as import("./types").ActionData | null) ?? undefined,
          };
          break;
        }
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const jsonStr = dataLine.slice(5).trim();
        if (!jsonStr) continue;
        try {
          handleEvent(JSON.parse(jsonStr));
        } catch (e) {
          if (e instanceof ApiException) throw e;
          /* ignore malformed frame */
        }
      }
    }
    return result;
  }

  async getEmail(messageId: string): Promise<EmailContent> {
    const data = await this.request(`/agent/emails/${messageId}`);
    return mapEmailContent(data);
  }

  async sendSuggestion(s: import("./types").SuggestedReply, conversationId?: string): Promise<{ sent: boolean; message: string }> {
    return this.request("/agent/send-suggestion", {
      method: "POST",
      body: {
        message_id: s.messageId,
        to: s.to,
        body: s.body,
        subject: s.subject,
        label: s.label,
        ...(conversationId ? { conversation_id: conversationId } : {}),
      },
    });
  }

  async getHistory(opts?: { limit?: number; before?: string; conversationId?: string }): Promise<import("./types").ConversationPage> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.before) params.set("before", opts.before);
    if (opts?.conversationId) params.set("conversation_id", opts.conversationId);
    const qs = params.toString();
    const raw = await this.request(`/agent/history${qs ? `?${qs}` : ""}`) as Record<string, unknown>;
    const msgs = (raw.messages as Record<string, unknown>[]) ?? [];
    return {
      conversationId: raw.conversation_id as string,
      hasMore: (raw.has_more as boolean) ?? false,
      messages: msgs.map((m) => ({
        role: m.role as MessageRole,
        content: m.content as string,
        createdAt: (m.created_at as string) ?? new Date().toISOString(),
        isAction: (m.is_action as boolean) ?? false,
        actionCancelled: (m.action_cancelled as boolean) ?? false,
        actionError: (m.action_error as string | null) ?? undefined,
        actionData: (m.action_data as import("./types").ActionData | null) ?? undefined,
        failedAction: m.failed_action ? mapPendingAction(m.failed_action as Record<string, unknown>) : undefined,
        suggestions: (m.suggestions as import("./types").SuggestedReply[] | null) ?? undefined,
      })),
    };
  }

  async listConversations(): Promise<import("./types").ConversationSummary[]> {
    const raw = await this.request("/agent/conversations") as { conversations?: Record<string, unknown>[] };
    return (raw.conversations ?? []).map((c) => ({
      conversationId: c.conversation_id as string,
      title: (c.title as string) ?? "New conversation",
      lastAt: (c.last_at as string | null) ?? null,
      messageCount: (c.message_count as number) ?? 0,
    }));
  }

  async transcribe(audio: Blob): Promise<string> {
    const form = new FormData();
    form.append("audio", audio, "audio.webm");
    const token = await this.accessToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(`${this.base}/agent/transcribe`, { method: "POST", headers, body: form });
    } catch {
      throw new Error("Could not reach the server for transcription.");
    }
    if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
    const data = await res.json() as { text: string };
    return data.text ?? "";
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.request(`/agent/conversation/${conversationId}`, {
      method: "DELETE",
    });
  }

  async confirm(
    pendingActionId: string,
    approved: boolean,
    opts?: { payloadOverride?: Record<string, unknown>; saveAsDraft?: boolean },
  ): Promise<string> {
    const data = await this.request<{ result: string; ok: boolean }>("/agent/confirm", {
      method: "POST",
      body: {
        pending_action_id: pendingActionId,
        approved,
        ...(opts?.payloadOverride ? { payload_override: opts.payloadOverride } : {}),
        ...(opts?.saveAsDraft ? { save_as_draft: true } : {}),
      },
    });
    if (data.ok === false) throw new ApiException(data.result ?? "Action failed");
    return data.result ?? "";
  }

  async getPendingAction(id: string): Promise<PendingAction> {
    const data = await this.request(`/agent/pending/${id}`);
    return mapPendingAction(data);
  }

  // ---- Preferences --------------------------------------------------------

  async getAutonomy(): Promise<AutonomySetting[]> {
    const data = await this.request<{ settings?: unknown[] }>(
      "/preferences/autonomy",
    );
    return (data.settings ?? []).map(mapAutonomy);
  }

  async setAutonomy(
    actionType: string,
    level: AutonomyLevel,
  ): Promise<AutonomySetting> {
    const data = await this.request("/preferences/autonomy", {
      method: "PUT",
      body: { action_type: actionType, level },
    });
    return mapAutonomy(data);
  }

  private mapNotificationPrefs(d: Record<string, unknown>): import("./types").NotificationPreferences {
    return {
      enabled: (d.enabled as boolean) ?? true,
      channelEmail: (d.channel_email as boolean) ?? false,
      channelWhatsapp: (d.channel_whatsapp as boolean) ?? false,
      notifyEmailAccountId: (d.notify_email_account_id as string | null) ?? null,
      notifyWhatsappNumberId: (d.notify_whatsapp_number_id as string | null) ?? null,
      eventNoticeMinutes: (d.event_notice_minutes as number) ?? 15,
    };
  }

  async getNotificationPreferences(): Promise<import("./types").NotificationPreferences> {
    return this.mapNotificationPrefs(await this.request<Record<string, unknown>>("/preferences/notifications"));
  }

  async setNotificationPreferences(
    patch: Partial<import("./types").NotificationPreferences>,
  ): Promise<import("./types").NotificationPreferences> {
    const body: Record<string, unknown> = {};
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    if (patch.channelEmail !== undefined) body.channel_email = patch.channelEmail;
    if (patch.channelWhatsapp !== undefined) body.channel_whatsapp = patch.channelWhatsapp;
    if (patch.notifyEmailAccountId !== undefined) body.notify_email_account_id = patch.notifyEmailAccountId;
    if (patch.notifyWhatsappNumberId !== undefined) body.notify_whatsapp_number_id = patch.notifyWhatsappNumberId;
    if (patch.eventNoticeMinutes !== undefined) body.event_notice_minutes = patch.eventNoticeMinutes;
    const data = await this.request<Record<string, unknown>>("/preferences/notifications", { method: "PUT", body });
    return this.mapNotificationPrefs(data);
  }

  async getEmailRules(): Promise<EmailRule[]> {
    const data = await this.request<{ rules?: unknown[] }>(
      "/preferences/email-rules",
    );
    return (data.rules ?? []).map(mapEmailRule);
  }

  async addEmailRule(args: {
    senderPattern: string;
    action: EmailRuleAction;
    notify: boolean;
  }): Promise<EmailRule> {
    const data = await this.request("/preferences/email-rules", {
      method: "POST",
      body: {
        sender_pattern: args.senderPattern,
        action: args.action,
        notify: args.notify,
      },
    });
    return mapEmailRule(data);
  }

  async deleteEmailRule(id: string): Promise<void> {
    await this.request(`/preferences/email-rules/${id}`, { method: "DELETE" });
  }

  // ---- Reminders ----------------------------------------------------------

  async getReminders(): Promise<Reminder[]> {
    const data = await this.request<{ reminders?: unknown[] }>("/reminders");
    return (data.reminders ?? []).map(mapReminder);
  }

  async deleteReminder(id: string): Promise<void> {
    await this.request(`/reminders/${id}`, { method: "DELETE" });
  }

  // ---- Device -------------------------------------------------------------

  async updateDeviceToken(
    fcmToken: string,
    coords?: { lat: number; lng: number },
  ): Promise<void> {
    await this.request("/preferences/device", {
      method: "POST",
      body: {
        fcm_token: fcmToken,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      },
    });
  }

  // ---- Setup status --------------------------------------------------------

  async getUserStatus(): Promise<{ gmailConnected: boolean; emailAccountsCount: number; setupCompleted: boolean }> {
    const data = await this.request<{ gmail_connected: boolean; email_accounts_count: number; setup_completed?: boolean }>("/auth/status");
    return {
      gmailConnected: data.gmail_connected,
      emailAccountsCount: data.email_accounts_count,
      setupCompleted: data.setup_completed ?? false,
    };
  }

  private mapProfile(d: Record<string, unknown>): import("./types").AgentProfile {
    return {
      agentName: (d.agent_name as string) ?? "Aria",
      tone: (d.tone as string) ?? "",
      doExamples: (d.do_examples as string) ?? "",
      dontExamples: (d.dont_examples as string) ?? "",
      scenarios: (d.scenarios as string) ?? "",
      setupCompleted: (d.setup_completed as boolean) ?? false,
    };
  }

  async getAgentProfile(): Promise<import("./types").AgentProfile> {
    return this.mapProfile(await this.request("/agent/profile"));
  }

  private mapWaNumber(d: Record<string, unknown>): import("./types").WhatsAppNumber {
    return {
      id: d.id as string,
      phoneNumber: d.phone_number as string,
      status: d.status as import("./types").WhatsAppStatus,
      verifiedAt: (d.verified_at as string | null) ?? null,
      lastInboundAt: (d.last_inbound_at as string | null) ?? null,
      createdAt: (d.created_at as string | null) ?? null,
    };
  }

  async listWhatsappNumbers(): Promise<import("./types").WhatsAppNumbersInfo> {
    const d = await this.request<Record<string, unknown>>("/whatsapp/numbers");
    return {
      numbers: ((d.numbers as Record<string, unknown>[]) ?? []).map((n) => this.mapWaNumber(n)),
      emailConnected: (d.email_connected as boolean) ?? false,
      canAdd: (d.can_add as boolean) ?? false,
      maxNumbers: (d.max_numbers as number) ?? 3,
    };
  }

  async addWhatsappNumber(phoneNumber: string): Promise<import("./types").WhatsAppNumber> {
    return this.mapWaNumber(await this.request("/whatsapp/numbers", { method: "POST", body: { phone_number: phoneNumber } }));
  }

  async verifyWhatsappNumber(id: string, code: string): Promise<import("./types").WhatsAppNumber> {
    return this.mapWaNumber(await this.request(`/whatsapp/numbers/${id}/verify`, { method: "POST", body: { code } }));
  }

  async resendWhatsappCode(id: string): Promise<import("./types").WhatsAppNumber> {
    return this.mapWaNumber(await this.request(`/whatsapp/numbers/${id}/resend`, { method: "POST" }));
  }

  async removeWhatsappNumber(id: string): Promise<void> {
    await this.request(`/whatsapp/numbers/${id}`, { method: "DELETE" });
  }

  async whatsappStatus(): Promise<{ configured: boolean; tokenValid: boolean }> {
    const d = await this.request<{ configured: boolean; token_valid: boolean }>("/whatsapp/status");
    return { configured: d.configured, tokenValid: d.token_valid };
  }

  private mapTelegramStatus(d: Record<string, unknown>): import("./types").TelegramStatus {
    return {
      status: d.status as import("./types").TelegramLinkStatus,
      link: (d.link as string | null) ?? null,
      linkedAt: (d.linked_at as string | null) ?? null,
      emailConnected: (d.email_connected as boolean) ?? false,
    };
  }

  async getTelegramStatus(): Promise<import("./types").TelegramStatus> {
    return this.mapTelegramStatus(await this.request("/telegram/status"));
  }

  async createTelegramLink(): Promise<import("./types").TelegramStatus> {
    return this.mapTelegramStatus(await this.request("/telegram/link", { method: "POST" }));
  }

  async unlinkTelegram(): Promise<void> {
    await this.request("/telegram", { method: "DELETE" });
  }

  private mapMessengerStatus(d: Record<string, unknown>): import("./types").MessengerStatus {
    return {
      status: d.status as import("./types").MessengerLinkStatus,
      link: (d.link as string | null) ?? null,
      linkedAt: (d.linked_at as string | null) ?? null,
      emailConnected: (d.email_connected as boolean) ?? false,
    };
  }

  async getMessengerStatus(): Promise<import("./types").MessengerStatus> {
    return this.mapMessengerStatus(await this.request("/messenger/status"));
  }

  async createMessengerLink(): Promise<import("./types").MessengerStatus> {
    return this.mapMessengerStatus(await this.request("/messenger/link", { method: "POST" }));
  }

  async unlinkMessenger(): Promise<void> {
    await this.request("/messenger", { method: "DELETE" });
  }

  async saveAgentProfile(patch: Partial<import("./types").AgentProfile>): Promise<import("./types").AgentProfile> {
    const body: Record<string, unknown> = {};
    if (patch.agentName !== undefined) body.agent_name = patch.agentName;
    if (patch.tone !== undefined) body.tone = patch.tone;
    if (patch.doExamples !== undefined) body.do_examples = patch.doExamples;
    if (patch.dontExamples !== undefined) body.dont_examples = patch.dontExamples;
    if (patch.scenarios !== undefined) body.scenarios = patch.scenarios;
    if (patch.setupCompleted !== undefined) body.setup_completed = patch.setupCompleted;
    return this.mapProfile(await this.request("/agent/profile", { method: "PUT", body }));
  }

  async deleteAgent(): Promise<void> {
    await this.request("/agent/profile", { method: "DELETE" });
  }

  async connectGmailFeature(returnTo: string): Promise<{ redirectUrl: string }> {
    // Authenticated feature-link flow: attaches Gmail to the current user and
    // persists tokens server-side. Independent of the platform session.
    const qs = `?return_to=${encodeURIComponent(returnTo)}`;
    const data = await this.request<{ redirect_url: string }>(`/email-accounts/oauth/start${qs}`);
    return { redirectUrl: data.redirect_url };
  }

  // ---- Email Automation — Accounts ----------------------------------------

  async listEmailAccounts(): Promise<EmailAccount[]> {
    const data = await this.request<{ accounts: unknown[] }>("/email-accounts");
    return (data.accounts ?? []).map(mapEmailAccount);
  }

  async createEmailAccount(email: string, displayName?: string): Promise<EmailAccount> {
    const data = await this.request<unknown>("/email-accounts", {
      method: "POST",
      body: { email, display_name: displayName ?? null },
    });
    return mapEmailAccount(data);
  }

  async updateEmailAccount(
    id: string,
    patch: { displayName?: string; systemPrompt?: string; isActive?: boolean },
  ): Promise<EmailAccount> {
    const data = await this.request<unknown>(`/email-accounts/${id}`, {
      method: "PATCH",
      body: {
        ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
        ...(patch.systemPrompt !== undefined ? { system_prompt: patch.systemPrompt } : {}),
        ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
      },
    });
    return mapEmailAccount(data);
  }

  async deleteEmailAccount(id: string): Promise<void> {
    await this.request(`/email-accounts/${id}`, { method: "DELETE" });
  }

  async generatePrompt(accountId: string, description: string): Promise<string> {
    const data = await this.request<{ prompt: string }>(`/email-accounts/${accountId}/generate-prompt`, {
      method: "POST",
      body: { description },
    });
    return data.prompt;
  }

  async listAccountKbs(accountId: string): Promise<KnowledgeBase[]> {
    const data = await this.request<{ kbs: unknown[] }>(`/email-accounts/${accountId}/kbs`);
    return (data.kbs ?? []).map(mapKnowledgeBase);
  }

  async attachKb(accountId: string, kbId: string): Promise<void> {
    await this.request(`/email-accounts/${accountId}/kbs/${kbId}`, { method: "POST" });
  }

  async detachKb(accountId: string, kbId: string): Promise<void> {
    await this.request(`/email-accounts/${accountId}/kbs/${kbId}`, { method: "DELETE" });
  }

  // ---- Email Automation — Knowledge Bases ---------------------------------

  async listKnowledgeBases(): Promise<KnowledgeBase[]> {
    const data = await this.request<{ knowledge_bases: unknown[] }>("/knowledge-bases");
    return (data.knowledge_bases ?? []).map(mapKnowledgeBase);
  }

  async createKnowledgeBase(name: string, description: string): Promise<KnowledgeBase> {
    const data = await this.request<unknown>("/knowledge-bases", {
      method: "POST",
      body: { name, description },
    });
    return mapKnowledgeBase(data);
  }

  async updateKnowledgeBase(
    id: string,
    patch: { name?: string; description?: string },
  ): Promise<KnowledgeBase> {
    const data = await this.request<unknown>(`/knowledge-bases/${id}`, {
      method: "PATCH",
      body: patch,
    });
    return mapKnowledgeBase(data);
  }

  async deleteKnowledgeBase(id: string): Promise<void> {
    await this.request(`/knowledge-bases/${id}`, { method: "DELETE" });
  }

  async listDocuments(kbId: string): Promise<KnowledgeDocument[]> {
    const data = await this.request<{ documents: unknown[] }>(`/knowledge-bases/${kbId}/documents`);
    return (data.documents ?? []).map(mapKnowledgeDocument);
  }

  async addDocument(
    kbId: string,
    doc: { name: string; content: string; source: string },
  ): Promise<KnowledgeDocument> {
    const data = await this.request<unknown>(`/knowledge-bases/${kbId}/documents`, {
      method: "POST",
      body: doc,
    });
    return mapKnowledgeDocument(data);
  }

  async uploadDocument(kbId: string, file: File): Promise<KnowledgeDocument> {
    const form = new FormData();
    form.append("file", file);
    const token = tokenStorage.access ?? "";
    const res = await fetch(`${this.base}/knowledge-bases/${kbId}/documents/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { detail?: string };
      throw new Error(err.detail ?? `Upload failed (${res.status})`);
    }
    return mapKnowledgeDocument(await res.json());
  }

  async ingestUrl(kbId: string, url: string, name?: string): Promise<KnowledgeDocument> {
    const data = await this.request<unknown>(`/knowledge-bases/${kbId}/documents/url`, {
      method: "POST",
      body: { url, name: name ?? null },
    });
    return mapKnowledgeDocument(data);
  }

  async scrapeWebsite(kbId: string, url: string, maxPages = 200): Promise<{ message: string; pagesQueued: number }> {
    const data = await this.request<{ message: string; pages_queued: number }>(
      `/knowledge-bases/${kbId}/documents/scrape`,
      { method: "POST", body: { url, max_pages: maxPages } },
    );
    return { message: data.message, pagesQueued: data.pages_queued };
  }

  async deleteDocument(kbId: string, docId: string): Promise<void> {
    await this.request(`/knowledge-bases/${kbId}/documents/${docId}`, { method: "DELETE" });
  }
}
