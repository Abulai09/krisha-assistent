import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserLoginForm } from "./forms";

export const metadata: Metadata = { title: "Вход", robots: { index: false } };

export default function LoginPage() {
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Вход</CardTitle>
        <CardDescription>Войдите логином и общим паролем.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <UserLoginForm />
        <p className="text-sm text-muted-foreground">
          Нет доступа?{" "}
          <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
            Зарегистрируйтесь
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
