import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit3, History, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminClient } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { MemoryItem, Page } from "../types";

const COLLECTIONS = [
  "all",
  "facts",
  "preferences",
  "feedback",
  "references",
  "episodes",
  "profiles",
  "session_archives",
];

export function MemoriesView({
  api,
  readOnly,
  scopeKey,
}: {
  api: AdminClient;
  readOnly: boolean;
  scopeKey: string;
}) {
  const queryClient = useQueryClient();
  const [collection, setCollection] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MemoryItem | null>(null);
  const [operation, setOperation] = useState<"delete" | "revise" | null>(null);
  const [revision, setRevision] = useState("");
  const query = useInfiniteQuery({
    getNextPageParam: (page: Page<MemoryItem>) => page.nextCursor ?? null,
    initialPageParam: "",
    queryKey: ["memories", scopeKey, collection],
    queryFn: ({ pageParam }): Promise<Page<MemoryItem>> =>
      api.memories(
        scopeKey,
        collection === "all" ? undefined : collection,
        pageParam || undefined,
      ),
  });
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["memories", scopeKey] }),
    queryClient.invalidateQueries({ queryKey: ["scopes"] }),
  ]);
  const deletion = useMutation({
    mutationFn: (memory: MemoryItem) => api.deleteMemory(scopeKey, memory),
    onSuccess: refresh,
  });
  const revisionMutation = useMutation({
    mutationFn: ({ content, memory }: { content: string; memory: MemoryItem }) =>
      api.reviseMemory(scopeKey, memory, content, "manual_review"),
    onSuccess: refresh,
  });
  const memories = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (query.data?.pages.flatMap((page) => page.items) ?? [])
      .filter((memory) => !needle || memory.summary.toLocaleLowerCase().includes(needle))
      .sort((left, right) =>
        (right.updatedAt ?? right.createdAt ?? "").localeCompare(
          left.updatedAt ?? left.createdAt ?? "",
        ),
      );
  }, [query.data, search]);

  return (
    <section className="view-section">
      <div className="section-toolbar">
        <div className="segmented scrollable" role="tablist" aria-label="Memory category">
          {COLLECTIONS.map((value) => (
            <button
              aria-selected={collection === value}
              className={collection === value ? "active" : ""}
              key={value}
              onClick={() => setCollection(value)}
              role="tab"
            >
              {value.replace("_", " ")}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Filter memories"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter this view"
            value={search}
          />
        </label>
      </div>

      {query.isLoading && <div className="empty-state">Loading memories...</div>}
      {query.isError && <div className="error-state">{query.error.message}</div>}
      {!query.isLoading && !query.isError && memories.length === 0 && (
        <div className="empty-state">No memories in this view.</div>
      )}
      {memories.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Memory</th>
                <th>Type</th>
                <th>Lifecycle</th>
                <th>Timeline</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {memories.map((memory) => (
                <tr key={`${memory.collection}:${memory.id}`}>
                  <td>
                    <button className="summary-button" onClick={() => setSelected(memory)}>
                      {memory.summary}
                    </button>
                    <span className="record-id">{memory.id}</span>
                  </td>
                  <td><span className="tag neutral">{memory.memoryType}</span></td>
                  <td>
                    <span className={`status-dot ${memory.lifecycle === "superseded" ? "muted" : "ok"}`} />
                    {memory.lifecycle ?? "active"}
                  </td>
                  <td>
                    <span className="timeline-cell">
                      <History size={14} />
                      {formatTime(memory.updatedAt ?? memory.createdAt)}
                    </span>
                    {memory.supersededBy && <span className="record-id">→ {memory.supersededBy}</span>}
                  </td>
                  <td className="row-actions">
                    {!readOnly && memory.revisable && (
                      <button
                        aria-label={`Revise ${memory.summary}`}
                        className="icon-button"
                        onClick={() => {
                          setSelected(memory);
                          setRevision(memory.summary);
                          setOperation("revise");
                        }}
                        title="Revise memory"
                      >
                        <Edit3 size={16} />
                      </button>
                    )}
                    {!readOnly && (
                      <button
                        aria-label={`Delete ${memory.summary}`}
                        className="icon-button danger"
                        onClick={() => {
                          setSelected(memory);
                          setOperation("delete");
                        }}
                        title="Delete memory"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.hasNextPage && (
        <div className="pagination-row">
          <button
            className="button secondary"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading..." : "Load more memories"}
          </button>
        </div>
      )}

      {selected && operation === null && (
        <ConfirmDialog
          confirmLabel="Close"
          description={`${selected.collection} · ${selected.id}`}
          onCancel={() => setSelected(null)}
          onConfirm={async () => setSelected(null)}
          showCancel={false}
          showIcon={false}
          title={selected.summary}
        >
          <pre className="details-block">{JSON.stringify(selected.details, null, 2)}</pre>
        </ConfirmDialog>
      )}
      {selected && operation === "delete" && (
        <ConfirmDialog
          confirmLabel="Delete memory"
          danger
          description={selected.summary}
          onCancel={() => {
            setOperation(null);
            setSelected(null);
          }}
          onConfirm={async () => {
            await deletion.mutateAsync(selected);
            setOperation(null);
            setSelected(null);
          }}
          title="Delete this memory?"
          verificationLabel="I understand this removes the selected memory from its exact scope."
        />
      )}
      {selected && operation === "revise" && (
        <ConfirmDialog
          confirmLabel="Create revision"
          description={selected.summary}
          onCancel={() => {
            setOperation(null);
            setSelected(null);
          }}
          onConfirm={async () => {
            await revisionMutation.mutateAsync({ content: revision, memory: selected });
            setOperation(null);
            setSelected(null);
          }}
          title="Revise memory"
          verificationLabel="Create a superseding memory and preserve this item in history."
        >
          <label className="field-label">
            Revised content
            <textarea onChange={(event) => setRevision(event.target.value)} rows={5} value={revision} />
          </label>
        </ConfirmDialog>
      )}
    </section>
  );
}

function formatTime(value?: string): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
