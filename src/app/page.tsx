export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-parchment">
      <main className="flex max-w-2xl flex-col items-center gap-8 px-8 text-center">
        <h1 className="text-6xl font-bold tracking-tight text-blue-900">
          Gnosis
        </h1>
        <p className="text-xl leading-relaxed text-ink">
          An immersive journey into Koine Greek through conversation with
          characters from the ancient world.
        </p>
        <div className="mt-4 flex gap-4">
          <a
            href="/sign-in"
            className="rounded-lg bg-blue-700 px-6 py-3 font-serif text-lg text-white transition-colors hover:bg-blue-800"
          >
            Sign In
          </a>
          <a
            href="/sign-up"
            className="rounded-lg border border-blue-700 px-6 py-3 font-serif text-lg text-blue-700 transition-colors hover:bg-blue-50"
          >
            Create Account
          </a>
        </div>
        <p className="mt-8 font-serif text-lg text-blue-800/60 italic">
          &#x0393;&#x03BD;&#x1FF6;&#x03B8;&#x03B9;
          &#x03C3;&#x03B5;&#x03B1;&#x03C5;&#x03C4;&#x03CC;&#x03BD;
        </p>
      </main>
    </div>
  );
}
