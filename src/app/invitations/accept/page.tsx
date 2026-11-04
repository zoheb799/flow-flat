import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { InvitationAcceptance } from "@/components/invitation-acceptance";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function AcceptInvitationPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (!token || token.length < 32 || token.length > 128) {
    return <main className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center"><div><h1 className="text-xl font-semibold">Invitation link is invalid</h1><p className="mt-2 text-sm text-slate-500">Ask your household admin for a new invitation.</p></div></main>;
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invitations/accept?token=${token}`)}`);
  }
  return <InvitationAcceptance token={token} />;
}
