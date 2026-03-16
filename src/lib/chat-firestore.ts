import {
  collection,
  addDoc,
  doc,
  setDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ChatMessage } from "@/types";

/**
 * ID de conversación DM: mismos dos UIDs ordenados y unidos con "_".
 * Coincide con el criterio del WMS para compartir el mismo chat.
 */
export function getDmChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

const CHATS_COLLECTION = "chats";
const USER_CHATS_COLLECTION = "userChats";

function messagesRef(chatId: string) {
  if (!db) throw new Error("Firestore no está inicializado");
  return collection(db, CHATS_COLLECTION, chatId, "messages");
}

/**
 * Suscribe a los mensajes de un chat en tiempo real.
 * Retorna función para cancelar la suscripción.
 */
export function subscribeChatMessages(
  chatId: string,
  onMessages: (messages: ChatMessage[]) => void
): Unsubscribe | null {
  if (!db) return null;
  const q = query(
    collection(db, CHATS_COLLECTION, chatId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snapshot) => {
    const messages: ChatMessage[] = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        text: d.text ?? "",
        senderId: d.senderId ?? "",
        createdAt: d.createdAt ?? { seconds: 0, nanoseconds: 0 },
      };
    });
    onMessages(messages);
  });
}

/**
 * Envía un mensaje al chat y actualiza lastMessage en userChats de ambos usuarios.
 */
export async function sendChatMessage(
  chatId: string,
  senderId: string,
  text: string,
  otherUserId: string
): Promise<void> {
  if (!db) throw new Error("Firestore no está inicializado");
  const ref = messagesRef(chatId);
  await addDoc(ref, {
    text: text.trim(),
    senderId,
    createdAt: serverTimestamp(),
  });
  // Actualizar userChats para ambos usuarios (mismo modelo que el WMS)
  const last = {
    lastMessage: text.trim().slice(0, 100),
    updatedAt: serverTimestamp(),
    type: "dm",
    participantUid: otherUserId,
  };
  const chatDocId = chatId;
  await setDoc(
    doc(db, USER_CHATS_COLLECTION, senderId, "chats", chatDocId),
    { ...last, participantUid: otherUserId },
    { merge: true }
  );
  await setDoc(
    doc(db, USER_CHATS_COLLECTION, otherUserId, "chats", chatDocId),
    { ...last, participantUid: senderId },
    { merge: true }
  );
}
