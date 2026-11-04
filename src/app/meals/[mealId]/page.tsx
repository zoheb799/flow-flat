import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MealDetails } from "@/components/meal-details";

type Props = { params: Promise<{ mealId: string }> };

export default async function MealPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { mealId } = await params;
  return <MealDetails mealId={mealId} />;
}
