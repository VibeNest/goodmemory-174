import { useMutation } from "@tanstack/react-query";
import { Play, Search } from "lucide-react";
import { useState } from "react";
import type { AdminClient } from "../api";

export function TraceView({ api, scopeKey }: { api: AdminClient; scopeKey: string }) {
  const [query, setQuery] = useState("");
  const trace = useMutation({
    mutationFn: () => api.recallTrace(scopeKey, query.trim()),
  });

  return (
    <section className="view-section">
      <form
        className="trace-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) trace.mutate();
        }}
      >
        <label className="trace-input">
          <Search size={17} />
          <input
            aria-label="Recall query"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter a query to inspect retrieval evidence"
            value={query}
          />
        </label>
        <button className="button primary" disabled={!query.trim() || trace.isPending} type="submit">
          <Play size={15} /> {trace.isPending ? "Running" : "Run trace"}
        </button>
      </form>
      {trace.isError && <div className="error-state">{trace.error.message}</div>}
      {!trace.data && !trace.isPending && (
        <div className="empty-state">Run a query to see channels, fusion, reranking, and evidence decisions.</div>
      )}
      {trace.data && <TraceResult value={trace.data} />}
    </section>
  );
}

function TraceResult({ value }: { value: Record<string, unknown> }) {
  const candidateTraces = Array.isArray(value.candidateTraces)
    ? value.candidateTraces as Array<Record<string, unknown>>
    : [];
  const retrievalTrace = value.retrievalTrace as Record<string, unknown> | undefined;
  return (
    <div className="trace-results">
      <div className="metric-strip">
        <Metric label="Latency" value={`${value.latencyMs ?? "–"} ms`} />
        <Metric label="Hits" value={String(Array.isArray(value.hits) ? value.hits.length : 0)} />
        <Metric label="Candidates" value={String(candidateTraces.length)} />
        <Metric label="Tokens" value={String(value.tokenCount ?? "–")} />
      </div>
      {retrievalTrace && (
        <section className="trace-panel">
          <h3>Retrieval channels</h3>
          <pre>{JSON.stringify(retrievalTrace, null, 2)}</pre>
        </section>
      )}
      <section className="trace-panel">
        <h3>Candidate evidence</h3>
        {candidateTraces.length === 0 ? (
          <p className="muted-text">No candidate traces were returned.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table compact">
              <thead><tr><th>Memory</th><th>Type</th><th>Decision</th><th>Scores</th></tr></thead>
              <tbody>
                {candidateTraces.map((candidate, index) => (
                  <tr key={String(candidate.memoryId ?? index)}>
                    <td>{String(candidate.memoryId ?? "unknown")}</td>
                    <td>{String(candidate.memoryType ?? "unknown")}</td>
                    <td>{candidate.returned ? "returned" : String(candidate.whySuppressed ?? "suppressed")}</td>
                    <td><code>{JSON.stringify(candidate)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
