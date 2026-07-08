"use client";

import Image from "next/image";
import { useState } from "react";
import { useAuthStore } from "@/lib/aria/state/authStore";

type Mode = "signin" | "register";

export function LoginScreen() {
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const register = useAuthStore((s) => s.register);

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = status === "signingIn";

  async function submit() {
    setLocalError(null);
    if (mode === "register") {
      // Register mirrors the backend's constraints (valid email + 8+ chars).
      if (!email.includes("@")) return setLocalError("Enter a valid email.");
      if (password.length < 8) return setLocalError("Password must be at least 8 characters.");
      await register(email, password, name.trim() || undefined);
    } else {
      // Sign-in accepts whatever the account was created with (incl. dev logins).
      if (!email.trim() || !password) return setLocalError("Enter your email and password.");
      await signInWithPassword(email.trim(), password);
    }
  }

  const shownError = localError ?? error;

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 shadow-xl text-center">
        <Image
          src="/logo-name.svg"
          alt="Flugia"
          width={130}
          height={32}
          style={{ width: 130, height: "auto" }}
          className="mx-auto object-contain"
          priority
        />
        <h2 className="mt-6 text-lg font-semibold text-slate-900">
          {mode === "signin" ? "Sign in to Flugia" : "Create your account"}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {mode === "signin" ? "Enter your credentials to continue." : "It takes less than a minute."}
        </p>

        <div className="mt-6 flex flex-col gap-3 text-left">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4cc9f0]"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4cc9f0]"
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4cc9f0]"
          />

          <button
            onClick={() => void submit()}
            disabled={busy}
            className="mt-1 flex items-center justify-center rounded-xl bg-[#4cc9f0] py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          {shownError && <p className="text-center text-xs text-red-500">{shownError}</p>}
        </div>

        <p className="mt-5 text-xs text-slate-400">
          {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => { setMode(mode === "signin" ? "register" : "signin"); setLocalError(null); }}
            className="font-semibold text-[#4cc9f0] hover:underline"
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>

        <p className="mt-4 border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-400">
          Signing in manages your platform session only. Your Gmail connection is a
          separate feature — connect it once inside the app and it stays linked.
        </p>
      </div>
    </div>
  );
}
