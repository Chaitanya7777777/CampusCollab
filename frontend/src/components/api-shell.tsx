"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Network, UserRound, Compass, Folder } from "lucide-react";
import { AuthFrame } from "./public-pages";
import { useAuth } from "./api-auth";
import { Avatar, ErrorState, Loading } from "./ui";
function ApiNavigation() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {[
        { href: "/discover", label: "Discover", icon: Compass },
        { href: "/my-projects", label: "My Projects", icon: Folder },
        { href: "/my-applications", label: "My Applications", icon: Folder },
        { href: "/profile", label: "My Profile", icon: UserRound },
      ].map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
        >
          <Icon size={19} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function ApiShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [error, setError] = useState("");
  const publicPage = path === "/login" || path === "/signup";
  useEffect(() => {
    if (path === "/" || auth.phase !== "ready" || auth.busy) return;
    if (!auth.user && !publicPage) router.replace("/login");
    if (auth.user && publicPage) router.replace("/profile");
  }, [auth.phase, auth.user, auth.busy, publicPage, router, path]);
  if (path === "/") return children;
  let content: ReactNode;
  if (auth.phase === "loading")
    content = <Loading label="Checking your session…" />;
  else if (auth.phase === "error")
    content = (
      <ErrorState error={auth.error!} retry={() => void auth.restore()} />
    );
  else if ((!auth.user && !publicPage) || (auth.user && publicPage))
    content = <Loading label="Opening your account…" />;
  else content = <div key={auth.user?.id ?? "signed-out"}>{children}</div>;
  if (publicPage)
    return <AuthFrame signup={path === "/signup"}>{content}</AuthFrame>;
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/profile" className="brand">
          <span className="brand-icon">
            <Network size={23} />
          </span>
          CampusCollab
        </Link>
        <ApiNavigation />
        {auth.phase === "ready" && auth.user && (
          <Link href="/profile" className="account">
            <Avatar name={auth.user.name} />
            <strong>{auth.user.name}</strong>
          </Link>
        )}
      </aside>
      <div className="app-content">
        <header className="header">
          <Link href="/profile">CampusCollab · API mode</Link>
          {auth.phase === "ready" && auth.user && (
            <div className="flex items-center gap-3">
              <Link className="button" href="/projects/new">
                + Create Project
              </Link>
              <button
                className="button secondary"
                disabled={auth.busy}
                onClick={async () => {
                  setError("");
                  try {
                    await auth.logout();
                    router.replace("/login");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {auth.busy ? "Signing out…" : "Log out"}
              </button>
            </div>
          )}
        </header>
        <div className="mobile-nav">
          <ApiNavigation />
        </div>
        <main id="main" className="page-container">
          {error && (
            <p role="alert" className="error-banner mb-4">
              {error}
            </p>
          )}
          {content}
        </main>
        <footer className="app-footer">
          CampusCollab · Build your student profile.
          <span>Discover projects, apply, and build your team.</span>
        </footer>
      </div>
    </>
  );
}
