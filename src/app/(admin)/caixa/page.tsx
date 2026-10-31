'use client';

import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Unlock, 
  DollarSign, 
  ArrowDownLeft, 
  ArrowUpRight, 
  AlertTriangle, 
  CheckCircle2, 
  Receipt,
  Clock,
  Sparkles
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { CashSession, CashMovement } from '@/types/database';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function CaixaFinanceiroPage() {
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Modais de Abertura, Sangria, Suprimento e Fechamento Cego
  const [modalType, setModalType] = useState<'OPEN' | 'SANGRIA' | 'SUPRIMENTO' | 'CLOSE' | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [closingActualAmount, setClosingActualAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('status', 'ABERTA')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionData) {
        setActiveSession(sessionData as CashSession);
        const { data: movData } = await supabase
          .from('cash_movements')
          .select('*')
          .eq('session_id', sessionData.id)
          .order('created_at', { ascending: false });

        if (movData) setMovements(movData as CashMovement[]);
      } else {
        setActiveSession(null);
        setMovements([]);
      }
    } catch (err) {
      console.error('Erro ao buscar sessão de caixa:', err);
    } finally {
      setLoading(false);
    }
  }

  // Abertura de Caixa
  async function handleOpenSession(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      const val = parseFloat(amountInput) || 0;
      const { error } = await supabase.from('cash_sessions').insert({
        company_id: '00000000-0000-0000-0000-000000000001',
        terminal_number: 1,
        opening_balance: val,
        status: 'ABERTA',
        notes: notesInput || 'Abertura de Caixa Diário'
      });

      if (error) throw error;
      setModalType(null);
      setAmountInput('');
      setNotesInput('');
      loadSession();
    } catch (err: any) {
      alert('Erro ao abrir caixa: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  // Sangria ou Suprimento
  async function handleMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSession || !modalType) return;
    setProcessing(true);
    try {
      const val = parseFloat(amountInput) || 0;
      const type = modalType === 'SANGRIA' ? 'SANGRIA' : 'SUPRIMENTO';

      const { error } = await supabase.from('cash_movements').insert({
        company_id: activeSession.company_id,
        session_id: activeSession.id,
        movement_type: type,
        amount: val,
        notes: notesInput || (type === 'SANGRIA' ? 'Retirada de Sangria' : 'Aporte de Suprimento')
      });

      if (error) throw error;
      setModalType(null);
      setAmountInput('');
      setNotesInput('');
      loadSession();
    } catch (err: any) {
      alert('Erro ao registrar sangria/suprimento: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  // Fechamento Cego
  async function handleCloseSession(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSession) return;
    setProcessing(true);
    try {
      const actualVal = parseFloat(closingActualAmount) || 0;
      const expectedVal = Number(activeSession.opening_balance || 0) + 
        movements.reduce((acc, m) => m.movement_type === 'SUPRIMENTO' ? acc + Number(m.amount) : acc - Number(m.amount), 0);
      const diff = actualVal - expectedVal;

      const { error } = await supabase.from('cash_sessions').update({
        status: 'FECHADA',
        closed_at: new Date().toISOString(),
        closing_expected_balance: expectedVal,
        closing_actual_balance: actualVal,
        closing_difference: diff,
        notes: notesInput || 'Fechamento de turno'
      }).eq('id', activeSession.id);

      if (error) throw error;
      alert(`Caixa fechado com sucesso! Diferença apurada: ${formatCurrency(diff)}`);
      setModalType(null);
      setClosingActualAmount('');
      setNotesInput('');
      loadSession();
    } catch (err: any) {
      alert('Erro ao fechar caixa: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-amber-950/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Financeiro & Fechamento</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Lock className="w-7 h-7 text-amber-400" />
            Controle de Caixa & Sangrias
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Abertura com troco, retiradas para cofre e conferência cega de valores
          </p>
        </div>

        {activeSession ? (
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setModalType('SANGRIA'); setAmountInput(''); setNotesInput(''); }}
              className="text-xs text-rose-400 hover:text-rose-300 border-rose-500/30 hover:border-rose-500/50"
            >
              <ArrowUpRight className="w-4 h-4 mr-1 text-rose-400" /> Sangria (Retirada)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setModalType('SUPRIMENTO'); setAmountInput(''); setNotesInput(''); }}
              className="text-xs text-amber-400 hover:text-amber-300 border-amber-500/30 hover:border-amber-500/50"
            >
              <ArrowDownLeft className="w-4 h-4 mr-1 text-amber-400" /> Suprimento (Entrada)
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setModalType('CLOSE'); setClosingActualAmount(''); setNotesInput(''); }}
              className="text-xs font-black shadow-md shadow-rose-950/60"
            >
              <Lock className="w-4 h-4 mr-1" /> Fechar Caixa Cego
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => { setModalType('OPEN'); setAmountInput('100.00'); setNotesInput(''); }}
            className="shadow-lg shadow-amber-950/60 font-black"
          >
            <Unlock className="w-4 h-4 mr-2" /> Abrir Novo Caixa
          </Button>
        )}
      </div>

      {/* ESTADO DO CAIXA */}
      {loading ? (
        <div className="py-16 text-center text-stone-500 text-sm">Carregando status do caixa...</div>
      ) : activeSession ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5">
            <span className="text-[11px] font-bold text-amber-400/90 uppercase tracking-widest">Status do Turno</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span className="text-xl font-black text-amber-400">Caixa Aberto</span>
            </div>
            <span className="text-xs text-stone-500 mt-1 block">Aberto em {formatDateTime(activeSession.opened_at)}</span>
          </Card>

          <Card className="p-5">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">Fundo de Troco Inicial</span>
            <div className="text-2xl font-black text-white font-mono mt-2">
              {formatCurrency(Number(activeSession.opening_balance || 0))}
            </div>
            <span className="text-xs text-stone-500 mt-1 block">Valor na abertura da gaveta</span>
          </Card>

          <Card className="p-5">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">Total Sangrias</span>
            <div className="text-2xl font-black text-rose-400 font-mono mt-2">
              {formatCurrency(movements.filter(m => m.movement_type === 'SANGRIA').reduce((acc, m) => acc + Number(m.amount), 0))}
            </div>
            <span className="text-xs text-stone-500 mt-1 block">Retiradas para cofre</span>
          </Card>

          <Card className="p-5">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">Total Suprimentos</span>
            <div className="text-2xl font-black text-amber-300 font-mono mt-2">
              {formatCurrency(movements.filter(m => m.movement_type === 'SUPRIMENTO').reduce((acc, m) => acc + Number(m.amount), 0))}
            </div>
            <span className="text-xs text-stone-500 mt-1 block">Reforços de troco</span>
          </Card>
        </div>
      ) : (
        <Card className="p-16 text-center space-y-4 border-dashed border-amber-900/50">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">O Caixa Está Fechado no Momento</h2>
            <p className="text-xs text-stone-400 max-w-md mx-auto mt-1">
              Para registrar vendas no PDV e receber pagamentos, realize a abertura do turno com o valor inicial de troco.
            </p>
          </div>
        </Card>
      )}

      {/* HISTÓRICO DE LANÇAMENTOS */}
      {activeSession && (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-amber-950/80 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="w-5 h-5 text-amber-400" />
              Lançamentos & Movimentações do Turno
            </CardTitle>
            <span className="text-xs text-stone-400 font-mono">{movements.length} registros</span>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-800 bg-stone-900/50 text-stone-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Horário</th>
                  <th className="py-3 px-4">Operação</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4">Motivo / Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/80 text-stone-300">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-stone-500 text-xs">
                      Nenhuma sangria ou suprimento realizado neste turno.
                    </td>
                  </tr>
                ) : (
                  movements.map(m => (
                    <tr key={m.id} className="hover:bg-stone-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs text-stone-400">
                        {formatDateTime(m.created_at)}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant={m.movement_type === 'SANGRIA' ? "destructive" : "default"} className="text-xs">
                          {m.movement_type}
                        </Badge>
                      </td>
                      <td className={`py-3.5 px-4 text-right font-mono font-black ${
                        m.movement_type === 'SANGRIA' ? 'text-rose-400' : 'text-amber-300'
                      }`}>
                        {m.movement_type === 'SANGRIA' ? '-' : '+'}{formatCurrency(Number(m.amount))}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-stone-400">
                        {m.notes || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* MODAL DE ABERTURA / SANGRIA / SUPRIMENTO */}
      {(modalType === 'OPEN' || modalType === 'SANGRIA' || modalType === 'SUPRIMENTO') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-white">
              {modalType === 'OPEN' ? 'Abertura de Caixa Diário' : modalType === 'SANGRIA' ? 'Lançar Sangria de Caixa' : 'Lançar Suprimento de Troco'}
            </h3>

            <form onSubmit={modalType === 'OPEN' ? handleOpenSession : handleMovement} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  {modalType === 'OPEN' ? 'Fundo de Troco Inicial (R$) *' : 'Valor do Lançamento (R$) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full bg-stone-900 border border-amber-500/50 rounded-xl px-3.5 py-2 text-amber-300 font-mono text-lg font-black focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">Observação / Justificativa</label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  rows={2}
                  placeholder="Ex: Reforço de moedas, retirada para cofre..."
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-stone-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalType(null)}
                  className="text-stone-400 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={processing}
                  className="text-xs font-black shadow-md shadow-amber-950/60"
                >
                  {processing ? 'Processando...' : 'Confirmar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE FECHAMENTO CEGO */}
      {modalType === 'CLOSE' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400">
              <Lock className="w-6 h-6" />
              <h3 className="text-lg font-black text-white">Fechamento Cego de Turno</h3>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              Conte o dinheiro físico em gaveta e informe abaixo. O sistema confrontará com o saldo apurado pelo sistema.
            </p>

            <form onSubmit={handleCloseSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  Total em Dinheiro Contado na Gaveta (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={closingActualAmount}
                  onChange={(e) => setClosingActualAmount(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full bg-stone-900 border border-rose-500/60 rounded-xl px-3.5 py-2 text-white font-mono text-xl font-black focus:outline-none focus:border-rose-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">Observações do Fechamento</label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  rows={2}
                  placeholder="Ex: Turno encerrado sem intercorrências..."
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-stone-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalType(null)}
                  className="text-stone-400 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={processing}
                  className="text-xs font-black shadow-lg shadow-rose-950/60"
                >
                  {processing ? 'Encerrando...' : 'Confirmar Fechamento'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
