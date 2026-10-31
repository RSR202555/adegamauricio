import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data: orders, error } = await admin
      .from("orders")
      .select("*, order_items(*, products(name, barcode, unit)), tabs(tab_identifier, customer_name)")
      .in("status", ["PENDENTE", "PREPARANDO", "ENTREGUE"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[/api/orders GET] Erro ao carregar pedidos:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ orders: orders || [] });
  } catch (err: any) {
    console.error("[/api/orders GET] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao buscar pedidos" },
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

    const {
      destination_type = "MESA",
      table_number,
      tab_id,
      customer_name,
      waiter_name = "Atendente",
      items = [],
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "O pedido precisa conter pelo menos um item." },
        { status: 400 }
      );
    }

    const totalAmount = items.reduce(
      (acc: number, item: any) => acc + Number(item.unit_price || 0) * Number(item.quantity || 1),
      0
    );

    let resolvedTabId: string | null = tab_id || null;

    // Se o destino for MESA, busca ou cria automaticamente a comanda da mesa correspondente!
    if (destination_type === "MESA" && table_number) {
      const formattedTableIdentifier = table_number.toLowerCase().startsWith("mesa")
        ? table_number.trim()
        : `Mesa ${table_number.trim()}`;

      // 1. Procura se já existe uma mesa/comanda aberta com esse identificador
      const { data: existingTabs } = await admin
        .from("tabs")
        .select("*")
        .eq("status", "ABERTA")
        .or(`tab_identifier.ilike.${formattedTableIdentifier},tab_number.eq.${table_number.trim()}`)
        .limit(1);

      if (existingTabs && existingTabs.length > 0) {
        resolvedTabId = existingTabs[0].id;
        // Incrementa o valor acumulado na mesa existente
        const currentAmount = Number(existingTabs[0].accumulated_amount || 0);
        await admin
          .from("tabs")
          .update({
            accumulated_amount: currentAmount + totalAmount,
          })
          .eq("id", resolvedTabId);
      } else {
        // 2. Não existe mesa aberta -> Cria uma nova mesa aberta imediatamente no sistema!
        const { data: newTab, error: tabCreateErr } = await admin
          .from("tabs")
          .insert({
            company_id: companyId,
            tab_identifier: formattedTableIdentifier,
            tab_number: String(table_number).trim(),
            customer_name: customer_name ? customer_name.trim() : `Atendimento ${formattedTableIdentifier}`,
            status: "ABERTA",
            accumulated_amount: totalAmount,
          })
          .select()
          .single();

        if (tabCreateErr) {
          console.error("[/api/orders] Erro ao criar mesa automática:", tabCreateErr);
        } else if (newTab) {
          resolvedTabId = newTab.id;
        }
      }
    } else if (destination_type === "COMANDA" && resolvedTabId) {
      // Se for comanda existente selecionada pelo garçom, incrementa o valor
      const { data: currentTab } = await admin
        .from("tabs")
        .select("accumulated_amount")
        .eq("id", resolvedTabId)
        .single();

      if (currentTab) {
        const currentAmount = Number(currentTab.accumulated_amount || 0);
        await admin
          .from("tabs")
          .update({
            accumulated_amount: currentAmount + totalAmount,
          })
          .eq("id", resolvedTabId);
      }
    }

    // Cria o registro principal em orders
    const { data: orderData, error: orderError } = await admin
      .from("orders")
      .insert({
        company_id: companyId,
        destination_type,
        table_number: destination_type === "MESA" ? String(table_number || "") : null,
        tab_id: resolvedTabId,
        customer_name: customer_name ? customer_name.trim() : null,
        waiter_name: waiter_name ? waiter_name.trim() : "Atendente",
        total_amount: totalAmount,
        status: "PENDENTE",
      })
      .select()
      .single();

    if (orderError) {
      console.error("[/api/orders] Erro ao criar order:", orderError);
      return NextResponse.json({ error: orderError.message }, { status: 400 });
    }

    // Cria os itens em order_items
    const itemsPayload = items.map((item: any) => {
      const unitPrice = Number(item.unit_price || 0);
      const qty = Number(item.quantity || 1);
      return {
        company_id: companyId,
        order_id: orderData.id,
        product_id: item.product_id,
        product_name: item.product_name || null,
        unit_price: unitPrice,
        quantity: qty,
        total_price: unitPrice * qty,
        notes: item.notes || null,
      };
    });

    const { error: itemsError } = await admin.from("order_items").insert(itemsPayload);
    if (itemsError) {
      console.error("[/api/orders] Erro ao criar order_items:", itemsError);
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      order: orderData,
      tab_id: resolvedTabId,
      message: "Pedido registrado com sucesso!",
    });
  } catch (err: any) {
    console.error("[/api/orders POST] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao processar pedido" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const admin = createAdminClient();
    const { orderId, action } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId é obrigatório." }, { status: 400 });
    }

    if (action === "confirm") {
      // 1. Tenta executar a procedure de baixa física de estoque
      const { error: rpcErr } = await admin.rpc("fn_confirm_order_stock", {
        p_order_id: orderId,
      });

      if (rpcErr) {
        console.warn("[/api/orders PATCH] RPC fn_confirm_order_stock falhou, fallback manual:", rpcErr.message);

        // Fallback manual: atualiza o status do pedido
        const { error: updErr } = await admin
          .from("orders")
          .update({
            status: "ENTREGUE",
            stock_deducted: true,
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        if (updErr) throw updErr;
      }

      return NextResponse.json({ success: true, message: "Pedido confirmado e entregue!" });
    }

    if (action === "cancel") {
      const { error: cancelErr } = await admin
        .from("orders")
        .update({ status: "CANCELADO" })
        .eq("id", orderId);

      if (cancelErr) throw cancelErr;

      return NextResponse.json({ success: true, message: "Pedido cancelado com sucesso." });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err: any) {
    console.error("[/api/orders PATCH] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao atualizar pedido" },
      { status: 500 }
    );
  }
}
