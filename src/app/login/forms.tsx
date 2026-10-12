"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { loginUserAction, registerAction, type FormState } from "./actions";

const IDLE: FormState = { status: "idle" };

function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-positive")}>
      {state.message}
    </p>
  );
}

function LoginField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="login">Логин</Label>
      <Input id="login" name="login" defaultValue={defaultValue} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} />
    </div>
  );
}

function PasswordField() {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="password">Пароль</Label>
      <Input id="password" name="password" type="password" autoComplete="current-password" required />
    </div>
  );
}

export function UserLoginForm() {
  const [state, action, pending] = useActionState(loginUserAction, IDLE);
  return (
    <form action={action} className="space-y-4">
      <LoginField defaultValue={state.status === "error" ? state.login : undefined} />
      <PasswordField />
      <FormMessage state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Проверяем…" : "Войти"}
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, IDLE);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Имя</Label>
        <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={60} aria-describedby="name-hint" />
        <p id="name-hint" className="text-xs text-muted-foreground">
          Так администратор поймёт, кто вы.
        </p>
      </div>
      <div className="space-y-1.5">
        <LoginField />
        <p className="text-xs text-muted-foreground">Латинские буквы, цифры, точка, дефис или подчёркивание.</p>
      </div>
      <PasswordField />
      <FormMessage state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Создаём аккаунт…" : "Зарегистрироваться"}
      </Button>
    </form>
  );
}
