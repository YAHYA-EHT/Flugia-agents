import type { AriaApi } from "./api";
import type {
  AuthResult,
  AutonomyLevel,
  AutonomySetting,
  ChatResult,
  EmailAccount,
  EmailContent,
  EmailRef,
  EmailRule,
  EmailRuleAction,
  KnowledgeBase,
  KnowledgeDocument,
  PendingAction,
  Reminder,
} from "./types";
import { ACTION_TYPES } from "./types";

const MOCK_EMAILS: EmailRef[] = [
  {
    id: "e1",
    threadId: "t1",
    sender: "Alice Martin <alice@client.com>",
    subject: "Projet Q3 — point d'avancement",
    date: "Today, 09:12",
    snippet:
      "Bonjour, peux-tu me confirmer la deadline pour la phase 2 ? On aimerait caler le planning…",
    unread: true,
  },
  {
    id: "e2",
    threadId: "t2",
    sender: "Manager <boss@mycompany.com>",
    subject: "Réunion demain 14h",
    date: "Today, 08:30",
    snippet: "On se cale à 14h en salle B pour le kickoff. Apporte le deck.",
    unread: true,
  },
  {
    id: "e3",
    threadId: "t3",
    sender: "Newsletter <news@example.com>",
    subject: "Votre digest hebdomadaire",
    date: "Yesterday",
    snippet: "Les 10 articles les plus lus cette semaine…",
    unread: false,
  },
];

const LATENCY = 450;
const delay = <T>(value: T): Promise<T> =>
  new Promise((r) => setTimeout(() => r(value), LATENCY));

const iso = (d: Date) => d.toISOString();
const now = () => new Date();
const plus = (ms: number) => new Date(Date.now() + ms);

/**
 * In-memory backend for developing the UI without a server.
 * Faithful port of flutter_app/lib/services/mock_api_service.dart.
 */
export class MockApi implements AriaApi {
  private autonomy: AutonomySetting[] = ACTION_TYPES.map((t) => ({
    actionType: t,
    level: (t === "mark_read" || t === "schedule_reminder"
      ? "auto"
      : "ask") as AutonomyLevel,
  }));

  private rules: EmailRule[] = [
    {
      id: "r1",
      senderPattern: "@newsletters.example.com",
      action: "archive",
      notify: false,
      createdAt: iso(plus(-3 * 864e5)),
    },
    {
      id: "r2",
      senderPattern: "spam@promo.io",
      action: "block",
      notify: false,
      createdAt: iso(plus(-1 * 864e5)),
    },
  ];

  private reminders: Reminder[] = [
    {
      id: "m1",
      message: "Your 14:00 Client meeting is 30 min away. Leave by 13:20.",
      fireAt: iso(plus(2 * 36e5)),
      fired: false,
      source: "calendar_event:abc123",
    },
    {
      id: "m2",
      message: "Call the dentist back",
      fireAt: iso(plus(27 * 36e5)),
      fired: false,
    },
  ];

  private turn = 0;

  async googleLogin(): Promise<AuthResult> {
    return delay({
      accessToken: "mock.jwt.token",
      refreshToken: "mock.refresh.token",
      user: { id: "mock-user", email: "you@example.com", displayName: "You" },
    });
  }

  async login(email: string): Promise<AuthResult> {
    const name = email.split("@")[0] || "You";
    return delay({
      accessToken: "mock.jwt.token",
      refreshToken: "mock.refresh.token",
      user: { id: "mock-user", email, displayName: name.charAt(0).toUpperCase() + name.slice(1) },
    });
  }

  async register(email: string, _password: string, name?: string): Promise<AuthResult> {
    return delay({
      accessToken: "mock.jwt.token",
      refreshToken: "mock.refresh.token",
      user: { id: "mock-user", email, displayName: name ?? "You" },
    });
  }

  async me() {
    return delay({ id: "mock-user", email: "you@example.com", displayName: "You" });
  }

  async logout(): Promise<void> {
    await delay(null);
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
    const result = await this.chat(args);
    handlers.onStart?.(result.conversationId);
    if (result.pendingAction) return result; // action card — nothing to stream
    // Fake token streaming of the reply for the dev typewriter effect.
    const words = result.reply.split(/(\s+)/);
    let acc = "";
    for (const w of words) {
      acc += w;
      handlers.onDelta?.(w);
      await new Promise((r) => setTimeout(r, 24));
    }
    return { ...result, reply: acc };
  }

  async chat(args: { message: string; conversationId?: string }): Promise<ChatResult> {
    await delay(null);
    this.turn += 1;
    const conversationId = args.conversationId ?? "mock-conv-1";

    if (this.turn % 3 === 0) {
      return {
        reply:
          "I drafted a reply to that email. Want me to send it? (this is mock data)",
        conversationId,
        pendingAction: {
          id: `pa-${this.turn}`,
          actionType: "reply_email",
          payload: {
            to: "sender@example.com",
            body: "Thanks for your message — I'll get back to you shortly.",
          },
          status: "pending",
          createdAt: iso(now()),
        },
      };
    }
    const m = args.message.toLowerCase();
    const emailish =
      m.includes("email") || m.includes("inbox") || m.includes("mail");
    const references = emailish
      ? m.includes("unread")
        ? MOCK_EMAILS.filter((e) => e.unread)
        : MOCK_EMAILS
      : undefined;
    return {
      reply: this.mockReply(args.message),
      conversationId,
      references,
    };
  }

  private mockReply(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("email") || m.includes("inbox") || m.includes("mail"))
      return "Here are your most recent emails. **2 are unread** — Alice is asking about the Phase 2 deadline, and your manager confirmed tomorrow's 14h kickoff.";
    if (m.includes("calendar") || m.includes("meeting"))
      return 'Your next event is "Client meeting @ WeWork" today at 14:00. (mock)';
    if (m.includes("remind"))
      return "Done — I've scheduled that reminder for you. (mock)";
    return "Got it. I'm running in mock mode right now, so I'm not hitting the real backend yet.";
  }

  async confirm(_id: string, approved: boolean, opts?: { saveAsDraft?: boolean }): Promise<string> {
    if (!approved) return delay("Okay, I won't do that.");
    return delay(opts?.saveAsDraft ? "Draft saved." : "Done — I sent it.");
  }

  async getPendingAction(id: string): Promise<PendingAction> {
    return delay({
      id,
      actionType: "reply_email",
      payload: {
        to: "sender@example.com",
        body: "Thanks for your message — I'll get back to you shortly.",
      },
      status: "pending",
      createdAt: iso(now()),
    });
  }

  async getHistory(opts?: { conversationId?: string }): Promise<import("./types").ConversationPage> {
    await delay(null);
    return { conversationId: opts?.conversationId ?? "mock-conv-1", messages: [], hasMore: false };
  }

  async listConversations(): Promise<import("./types").ConversationSummary[]> {
    return delay([
      { conversationId: "mock-conv-1", title: "Summarize my unread emails", lastAt: iso(now()), messageCount: 6 },
      { conversationId: "mock-conv-2", title: "Schedule a meeting Thursday", lastAt: iso(now()), messageCount: 4 },
    ]);
  }

  async transcribe(_audio: Blob): Promise<string> {
    await delay(null);
    return "Mock transcription";
  }

  async deleteConversation(_conversationId: string): Promise<void> {
    await delay(null);
  }

  async sendSuggestion(s: import("./types").SuggestedReply, _conversationId?: string): Promise<{ sent: boolean; message: string }> {
    return delay({ sent: true, message: `Reply sent to ${s.to}. (mock)` });
  }

  async getEmail(messageId: string): Promise<EmailContent> {
    await delay(null);
    const ref =
      MOCK_EMAILS.find((e) => e.id === messageId) ?? MOCK_EMAILS[0];
    return {
      ...ref,
      to: "you@example.com",
      body:
        `${ref.snippet}\n\n` +
        "Lorem ipsum — ceci est le corps complet (simulé) de l'email. " +
        "En production, ce contenu provient de l'API Gmail via le backend.\n\n" +
        "Bien à toi,\n" +
        ref.sender.split("<")[0].trim(),
    };
  }

  async getAutonomy(): Promise<AutonomySetting[]> {
    return delay([...this.autonomy]);
  }

  async setAutonomy(
    actionType: string,
    level: AutonomyLevel,
  ): Promise<AutonomySetting> {
    await delay(null);
    const i = this.autonomy.findIndex((a) => a.actionType === actionType);
    const updated = { actionType: actionType as AutonomySetting["actionType"], level };
    if (i >= 0) this.autonomy[i] = updated;
    else this.autonomy.push(updated);
    return updated;
  }

  private mockNotificationPrefs: import("./types").NotificationPreferences = {
    enabled: true,
    channelEmail: false,
    channelWhatsapp: false,
    notifyEmailAccountId: null,
    notifyWhatsappNumberId: null,
    eventNoticeMinutes: 15,
  };

  async getNotificationPreferences(): Promise<import("./types").NotificationPreferences> {
    return delay({ ...this.mockNotificationPrefs });
  }

  async setNotificationPreferences(
    patch: Partial<import("./types").NotificationPreferences>,
  ): Promise<import("./types").NotificationPreferences> {
    this.mockNotificationPrefs = { ...this.mockNotificationPrefs, ...patch };
    return delay({ ...this.mockNotificationPrefs });
  }

  async getEmailRules(): Promise<EmailRule[]> {
    return delay([...this.rules]);
  }

  async addEmailRule(args: {
    senderPattern: string;
    action: EmailRuleAction;
    notify: boolean;
  }): Promise<EmailRule> {
    await delay(null);
    const rule: EmailRule = {
      id: `r${Date.now()}`,
      senderPattern: args.senderPattern,
      action: args.action,
      notify: args.notify,
      createdAt: iso(now()),
    };
    this.rules.push(rule);
    return rule;
  }

  async deleteEmailRule(id: string): Promise<void> {
    await delay(null);
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  async getReminders(): Promise<Reminder[]> {
    return delay([...this.reminders]);
  }

  async deleteReminder(id: string): Promise<void> {
    await delay(null);
    this.reminders = this.reminders.filter((r) => r.id !== id);
  }

  async updateDeviceToken(): Promise<void> {
    await delay(null);
  }

  // ---- Email Automation ---------------------------------------------------

  private emailAccounts: EmailAccount[] = [
    {
      id: "ea-1",
      userId: "mock-user",
      email: "info@example.com",
      displayName: "Info Mailbox",
      systemPrompt: "[IDENTITY]\nYou are an automated email assistant...\n\n[COMPLIANCE FILTER — HARD BLOCK]\nEscalate if: warranty, injury, GDPR...",
      isActive: true,
      lastFetchedAt: null,
      createdAt: new Date().toISOString(),
    },
  ];

  private knowledgeBases: KnowledgeBase[] = [
    {
      id: "kb-global-1",
      ownerId: null,
      name: "General FAQ",
      description: "Global FAQ available to all accounts",
      isGlobal: true,
      documentCount: 3,
      createdAt: new Date().toISOString(),
    },
    {
      id: "kb-1",
      ownerId: "mock-user",
      name: "Product Documentation",
      description: "Internal product specs and manuals",
      isGlobal: false,
      documentCount: 2,
      createdAt: new Date().toISOString(),
    },
  ];

  private documents: KnowledgeDocument[] = [
    {
      id: "doc-1",
      kbId: "kb-1",
      name: "Product Spec Sheet",
      content: "Full technical specifications for all product lines...",
      source: "specs-v2.pdf",
      createdAt: new Date().toISOString(),
    },
    {
      id: "doc-2",
      kbId: "kb-1",
      name: "Installation Guide",
      content: "Step-by-step installation instructions...",
      source: "install-guide.pdf",
      createdAt: new Date().toISOString(),
    },
  ];

  private accountKbs: Record<string, string[]> = { "ea-1": ["kb-global-1"] };

  private mockProfile: import("./types").AgentProfile = {
    agentName: "Aria", tone: "", doExamples: "", dontExamples: "", scenarios: "", setupCompleted: false,
  };

  async getUserStatus() {
    return delay({
      gmailConnected: true, // mock: pretend Google is always linked so the wizard can proceed
      emailAccountsCount: this.emailAccounts.length,
      setupCompleted: this.mockProfile.setupCompleted,
    });
  }

  async getAgentProfile() {
    return delay({ ...this.mockProfile });
  }

  private mockWaNumbers: import("./types").WhatsAppNumber[] = [];

  async listWhatsappNumbers(): Promise<import("./types").WhatsAppNumbersInfo> {
    const emailConnected = true; // mock: email always connected
    const active = this.mockWaNumbers.filter((n) => n.status === "active" || n.status === "pending_verification").length;
    return delay({ numbers: [...this.mockWaNumbers], emailConnected, canAdd: emailConnected && active < 3, maxNumbers: 3 });
  }

  async addWhatsappNumber(phoneNumber: string): Promise<import("./types").WhatsAppNumber> {
    const n: import("./types").WhatsAppNumber = {
      id: `wa-${Date.now()}`, phoneNumber, status: "pending_verification",
      verifiedAt: null, lastInboundAt: null, createdAt: iso(now()),
    };
    this.mockWaNumbers.push(n);
    return delay(n);
  }

  async verifyWhatsappNumber(id: string): Promise<import("./types").WhatsAppNumber> {
    const n = this.mockWaNumbers.find((x) => x.id === id);
    if (n) { n.status = "active"; n.verifiedAt = iso(now()); }
    return delay(n ?? { id, phoneNumber: "", status: "active" });
  }

  async resendWhatsappCode(id: string): Promise<import("./types").WhatsAppNumber> {
    const n = this.mockWaNumbers.find((x) => x.id === id);
    return delay(n ?? { id, phoneNumber: "", status: "pending_verification" });
  }

  async removeWhatsappNumber(id: string): Promise<void> {
    this.mockWaNumbers = this.mockWaNumbers.filter((x) => x.id !== id);
    await delay(null);
  }

  async whatsappStatus(): Promise<{ configured: boolean; tokenValid: boolean }> {
    return delay({ configured: true, tokenValid: true });
  }

  private mockTelegramStatus: import("./types").TelegramLinkStatus = "not_linked";

  async getTelegramStatus(): Promise<import("./types").TelegramStatus> {
    return delay({
      status: this.mockTelegramStatus,
      link: this.mockTelegramStatus === "pending_link" ? "https://t.me/AriaAssistantBot?start=mock-code" : null,
      linkedAt: this.mockTelegramStatus === "active" ? iso(now()) : null,
      emailConnected: true,
    });
  }

  async createTelegramLink(): Promise<import("./types").TelegramStatus> {
    if (this.mockTelegramStatus !== "active") this.mockTelegramStatus = "pending_link";
    return this.getTelegramStatus();
  }

  async unlinkTelegram(): Promise<void> {
    this.mockTelegramStatus = "not_linked";
    await new Promise((r) => setTimeout(r, 24));
  }

  private mockMessengerStatus: import("./types").MessengerLinkStatus = "not_linked";

  async getMessengerStatus(): Promise<import("./types").MessengerStatus> {
    return delay({
      status: this.mockMessengerStatus,
      link: this.mockMessengerStatus === "pending_link" ? "https://m.me/ariabot?ref=mock-code" : null,
      linkedAt: this.mockMessengerStatus === "active" ? iso(now()) : null,
      emailConnected: true,
    });
  }

  async createMessengerLink(): Promise<import("./types").MessengerStatus> {
    if (this.mockMessengerStatus !== "active") this.mockMessengerStatus = "pending_link";
    return this.getMessengerStatus();
  }

  async unlinkMessenger(): Promise<void> {
    this.mockMessengerStatus = "not_linked";
    await new Promise((r) => setTimeout(r, 24));
  }

  async saveAgentProfile(patch: Partial<import("./types").AgentProfile>) {
    this.mockProfile = { ...this.mockProfile, ...patch };
    return delay({ ...this.mockProfile });
  }

  async deleteAgent(): Promise<void> {
    await new Promise((r) => setTimeout(r, 24));
  }

  async connectGmailFeature(returnTo: string) {
    // Mock: no real OAuth — pretend the feature is already linked and bounce back.
    return delay({ redirectUrl: returnTo });
  }

  async listEmailAccounts(): Promise<EmailAccount[]> {
    return delay([...this.emailAccounts]);
  }

  async createEmailAccount(email: string, displayName?: string): Promise<EmailAccount> {
    await delay(null);
    const account: EmailAccount = {
      id: `ea-${Date.now()}`,
      userId: "mock-user",
      email,
      displayName: displayName ?? null,
      systemPrompt: "",
      isActive: true,
      lastFetchedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.emailAccounts.push(account);
    this.accountKbs[account.id] = [];
    return account;
  }

  async updateEmailAccount(
    id: string,
    patch: { displayName?: string; systemPrompt?: string; isActive?: boolean },
  ): Promise<EmailAccount> {
    await delay(null);
    const account = this.emailAccounts.find((a) => a.id === id);
    if (!account) throw new Error("Not found");
    if (patch.displayName !== undefined) account.displayName = patch.displayName;
    if (patch.systemPrompt !== undefined) account.systemPrompt = patch.systemPrompt;
    if (patch.isActive !== undefined) account.isActive = patch.isActive;
    return { ...account };
  }

  async deleteEmailAccount(id: string): Promise<void> {
    await delay(null);
    this.emailAccounts = this.emailAccounts.filter((a) => a.id !== id);
    delete this.accountKbs[id];
  }

  async generatePrompt(_accountId: string, description: string): Promise<string> {
    await delay(null);
    return `[IDENTITY]
You are an automated email assistant. ${description}

[COMPLIANCE FILTER — HARD BLOCK]
Immediately classify as ESCALATE if the email contains any of:
warranty, liability, injury, damage, complaint, GDPR, fraud, court
→ Forward to: {escalation_email}
→ Do NOT generate any substantive response

[SENDER CLASSIFICATION]
Identify the sender as: end_customer | dealer | internal | unknown

[INTENT ROUTING]
- AUTO_REPLY (confidence ≥ 85%): General FAQ, product info, website content
- DRAFT_REVIEW (confidence ≥ 70%): Technical questions, manuals, specifications
- FORWARD: Pricing, lead times, commercial requests → {sales_email}
- ESCALATE: See compliance filter above

[TONE & LANGUAGE]
Professional and warm. Never mention AI or chatbot.
Respond in the same language as the incoming email (NL/FR/EN/DE).

[CONSTRAINTS]
Never mention prices, discounts, or delivery times.
Always include a way to contact a human directly.

[FORWARDING RULES]
Pricing requests → {sales_email}
Commercial inquiries → {account_manager_email}
Legal/compliance → {escalation_email}`;
  }

  async listAccountKbs(accountId: string): Promise<KnowledgeBase[]> {
    await delay(null);
    const ids = this.accountKbs[accountId] ?? [];
    return this.knowledgeBases.filter((kb) => ids.includes(kb.id));
  }

  async attachKb(accountId: string, kbId: string): Promise<void> {
    await delay(null);
    if (!this.accountKbs[accountId]) this.accountKbs[accountId] = [];
    if (!this.accountKbs[accountId].includes(kbId)) {
      this.accountKbs[accountId].push(kbId);
    }
  }

  async detachKb(accountId: string, kbId: string): Promise<void> {
    await delay(null);
    if (this.accountKbs[accountId]) {
      this.accountKbs[accountId] = this.accountKbs[accountId].filter((id) => id !== kbId);
    }
  }

  async listKnowledgeBases(): Promise<KnowledgeBase[]> {
    return delay([...this.knowledgeBases]);
  }

  async createKnowledgeBase(name: string, description: string): Promise<KnowledgeBase> {
    await delay(null);
    const kb: KnowledgeBase = {
      id: `kb-${Date.now()}`,
      ownerId: "mock-user",
      name,
      description,
      isGlobal: false,
      documentCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.knowledgeBases.push(kb);
    return kb;
  }

  async updateKnowledgeBase(
    id: string,
    patch: { name?: string; description?: string },
  ): Promise<KnowledgeBase> {
    await delay(null);
    const kb = this.knowledgeBases.find((k) => k.id === id);
    if (!kb) throw new Error("Not found");
    if (patch.name !== undefined) kb.name = patch.name;
    if (patch.description !== undefined) kb.description = patch.description;
    return { ...kb };
  }

  async deleteKnowledgeBase(id: string): Promise<void> {
    await delay(null);
    this.knowledgeBases = this.knowledgeBases.filter((k) => k.id !== id);
    this.documents = this.documents.filter((d) => d.kbId !== id);
  }

  async listDocuments(kbId: string): Promise<KnowledgeDocument[]> {
    return delay(this.documents.filter((d) => d.kbId === kbId));
  }

  async addDocument(
    kbId: string,
    doc: { name: string; content: string; source: string },
  ): Promise<KnowledgeDocument> {
    await delay(null);
    const d: KnowledgeDocument = {
      id: `doc-${Date.now()}`,
      kbId,
      name: doc.name,
      content: doc.content,
      source: doc.source,
      createdAt: new Date().toISOString(),
    };
    this.documents.push(d);
    const kb = this.knowledgeBases.find((k) => k.id === kbId);
    if (kb) kb.documentCount += 1;
    return d;
  }

  async uploadDocument(kbId: string, file: File): Promise<KnowledgeDocument> {
    await delay(null);
    const doc: KnowledgeDocument = {
      id: `doc-${Date.now()}`, kbId, name: file.name,
      content: `[file content of ${file.name}]`, source: file.name, createdAt: iso(now()),
    };
    this.documents.push(doc);
    const kb = this.knowledgeBases.find((k) => k.id === kbId);
    if (kb) kb.documentCount += 1;
    return doc;
  }

  async ingestUrl(kbId: string, url: string, name?: string): Promise<KnowledgeDocument> {
    await delay(null);
    const docName = name ?? url.split("/").pop() ?? "document";
    const doc: KnowledgeDocument = {
      id: `doc-${Date.now()}`, kbId, name: docName,
      content: `[content from ${url}]`, source: url, createdAt: iso(now()),
    };
    this.documents.push(doc);
    const kb = this.knowledgeBases.find((k) => k.id === kbId);
    if (kb) kb.documentCount += 1;
    return doc;
  }

  async scrapeWebsite(kbId: string, url: string): Promise<{ message: string; pagesQueued: number }> {
    await delay(null);
    return { message: "Scraping started (mock). Pages will appear shortly.", pagesQueued: 5 };
  }

  async deleteDocument(kbId: string, docId: string): Promise<void> {
    await delay(null);
    this.documents = this.documents.filter((d) => !(d.id === docId && d.kbId === kbId));
    const kb = this.knowledgeBases.find((k) => k.id === kbId);
    if (kb && kb.documentCount > 0) kb.documentCount -= 1;
  }
}
