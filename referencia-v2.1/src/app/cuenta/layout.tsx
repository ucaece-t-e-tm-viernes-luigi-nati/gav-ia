import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sand/40 px-6 py-8">
      <Link href="/"><Logo /></Link>
      <div className="mx-auto mt-16 w-full max-w-sm rounded-2xl border border-line bg-white p-8 shadow-sm">{children}</div>
    </div>
  );
}
