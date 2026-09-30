type PageQuery<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }> & {
  abortSignal(signal: AbortSignal): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

/** One deadline for the entire paginated read, not a fresh timeout per page. */
export async function fetchCockpitRows<T>(
  buildQuery: (from: number, to: number) => PageQuery<T>,
  timeoutMs = 15_000,
): Promise<T[]> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  // Aborting fetch alone is insufficient if the client is still resolving its
  // session (or another transport ignores AbortSignal). Always settle the read.
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("A consulta dos indicadores demorou demais. Tente novamente."));
      controller.abort();
    }, timeoutMs);
  });
  const result: T[] = [];
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await Promise.race([
        buildQuery(from, from + 999).abortSignal(controller.signal),
        deadline,
      ]);
      if (controller.signal.aborted) throw new Error("A consulta dos indicadores demorou demais. Tente novamente.");
      if (error) throw new Error(error.message);
      const page = data ?? [];
      result.push(...page);
      if (page.length < 1000) return result;
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function snapshotsAreStale(
  snapshots: Array<{ unit_id: string; revisao_fonte: number | null }>,
  revisions: Array<{ unit_id: string; revisao: number }>,
): boolean {
  return revisions.some(revision => {
    const rows = snapshots.filter(row => row.unit_id === revision.unit_id);
    return !rows.length || rows.some(row => row.revisao_fonte == null || Number(row.revisao_fonte) !== Number(revision.revisao));
  });
}
