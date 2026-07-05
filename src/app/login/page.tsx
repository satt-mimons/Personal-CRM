"use client";

import { useActionState } from "react";
import { login, signInWithPassword, type LoginState } from "./actions";

const initialLoginState: LoginState = {
  step: "email",
  email: "",
  status: "idle",
};

const initialPasswordState: LoginState = {
  step: "password",
  email: "",
  status: "idle",
};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialLoginState);
  const [pwState, pwAction, pwPending] = useActionState(
    signInWithPassword,
    initialPasswordState,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">pipeline</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Your MBA recruiting network, in one place.
      </p>

      {state.step === "email" ? (
        <form action={formAction} className="mt-8 flex flex-col gap-3">
          <input type="hidden" name="intent" value="send" />
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.email}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-1 w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Sending…" : "Email me a sign-in link"}
          </button>
          {state.status === "error" && (
            <p className="text-sm text-red-600">{state.message}</p>
          )}
        </form>
      ) : (
        <form action={formAction} className="mt-8 flex flex-col gap-3">
          <input type="hidden" name="intent" value="verify" />
          <input type="hidden" name="email" value={state.email} />
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
            We emailed <strong>{state.email}</strong>. Click the sign-in link to
            finish — or, if your email includes a 6-digit code, enter it here.
          </div>
          <label htmlFor="token" className="text-sm font-medium">
            6-digit code (optional)
          </label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            placeholder="123456"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-neutral-900"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-1 w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Verifying…" : "Verify & sign in"}
          </button>
          {state.status === "error" && (
            <p className="text-sm text-red-600">{state.message}</p>
          )}
          <button
            type="submit"
            name="intent"
            value="send"
            formNoValidate
            className="text-sm text-neutral-500 underline underline-offset-2"
          >
            Resend link
          </button>
        </form>
      )}

      <div className="mt-10 border-t border-neutral-200 pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Or sign in with a password
        </p>
        <form action={pwAction} className="mt-3 flex flex-col gap-3">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={pwState.email}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
          />
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Password"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
          />
          <button
            type="submit"
            disabled={pwPending}
            className="w-full rounded-lg border border-neutral-900 px-3 py-2.5 text-sm font-medium text-neutral-900 disabled:opacity-60"
          >
            {pwPending ? "Signing in…" : "Sign in"}
          </button>
          {pwState.status === "error" && (
            <p className="text-sm text-red-600">{pwState.message}</p>
          )}
        </form>
      </div>
    </main>
  );
}
