'use client';

import React, { useState, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Lock, 
  Mail, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Loader2
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Por favor, informe seu e-mail e senha.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('A senha precisa ter no mínimo 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.');
        }
        if (error.message.includes('Email not confirmed')) {
          throw new Error('E-mail ainda não confirmado. Verifique sua caixa de entrada para ativar a conta.');
        }
        throw error;
      }

      setSuccessMsg('Acesso autorizado! Carregando o sistema...');
      setTimeout(() => {
        window.location.href = redirectTo;
      }, 600);
    } catch (err: any) {
      console.error('Erro na autenticação:', err);
      setErrorMsg(err.message || 'Falha ao processar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* HEADER VISUAL DA MARCA CENTRALIZADO */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="relative w-28 h-28 rounded-3xl overflow-hidden shadow-2xl shadow-amber-500/20 mb-4 border-2 border-amber-500/40 bg-stone-900 ring-4 ring-amber-500/10 shrink-0">
          <Image
            src="/logo.jpg"
            alt="Adega de Mauricio"
            fill
            className="object-cover"
            sizes="112px"
            priority
          />
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-950/60 border border-amber-800/40 text-amber-300 text-xs font-semibold mb-3 shadow-inner">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span>Acesso Obrigatório ao Sistema</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          ADEGA DE MAURICIO
        </h1>
        <p className="text-sm text-stone-400 mt-1.5">
          Faça login com seu e-mail e senha para acessar o sistema.
        </p>
      </div>

      {/* CARD DO FORMULÁRIO */}
      <Card className="bg-stone-900/90 border-amber-900/40 shadow-2xl backdrop-blur-xl">
        <CardContent className="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ALERTAS DE STATUS */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800/50 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800/50 text-emerald-200 text-xs flex items-start gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{successMsg}</span>
              </div>
            )}

            {/* CAMPO E-MAIL */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-400" />
                <span>E-mail</span>
              </label>
              <Input
                type="email"
                required
                placeholder="usuario@adegademauricio.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-stone-950/80 border-stone-800 focus-visible:ring-amber-500 text-stone-100 placeholder:text-stone-600"
              />
            </div>

            {/* CAMPO SENHA */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Senha de Acesso</span>
                </label>
                <span className="text-[11px] text-stone-500">Mínimo 6 dígitos</span>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-stone-950/80 border-stone-800 focus-visible:ring-amber-500 text-stone-100 placeholder:text-stone-600 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 focus:outline-none cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* BOTÃO PRINCIPAL */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold py-5 rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* RODAPÉ INFORMATIVO */}
      <div className="mt-8 text-center text-xs text-stone-500">
        <p className="flex items-center justify-center gap-1.5 text-stone-400 font-medium">
          <ShieldCheck className="w-4 h-4 text-amber-500" />
          <span>Acesso protegido por autenticação</span>
        </p>
        <p className="mt-1 text-[11px] text-stone-600">Adega de Mauricio • Depósito & Bar</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}