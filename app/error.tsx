"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#050505",
      color: "#fff",
      display: "grid",
      placeItems: "center",
      padding: 24,
      fontFamily: "system-ui, sans-serif"
    }}>
      <div style={{
        width: "min(720px, 100%)",
        border: "1px solid #ff2e93",
        borderRadius: 20,
        padding: 28,
        background: "#0b0b0b",
        boxShadow: "0 0 40px rgba(255,46,147,.12)"
      }}>
        <h1 style={{ color: "#ff2e93", marginTop: 0 }}>TREXOR – Fehler</h1>
        <p>Die Oberfläche ist abgestürzt. Der Fehler wurde abgefangen.</p>
        <pre style={{
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          background: "#000",
          padding: 16,
          borderRadius: 12,
          color: "#ddd"
        }}>{error?.message || "Unbekannter Fehler"}</pre>
        <button
          onClick={() => reset()}
          style={{
            border: 0,
            borderRadius: 10,
            padding: "11px 18px",
            background: "#ff2e93",
            color: "#000",
            fontWeight: 800,
            cursor: "pointer"
          }}
        >
          Erneut versuchen
        </button>
      </div>
    </main>
  );
}
