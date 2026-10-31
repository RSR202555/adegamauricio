import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data: tabs, error } = await admin
      .from("tabs")
      .select("*, orders(*, order_items(*))")
      .eq("status", "ABERTA")
      .order("tab_identifier", { ascending: true });

    if (error) {
      console.error("[/api/tabs GET] Erro ao carregar comandas:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Calcula o valor acumulado real caso accumulated_amount não esteja sincronizado
    const formattedTabs = (tabs || []).map((tab) => {
      let calcTotal = Number(tab.accumulated_amount || tab.total_amount || 0);

      if (calcTotal === 0 && tab.orders && tab.orders.length > 0) {
        calcTotal = tab.orders.reduce((acc: number, order: any) => {
          if (order.status !== "CANCELADO") {
            return acc + Number(order.total_amount || 0);
          }
          return acc;
        }, 0);
      }

      return {
        ...tab,
        accumulated_amount: calcTotal,
      };
    });

    return NextResponse.json({ tabs: formattedTabs });
  } catch (err: any) {
    console.error("[/api/tabs GET] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao buscar comandas" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const admin = createAdminClient();
    const companyId =
      body.company_id ||
      process.env.NEXT_PUBLIC_COMPANY_ID ||
      "00000000-0000-0000-0000-000000000001";

    // 1. Criar nova comanda / mesa manualmente
    if (body.action === "create" || !body.action) {
      const { tab_identifier, customer_name, tab_number } = body;
      if (!tab_identifier || !tab_identifier.trim()) {
        return NextResponse.json(
          { error: "Identificador da comanda/mesa é obrigatório." },
          { status: 400 }
        );
      }

      const { data: newTab, error } = await admin
        .from("tabs")
        .insert({
          company_id: companyId,
          tab_identifier: tab_identifier.trim(),
          tab_number: tab_number ? String(tab_number).trim() : null,
          customer_name: customer_name ? customer_name.trim() : null,
          status: "ABERTA",
          accumulated_amount: 0,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, tab: newTab });
    }

    // 2. Encerrar / fechar comanda ou mesa
    if (body.action === "close") {
      const { tabId, paymentMethod = "PIX" } = body;
      if (!tabId) {
        return NextResponse.json(
          { error: "tabId é obrigatório para fechamento." },
          { status: 400 }
        );
      }

      // Tenta chamar a RPC fn_close_tab
      const { data: saleId, error: rpcErr } = await admin.rpc("fn_close_tab", {
        p_tab_id: tabId,
        p_payment_method: paymentMethod,
        p_company_id: companyId,
      });

      if (rpcErr) {
        console.warn("[/api/tabs close] RPC fn_close_tab falhou, fallback manual:", rpcErr.message);

        // Fallback manual seguro: busca a comanda, insere em sales e atualiza status para FECHADA
        const { data: tabData, error: tabFetchErr } = await admin
          .from("tabs")
          .select("*")
          .eq("id", tabId)
          .single();

        if (tabFetchErr || !tabData) {
          return NextResponse.json(
            { error: "Comanda não encontrada para fechamento." },
            { status: 404 }
          );
        }

        const amount = Number(tabData.accumulated_amount || tabData.total_amount || 0);

        await admin.from("sales").insert({
          company_id: companyId,
          tab_id: tabId,
          sale_type: "COMANDA",
          payment_method: paymentMethod,
          subtotal_amount: amount,
          total_amount: amount,
          final_amount: amount,
          status: "CONCLUIDA",
        });

        const { error: updErr } = await admin
          .from("tabs")
          .update({
            status: "FECHADA",
            closed_at: new Date().toISOString(),
            final_amount: amount,
          })
          .eq("id", tabId);

        if (updErr) throw updErr;
      }

      return NextResponse.json({ success: true, message: "Comanda encerrada com sucesso!" });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err: any) {
    console.error("[/api/tabs POST] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao processar comanda" },
      { status: 500 }
    );
  }
}
