import { AppShell } from "@/components/AppShell";
import { PipelineDashboard } from "@/components/PipelineDashboard";

export default function HomePage() {
  return (
    <AppShell>
      <PipelineDashboard />
    </AppShell>
  );
}
