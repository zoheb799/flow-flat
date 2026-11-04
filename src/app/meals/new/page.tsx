import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MealForm } from "@/components/meal-form";

export default async function NewMealPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <MealForm />;
}
