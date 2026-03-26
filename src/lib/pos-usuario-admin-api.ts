export async function crearUsuarioPosEnWms(
  params: { email: string; password: string; puntoVenta: string },
  idToken: string | null
): Promise<{ ok: boolean; message?: string }> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  try {
    const res = await fetch("/api/pos_usuario_crear", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: params.email.trim(),
        password: params.password,
        puntoVenta: params.puntoVenta.trim() || undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
    if (!res.ok) {
      return { ok: false, message: data.message || data.error || `Error ${res.status}` };
    }
    if (data.ok === false) {
      return { ok: false, message: data.message || "No se pudo crear el usuario." };
    }
    return { ok: true, message: data.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error de red" };
  }
}

export async function actualizarUsuarioPosEnWms(
  params: { email: string; puntoVenta: string },
  idToken: string | null
): Promise<{ ok: boolean; message?: string }> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  try {
    const res = await fetch("/api/pos_usuario_actualizar", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: params.email.trim(), puntoVenta: params.puntoVenta.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
    if (!res.ok) {
      return { ok: false, message: data.message || data.error || `Error ${res.status}` };
    }
    if (data.ok === false) {
      return { ok: false, message: data.message || "No se pudo actualizar el usuario." };
    }
    return { ok: true, message: data.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error de red" };
  }
}
