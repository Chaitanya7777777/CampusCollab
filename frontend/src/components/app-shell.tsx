"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Folder,
  GraduationCap,
  Network,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useSession } from "@/lib/queries";
import { Avatar } from "./ui";
import { DemoUser } from "./demo-user";
function Navigation() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {[
        { href: "/discover", label: "Discover", icon: Compass },
        { href: "/my-projects", label: "My Projects", icon: Folder },
        { href: "/profile", label: "My Profile", icon: UserRound },
      ].map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={
            path === href ||
            (href === "/discover" &&
              path.startsWith("/projects/") &&
              !path.endsWith("/manage") &&
              !path.endsWith("/edit") &&
              path !== "/projects/new") ||
            (href === "/my-projects" &&
              (path.endsWith("/manage") ||
                path.endsWith("/edit") ||
                path === "/projects/new"))
              ? "page"
              : undefined
          }
        >
          <Icon size={19} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function Sidebar() {
  const { data } = useSession();
  return (
    <aside className="sidebar">
      <Link href="/discover" className="brand">
        <span className="brand-icon">
          <Network size={23} />
        </span>
        CampusCollab
      </Link>
      <Navigation />
      <Link className="account" href="/profile">
        <Avatar name={data?.student.name ?? "Student"} />
        <div>
          <strong>{data?.student.name ?? "Student profile"}</strong>
          <small>{data?.student.campus ?? "Loading…"}</small>
        </div>
      </Link>
    </aside>
  );
}
export function Header() {
  const { data } = useSession();
  return (
    <header className="header">
      <span className="campus-label">
        <GraduationCap size={18} />
        {data?.student.campus ?? "CampusCollab"}
      </span>
      <div className="flex items-center gap-4">
        <DemoUser />
        <Link href="/projects/new" className="button create-project-action">
          + Create Project
        </Link>
        <Link href="/profile" aria-label="Open my profile">
          <Avatar name={data?.student.name ?? "Student"} />
        </Link>
      </div>
    </header>
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="app-content">
        <Header />
        <div className="mobile-nav">
          <Navigation />
        </div>
        <main id="main" className="page-container">
          {children}
        </main>
        <footer className="app-footer">
          CampusCollab · A place to build, together.
          <span>Fictional profiles · Local prototype</span>
        </footer>
      </div>
    </>
  );
}
