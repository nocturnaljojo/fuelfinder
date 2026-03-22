import { useState } from "react";
import { supabase } from "./supabaseClient";

interface FeedbackModalProps { onClose: () => void; }

export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [message, setMessage] = useState("");
  const [email,   setEmail]   = useState("");
  const [status,  setStatus]  = useState<"idle" | "sending" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    try {
      const { error } = await supabase.from("feedback").insert({
        message:    message.trim(),
        email:      email.trim() || null,
        page_url:   window.location.href,
        user_agent: navigator.userAgent,
      });
      if (error) throw error;
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="feedback-modal" onClick={e => e.stopPropagation()}>
        <div className="feedback-modal-header">
          <h2 className="feedback-modal-title">💬 Make FuelFinder better</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {status === "done" ? (
          <div className="feedback-success">
            <div className="feedback-success-icon">🎉</div>
            <h3>Thanks for your feedback!</h3>
            <p>Jovi reads every submission and uses it to improve FuelFinder.</p>
            <button className="about-close-btn" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={handleSubmit}>
            <label className="feedback-label">
              What would make FuelFinder more useful for you?
              <textarea
                className="feedback-textarea"
                placeholder="e.g. I'd love price alerts, or a feature to compare stations side by side…"
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={5}
                maxLength={1000}
                required
              />
              <span className="feedback-char-count">{message.length} / 1000</span>
            </label>

            <label className="feedback-label">
              Your email <span className="feedback-optional">(optional — only if you'd like a reply)</span>
              <input
                className="feedback-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            {status === "error" && (
              <p className="feedback-error">⚠️ Something went wrong — please try again.</p>
            )}

            <div className="feedback-form-footer">
              <button type="button" className="feedback-cancel-btn" onClick={onClose}>Cancel</button>
              <button
                type="submit"
                className="feedback-submit-btn"
                disabled={status === "sending" || !message.trim()}
              >
                {status === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
