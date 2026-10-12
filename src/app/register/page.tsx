import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "../login/forms";

export const metadata: Metadata = { title: "Регистрация", robots: { index: false } };

export default function RegisterPage() {
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Регистрация</CardTitle>
        <CardDescription>Пароль выдаёт администратор. После заявки дождитесь одобрения — затем можно войти.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <p className="text-sm text-muted-foreground">
          Уже одобрены?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Войти
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
