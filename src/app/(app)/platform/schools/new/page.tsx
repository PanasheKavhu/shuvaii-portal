import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/viewer";
import { NewSchoolForm } from "./new-school-form";

export const metadata: Metadata = { title: "New school" };

/** US-10.1: create a school. Branding and the first admin invite follow on its page. */
export default async function NewSchoolPage() {
  await requireArea("platform");

  return (
    <section className="flex flex-col gap-4">
      <Link href="/platform" className="text-muted-foreground w-fit text-sm hover:underline">
        ← All schools
      </Link>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>New school</h1>
          </CardTitle>
          <CardDescription>
            Next you can add the logo and colours and invite the school&apos;s first admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewSchoolForm />
        </CardContent>
      </Card>
    </section>
  );
}
