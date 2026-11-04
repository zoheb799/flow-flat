import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MealForm } from "@/components/meal-form";

type Props = { params: Promise<{ mealId: string }> };

export default async function EditMealPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { mealId } = await params;
  return <MealForm mealId={mealId} />;
}
