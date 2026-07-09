"use client";

import { useState, useEffect } from "react";
import { EmilyOverview } from "./EmilyOverview";
import { EmilyFeatureScreen } from "./EmilyFeatureScreen";

type EmilyFeature = "chatbot" | "agent_call";
type EmilyView = "overview" | "feature";
type InitialFeature = "overview" | EmilyFeature;

export function Emily({ onBack, initialFeature = "overview" }: {
  onBack?: () => void; initialFeature?: InitialFeature;
}) {
  const [view, setView]     = useState<EmilyView>(initialFeature !== "overview" ? "feature" : "overview");
  const [active, setActive] = useState<EmilyFeature>(initialFeature !== "overview" ? initialFeature as EmilyFeature : "chatbot");

  useEffect(() => {
    if (initialFeature === "overview") {
      setView("overview");
    } else {
      setActive(initialFeature as EmilyFeature);
      setView("feature");
    }
  }, [initialFeature]);

  function openFeature(f: EmilyFeature) { setActive(f); setView("feature"); }

  if (view === "feature") {
    return <EmilyFeatureScreen feature={active} onBack={() => setView("overview")} onSwitchFeature={openFeature} />;
  }
  return <EmilyOverview onFeatureClick={openFeature} onBack={onBack} />;
}