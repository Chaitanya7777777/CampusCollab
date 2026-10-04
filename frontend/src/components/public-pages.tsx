"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Network,
  Search,
  Send,
  Users,
  Info,
} from "lucide-react";
import { API_MODE } from "@/lib/app-mode";
import { useAuth } from "./api-auth";
export function PublicBrand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-icon">
        <Network size={23} />
      </span>
      CampusCollab
    </Link>
  );
}
function ApiActions() {
  const auth = useAuth();
  if (auth.phase === "loading" || auth.busy)
    return <span role="status">Checking session…</span>;
  if (auth.phase === "error")
    return (
      <span>
        Account unavailable.{" "}
        <button className="underline" onClick={() => void auth.restore()}>
          Retry
        </button>
      </span>
    );
  return auth.user ? (
    <Link className="button" href="/profile">
      Open CampusCollab <ArrowRight size={16} />
    </Link>
  ) : (
    <>
      <Link className="button secondary" href="/login">
        Log in
      </Link>
      <Link className="button" href="/signup">
        Create account <ArrowRight size={16} />
      </Link>
    </>
  );
}
function EntryActions() {
  return (
    <div className="entry-actions">
      {API_MODE ? (
        <ApiActions />
      ) : (
        <Link className="button" href="/discover">
          Open Demo <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
const features = [
  {
    icon: Search,
    title: "Discover by skills and roles",
    text: "Explore project ideas and find contributions that fit your interests and skills.",
  },
  {
    icon: Send,
    title: "Apply with relevant experience",
    text: "Introduce yourself with your motivation and experience for a specific team role.",
  },
  {
    icon: Users,
    title: "Manage recruitment and form a team",
    text: "Review applications, see role openings, and build a team around a shared idea.",
  },
];
export function AuthFrame({
  children,
  signup,
}: {
  children: ReactNode;
  signup: boolean;
}) {
  return (
    <div className="public-page auth-page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="auth-layout">
        <aside className="auth-story">
          <PublicBrand />
          <div>
            <span className="public-tag">Academic & project network</span>
            <h2>
              {signup
                ? "Build together from day one."
                : "Welcome to CampusCollab"}
            </h2>
            <p>
              A place for student developers, designers, and researchers to
              share their skills and build together.
            </p>
          </div>
          {!signup && (
            <div className="auth-benefits">
              {features.map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <Icon size={23} />
                  <section>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </section>
                </div>
              ))}
            </div>
          )}
          <div className="auth-note">
            <Info size={21} />
            <p>
              Start with your profile. Real accounts support profiles and skills
              today. Team formation is available in the separate mock demo.
            </p>
          </div>
        </aside>
        <main id="main" className="auth-content">
          <Link className="back-home" href="/">
            <ArrowLeft size={18} /> Back to home
          </Link>
          {children}
        </main>
      </div>
    </div>
  );
}
export function LandingPage() {
  return (
    <div className="public-page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <PublicBrand />
        <nav aria-label="Public navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <EntryActions />
      </header>
      <main id="main">
        <section className="landing-hero public-container">
          <div>
            <span className="public-tag">For students who want to build</span>
            <h1>
              Find your people.
              <br />
              Build something together.
            </h1>
            <p>
              Discover project ideas, find teammates with complementary skills,
              and turn shared interests into a team.
            </p>
            <EntryActions />
            <p className="hero-footnote">
              Projects, hackathons & research ventures
            </p>
          </div>
          <figure className="project-illustration">
            <figcaption>
              Example workspace · Illustration, not live recruitment
            </figcaption>
            <div className="illustration-card">
              <span className="public-tag">Hackathon · Example project</span>
              <h2>Smart Campus Garden</h2>
              <p>
                A student-built system to help campus gardens use water
                thoughtfully.
              </p>
              <div className="illustration-capacity">
                <span>
                  Team capacity <strong>3 of 5 members</strong>
                </span>
                <div className="illustration-bar">
                  <i />
                </div>
                <small>Illustrative team · 2 places remaining</small>
              </div>
              <h3>Open contribution roles</h3>
              <p className="illustration-role">
                Backend Developer <span>1 opening</span>
              </p>
              <p className="illustration-role">
                Product Designer <span>1 opening</span>
              </p>
              <div className="illustration-skills">
                <span>Python</span>
                <span>React</span>
                <span>Figma</span>
              </div>
            </div>
            <div className="illustration-request">
              <span className="illustration-avatar">AS</span>
              <div>
                <strong>Alex S. · Fictional student</strong>
                <p>Applied for Backend Developer</p>
              </div>
              <span className="public-tag">Pending review</span>
            </div>
          </figure>
        </section>
        <section id="how-it-works" className="how-section">
          <div className="public-container">
            <div className="section-intro">
              <span className="eyebrow">Simple workflow</span>
              <h2>How it works</h2>
              <p>A straightforward path from idea to student team.</p>
            </div>
            <div className="public-grid">
              {[
                {
                  title: "Build your profile",
                  text: "Share your skills and interests so people know what you bring to the table.",
                  detail: "Self-declared skills · React · Python · Design",
                },
                {
                  title: "Find a project",
                  text: "Explore ideas and the roles teams need across projects, research, and hackathons.",
                  detail: "Explore by project type, skills, and role",
                },
                {
                  title: "Apply and team up",
                  text: "Introduce yourself and let the owner review your request and relevant experience.",
                  detail: "Apply → Review → Join the team",
                },
              ].map((step, index) => (
                <article className="public-card" key={step.title}>
                  <span className="step-number">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  <div className="step-detail">{step.detail}</div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="features" className="public-container features-section">
          <div className="section-intro">
            <span className="eyebrow">Purpose-built features</span>
            <h2>Built for campus collaboration</h2>
            <p>
              Designed for student projects, research ideas, and hackathon
              teams.
            </p>
          </div>
          <div className="public-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="public-card">
                <span className="step-number">
                  <Icon size={22} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <aside className="development-note">
            <Info size={22} />
            <div>
              <strong>Development preview</strong>
              <p>
                API mode supports registration, login, profiles, skills, project
                discovery, creation, applications, and team formation. Owners
                can review applicants and form teams. Mock mode remains a
                separate prototype. The examples above are static illustrations.
              </p>
            </div>
          </aside>
          <section className="final-cta">
            <span className="eyebrow">Build your student profile</span>
            <h2>
              Your next project starts with
              <br />
              the right people.
            </h2>
            <p>Start with your skills and the ideas you want to explore.</p>
            <EntryActions />
          </section>
        </section>
      </main>
      <footer className="public-footer">
        <PublicBrand />
        <p>CampusCollab · Built for university collaboration.</p>
        <a href="#main">Back to top</a>
      </footer>
    </div>
  );
}
