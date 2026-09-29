export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-stone-300 bg-white p-8">
        <p className="mb-6 text-sm font-semibold text-stone-500">
          Brasaland Backoffice
        </p>
        {children}
      </div>
    </main>
  );
}
