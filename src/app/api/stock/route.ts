import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "150", 10);
    const productId = searchParams.get("productId");

    let query = admin
      .from("stock_movements")
      .select("*, products(id, name, barcode, sku, unit, current_stock, min_stock, cost_price, sale_price)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data: movements, error } = await query;
    if (error) {
      console.error("[/api/stock GET] Erro ao carregar movimentações:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ movements: movements || [] });
  } catch (err: any) {
    console.error("[/api/stock GET] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao buscar movimentações de estoque" },
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
    const companyId = body.company_id || defaultCompanyId;

    // 1. AJUSTE MANUAL DE ESTOQUE (ENTRADA, SAÍDA, PERDA OU BALANÇO)
    if (body.action === "manual_adjustment" || !body.action) {
      const {
        product_id,
        movement_type = "ENTRADA",
        quantity = 1,
        cost_price,
        notes = "Ajuste manual de estoque",
      } = body;

      const movementType = (movement_type || "ENTRADA").toUpperCase();

      if (!product_id) {
        return NextResponse.json({ error: "Produto é obrigatório." }, { status: 400 });
      }

      const numQty = Math.max(0, parseFloat(quantity) || 0);

      // Busca o saldo atual do produto com lock
      const { data: prod, error: fetchErr } = await admin
        .from("products")
        .select("*")
        .eq("id", product_id)
        .single();

      if (fetchErr || !prod) {
        return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
      }

      const previousStock = Number(prod.current_stock || 0);
      let newStock = previousStock;
      let effectiveMovementQty = numQty;

      if (movementType === "ENTRADA") {
        newStock = previousStock + numQty;
      } else if (movementType === "SAIDA" || movementType === "PERDA") {
        newStock = Math.max(0, previousStock - numQty);
      } else if (movementType === "AJUSTE") {
        // Balanço direto: define o novo estoque para a quantidade contada
        newStock = numQty;
        effectiveMovementQty = Math.abs(newStock - previousStock);
      }

      const unitCost = cost_price !== undefined && cost_price !== ""
        ? parseFloat(cost_price)
        : Number(prod.cost_price || 0);

      // 1. Grava histórico na tabela stock_movements
      const { data: movement, error: movErr } = await admin
        .from("stock_movements")
        .insert({
          company_id: companyId,
          product_id: prod.id,
          movement_type: movementType,
          type: movementType === "ENTRADA" ? "manual_in" : movementType === "AJUSTE" ? "inventory_adjustment" : "loss_waste",
          quantity: movementType === "SAIDA" || movementType === "PERDA" ? -numQty : numQty,
          previous_stock: previousStock,
          new_stock: newStock,
          cost_price: unitCost,
          unit_cost: unitCost,
          notes: notes.trim() || `Ajuste manual de ${movementType}`,
        })
        .select()
        .single();

      if (movErr) throw movErr;

      // 2. Atualiza o saldo no cadastro do produto
      const updatePayload: any = {
        current_stock: newStock,
        updated_at: new Date().toISOString(),
      };
      if (cost_price !== undefined && cost_price !== "" && parseFloat(cost_price) > 0) {
        updatePayload.cost_price = parseFloat(cost_price);
      }

      const { error: updErr } = await admin
        .from("products")
        .update(updatePayload)
        .eq("id", prod.id);

      if (updErr) throw updErr;

      return NextResponse.json({
        success: true,
        message: "Estoque atualizado com sucesso!",
        movement,
        new_stock: newStock,
      });
    }

    // 2. RECEBIMENTO DE MERCADORIA EM LOTE (POR BIPAGEM OU NOTA)
    if (body.action === "batch_reception") {
      const { items = [], delivery_ref = "" } = body;

      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "Nenhum item informado para recebimento." }, { status: 400 });
      }

      const refLabel = delivery_ref.trim() ? `Ref: ${delivery_ref.trim()}` : "Recebimento de Mercadoria";
      const processedMovements: any[] = [];

      for (const item of items) {
        const { product_id, total_units, package_qty, is_box, box_units, cost_per_package } = item;

        const { data: prod, error: fetchErr } = await admin
          .from("products")
          .select("*")
          .eq("id", product_id)
          .single();

        if (fetchErr || !prod) continue;

        const previousStock = Number(prod.current_stock || 0);
        const unitsToAdd = Number(total_units || 0);
        const newStock = previousStock + unitsToAdd;

        const calculatedUnitCost = Number(cost_per_package || 0) > 0
          ? Number(cost_per_package) / Number(box_units || 1)
          : Number(prod.cost_price || 0);

        // Grava auditoria em stock_movements
        const { data: movRecord, error: movErr } = await admin
          .from("stock_movements")
          .insert({
            company_id: companyId,
            product_id: prod.id,
            movement_type: "ENTRADA",
            type: "purchase_in",
            quantity: unitsToAdd,
            previous_stock: previousStock,
            new_stock: newStock,
            cost_price: calculatedUnitCost,
            unit_cost: calculatedUnitCost,
            notes: `${refLabel} • ${package_qty} ${is_box ? `cx (${box_units} un/cx)` : "un"}`,
          })
          .select()
          .single();

        if (movErr) throw movErr;
        processedMovements.push(movRecord);

        // Atualiza estoque e custo no produto
        const updatePayload: any = {
          current_stock: newStock,
          updated_at: new Date().toISOString(),
        };
        if (calculatedUnitCost > 0) {
          updatePayload.cost_price = calculatedUnitCost;
        }

        const { error: updErr } = await admin
          .from("products")
          .update(updatePayload)
          .eq("id", prod.id);

        if (updErr) throw updErr;
      }

      return NextResponse.json({
        success: true,
        message: `${processedMovements.length} item(ns) recebido(s) e adicionado(s) ao estoque físico!`,
        movements: processedMovements,
      });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err: any) {
    console.error("[/api/stock POST] Erro interno:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao processar movimentação de estoque" },
      { status: 500 }
    );
  }
}
