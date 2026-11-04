import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { RationFund } from "@/components/ration-fund";

export default async function RationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <RationFund />;
}
