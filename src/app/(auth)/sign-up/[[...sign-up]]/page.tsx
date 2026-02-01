import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-parchment px-4">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-5xl font-bold tracking-tight text-blue-900">
          Gnosis
        </h1>
        <p className="mt-3 font-serif text-lg text-blue-800/70 italic">
          Begin your journey of discovery
        </p>
      </div>
      <SignUp />
      <p className="mt-6 text-center font-serif text-sm text-blue-800/40 italic">
        &#x0393;&#x03BD;&#x1FF6;&#x03B8;&#x03B9; &#x03C3;&#x03B5;&#x03B1;&#x03C5;&#x03C4;&#x03CC;&#x03BD;
      </p>
    </div>
  );
}
