import { requireUser } from "@maza/auth/server";
import { getCurrentUnitComOrigem } from "@maza/auth/unit";
import { AvisoUnidadeFallback } from "@/components/financeiro/AvisoUnidadeFallback";
import { ImportarComprasClient } from "@/components/financeiro/pagar/ImportarComprasClient";

const YOSHIMORI_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909c";

export const dynamic = "force-dynamic";

export default async function ImportarComprasPage() {
  await requireUser();
  const { unit, cookiePresente } = await getCurrentUnitComOrigem();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <AvisoUnidadeFallback cookiePresente={cookiePresente} />
      <ImportarComprasClient unitIdInicial={unit?.id ?? YOSHIMORI_UNIT_ID} />
    </div>
  );
}
