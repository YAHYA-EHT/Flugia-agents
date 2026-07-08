"use client";

import { useEffect, useRef, useState } from "react";
import { getApi } from "@/lib/aria";
import { getRuntimeConfig } from "@/lib/aria/config";
import { registerFcm } from "@/lib/aria/fcm";
import { useAuthStore } from "@/lib/aria/state/authStore";
import { AriaSidebar, type AriaPage } from "./AriaSidebar";
import { AgentSettingsScreen } from "./AgentSettingsScreen";
import { ChatScreen } from "./ChatScreen";
import { EmailAccountsScreen } from "./EmailAccountsScreen";
import { KnowledgeBasesScreen } from "./KnowledgeBasesScreen";
import { VSHomeScreen } from "./VSHomeScreen";
import { WhatsAppScreen } from "./WhatsAppScreen";
import { SettingsScreen } from "./SettingsScreen";
import { SetupWizard } from "./SetupWizard";
import { Loader2 } from "lucide-react";

/**
 * The portable Aria widget — a flugia-style left sidebar + the active page.
 * Fully **controlled**: the active `page` and navigation come from the host
 * (which maps them to the URL). Route-free and auth-agnostic, so it mounts as a
 * Flugia tab beside flugia's global nav.
 */
export function Aria({
  page,
  onNavigate,
}: {
  page: AriaPage;
  onNavigate: (p: AriaPage) => void;
}) {
  // Setup gate: no feature tab is reachable until onboarding is completed.
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const signOut = useAuthStore((s) => s.signOut);
  const fcmDone = useRef(false);

  useEffect(() => {
    getApi().getUserStatus()
      .then((s) => setSetupDone(s.setupCompleted))
      .catch(() => setSetupDone(false));
  }, []);

  useEffect(() => {
    if (fcmDone.current || getRuntimeConfig().useMockData) return;
    fcmDone.current = true;
    void registerFcm(getApi());
  }, []);

  if (setupDone === null) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!setupDone) {
    return <SetupWizard onDone={() => setSetupDone(true)} />;
  }

  return (
    <div className="flex h-full min-h-0 bg-slate-50 dark:bg-slate-950">
      <AriaSidebar
        active={page}
        onSelect={onNavigate}
        embedded
        onSignOut={() => signOut()}
      />
      <main className="min-w-0 flex-1 overflow-hidden">
        <div key={page} className="animate-page-in h-full">
          {page === "overview" ? (
            <VSHomeScreen />
          ) : page === "assistant" ? (
            <ChatScreen />
          ) : page === "agent" ? (
            <AgentSettingsScreen />
          ) : page === "email-accounts" ? (
            <EmailAccountsScreen />
          ) : page === "knowledge-bases" ? (
            <KnowledgeBasesScreen />
          ) : page === "whatsapp" ? (
            <WhatsAppScreen
              onGoToEmail={() => onNavigate("email-accounts")}
              onGoToNotifications={() => onNavigate("notifications")}
            />
          ) : page === "agenda" ? (
            <SettingsScreen section="agenda" />
          ) : page === "notifications" ? (
            <SettingsScreen
              section="notifications"
              onGoToEmail={() => onNavigate("email-accounts")}
              onGoToWhatsapp={() => onNavigate("whatsapp")}
            />
          ) : (
            <SettingsScreen section={page as "autonomy" | "rules"} />
          )}
        </div>
      </main>
    </div>
  );
}
