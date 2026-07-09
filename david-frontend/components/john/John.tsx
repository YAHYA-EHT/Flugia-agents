"use client";

import { useState, useEffect } from "react";
import { JohnOverview } from "./JohnOverview";
import { JohnFeatureScreen } from "./JohnFeatureScreen";

type SalesFeature = "prospecting" | "campaigns";
type SalesView = "overview" | "feature";

interface Props {
  onBack?: () => void;
  initialFeature?: "overview" | SalesFeature;
}

export function John({ onBack, initialFeature = "overview" }: Props) {
  const [view, setView]     = useState<SalesView>(initialFeature !== "overview" ? "feature" : "overview");
  const [active, setActive] = useState<SalesFeature>(
    initialFeature !== "overview" ? (initialFeature as SalesFeature) : "prospecting"
  );

  // Sync when URL changes (sidebar click while already on John)
  useEffect(() => {
    if (initialFeature === "overview") {
      setView("overview");
    } else {
      setActive(initialFeature as SalesFeature);
      setView("feature");
    }
  }, [initialFeature]);

  function openFeature(f: SalesFeature) {
    setActive(f);
    setView("feature");
  }

  if (view === "feature") {
    return (
      <JohnFeatureScreen
        feature={active}
        onBack={() => setView("overview")}
        onSwitchFeature={openFeature}
      />
    );
  }

  return <JohnOverview onFeatureClick={openFeature} onBack={onBack} />;
}