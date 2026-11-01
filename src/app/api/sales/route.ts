import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const admin = createAdminClient();

    const isToday = searchParams.get("today") === "true";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 200;
    const includeItems = searchParams.get("includeItems") === "true";

    let query = admin
      .from("sales")
      .select(includeItems ? "*, sale_items(*, products(name, barcode))" : "*")
      .order("created_at", { ascending: false });

    if (isToday) {
      // Início do dia no fuso de Brasília (UTC-3)
      const now = new Date();
      const brDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const startOfDay = new Date(`${brDateStr}T00:00:00-03:00`).toISOString();
      query = query.gte("created_at", startOfDay);
    } else {
      if (startDate) {
        const startIso = startDate.includes("T")
          ? startDate
          : new Date(`${startDate}T00:00:00`).toISOString();
        query = query.gte("created_at", startIso);
      }
      if (endDate) {
        const endIso = endDate.includes("T")
          ? endDate
          : new Date(`${endDate}T23:59:59.999`).toISOString();
        query = query.lte("created_at", endIso);
      }
    }

    const { data: sales, error } = await query.limit(limit);

    if (error) {
      console.error("[/api/sales GET] Erro ao buscar vendas:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, sales: sales || [] });
  } catch (err: any) {
    console.error("[/api/sales GET] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao buscar vendas" },
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

    // 1. Sincronização em lote de vendas acumuladas no modo offline
    if (body.action === "sync_batch" && Array.isArray(body.sales)) {
      const results: any[] = [];
      let successCount = 0;

      for (const sale of body.sales) {
        try {
          const companyId = sale.company_id || defaultCompanyId;
          const { data: saleId, error: rpcErr } = await admin.rpc("fn_process_sale", {
            p_company_id: companyId,
            p_sale_type: sale.sale_type || "BALCAO",
            p_payment_method: sale.payment_method || "DINHEIRO",
            p_total_amount: Number(sale.total_amount || 0),
            p_discount_amount: Number(sale.discount_amount || 0),
            p_final_amount: Number(sale.final_amount || 0),
            p_customer_name: sale.customer_name || null,
            p_customer_cpf: sale.customer_cpf || null,
            p_items: sale.items || [],
          });

          if (rpcErr) throw rpcErr;

          if (sale.payment_method === "FIADO") {
            await admin.from("sales").update({
              status: "PENDENTE",
              sale_type: "FIADO",
            }).eq("id", saleId);
          }

          successCount++;
          results.push({
            offline_id: sale.offline_id || sale.id,
            server_id: saleId,
            status: "synced",
          });
        } catch (err: any) {
          console.error("[/api/sales sync_batch] Erro ao sincronizar venda:", err);
          results.push({
            offline_id: sale.offline_id || sale.id,
            error: err.message || "Falha na sincronização",
            status: "failed",
          });
        }
      }

      return NextResponse.json({
        success: true,
        synced_count: successCount,
        total_requested: body.sales.length,
        results,
      });
    }

    // 2. Processamento de venda individual
    const companyId = body.company_id || defaultCompanyId;
    const { data: saleId, error: rpcErr } = await admin.rpc("fn_process_sale", {
      p_company_id: companyId,
      p_sale_type: body.sale_type || "BALCAO",
      p_payment_method: body.payment_method || "DINHEIRO",
      p_total_amount: Number(body.total_amount || 0),
      p_discount_amount: Number(body.discount_amount || 0),
      p_final_amount: Number(body.final_amount || 0),
      p_customer_name: body.customer_name || null,
      p_customer_cpf: body.customer_cpf || null,
      p_items: body.items || [],
    });

    if (rpcErr) {
      console.error("[/api/sales] Erro no fn_process_sale:", rpcErr);
      return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    }

    if (body.payment_method === "FIADO") {
      await admin.from("sales").update({
        status: "PENDENTE",
        sale_type: "FIADO",
      }).eq("id", saleId);
    }

    return NextResponse.json({
      success: true,
      sale_id: saleId,
      message: "Venda processada com sucesso!",
    });
  } catch (err: any) {
    console.error("[/api/sales] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao processar venda" },
      { status: 500 }
    );
  }
}
