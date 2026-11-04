import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <Dashboard userName={session.user.name ?? "Member"} />;
}
