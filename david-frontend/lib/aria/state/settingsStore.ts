import { create } from "zustand";
import { ApiException } from "@/lib/aria/api";
import { getApi } from "@/lib/aria";
import type {
  AutonomyLevel,
  AutonomySetting,
  EmailRule,
  EmailRuleAction,
  NotificationPreferences,
  Reminder,
} from "@/lib/aria/types";

interface SettingsState {
  autonomy: AutonomySetting[];
  rules: EmailRule[];
  reminders: Reminder[];
  notificationPrefs: NotificationPreferences | null;
  loading: boolean;
  error: string | null;
  loadAll: () => Promise<void>;
  setAutonomy: (actionType: string, level: AutonomyLevel) => Promise<void>;
  setNotificationPrefs: (patch: Partial<NotificationPreferences>) => Promise<void>;
  addEmailRule: (args: {
    senderPattern: string;
    action: EmailRuleAction;
    notify: boolean;
  }) => Promise<void>;
  deleteEmailRule: (id: string) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
}

const errMsg = (e: unknown) =>
  e instanceof ApiException ? e.message : String(e);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  autonomy: [],
  rules: [],
  reminders: [],
  notificationPrefs: null,
  loading: false,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const api = getApi();
      const [autonomy, rules, reminders, notificationPrefs] = await Promise.all([
        api.getAutonomy(),
        api.getEmailRules(),
        api.getReminders(),
        api.getNotificationPreferences(),
      ]);
      set({ autonomy, rules, reminders, notificationPrefs });
    } catch (e) {
      set({ error: errMsg(e) });
    } finally {
      set({ loading: false });
    }
  },

  // Optimistic, revert on error.
  setAutonomy: async (actionType, level) => {
    const prev = get().autonomy;
    const exists = prev.some((a) => a.actionType === actionType);
    set({
      autonomy: exists
        ? prev.map((a) => (a.actionType === actionType ? { ...a, level } : a))
        : [...prev, { actionType: actionType as AutonomySetting["actionType"], level }],
    });
    try {
      await getApi().setAutonomy(actionType, level);
    } catch (e) {
      set({ autonomy: prev, error: errMsg(e) });
    }
  },

  // Optimistic, revert on error.
  setNotificationPrefs: async (patch) => {
    const prev = get().notificationPrefs;
    if (!prev) return;
    set({ notificationPrefs: { ...prev, ...patch } });
    try {
      const updated = await getApi().setNotificationPreferences(patch);
      set({ notificationPrefs: updated });
    } catch (e) {
      set({ notificationPrefs: prev, error: errMsg(e) });
    }
  },

  addEmailRule: async (args) => {
    try {
      const rule = await getApi().addEmailRule(args);
      set((s) => ({ rules: [...s.rules, rule] }));
    } catch (e) {
      set({ error: errMsg(e) });
    }
  },

  deleteEmailRule: async (id) => {
    const prev = get().rules;
    set({ rules: prev.filter((r) => r.id !== id) });
    try {
      await getApi().deleteEmailRule(id);
    } catch (e) {
      set({ rules: prev, error: errMsg(e) });
    }
  },

  deleteReminder: async (id) => {
    const prev = get().reminders;
    set({ reminders: prev.filter((r) => r.id !== id) });
    try {
      await getApi().deleteReminder(id);
    } catch (e) {
      set({ reminders: prev, error: errMsg(e) });
    }
  },
}));
