import type { ReactNode } from "react";
import { signOut } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The card every two-factor page sits in, with a way out (D54). */
export function TwoFactorShell({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            <h1>{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {children}
          <form action={signOut} className="border-t pt-4 text-center">
            <Button type="submit" variant="ghost" className="min-h-11 px-3">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
