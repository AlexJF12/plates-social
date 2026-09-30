import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/config";
import { ErrorText } from "@/components/ui";

export default async function Home({ searchParams }: PageProps<"/">) {
  if (await getSession()) redirect("/following");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-[18vh] pb-10">
      <h1 className="font-display text-hero text-accent">{APP_NAME}</h1>
      <p className="mt-4 max-w-xs text-lead text-balance text-muted">
        Log what you cook. See what your friends are cooking.
      </p>
      <div className="mt-auto pt-12">
        {error === "login_failed" && (
          <ErrorText className="mb-4">Sign-in didn&apos;t finish. Try again.</ErrorText>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
