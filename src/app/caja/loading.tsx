export default function CajaLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-100/90">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      <p className="text-sm font-medium text-gray-600">Abriendo caja…</p>
    </div>
  );
}
