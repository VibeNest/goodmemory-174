import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw, X } from "lucide-react";
import type { AdminClient } from "../api";
import type { CandidateItem, Page } from "../types";

export function CandidatesView({
  api,
  readOnly,
  scopeKey,
}: {
  api: AdminClient;
  readOnly: boolean;
  scopeKey: string;
}) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    getNextPageParam: (page: Page<CandidateItem>) => page.nextCursor ?? null,
    initialPageParam: "",
    queryKey: ["candidates", scopeKey],
    queryFn: ({ pageParam }): Promise<Page<CandidateItem>> =>
      api.candidates(scopeKey, pageParam || undefined),
  });
  const mutation = useMutation({
    mutationFn: ({ candidate, status }: { candidate: CandidateItem; status: string }) =>
      api.transitionCandidate(candidate, status),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["candidates", scopeKey] }),
      queryClient.invalidateQueries({ queryKey: ["memories", scopeKey] }),
      queryClient.invalidateQueries({ queryKey: ["scopes"] }),
    ]),
  });
  const candidates = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="view-section">
      {query.isLoading && <div className="empty-state">Loading candidate queue...</div>}
      {query.isError && <div className="error-state">{query.error.message}</div>}
      {mutation.isError && <div className="inline-error" role="alert">{mutation.error.message}</div>}
      {!query.isLoading && !query.isError && candidates.length === 0 && (
        <div className="empty-state">No candidate memories for this scope.</div>
      )}
      <div className="candidate-list">
        {candidates.map((candidate) => (
          <article className="candidate-row" key={candidate.id}>
            <div className="candidate-main">
              <div className="candidate-meta">
                <span className={`tag ${candidate.status}`}>{candidate.status}</span>
                <span>{candidate.kind}</span>
                <span>{candidate.host}</span>
              </div>
              <h3>{candidate.contentPreview}</h3>
              <p>{candidate.reason}</p>
              <span className="record-id">{candidate.id}</span>
            </div>
            {!readOnly && (
              <div className="candidate-actions">
                {candidate.status === "pending" && (
                  <>
                    <button
                      className="button primary"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ candidate, status: "approved" })}
                    >
                      <Check size={15} /> Approve
                    </button>
                    <button
                      className="button secondary"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ candidate, status: "rejected" })}
                    >
                      <X size={15} /> Reject
                    </button>
                  </>
                )}
                {candidate.status === "approved" && (
                  <button
                    className="button secondary"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ candidate, status: "released" })}
                  >
                    <RotateCcw size={15} /> Release
                  </button>
                )}
              </div>
            )}
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
            {query.isFetchingNextPage ? "Loading..." : "Load more candidates"}
          </button>
        </div>
      )}
    </section>
  );
}
