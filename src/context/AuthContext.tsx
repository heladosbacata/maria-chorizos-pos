"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { persistPuntoVentaUsuario } from "@/lib/pos-user-firestore";

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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setAuthUser(null);
        setPuntoVentaManual(null);
        setLoading(false);
        return;
      }

      try {
        if (!db) {
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
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const data = userDoc.data();
        const rawPv = data?.puntoVenta;
        const puntoTrim =
          typeof rawPv === "string" && rawPv.trim().length > 0 ? rawPv.trim() : undefined;
        if (typeof rawPv === "string" && puntoTrim && rawPv !== puntoTrim) {
          try {
            await setDoc(doc(db, "users", user.uid), { puntoVenta: puntoTrim }, { merge: true });
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
      } catch {
        setAuthUser({
          uid: user.uid,
          email: user.email ?? null,
          puntoVenta: puntoVentaManual ?? null,
          role: null,
          necesitaSeleccionarPunto: true,
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
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
