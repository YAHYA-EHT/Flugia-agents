"use client";

import { useState, useEffect } from "react";
import { DavidOverview } from "./DavidOverview";
import { DavidFeatureScreen } from "./DavidFeatureScreen";

type DavidFeature = "e_reputation" | "seo" | "linkedin";
type MarketingFeature = "overview" | DavidFeature;
type DavidView = "overview" | "feature";

interface Props {
  onBack?: () => void;
  initialFeature?: MarketingFeature;
}

export function David({ onBack, initialFeature = "overview" }: Props) {
  const [view, setView]     = useState<DavidView>(initialFeature !== "overview" ? "feature" : "overview");
  const [active, setActive] = useState<DavidFeature>(
    initialFeature !== "overview" ? (initialFeature as DavidFeature) : "e_reputation"
  );

  // Sync when URL changes (sidebar click while already on David)
  useEffect(() => {
    if (initialFeature === "overview") {
      setView("overview");
    } else {
      setActive(initialFeature as DavidFeature);
      setView("feature");
    }
  }, [initialFeature]);

  function openFeature(f: DavidFeature) {
    setActive(f);
    setView("feature");
  }

  if (view === "feature") {
    return (
      <DavidFeatureScreen
        feature={active}
        onBack={() => setView("overview")}
        onSwitchFeature={openFeature}
      />
    );
  }

  return <DavidOverview onFeatureClick={openFeature} onBack={onBack} />;
}