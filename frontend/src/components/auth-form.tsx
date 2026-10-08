"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { loginSchema, signupSchema } from "@/lib/api-contract";
import { API_MODE } from "@/lib/app-mode";
import { useAuth } from "./api-auth";
import { api } from "@/lib/api-client";
import {
  SignupCode,
  readSignup,
  rememberSignup,
  type SignupFlow,
} from "./signup-code";
import { FieldError } from "./ui";
export function AuthForm({ signup = false }: { signup?: boolean }) {
  if (!API_MODE)
    return (
      <section className="panel">
        <h1>Mock mode</h1>
        <p>
          The prototype uses fictional demo identities. Enable API mode to
          register or sign in.
        </p>
        <Link className="button mt-4" href="/discover">
          Open Demo
        </Link>
      </section>
    );
  return <RealAuthForm signup={signup} />;
}
function RealAuthForm({ signup }: { signup: boolean }) {
  const auth = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<SignupFlow | null>(null);
  const [restoring, setRestoring] = useState(signup);
  useEffect(() => {
    if (!signup) return;
    const timer = window.setTimeout(() => {
      setPending(readSignup());
      setRestoring(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [signup]);
  const schema = signup
    ? signupSchema
    : loginSchema.extend({ name: z.string(), confirmPassword: z.string() });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  if (restoring) return <p role="status">Restoring signup...</p>;
  if (signup && pending)
    return (
      <SignupCode
        initial={pending}
        onBack={() => {
          reset();
          setPending(null);
        }}
      />
    );
  return (
    <section className="auth-form space-y-5">
      <p className="eyebrow">Your CampusCollab account</p>
      <h1>{signup ? "Create your account" : "Welcome back"}</h1>
      <p className="muted">
        Save your student profile and choose the skills you want to share.
      </p>
      <form
        noValidate
        className="space-y-5"
        onSubmit={handleSubmit(async (values) => {
          setError("");
          try {
            if (signup) {
              const result = await api.startRegistration(values);
              reset();
              setPending(rememberSignup(result));
            } else {
              await auth.authenticate("login", {
                email: values.email,
                password: values.password,
              });
              reset();
              router.replace("/profile");
            }
          } catch (e) {
            setError((e as Error).message);
          }
        })}
      >
        <fieldset className="space-y-4" disabled={isSubmitting || auth.busy}>
          {[
            ...(signup
              ? [
                  {
                    key: "name" as const,
                    label: "Full name",
                    type: "text",
                    complete: "name",
                  },
                ]
              : []),
            {
              key: "email" as const,
              label: "Email",
              type: "email",
              complete: "email",
            },
            {
              key: "password" as const,
              label: "Password",
              type: "password",
              complete: signup ? "new-password" : "current-password",
            },
            ...(signup
              ? [
                  {
                    key: "confirmPassword" as const,
                    label: "Confirm password",
                    type: "password",
                    complete: "new-password",
                  },
                ]
              : []),
          ].map((field) => (
            <div key={field.key} className="form-field">
              <label htmlFor={field.key}>{field.label}</label>
              <div className="password-field">
                <input
                  id={field.key}
                  type={
                    field.type === "password" && visible[field.key]
                      ? "text"
                      : field.type
                  }
                  className={
                    field.type === "password" ? "password-input" : undefined
                  }
                  autoComplete={field.complete}
                  {...register(field.key)}
                  aria-invalid={!!errors[field.key]}
                  aria-describedby={`${field.key}-error`}
                />
                {field.type === "password" && (
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={`${visible[field.key] ? "Hide" : "Show"} ${field.label.toLowerCase()}`}
                    aria-pressed={!!visible[field.key]}
                    onClick={() =>
                      setVisible((current) => ({
                        ...current,
                        [field.key]: !current[field.key],
                      }))
                    }
                  >
                    {visible[field.key] ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>
                )}
              </div>
              <FieldError
                id={`${field.key}-error`}
                message={errors[field.key]?.message}
              />
            </div>
          ))}
          {signup && (
            <p className="helper">Use 12–128 characters for your password.</p>
          )}
          <button className="button w-full" type="submit">
            {isSubmitting
              ? "Please wait…"
              : signup
                ? "Send verification code"
                : "Log in"}
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
      </form>
      {!signup && (
        <Link className="text-indigo-700 underline" href="/forgot-password">
          Forgot password?
        </Link>
      )}
      <p>
        {signup ? "Already have an account?" : "New to CampusCollab?"}{" "}
        <Link
          className="text-indigo-700 underline"
          href={signup ? "/login" : "/signup"}
        >
          {signup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </section>
  );
}
