import type { ReactNode } from "react";
import { PosViewportFitProvider } from "@/context/PosViewportFitContext";
import PosViewportFitShell from "@/components/PosViewportFitShell";

export default function CajaLayout({ children }: { children: ReactNode }) {
  return (
    <PosViewportFitProvider>
      <PosViewportFitShell>{children}</PosViewportFitShell>
    </PosViewportFitProvider>
  );
}
