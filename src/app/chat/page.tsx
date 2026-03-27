"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { esContadorInvitado } from "@/lib/auth-roles";
import { auth } from "@/lib/firebase";
import { LOGO_ORG_URL } from "@/lib/brand";
import { getChatUsuarios } from "@/lib/chat-api";
import {
  getDmChatId,
  subscribeChatMessages,
  sendChatMessage,
} from "@/lib/chat-firestore";
import type { ChatUsuario, ChatMessage } from "@/types";

function formatMessageTime(createdAt: { seconds: number; nanoseconds: number }): string {
  const date = new Date(createdAt.seconds * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatPage() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [contactos, setContactos] = useState<ChatUsuario[]>([]);
  const [contactosLoading, setContactosLoading] = useState(true);
  const [contactosError, setContactosError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ChatUsuario | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!loading && user && esContadorInvitado(user.role)) {
      router.replace("/caja");
    }
  }, [loading, user, router]);

  // Cargar contactos desde API WMS con token
  useEffect(() => {
    if (!user || !auth?.currentUser || esContadorInvitado(user.role)) {
      setContactosLoading(false);
      return;
    }
    let cancelled = false;
    setContactosLoading(true);
    setContactosError(null);
    auth.currentUser
      .getIdToken()
      .then((token) => getChatUsuarios(token))
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.usuarios) setContactos(res.usuarios);
        else setContactosError(res.message || "No se pudieron cargar los contactos");
      })
      .catch(() => {
        if (!cancelled) setContactosError("Error al cargar contactos");
      })
      .finally(() => {
        if (!cancelled) setContactosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Suscripción a mensajes del chat seleccionado
  useEffect(() => {
    if (!user || !selected) {
      setMessages([]);
      return;
    }
    const chatId = getDmChatId(user.uid, selected.uid);
    const unsub = subscribeChatMessages(chatId, setMessages);
    return () => {
      unsub?.();
    };
  }, [user, selected]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !user || !selected || sending) return;
    setSending(true);
    setInputText("");
    try {
      const chatId = getDmChatId(user.uid, selected.uid);
      await sendChatMessage(chatId, user.uid, text, selected.uid);
    } catch {
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100/90">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    router.replace("/");
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gray-100/90">
      {/* Barra superior */}
      <header className="fixed left-0 right-0 top-0 z-20 flex h-12 items-center bg-primary-500 px-4 text-white shadow-md">
        <span className="font-semibold">Chat con franquiciado y administración</span>
      </header>

      {/* Sidebar izquierdo (mismo que caja) */}
      <aside className="fixed left-0 top-12 z-10 flex w-52 flex-col border-r border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col items-center gap-1 border-b border-gray-100 px-3 py-4">
          <Image
            src={LOGO_ORG_URL}
            alt="Maria Chorizos"
            width={100}
            height={36}
            className="h-8 w-auto object-contain"
          />
          <span className="text-xs font-medium text-primary-600">POS</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          <Link
            href="/caja"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Ventas e ingresos
          </Link>
          <Link href="/caja" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Turnos
          </Link>
          <Link href="/caja" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Reportes
          </Link>
          <Link href="/caja" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Más
          </Link>
        </nav>
        <div className="border-t border-gray-100 p-2">
          <button
            type="button"
            onClick={() => signOut().then(() => router.replace("/"))}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Área principal: lista de contactos + conversación */}
      <main className="flex flex-1 pl-52 pt-12">
        {/* Lista de contactos */}
        <div className="flex w-72 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-3">
            <h2 className="font-semibold text-gray-900">Contactos</h2>
            <p className="text-xs text-gray-500">Franquiciado y administración WMS</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {contactosLoading && (
              <div className="flex justify-center p-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            )}
            {contactosError && (
              <div className="rounded-lg bg-red-50 p-3 mx-2 mt-2 text-sm text-red-700">
                {contactosError}
              </div>
            )}
            {!contactosLoading && !contactosError && contactos.length === 0 && (
              <p className="p-4 text-center text-sm text-gray-500">No hay contactos disponibles.</p>
            )}
            {!contactosLoading &&
              contactos.map((c) => (
                <button
                  key={c.uid}
                  type="button"
                  onClick={() => setSelected(c)}
                  className={`flex w-full items-center gap-3 border-b border-gray-50 px-3 py-3 text-left transition-colors hover:bg-gray-50 ${
                    selected?.uid === c.uid ? "bg-primary-50" : ""
                  }`}
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                    {c.photoURL ? (
                      <img src={c.photoURL} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (c.displayName || c.email || "?").slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {c.displayName || c.email || c.uid}
                    </p>
                    {c.puntoVenta && (
                      <p className="truncate text-xs text-gray-500">{c.puntoVenta}</p>
                    )}
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Conversación */}
        <div className="flex flex-1 flex-col bg-white">
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                  {selected.photoURL ? (
                    <img src={selected.photoURL} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (selected.displayName || selected.email || "?").slice(0, 2).toUpperCase()
                  )}
                </span>
                <div>
                  <p className="font-medium text-gray-900">
                    {selected.displayName || selected.email || selected.uid}
                  </p>
                  {selected.puntoVenta && (
                    <p className="text-xs text-gray-500">{selected.puntoVenta}</p>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => {
                  const isOwn = msg.senderId === user.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          isOwn
                            ? "bg-primary-500 text-white"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        <p className="text-sm">{msg.text}</p>
                        <p
                          className={`mt-1 text-xs ${
                            isOwn ? "text-primary-100" : "text-gray-500"
                          }`}
                        >
                          {formatMessageTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t border-gray-200 p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={sending || !inputText.trim()}
                    className="rounded-xl bg-brand-yellow px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    {sending ? "..." : "Enviar"}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-500">
              <svg
                className="mb-4 h-16 w-16 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-sm">Elige un contacto para iniciar la conversación</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
