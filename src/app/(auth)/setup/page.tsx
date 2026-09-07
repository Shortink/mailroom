import { notFound } from "next/navigation";
import { setupAvailable } from "@/lib/auth/setup";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Once an account exists the route returns 404 rather than refusing, so it
  // cannot be probed.
  if (!(await setupAvailable())) notFound();
  return <SetupForm />;
}
