"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { API_MODE } from "@/lib/app-mode";
import { api } from "@/lib/api-client";
import { loginSchema } from "@/lib/api-contract";
import { useAuth } from "./api-auth";
import { FieldError } from "./ui";

export function EmailAuthPage({
  kind,
}: {
  kind: "forgot" | "reset" | "verify";
}) {
  if (!API_MODE)
    return (
      <section className="panel space-y-4">
        <h1>Prototype accounts</h1>
        <p>
          Demo identities do not use passwords or real email. Select API mode
          for account recovery and verification.
        </p>
        <Link className="button" href="/discover">
          Open Demo
        </Link>
      </section>
    );
  return kind === "forgot" ? <ForgotPassword /> : <TokenForm kind={kind} />;
}

function ForgotPassword() {
  const auth = useAuth();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({
    resolver: zodResolver(loginSchema.pick({ email: true })),
    defaultValues: { email: "" },
  });
  return (
    <section className="auth-form space-y-5">
      <h1>Reset your password</h1>
      <p>
        Enter your account email. If eligible, you will receive a link to choose
        a new password.
      </p>
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async ({ email }) => {
          setError("");
          setMessage("");
          try {
            setMessage(
              (await api.requestEmail("password-reset", email)).message,
            );
          } catch (e) {
            setError((e as Error).message);
          }
        })}
      >
        <div className="form-field">
          <label htmlFor="recovery-email">Email</label>
          <input
            id="recovery-email"
            type="email"
            autoComplete="email"
            {...register("email")}
            aria-invalid={!!errors.email}
            aria-describedby="email-error"
          />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>
        <button
          className="button"
          disabled={isSubmitting || auth.phase === "loading"}
        >
          {isSubmitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <Link href="/login" className="text-indigo-700 underline">
        Back to login
      </Link>
    </section>
  );
}

const passwordSchema = z
  .object({
    password: z.string().min(12, "Use at least 12 characters.").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });

function TokenForm({ kind }: { kind: "reset" | "verify" }) {
  const auth = useAuth();
  const token = useRef("");
  const captured = useRef(false);
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  useEffect(() => {
    if (!captured.current) {
      captured.current = true;
      token.current =
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      window.history.replaceState(null, "", window.location.pathname);
    }
    // Only in memory: a reload intentionally requires opening the email link again.
    const timer = window.setTimeout(() => {
      setHasToken(Boolean(token.current));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function submit(password?: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await api.confirmEmailToken(
        kind === "reset" ? "password-reset" : "verification",
        token.current,
        password,
      );
      token.current = "";
      setHasToken(false);
      reset();
      setMessage(result.message);
      await auth.refreshAccount();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const verified = kind === "verify" && auth.user?.emailVerifiedAt && !hasToken;
  return (
    <section className="auth-form space-y-5">
      <h1>
        {kind === "reset" ? "Choose a new password" : "Verify your email"}
      </h1>
      {kind === "verify" && auth.user?.emailVerifiedAt && hasToken && (
        <p className="helper">
          Your signed-in account already has a verified email address. You can
          return to your profile. If this link belongs to another account,
          confirming it will not switch your session.
        </p>
      )}
      <p>
        {kind === "reset"
          ? "Changing your password signs out every existing session. You will need to log in again."
          : "Confirm the email address linked to this email. This will not sign you in or switch the account currently open."}
      </p>
      {!ready ? (
        <p role="status">Preparing your link...</p>
      ) : message || verified ? (
        <p role="status">{message || "Your email is already verified."}</p>
      ) : !hasToken ? (
        <p role="alert">
          Open the latest link in your email. A link is required and is removed
          from the address bar for privacy.
        </p>
      ) : kind === "verify" ? (
        <button
          className="button"
          disabled={pending || auth.phase === "loading"}
          onClick={() => void submit()}
        >
          {pending ? "Confirming..." : "Confirm email"}
        </button>
      ) : (
        <form
          noValidate
          onSubmit={(event) =>
            void handleSubmit(({ password }) => submit(password))(event)
          }
          className="space-y-4"
        >
          <fieldset
            disabled={pending || auth.phase === "loading"}
            className="space-y-4"
          >
            {(["password", "confirmPassword"] as const).map((name) => (
              <div className="form-field" key={name}>
                <label htmlFor={name}>
                  {name === "password" ? "New password" : "Confirm password"}
                </label>
                <input
                  id={name}
                  type={visible ? "text" : "password"}
                  autoComplete="new-password"
                  {...register(name)}
                  aria-invalid={!!errors[name]}
                  aria-describedby={`${name}-error`}
                />
                <FieldError
                  id={`${name}-error`}
                  message={errors[name]?.message}
                />
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              {visible ? "Hide passwords" : "Show passwords"}
            </button>
            <p className="helper">
              Use 12-128 characters. Password managers and pasting are
              supported.
            </p>
            <button className="button" type="submit">
              {pending ? "Saving..." : "Set new password"}
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {kind === "verify" && !message && !verified && <VerificationRequest />}
      <Link
        className="text-indigo-700 underline"
        href={auth.user ? "/profile" : "/login"}
      >
        {auth.user ? "Open profile" : "Log in"}
      </Link>
      {kind === "reset" && (
        <p>
          <Link href="/forgot-password" className="text-indigo-700 underline">
            Request a new reset link
          </Link>
        </p>
      )}
    </section>
  );
}

function VerificationRequest() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        setError("");
        setMessage("");
        try {
          setMessage(
            (await api.requestEmail("verification", auth.user?.email ?? email))
              .message,
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      {!auth.user && (
        <div className="form-field">
          <label htmlFor="verification-email">Account email</label>
          <input
            id="verification-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      )}
      <button className="button secondary" disabled={pending}>
        {pending ? "Sending..." : "Resend verification email"}
      </button>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
    </form>
  );
}

export function VerificationBanner() {
  const auth = useAuth();
  if (!auth.user || auth.user.emailVerifiedAt) return null;
  return (
    <aside className="panel mb-5 space-y-3" aria-label="Email verification">
      <h2>Verify your email</h2>
      <p>
        Verify your email address before publishing a project or applying. You
        can edit your profile, save drafts, and manage existing records.
      </p>
      {auth.user.verificationEmailStatus === "unavailable" && (
        <p role="alert">
          Your account was created, but the verification email could not be
          sent. Try resending later.
        </p>
      )}
      <VerificationRequest />
    </aside>
  );
}
