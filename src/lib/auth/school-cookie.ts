import "server-only";

import { cookies } from "next/headers";
import { SCHOOL_COOKIE } from "./active-school";

/** Remembers the school a person works in (D9); the cookie only counts for their own schools. */
export async function rememberSchool(schoolId: string): Promise<void> {
  (await cookies()).set(SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
