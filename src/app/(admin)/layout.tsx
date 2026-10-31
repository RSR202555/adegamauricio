import { Sidebar } from "@/components/layout/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen w-full bg-[#0c0a09] text-stone-100 overflow-hidden print:overflow-visible print:h-auto print:bg-white print:text-black selection:bg-amber-500 selection:text-stone-950">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto print:overflow-visible print:h-auto print:p-0 p-4 sm:p-6 lg:p-8 bg-[#0c0a09] print:bg-white relative">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-1/4 w-[600px] h-[300px] bg-amber-500/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="relative z-10 w-full">
          {children}
        </div>
      </main>
    </div>
  );
}