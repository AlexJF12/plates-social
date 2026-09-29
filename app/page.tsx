import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/config";

export default async function Home({ searchParams }: PageProps<"/">) {
  if (await getSession()) redirect("/following");
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">{APP_NAME}</h1>
        <p className="mt-2 text-muted">Log the meals you actually cook.</p>
        {error === "login_failed" && (
          <p role="alert" className="mt-6 text-sm text-red-600">
            Sign-in didn&apos;t complete. Please try again.
          </p>
        )}
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
