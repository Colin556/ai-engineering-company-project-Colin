import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Backoffice</h1>
      <p className="text-stone-600 mb-6">
        Internal tools for the Brasaland Digital team.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/incidents"
          className="inline-block rounded-md bg-stone-900 px-4 py-2 text-white hover:bg-stone-700"
        >
          Go to Incident Analysis
        </Link>
        <Link
          href="/suppliers"
          className="inline-block rounded-md border border-stone-400 bg-white px-4 py-2 hover:bg-stone-100"
        >
          Open Supplier Directory
        </Link>
      </div>
    </div>
  );
}
