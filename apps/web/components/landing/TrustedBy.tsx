const brands = ["Google", "Microsoft", "GitHub", "Canva", "Notion", "OpenAI"];

export default function TrustedBy() {
  return (
    <section className="border-y border-border bg-white py-12" aria-label="Dipercaya oleh">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-7 text-center text-sm font-medium text-muted">Dipercaya oleh kreator yang bekerja di</p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-5 opacity-70">
          {brands.map((brand) => (
            <span
              key={brand}
              className="cursor-default font-heading text-xl font-bold tracking-tight text-slate-400 transition-colors hover:text-ink"
            >
              {brand}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
