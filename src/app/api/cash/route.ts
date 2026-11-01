import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const admin = createAdminClient();

    const { data: sessionData, error: sessionErr } = await admin
      .from("cash_sessions")
      .select("*")
      .eq("status", "ABERTA")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionErr) {
      console.error("[/api/cash GET] Erro ao buscar sessão:", sessionErr);
      return NextResponse.json({ error: sessionErr.message }, { status: 400 });
    }

    if (!sessionData) {
      return NextResponse.json({ session: null, movements: [] });
    }

    const { data: movData, error: movErr } = await admin
      .from("cash_movements")
      .select("*")
      .eq("session_id", sessionData.id)
      .order("created_at", { ascending: false });

    if (movErr) {
      console.error("[/api/cash GET] Erro ao buscar movimentações:", movErr);
    }

    return NextResponse.json({
      session: sessionData,
      movements: movData || [],
    });
  } catch (err: any) {
    console.error("[/api/cash GET] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao buscar sessão de caixa" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const admin = createAdminClient();
    const defaultCompanyId =
      process.env.NEXT_PUBLIC_COMPANY_ID || "00000000-0000-0000-0000-000000000001";

    const { action } = body;

    // 1. Abertura de Caixa
    if (action === "open") {
      const { opening_balance, notes, terminal_number } = body;
      const { data, error } = await admin
        .from("cash_sessions")
        .insert({
          company_id: defaultCompanyId,
          terminal_number: terminal_number || 1,
          opening_balance: Number(opening_balance || 0),
          status: "ABERTA",
          notes: notes || "Abertura de Caixa Diário",
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, session: data });
    }

    // 2. Sangria ou Suprimento
    if (action === "movement") {
      const { session_id, movement_type, amount, notes } = body;
      if (!session_id || !movement_type) {
        return NextResponse.json(
          { error: "Sessão e tipo de movimento são obrigatórios" },
          { status: 400 }
        );
      }

      const { data, error } = await admin
        .from("cash_movements")
        .insert({
          company_id: defaultCompanyId,
          session_id,
          movement_type,
          amount: Number(amount || 0),
          notes: notes || (movement_type === "SANGRIA" ? "Retirada de Sangria" : "Aporte de Suprimento"),
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, movement: data });
    }

    // 3. Fechamento de Caixa
    if (action === "close") {
      const {
        session_id,
        closing_expected_balance,
        closing_actual_balance,
        closing_difference,
        notes,
      } = body;

      if (!session_id) {
        return NextResponse.json({ error: "session_id obrigatório" }, { status: 400 });
      }

      const { data, error } = await admin
        .from("cash_sessions")
        .update({
          status: "FECHADA",
          closed_at: new Date().toISOString(),
          closing_expected_balance: Number(closing_expected_balance || 0),
          closing_actual_balance: Number(closing_actual_balance || 0),
          closing_difference: Number(closing_difference || 0),
          notes: notes || "Fechamento de turno",
        })
        .eq("id", session_id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, session: data });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err: any) {
    console.error("[/api/cash POST] Erro:", err);
    return NextResponse.json(
      { error: err.message || "Erro ao processar operação de caixa" },
      { status: 500 }
    );
  }
}
