import { useInfiniteQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import type { AdminClient } from "../api";
import type { AuditEvent, Page } from "../types";

export function AuditView({ api, scopeKey }: { api: AdminClient; scopeKey: string }) {
  const query = useInfiniteQuery({
    getNextPageParam: (page: Page<AuditEvent>) => page.nextCursor ?? null,
    initialPageParam: "",
    queryFn: ({ pageParam }): Promise<Page<AuditEvent>> =>
      api.auditEvents(scopeKey, pageParam || undefined),
    queryKey: ["audit", scopeKey],
  });
  const events = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section className="view-section">
      {query.isLoading && <div className="empty-state">Loading audit events...</div>}
      {query.isError && <div className="error-state">{query.error.message}</div>}
      {!query.isLoading && !query.isError && events.length === 0 && (
        <div className="empty-state">No Inspector mutations have been recorded.</div>
      )}
      <div className="audit-list">
        {events.map((event) => (
          <article className="audit-row" key={event.actionId}>
            {event.resultStatus === "ok" ? (
              <CheckCircle2 className="success-icon" size={18} />
            ) : (
              <XCircle className="error-icon" size={18} />
            )}
            <div>
              <strong>{event.action}</strong>
              <span>{event.targetId ?? "scope operation"}</span>
              {event.contentPreview && <p>{event.contentPreview}</p>}
            </div>
            <time>{new Date(event.occurredAt).toLocaleString()}</time>
          </article>
        ))}
      </div>
      {query.hasNextPage && (
        <div className="pagination-row">
          <button
            className="button secondary"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading..." : "Load more events"}
          </button>
        </div>
      )}
    </section>
  );
}
