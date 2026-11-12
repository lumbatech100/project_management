export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-brand-sky px-3 py-6 sm:px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
