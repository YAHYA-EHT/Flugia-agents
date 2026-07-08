import type {
  AuthResult,
  AutonomyLevel,
  AutonomySetting,
  ChatResult,
  ConversationHistory,
  EmailContent,
  EmailRule,
  EmailRuleAction,
  PendingAction,
  Reminder,
  SuggestedReply,
} from "./types";

/** Thrown for any non-2xx response or transport failure. */
export class ApiException extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiException";
    this.status = status;
  }
}

/**
 * The backend contract the app depends on, implemented by both the real
 * ApiClient and the in-memory MockApi. Mirrors flutter_app AriaApi.
 */
export interface AriaApi {
  // Auth
  googleLogin(code: string, redirectUri?: string): Promise<AuthResult>;
  /** Platform login with email + password. Independent of Gmail. */
  login(email: string, password: string): Promise<AuthResult>;
  /** Create a platform account. Independent of Gmail. */
  register(email: string, password: string, name?: string): Promise<AuthResult>;
  /** Current user from a stored session (rehydrate profile after reload). */
  me(): Promise<import("./types").User>;
  logout(): Promise<void>;

  // Agent
  chat(args: {
    message: string;
    conversationId?: string;
    locale?: string;
    timezone?: string;
  }): Promise<ChatResult>;
  /**
   * Streaming variant of chat over SSE. Invokes handlers as events arrive and
   * resolves with the final ChatResult. Falls back to chat() semantics.
   */
  chatStream(
    args: { message: string; conversationId?: string; locale?: string; timezone?: string },
    handlers: {
      onStart?: (conversationId: string) => void;
      onStatus?: (message: string) => void;
      onDelta?: (text: string) => void;
      onReset?: () => void;
    },
  ): Promise<ChatResult>;
  confirm(
    pendingActionId: string,
    approved: boolean,
    opts?: { payloadOverride?: Record<string, unknown>; saveAsDraft?: boolean },
  ): Promise<string>;
  getPendingAction(id: string): Promise<PendingAction>;
  /** Full content of a referenced email (for the expandable card). */
  getEmail(messageId: string): Promise<EmailContent>;
  /** Send a suggested reply directly (chip tap = user has approved). */
  sendSuggestion(s: SuggestedReply, conversationId?: string): Promise<{ sent: boolean; message: string }>;
  /** Load a conversation from the backend (latest when no id given). */
  getHistory(opts?: { limit?: number; before?: string; conversationId?: string }): Promise<import("./types").ConversationPage>;
  /** List the user's conversations for the history sidebar. */
  listConversations(): Promise<import("./types").ConversationSummary[]>;
  /** Transcribe audio to text (key stays server-side). */
  transcribe(audio: Blob): Promise<string>;
  /** Permanently delete all messages for a conversation (irreversible). */
  deleteConversation(conversationId: string): Promise<void>;

  // Preferences
  getAutonomy(): Promise<AutonomySetting[]>;
  setAutonomy(
    actionType: string,
    level: AutonomyLevel,
  ): Promise<AutonomySetting>;
  getNotificationPreferences(): Promise<import("./types").NotificationPreferences>;
  setNotificationPreferences(
    patch: Partial<import("./types").NotificationPreferences>,
  ): Promise<import("./types").NotificationPreferences>;
  getEmailRules(): Promise<EmailRule[]>;
  addEmailRule(args: {
    senderPattern: string;
    action: EmailRuleAction;
    notify: boolean;
  }): Promise<EmailRule>;
  deleteEmailRule(id: string): Promise<void>;

  // Reminders
  getReminders(): Promise<Reminder[]>;
  deleteReminder(id: string): Promise<void>;

  // Device / FCM
  updateDeviceToken(
    fcmToken: string,
    coords?: { lat: number; lng: number },
  ): Promise<void>;

  // Setup status — used to gate features that require Gmail / onboarding
  getUserStatus(): Promise<{ gmailConnected: boolean; emailAccountsCount: number; setupCompleted: boolean }>;
  /** Personalised agent profile (onboarding wizard). */
  getAgentProfile(): Promise<import("./types").AgentProfile>;
  saveAgentProfile(patch: Partial<import("./types").AgentProfile>): Promise<import("./types").AgentProfile>;
  /** Deletes the agent feature only (profile, emails, WhatsApp, history, KBs) — irreversible.
   * The platform account itself is untouched, so the caller should NOT sign out afterward. */
  deleteAgent(): Promise<void>;

  // WhatsApp channel — cannot be set up without a connected email (backend-enforced too).
  listWhatsappNumbers(): Promise<import("./types").WhatsAppNumbersInfo>;
  addWhatsappNumber(phoneNumber: string): Promise<import("./types").WhatsAppNumber>;
  verifyWhatsappNumber(id: string, code: string): Promise<import("./types").WhatsAppNumber>;
  resendWhatsappCode(id: string): Promise<import("./types").WhatsAppNumber>;
  removeWhatsappNumber(id: string): Promise<void>;
  /** Channel health — server configured + Meta token valid (drives a warning banner). */
  whatsappStatus(): Promise<{ configured: boolean; tokenValid: boolean }>;

  // Telegram channel — cannot be set up without a connected email (backend-enforced too).
  getTelegramStatus(): Promise<import("./types").TelegramStatus>;
  createTelegramLink(): Promise<import("./types").TelegramStatus>;
  unlinkTelegram(): Promise<void>;

  // Messenger channel — cannot be set up without a connected email (backend-enforced too).
  getMessengerStatus(): Promise<import("./types").MessengerStatus>;
  createMessengerLink(): Promise<import("./types").MessengerStatus>;
  unlinkMessenger(): Promise<void>;

  /**
   * Begin the Gmail *feature* connection (authenticated). Returns the Google
   * OAuth redirect URL the browser should navigate to. This attaches Gmail to
   * the already-logged-in user and persists tokens in the DB — it does NOT
   * create or depend on the platform session. Connect once; survives logout.
   */
  connectGmailFeature(returnTo: string): Promise<{ redirectUrl: string }>;

  // Email Automation — Accounts
  listEmailAccounts(): Promise<import("./types").EmailAccount[]>;
  createEmailAccount(email: string, displayName?: string): Promise<import("./types").EmailAccount>;
  updateEmailAccount(id: string, patch: { displayName?: string; systemPrompt?: string; isActive?: boolean }): Promise<import("./types").EmailAccount>;
  deleteEmailAccount(id: string): Promise<void>;
  generatePrompt(accountId: string, description: string): Promise<string>;
  listAccountKbs(accountId: string): Promise<import("./types").KnowledgeBase[]>;
  attachKb(accountId: string, kbId: string): Promise<void>;
  detachKb(accountId: string, kbId: string): Promise<void>;

  // Email Automation — Knowledge Bases
  listKnowledgeBases(): Promise<import("./types").KnowledgeBase[]>;
  createKnowledgeBase(name: string, description: string): Promise<import("./types").KnowledgeBase>;
  updateKnowledgeBase(id: string, patch: { name?: string; description?: string }): Promise<import("./types").KnowledgeBase>;
  deleteKnowledgeBase(id: string): Promise<void>;
  listDocuments(kbId: string): Promise<import("./types").KnowledgeDocument[]>;
  addDocument(kbId: string, doc: { name: string; content: string; source: string }): Promise<import("./types").KnowledgeDocument>;
  uploadDocument(kbId: string, file: File): Promise<import("./types").KnowledgeDocument>;
  ingestUrl(kbId: string, url: string, name?: string): Promise<import("./types").KnowledgeDocument>;
  scrapeWebsite(kbId: string, url: string, maxPages?: number): Promise<{ message: string; pagesQueued: number }>;
  deleteDocument(kbId: string, docId: string): Promise<void>;
}
