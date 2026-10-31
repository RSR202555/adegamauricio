import { Product } from "@/types/database";

export interface ProductPackagingMeta {
  description_text?: string;
  box_enabled?: boolean;
  box_units?: number;
  box_price?: number;
  box_barcodes?: string[];
  secondary_barcodes?: string[];
}

export function parseProductMetadata(rawProduct: any): Product {
  if (!rawProduct) return rawProduct;
  
  let meta: ProductPackagingMeta = {};
  let plainDescription = rawProduct.description || "";

  if (rawProduct.description) {
    const trimmed = String(rawProduct.description).trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) {
          meta = parsed;
          plainDescription = parsed.description_text || "";
        }
      } catch {
        plainDescription = rawProduct.description;
      }
    }
  }

  return {
    ...rawProduct,
    description: plainDescription,
    box_enabled: rawProduct.box_enabled ?? meta.box_enabled ?? false,
    box_units: Number(rawProduct.box_units ?? meta.box_units ?? 1),
    box_price: Number(rawProduct.box_price ?? meta.box_price ?? 0),
    box_barcodes: Array.isArray(rawProduct.box_barcodes)
      ? rawProduct.box_barcodes
      : Array.isArray(meta.box_barcodes)
      ? meta.box_barcodes
      : [],
    secondary_barcodes: Array.isArray(rawProduct.secondary_barcodes)
      ? rawProduct.secondary_barcodes
      : Array.isArray(meta.secondary_barcodes)
      ? meta.secondary_barcodes
      : [],
  };
}

export function serializeProductForSave(productData: any) {
  const meta: ProductPackagingMeta = {
    description_text: productData.description || "",
    box_enabled: Boolean(productData.box_enabled),
    box_units: Number(productData.box_units || 1),
    box_price: Number(productData.box_price || 0),
    box_barcodes: Array.isArray(productData.box_barcodes)
      ? productData.box_barcodes.map((c: string) => String(c).trim()).filter(Boolean)
      : [],
    secondary_barcodes: Array.isArray(productData.secondary_barcodes)
      ? productData.secondary_barcodes.map((c: string) => String(c).trim()).filter(Boolean)
      : [],
  };

  // Guarda em formato JSON dentro do campo description garantindo persistência imediata
  const serializedDescription = JSON.stringify(meta);

  const payload: any = {
    ...productData,
    description: serializedDescription,
  };

  // Remove campos virtuais para evitar erro caso a tabela products no Postgres não tenha essas colunas avulsas
  delete payload.box_enabled;
  delete payload.box_units;
  delete payload.box_price;
  delete payload.box_barcodes;
  delete payload.secondary_barcodes;

  return payload;
}

export interface MatchedProductResult {
  product: Product;
  matchType: "unit" | "box" | "secondary";
  isBox: boolean;
  boxUnits: number;
  boxPrice: number;
  matchedCode: string;
}

export function matchProductByCode(
  products: Product[],
  rawCode: string
): MatchedProductResult | null {
  const code = rawCode.trim().toLowerCase();
  if (!code) return null;

  for (const raw of products) {
    const p = parseProductMetadata(raw);

    // 1. Conferir Códigos de Caixa Cadastrados
    if (p.box_enabled && p.box_barcodes && p.box_barcodes.length > 0) {
      const matchedBoxCode = p.box_barcodes.find(
        (bc) => bc && bc.trim().toLowerCase() === code
      );
      if (matchedBoxCode) {
        return {
          product: p,
          matchType: "box",
          isBox: true,
          boxUnits: Number(p.box_units || 1),
          boxPrice: Number(p.box_price || p.sale_price || p.selling_price || 0),
          matchedCode: matchedBoxCode,
        };
      }
    }

    // 2. Conferir Código de Barras Principal (Unidade)
    if (p.barcode && p.barcode.trim().toLowerCase() === code) {
      return {
        product: p,
        matchType: "unit",
        isBox: false,
        boxUnits: 1,
        boxPrice: 0,
        matchedCode: p.barcode,
      };
    }

    // 3. Conferir SKU
    if (p.sku && p.sku.trim().toLowerCase() === code) {
      return {
        product: p,
        matchType: "unit",
        isBox: false,
        boxUnits: 1,
        boxPrice: 0,
        matchedCode: p.sku,
      };
    }

    // 4. Conferir Códigos Secundários/Alternativos da Unidade
    if (p.secondary_barcodes && p.secondary_barcodes.length > 0) {
      const matchedSecondary = p.secondary_barcodes.find(
        (bc) => bc && bc.trim().toLowerCase() === code
      );
      if (matchedSecondary) {
        return {
          product: p,
          matchType: "secondary",
          isBox: false,
          boxUnits: 1,
          boxPrice: 0,
          matchedCode: matchedSecondary,
        };
      }
    }
  }

  return null;
}
