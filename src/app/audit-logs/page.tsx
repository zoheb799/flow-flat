import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AuditLogPage } from "@/components/audit-log-page";

export default async function AuditLogsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <AuditLogPage />;
}
