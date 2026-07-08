"use client";

import { useState } from "react";
import { FlugiaHeader } from "./FlugiaHeader";
import { FlugiaSidebar } from "./FlugiaSidebar";

interface Props {
  children: React.ReactNode;
  activePage?: string | null;
  onNavigate: (id: string) => void;
}

export function FlugiaShell({ children, activePage = null, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(activePage !== "secretary");
  const [trackedPage, setTrackedPage] = useState(activePage);
  if (activePage !== trackedPage) {
    setTrackedPage(activePage);
    setExpanded(activePage !== "secretary");
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <FlugiaHeader />
      <FlugiaSidebar
        activePage={activePage}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        onNavigate={onNavigate}
      />
      <div
        className={`pt-16 transition-[padding-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[padding-left] ${
          expanded ? "pl-64" : "pl-20"
        }`}
      >
        <div className="relative h-[calc(100vh-64px)] overflow-hidden">{children}</div>
      </div>
    </div>
  );
}