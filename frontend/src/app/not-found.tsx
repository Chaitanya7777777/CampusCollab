import Link from "next/link";
export default function NotFound() {
  return (
    <div className="state-panel">
      <h1>Page not found</h1>
      <p>Find your next collaboration on Discover.</p>
      <Link className="button" href="/discover">
        Back to Discover
      </Link>
    </div>
  );
}
