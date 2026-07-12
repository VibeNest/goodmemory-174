import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

interface ConfirmDialogProps {
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  description: string;
  onCancel(): void;
  onConfirm(): Promise<void>;
  showCancel?: boolean;
  showIcon?: boolean;
  title: string;
  verificationLabel?: string;
}

export function ConfirmDialog({
  children,
  confirmLabel,
  danger = false,
  description,
  onCancel,
  onConfirm,
  showCancel = true,
  showIcon = true,
  title,
  verificationLabel,
}: ConfirmDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onCancel, pending]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" className="modal" role="dialog">
        <header className={`modal-header ${showIcon ? "" : "no-icon"}`}>
          {showIcon && (
            <span className={danger ? "modal-icon danger" : "modal-icon"}>
              <AlertTriangle size={18} />
            </span>
          )}
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button aria-label="Close" className="icon-button" disabled={pending} onClick={onCancel}>
            <X size={18} />
          </button>
        </header>
        {children}
        {verificationLabel && (
          <label className="confirmation-check">
            <input
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>{verificationLabel}</span>
          </label>
        )}
        {error && <div className="inline-error" role="alert">{error}</div>}
        <footer className="modal-actions">
          {showCancel && (
            <button className="button secondary" disabled={pending} onClick={onCancel}>Cancel</button>
          )}
          <button
            className={`button ${danger ? "danger" : "primary"}`}
            disabled={pending || Boolean(verificationLabel && !confirmed)}
            onClick={async () => {
              setError(undefined);
              setPending(true);
              try {
                await onConfirm();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Working..." : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
