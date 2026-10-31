import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0c0a09] text-stone-100 flex flex-col justify-center relative overflow-hidden selection:bg-amber-500 selection:text-stone-950">
      {/* GLOWS & AMBIENCE DE FUNDO */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 right-0 w-[500px] h-[400px] bg-amber-700/10 rounded-full blur-[130px] pointer-events-none" />
      
      {/* GRID TEXTURA SUTIL */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #d97706 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />

      <main className="relative z-10 w-full px-4 py-8">
        {children}
      </main>

      {/* FOOTER DISCRETO */}
      <footer className="relative z-10 py-4 text-center text-xs text-stone-600 font-mono">
        ADEGA DE MAURICIO © 2026 — Sistema Integrado de PDV & Gestão
      </footer>
    </div>
  );
}
