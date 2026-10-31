"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Package,
  ArrowLeftRight,
  ClipboardList,
  UtensilsCrossed,
  BarChart3,
  LogOut,
  Smartphone,
  Wine,
  LogIn,
  ShieldCheck,
  User,
  BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "PDV / Frente de Caixa", href: "/pdv", icon: ShoppingCart },
  { name: "Vendas a Prazo (Fiado)", href: "/a-prazo", icon: BookOpen },
  { name: "Fluxo de Caixa", href: "/caixa", icon: Receipt },
  { name: "Central de Pedidos", href: "/pedidos", icon: ClipboardList },
  { name: "Mesas & Comandas", href: "/comandas", icon: UtensilsCrossed },
  { name: "Catálogo de Produtos", href: "/produtos", icon: Package },
  { name: "Auditoria de Estoque", href: "/estoque", icon: ArrowLeftRight },
  { name: "Relatórios & Vendas", href: "/relatorios", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    }
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setCurrentUser(null);
    window.location.href = "/login";
  }

  return (
    <aside className="w-64 bg-stone-950 text-stone-200 flex flex-col h-screen border-r border-amber-950/80 select-none shadow-2xl relative z-30">
      {/* BRANDING COM LOGO OFICIAL */}
      <div className="p-5 border-b border-amber-950/80 flex items-center justify-between bg-stone-900/40">
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-2xl overflow-hidden shadow-lg shadow-amber-950/60 border border-amber-500/40 bg-stone-900 shrink-0">
            <Image
              src="/logo.jpg"
              alt="Adega de Mauricio"
              fill
              className="object-cover"
              sizes="44px"
              priority
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-base tracking-tight text-amber-100 leading-tight">
                ADEGA DE MAURICIO
              </h1>
            </div>
            <p className="text-[11px] font-semibold text-amber-400/90">Depósito & Bar</p>
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO PRINCIPAL */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto no-scrollbar">
        <div className="px-3 pb-2 text-[10px] font-bold tracking-widest text-amber-500/70 uppercase">
          Operação Comercial
        </div>
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 group relative",
                isActive
                  ? "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-stone-950 shadow-lg shadow-amber-950/60 font-black border border-amber-300/40"
                  : "text-stone-400 hover:text-stone-100 hover:bg-stone-900/80 hover:border-amber-900/30 border border-transparent"
              )}
            >
              <Icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", isActive ? "text-stone-950 stroke-[2.5]" : "text-stone-400 group-hover:text-amber-400")} />
              <span>{item.name}</span>
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-stone-950 shadow-sm animate-pulse"></span>
              )}
            </Link>
          );
        })}

        {/* ATALHO PWA GARÇOM */}
        <div className="pt-5 px-3 pb-2 text-[10px] font-bold tracking-widest text-amber-500/70 uppercase">
          Salão & Atendimento
        </div>
        <Link
          href="/atendimento"
          target="_blank"
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-amber-300 bg-amber-950/30 border border-amber-800/40 hover:bg-amber-900/40 transition-all shadow-md group"
        >
          <Smartphone className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          <span>Abrir App do Celular</span>
          <span className="ml-auto text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono border border-amber-500/30">PWA</span>
        </Link>
      </nav>

      {/* FOOTER DO OPERADOR / GESTOR COM SUPABASE AUTH */}
      <div className="p-3.5 border-t border-amber-950/80 bg-stone-950/90 text-xs">
        {currentUser ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-bold text-amber-400 text-xs shadow-inner shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="truncate">
                <p className="font-bold text-amber-200 text-xs truncate">
                  {currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || "Gestor Mauricio"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] text-emerald-400 font-semibold truncate">Conectado</span>
                </div>
              </div>
            </div>
            <button
              title="Desconectar da conta de gestor"
              onClick={handleLogout}
              className="p-2 rounded-xl text-stone-400 hover:text-rose-400 hover:bg-stone-900 border border-transparent hover:border-stone-800 transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400/60 text-xs shrink-0 animate-pulse">
                <User className="w-4 h-4" />
              </div>
              <div className="truncate">
                <p className="font-semibold text-stone-300 text-xs truncate">Operador Autenticado</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] text-stone-400 font-medium">Sessão Ativa</span>
                </div>
              </div>
            </div>
            <button
              title="Desconectar da conta"
              onClick={handleLogout}
              className="p-2 rounded-xl text-stone-400 hover:text-rose-400 hover:bg-stone-900 border border-transparent hover:border-stone-800 transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
