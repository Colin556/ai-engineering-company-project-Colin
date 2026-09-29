import { AuthGuard } from "@/components/AuthGuard";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return <AuthGuard>{children}</AuthGuard>;
}
