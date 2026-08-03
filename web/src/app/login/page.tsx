import Link from "next/link";
import { RAKURISU_ICON } from "@/lib/brand";

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--sheet)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 32,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={RAKURISU_ICON}
            alt="ラクリス"
            width={28}
            height={28}
            style={{ borderRadius: 8 }}
          />
          <span style={{ fontSize: 18, fontWeight: 700 }}>ラクリス</span>
        </div>
        <p style={{ margin: "8px 0 24px", fontSize: 12.5, color: "var(--ink2)" }}>
          lead-harvest console — B2B リード収集を UI から回す
        </p>
        <Link
          href="/api/auth/google/start"
          className="btn btn-primary"
          style={{ display: "flex", justifyContent: "center", padding: "10px 14px" }}
        >
          Google でログイン
        </Link>
        <p style={{ marginTop: 14, fontSize: 11.5, color: "var(--ink3)" }}>
          Google アカウントでログインしてください。
        </p>
      </div>
    </main>
  );
}
