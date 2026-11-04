import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MonthlyReports } from "@/components/monthly-reports";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <MonthlyReports />;
}
