import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { WalletOverview } from "@/components/wallet-overview";

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <WalletOverview />;
}
