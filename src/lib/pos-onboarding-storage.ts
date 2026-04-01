/**
 * Preferencias de bienvenida / tutorial POS GEB (por usuario, en este navegador).
 */

export type PosGebOnboardingStateV1 = {
  version: 1;
  answeredAt: string;
  /** true = eligió «soy nuevo» y debe (o debía) ver el tour guiado */
  isNewUser: boolean;
  tutorialCompleted?: boolean;
};

const STORAGE_PREFIX = "posGeb_onboarding_v1_";

function key(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

export function readPosGebOnboarding(uid: string): PosGebOnboardingStateV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PosGebOnboardingStateV1>;
    if (parsed?.version !== 1 || typeof parsed.answeredAt !== "string") return null;
    if (typeof parsed.isNewUser !== "boolean") return null;
    return {
      version: 1,
      answeredAt: parsed.answeredAt,
      isNewUser: parsed.isNewUser,
      tutorialCompleted: Boolean(parsed.tutorialCompleted),
    };
  } catch {
    return null;
  }
}

export function writePosGebOnboarding(uid: string, state: PosGebOnboardingStateV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(uid), JSON.stringify(state));
  } catch {
    /* cuota / modo privado */
  }
}

export function markPosGebTutorialCompleted(uid: string): void {
  const prev = readPosGebOnboarding(uid);
  if (!prev) return;
  writePosGebOnboarding(uid, { ...prev, tutorialCompleted: true });
}

/** Borra la preferencia en este navegador: la próxima vez en Caja volverá la pregunta «¿Sos nuevo?» y el tour si elegís nuevo. */
export function clearPosGebOnboarding(uid: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(uid));
  } catch {
    /* */
  }
}
