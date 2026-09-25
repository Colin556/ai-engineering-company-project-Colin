import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Backoffice</h1>
      <p className="text-stone-600 mb-6">
        Internal tools for the Brasaland Digital team.
      </p>
      <Link
        href="/incidents"
        className="inline-block rounded-md bg-stone-900 px-4 py-2 text-white hover:bg-stone-700"
      >
        Go to Incident Analysis
      </Link>
    </div>
  );
}
