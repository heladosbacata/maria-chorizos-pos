/** Rol Firestore `users/{uid}.role` para contador invitado (solo datos de un PV). */
export const POS_CONTADOR_ROLE = "pos_contador" as const;

export function esContadorInvitado(role: string | null | undefined): boolean {
  return role === POS_CONTADOR_ROLE;
}
