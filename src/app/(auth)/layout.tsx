export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh items-center justify-center px-6">
      <div className="w-[296px]">{children}</div>
    </div>
  );
}
