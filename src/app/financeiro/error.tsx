"use client";

import { RefreshCw, ChartNoAxesCombined } from "lucide-react";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="maza-panel maza-empty"><ChartNoAxesCombined size={32} /><h2>Não foi possível carregar esta visão.</h2><p>Tente novamente para consultar seus dados financeiros.</p><button type="button" className="maza-button maza-button-primary" onClick={reset}><RefreshCw size={16} />Tentar novamente</button></section>;
}
