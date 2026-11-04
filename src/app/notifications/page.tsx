import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { NotificationsPage } from "@/components/notifications-page";

export default async function NotificationsRoute() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <NotificationsPage />;
}
