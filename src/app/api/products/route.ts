import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseProductMetadata, serializeProductForSave } from "@/lib/products";

let memoryCachedProducts: any[] = [];

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("products").select("*").order("name");
    if (!error && data && data.length > 0) {
      const parsed = data.map(parseProductMetadata);
      memoryCachedProducts = parsed;
      return NextResponse.json({ products: parsed, source: "live" });
    }
    if (memoryCachedProducts.length > 0) {
      return NextResponse.json({ products: memoryCachedProducts, source: "cache", warning: "Offline cache ativo" });
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ products: [] });
  } catch (err: any) {
    if (memoryCachedProducts.length > 0) {
      return NextResponse.json({ products: memoryCachedProducts, source: "cache", warning: "Offline cache ativo" });
    }
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const admin = createAdminClient();

    // Ação rápida: Vincular novo código de caixa a um produto existente
    if (body.action === "link_box_code") {
      const { productId, boxBarcode, boxUnits, boxPrice } = body;
      if (!productId || !boxBarcode) {
        return NextResponse.json({ error: "Produto e código de caixa são obrigatórios" }, { status: 400 });
      }

      const { data: prod, error: fetchErr } = await admin.from("products").select("*").eq("id", productId).single();
      if (fetchErr || !prod) {
        return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
      }

      const parsed = parseProductMetadata(prod);
      const cleanedCode = String(boxBarcode).trim();
      const currentBoxCodes = new Set(parsed.box_barcodes || []);
      currentBoxCodes.add(cleanedCode);

      const toSave = serializeProductForSave({
        ...parsed,
        box_enabled: true,
        box_units: boxUnits ? Number(boxUnits) : parsed.box_units || 1,
        box_price: boxPrice !== undefined ? Number(boxPrice) : parsed.box_price || parsed.sale_price || 0,
        box_barcodes: Array.from(currentBoxCodes),
      });

      const { data: updated, error: updErr } = await admin
        .from("products")
        .update({
          description: toSave.description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId)
        .select()
        .single();

      if (updErr) throw updErr;
      return NextResponse.json({ success: true, product: parseProductMetadata(updated) });
    }

    // Ação rápida: Vincular código alternativo de unidade
    if (body.action === "link_secondary_code") {
      const { productId, barcode } = body;
      if (!productId || !barcode) {
        return NextResponse.json({ error: "Produto e código são obrigatórios" }, { status: 400 });
      }

      const { data: prod, error: fetchErr } = await admin.from("products").select("*").eq("id", productId).single();
      if (fetchErr || !prod) {
        return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
      }

      const parsed = parseProductMetadata(prod);
      const cleanedCode = String(barcode).trim();
      const currentSecondary = new Set(parsed.secondary_barcodes || []);
      currentSecondary.add(cleanedCode);

      const toSave = serializeProductForSave({
        ...parsed,
        secondary_barcodes: Array.from(currentSecondary),
      });

      const { data: updated, error: updErr } = await admin
        .from("products")
        .update({
          description: toSave.description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId)
        .select()
        .single();

      if (updErr) throw updErr;
      return NextResponse.json({ success: true, product: parseProductMetadata(updated) });
    }

    // Cadastro / Edição regular de produto
    const { id, ...data } = body;
    const payloadToSave = serializeProductForSave(data);

    if (id) {
      // Atualização de produto existente
      const { data: updated, error } = await admin
        .from("products")
        .update({
          ...payloadToSave,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ product: parseProductMetadata(updated) });
    } else {
      // Inserção de novo produto
      const { data: inserted, error } = await admin
        .from("products")
        .insert([
          {
            ...payloadToSave,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ product: parseProductMetadata(inserted) });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro interno do servidor" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID do produto é obrigatório" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("products").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, current_stock, cost_price } = body;

    if (!id) {
      return NextResponse.json({ error: "ID do produto é obrigatório" }, { status: 400 });
    }

    const admin = createAdminClient();
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (current_stock !== undefined) {
      updateData.current_stock = Number(current_stock);
    }
    if (cost_price !== undefined) {
      updateData.cost_price = Number(cost_price);
    }

    const { data: updated, error } = await admin
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ product: parseProductMetadata(updated) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro interno do servidor" }, { status: 500 });
  }
}
