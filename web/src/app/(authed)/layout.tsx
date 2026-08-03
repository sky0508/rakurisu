export const dynamic = "force-dynamic";

/**
 * 認証必須ルートの layout。ガードは proxy.ts に集約しているので pass-through。
 * layout に requireAuth を書くと配下 login が redirect loop に陥る。
 */
export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
