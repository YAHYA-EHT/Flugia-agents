"use client";

import { useRouter } from "next/navigation";
import { RogerOverview } from "./RogerOverview";

export function Roger({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  return (
    <RogerOverview
      onBack={onBack}
      onNavigate={(path) => router.push(path)}
    />
  );
}