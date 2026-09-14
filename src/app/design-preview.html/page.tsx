import { notFound } from "next/navigation";
import { DesignPreview } from "./preview";

export default async function DesignPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; competencia?: string; consolidado?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DesignPreview {...await searchParams} />;
}
