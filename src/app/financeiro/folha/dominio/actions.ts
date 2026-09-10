"use server";

import { requireUser } from "@maza/auth/server";
import { createServiceClient } from "@maza/db/supabase/server";
import {
  importarExtratoDominioParaBanco,
  type ImportarExtratoDominioResultado,
} from "@/lib/folha/dominio/importar";
import type { DominioParseResultado } from "@/lib/folha/dominio/types";

export async function importarExtratoDominio(
  resultado: DominioParseResultado
): Promise<ImportarExtratoDominioResultado> {
  await requireUser();
  const supabase = createServiceClient();
  if (!supabase) {
    return {
      ok: false,
      arquivoOrigem: resultado.arquivoOrigem,
      competencias: [],
      cnpjsDesconhecidos: [],
    };
  }
  return importarExtratoDominioParaBanco(supabase, resultado);
}
