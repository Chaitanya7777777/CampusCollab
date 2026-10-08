"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { PendingRegistration } from "@/lib/api-contract";
import { useAuth } from "./api-auth";

const storageKey = "campuscollab-pending-signup-v1";
export type SignupFlow = PendingRegistration & { clockOffset: number };
export function rememberSignup(value: PendingRegistration): SignupFlow {
  const flow = {
    ...value,
    clockOffset: Date.parse(value.serverTime) - Date.now(),
  };
  // No password, code, or raw email in browser storage. Storage is optional.
  const { registrationId, expiresAt, resendAt, clockOffset, deliveryStatus } =
    flow;
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        registrationId,
        expiresAt,
        resendAt,
        clockOffset,
        deliveryStatus,
      }),
    );
  } catch {}
  return flow;
}
export function readSignup(): SignupFlow | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (
      !value ||
      typeof value.registrationId !== "string" ||
      !/^[0-9a-f-]{36}$/.test(value.registrationId) ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      !Number.isFinite(Date.parse(value.resendAt)) ||
      !Number.isFinite(value.clockOffset) ||
      !["sent", "unavailable"].includes(value.deliveryStatus)
    )
      return null;
    return {
      ...value,
      maskedEmail: "your email address",
      serverTime: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
export function forgetSignup() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {}
}
export function SignupCode({
  initial,
  onBack,
}: {
  initial: SignupFlow;
  onBack: () => void;
}) {
  const [flow, setFlow] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const serverNow = now + flow.clockOffset;
  const expired = serverNow >= Date.parse(flow.expiresAt);
  const wait = Math.max(
    0,
    Math.ceil((Date.parse(flow.resendAt) - serverNow) / 1000),
  );
  function failure(e: unknown) {
    setError(e instanceof Error ? e.message : "Please try again.");
    if (
      e instanceof ApiError &&
      [
        "registration_expired",
        "registration_exhausted",
        "registration_closed",
        "registration_unavailable",
      ].includes(e.detail)
    )
      setClosed(true);
  }
  return (
    <section className="auth-form space-y-5">
      <p className="eyebrow">Verify your email</p>
      <h1>Enter your verification code</h1>
      <p>
        Destination: <strong>{flow.maskedEmail}</strong>. Your account is
        created only after verification.
      </p>
      {flow.deliveryStatus === "unavailable" ? (
        <p role="alert" className="error-banner">
          We could not send the code. Your account has not been created. You can
          retry sending below without entering your password again.
        </p>
      ) : (
        <p role="status">
          A six-digit code was sent. Use the latest code; it expires ten minutes
          after starting registration.
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || auth.busy || expired || closed) return;
          if (!/^[0-9]{6}$/.test(code)) {
            setError("Enter all six digits, including any leading zeros.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await auth.authenticate("register/confirm", {
              registrationId: flow.registrationId,
              code,
            });
            setCode("");
            forgetSignup();
            router.replace("/profile");
          } catch (e) {
            failure(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-field">
          <label htmlFor="signup-code">Verification code</label>
          <input
            id="signup-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            type="text"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            required
            aria-describedby="signup-code-help"
            disabled={busy || closed || expired}
            onChange={(event) =>
              setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))
            }
          />
          <p className="helper" id="signup-code-help">
            Type or paste the six-digit code from your email.
          </p>
        </div>
        <button
          className="button w-full"
          disabled={busy || auth.busy || closed || expired}
        >
          {busy ? "Please wait…" : "Verify and create account"}
        </button>
      </form>
      {expired && (
        <p role="alert" className="error-banner">
          Your code expired. Start again to request a new one.
        </p>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <button
        className="button secondary w-full"
        type="button"
        disabled={busy || auth.busy || wait > 0 || expired || closed}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            setFlow(
              rememberSignup(await api.resendRegistration(flow.registrationId)),
            );
            setCode("");
            setNow(Date.now());
          } catch (e) {
            failure(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
      </button>
      <button
        className="text-indigo-700 underline"
        type="button"
        disabled={busy || auth.busy}
        onClick={() => {
          forgetSignup();
          onBack();
        }}
      >
        Change email / start again
      </button>
      {process.env.NODE_ENV === "development" && (
        <p className="helper">
          For local development, find the message in Mailpit at localhost:8025.
          Local Mailpit does not deliver to Gmail or other external inboxes.
        </p>
      )}
    </section>
  );
}
