import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const filterStatus = searchParams.get("status") || "all"; // 'all' | 'pending' | 'settled'

    let query = admin
      .from("sales")
      .select("*, sale_items(*, products(name, barcode, unit))")
      .or("payment_method.eq.FIADO,sale_type.eq.FIADO")
      .order("created_at", { ascending: false });

    if (filterStatus === "pending") {
      query = query.in("status", ["PENDENTE", "FIADO_PENDENTE", "ABERTA"]);
    } else if (filterStatus === "settled") {
      query = query.in("status", ["CONCLUIDA", "QUITADA", "PAGO"]);
    }

    const { data: sales, error } = await query;

    if (error) {
      console.error("[/api/a-prazo GET] Erro ao carregar vendas a prazo:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const salesList = sales || [];

    // Calcula KPIs
    let totalPending = 0;
    let totalSettled = 0;
    const customerDebtsMap: Record<
      string,
      {
        customer_name: string;
        customer_phone?: string;
        total_pending: number;
        total_settled: number;
        sales_count: number;
        last_sale_date: string;
        sales: any[];
      }
    > = {};

    salesList.forEach((s) => {
      const amount = Number(s.final_amount || s.total_amount || 0);
      const isPending = ["PENDENTE", "FIADO_PENDENTE", "ABERTA"].includes(s.status);

      if (isPending) {
        totalPending += amount;
      } else {
        totalSettled += amount;
      }

      const clientKey = (s.customer_name || "Cliente Balcão").trim().toUpperCase();

      if (!customerDebtsMap[clientKey]) {
        customerDebtsMap[clientKey] = {
          customer_name: s.customer_name || "Cliente Balcão",
          customer_phone: s.customer_cpf || "",
          total_pending: 0,
          total_settled: 0,
          sales_count: 0,
          last_sale_date: s.created_at,
          sales: [],
        };
      }

      const client = customerDebtsMap[clientKey];
      if (isPending) {
        client.total_pending += amount;
      } else {
        client.total_settled += amount;
      }
      client.sales_count += 1;
      if (new Date(s.created_at) > new Date(client.last_sale_date)) {
        client.last_sale_date = s.created_at;
      }
      if (!client.customer_phone && s.customer_cpf) {
        client.customer_phone = s.customer_cpf;
      }
      client.sales.push(s);
    });

    const customersList = Object.values(customerDebtsMap).sort(
      (a, b) => b.total_pending - a.total_pending
    );

    const debtorsCount = customersList.filter((c) => c.total_pending > 0).length;

    return NextResponse.json({
      success: true,
      kpis: {
        total_pending: totalPending,
        total_settled: totalSettled,
        debtors_count: debtorsCount,
        total_records: salesList.length,
      },
      customers: customersList,
      sales: salesList,
    });
  } catch (err: any) {
    console.error("[/api/a-prazo GET] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao processar vendas a prazo" },
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

    // 1. Quitar uma venda a prazo específica
    if (action === "settle_sale") {
      const { saleId, paymentMethod = "DINHEIRO", customerName } = body;

      if (!saleId) {
        return NextResponse.json({ error: "saleId é obrigatório" }, { status: 400 });
      }

      // Atualiza o status da venda para QUITADA e registra a forma de recebimento
      const { data: updatedSale, error: updErr } = await admin
        .from("sales")
        .update({
          status: "QUITADA",
          change_amount: 0,
        })
        .eq("id", saleId)
        .select()
        .single();

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }

      // Registra o pagamento na tabela sale_payments
      await admin.from("sale_payments").insert({
        sale_id: saleId,
        method: paymentMethod,
        amount: Number(updatedSale.final_amount || 0),
      });

      // Tenta registrar a entrada no caixa ativo da sessão
      try {
        const { data: activeSession } = await admin
          .from("cash_sessions")
          .select("id")
          .in("status", ["open", "ABERTA"])
          .limit(1)
          .single();

        if (activeSession) {
          await admin.from("cash_movements").insert({
            company_id: defaultCompanyId,
            session_id: activeSession.id,
            movement_type: "SUPRIMENTO",
            payment_method: paymentMethod,
            amount: Number(updatedSale.final_amount || 0),
            notes: `Recebimento Fiado: ${customerName || updatedSale.customer_name || "Cliente"} (Venda #${updatedSale.sale_number || saleId.slice(-6)})`,
          });
        }
      } catch (sessionErr) {
        console.warn("[/api/a-prazo] Caixa ativo não encontrado para movimentação:", sessionErr);
      }

      return NextResponse.json({
        success: true,
        message: "Conta quitada com sucesso!",
        sale: updatedSale,
      });
    }

    // 2. Quitar todo o saldo devedor do cliente de uma só vez
    if (action === "settle_customer_total") {
      const { customerName, paymentMethod = "DINHEIRO" } = body;

      if (!customerName) {
        return NextResponse.json({ error: "customerName é obrigatório" }, { status: 400 });
      }

      // Busca todas as vendas pendentes deste cliente
      const { data: pendingSales, error: fetchErr } = await admin
        .from("sales")
        .select("id, final_amount, sale_number")
        .ilike("customer_name", customerName.trim())
        .in("status", ["PENDENTE", "FIADO_PENDENTE", "ABERTA"]);

      if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 400 });
      }

      if (!pendingSales || pendingSales.length === 0) {
        return NextResponse.json(
          { error: "Nenhuma conta pendente encontrada para este cliente." },
          { status: 404 }
        );
      }

      let totalAmountSettled = 0;
      const ids = pendingSales.map((s) => {
        totalAmountSettled += Number(s.final_amount || 0);
        return s.id;
      });

      // Atualiza todas para QUITADA
      const { error: updErr } = await admin
        .from("sales")
        .update({
          status: "QUITADA",
        })
        .in("id", ids);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }

      // Registra pagamentos
      const paymentInserts = ids.map((id, index) => ({
        sale_id: id,
        method: paymentMethod,
        amount: Number(pendingSales[index].final_amount || 0),
      }));
      await admin.from("sale_payments").insert(paymentInserts);

      // Registra entrada no caixa se houver caixa aberto
      try {
        const { data: activeSession } = await admin
          .from("cash_sessions")
          .select("id")
          .in("status", ["open", "ABERTA"])
          .limit(1)
          .single();

        if (activeSession) {
          await admin.from("cash_movements").insert({
            company_id: defaultCompanyId,
            session_id: activeSession.id,
            movement_type: "SUPRIMENTO",
            payment_method: paymentMethod,
            amount: totalAmountSettled,
            notes: `Quitação Total Fiado: ${customerName} (${ids.length} conta(s))`,
          });
        }
      } catch (sessionErr) {
        console.warn("[/api/a-prazo] Caixa ativo não encontrado:", sessionErr);
      }

      return NextResponse.json({
        success: true,
        message: `Saldo total de ${customerName} quitado com sucesso!`,
        totalSettled: totalAmountSettled,
        settledCount: ids.length,
      });
    }

    // 3. Lançar débito manual direto na caderneta (sem bipar no PDV)
    if (action === "create_manual_debt") {
      const { customerName, customerPhone, description, amount } = body;

      if (!customerName || !amount || Number(amount) <= 0) {
        return NextResponse.json(
          { error: "Nome do cliente e valor maior que zero são obrigatórios." },
          { status: 400 }
        );
      }

      const numAmount = Number(amount);

      // Insere venda em aberto como FIADO
      const { data: newSale, error: insertErr } = await admin
        .from("sales")
        .insert({
          company_id: defaultCompanyId,
          sale_type: "FIADO",
          payment_method: "FIADO",
          customer_name: customerName.trim(),
          customer_cpf: customerPhone ? customerPhone.trim() : null,
          total_amount: numAmount,
          subtotal_amount: numAmount,
          discount_amount: 0,
          final_amount: numAmount,
          status: "PENDENTE",
        })
        .select()
        .single();

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: "Lançamento a prazo registrado com sucesso!",
        sale: newSale,
      });
    }

    // 4. Deletar venda ou limpar registros de teste
    if (action === "delete_sale") {
      const { saleId } = body;
      if (!saleId) return NextResponse.json({ error: "saleId é obrigatório" }, { status: 400 });
      await admin.from("sales").delete().eq("id", saleId);
      return NextResponse.json({ success: true, message: "Registro removido com sucesso!" });
    }

    if (action === "delete_test") {
      await admin.from("sales").delete().ilike("customer_name", "%Teste%");
      await admin.from("sales").delete().ilike("id", "%TEST-%");
      await admin.from("cash_movements").delete().ilike("notes", "%Teste%");
      return NextResponse.json({ success: true, message: "Dados de teste removidos com sucesso!" });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err: any) {
    console.error("[/api/a-prazo POST] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao processar operação a prazo" },
      { status: 500 }
    );
  }
}
