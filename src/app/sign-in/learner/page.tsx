import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PIN_LENGTH } from "@/lib/auth/learner-pin";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { LearnerSignInForm } from "./learner-sign-in-form";

export const metadata: Metadata = { title: "Learner sign in" };

/**
 * US-1.2: learners sign in with their school, learner number and PIN.
 * `?school=<slug>` picks the school, for a link the school shares.
 */
export default async function LearnerSignInPage({ searchParams }: PageProps<"/sign-in/learner">) {
  if (await getViewer()) redirect("/");
  const { school } = await searchParams;

  const supabase = await createClient();
  const { data: schools, error } = await supabase.rpc("sign_in_schools");
  if (error) throw new Error("Could not load schools");
  const preset =
    schools.find((s) => s.slug === school)?.id ?? (schools.length === 1 ? schools[0].id : "");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>Learner sign in</h1>
          </CardTitle>
          <CardDescription>Use the learner number and PIN your school gave you.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <LearnerSignInForm
            schools={schools.map((s) => ({ id: s.id, name: s.name }))}
            defaultSchoolId={preset}
            pinLength={PIN_LENGTH}
          />
          <p className="text-muted-foreground text-center text-sm">
            Forgot your PIN? Ask your school office to reset it.
          </p>
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground self-center py-2 text-sm underline underline-offset-4"
          >
            Staff or parent? Sign in with email
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
