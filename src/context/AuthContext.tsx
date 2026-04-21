"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type IdTokenResult,
} from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { persistPuntoVentaUsuario } from "@/lib/pos-user-firestore";
import { clearPosGebOnboarding } from "@/lib/pos-onboarding-storage";

export interface AuthUser {
  uid: string;
  email: string | null;
  puntoVenta: string | null;
  /** Firestore `users/{uid}.role` — p. ej. `pos`, `pos_contador`. */
  role: string | null;
  necesitaSeleccionarPunto: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setPuntoVentaSeleccionado: (punto: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function authTimeMsFromIdToken(result: IdTokenResult): number | null {
  const authTimeClaim = result.claims.auth_time;
  if (typeof authTimeClaim === "number" && Number.isFinite(authTimeClaim)) {
    return authTimeClaim * 1000;
  }
  if (typeof authTimeClaim === "string" && authTimeClaim.trim()) {
    const asNumber = Number(authTimeClaim);
    if (Number.isFinite(asNumber)) return asNumber * 1000;
    const parsed = Date.parse(authTimeClaim);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const parsedAuthTime = Date.parse(result.authTime);
  return Number.isNaN(parsedAuthTime) ? null : parsedAuthTime;
}

function sesionRevocadaTrasAuth(authTimeMs: number | null, revokedAtMs: number | null): boolean {
  if (authTimeMs == null || revokedAtMs == null) return false;
  return Math.floor(authTimeMs / 1000) < Math.floor(revokedAtMs / 1000);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [puntoVentaManual, setPuntoVentaManual] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const authClient = auth;
    let unsubscribeUserDoc: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(authClient, async (user) => {
      unsubscribeUserDoc?.();
      unsubscribeUserDoc = null;
      setFirebaseUser(user);
      if (!user) {
        setAuthUser(null);
        setPuntoVentaManual(null);
        setLoading(false);
        return;
      }

      try {
        const firestore = db;
        if (!firestore) {
          setAuthUser({
            uid: user.uid,
            email: user.email ?? null,
            puntoVenta: null,
            role: null,
            necesitaSeleccionarPunto: true,
          });
          setLoading(false);
          return;
        }
        unsubscribeUserDoc = onSnapshot(
          doc(firestore, "users", user.uid),
          async (userDoc) => {
            const data = userDoc.data();
            const revokedAtMs =
              typeof data?.sessionRevokedAtMs === "number" && Number.isFinite(data.sessionRevokedAtMs)
                ? data.sessionRevokedAtMs
                : null;
            if (sesionRevocadaTrasAuth(authTimeMsFromIdToken(await user.getIdTokenResult()), revokedAtMs)) {
              clearPosGebOnboarding(user.uid);
              await firebaseSignOut(authClient);
              setPuntoVentaManual(null);
              setLoading(false);
              return;
            }

            const rawPv = data?.puntoVenta;
            const puntoTrim =
              typeof rawPv === "string" && rawPv.trim().length > 0 ? rawPv.trim() : undefined;
            if (typeof rawPv === "string" && puntoTrim && rawPv !== puntoTrim) {
              try {
                await setDoc(
                  doc(firestore, "users", user.uid),
                  { puntoVenta: puntoTrim },
                  { merge: true }
                );
              } catch {
                /* si las reglas impiden el parche, el API Admin igual usa .trim() al validar */
              }
            }
            const puntoVentaFirestore = puntoTrim;
            const roleFirestore = (data?.role as string | undefined) ?? null;

            if (puntoVentaFirestore) {
              setAuthUser({
                uid: user.uid,
                email: user.email ?? null,
                puntoVenta: puntoVentaFirestore,
                role: roleFirestore,
                necesitaSeleccionarPunto: false,
              });
              setPuntoVentaManual(null);
            } else {
              setAuthUser({
                uid: user.uid,
                email: user.email ?? null,
                puntoVenta: puntoVentaManual ?? null,
                role: roleFirestore,
                necesitaSeleccionarPunto: true,
              });
            }
            setLoading(false);
          },
          () => {
            setAuthUser({
              uid: user.uid,
              email: user.email ?? null,
              puntoVenta: puntoVentaManual ?? null,
              role: null,
              necesitaSeleccionarPunto: true,
            });
            setLoading(false);
          }
        );
      } catch {
        setAuthUser({
          uid: user.uid,
          email: user.email ?? null,
          puntoVenta: puntoVentaManual ?? null,
          role: null,
          necesitaSeleccionarPunto: true,
        });
        unsubscribeUserDoc = null;
      }
    });

    return () => {
      unsubscribeUserDoc?.();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser || !authUser) return;
    if (authUser.necesitaSeleccionarPunto && puntoVentaManual && authUser.role !== POS_CONTADOR_ROLE) {
      setAuthUser((prev) =>
        prev
          ? { ...prev, puntoVenta: puntoVentaManual, necesitaSeleccionarPunto: false }
          : null
      );
    }
  }, [puntoVentaManual, firebaseUser, authUser?.necesitaSeleccionarPunto, authUser?.role]);

  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error("Firebase no está inicializado");
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    const uid = auth?.currentUser?.uid;
    if (uid) clearPosGebOnboarding(uid);
    if (auth) await firebaseSignOut(auth);
    setPuntoVentaManual(null);
  };

  const setPuntoVentaSeleccionado = async (punto: string) => {
    if (authUser?.role === POS_CONTADOR_ROLE) {
      return;
    }

    setPuntoVentaManual(punto);
    setAuthUser((prev) =>
      prev && prev.role !== POS_CONTADOR_ROLE
        ? { ...prev, puntoVenta: punto, necesitaSeleccionarPunto: false }
        : prev
    );
    const u = auth?.currentUser;
    if (u) {
      const r = await persistPuntoVentaUsuario({
        uid: u.uid,
        email: u.email,
        puntoVenta: punto,
      });
      if (!r.ok) {
        console.warn("[POS] No se guardó puntoVenta en Firestore:", r.message);
      }
    }
  };

  const value: AuthContextType = {
    user: authUser,
    loading,
    signIn,
    signOut,
    setPuntoVentaSeleccionado,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return context;
}
