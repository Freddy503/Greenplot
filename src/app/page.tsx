import { redirect } from "next/navigation";

export default function Home() {
  redirect("/onboarding/step-1");
}
