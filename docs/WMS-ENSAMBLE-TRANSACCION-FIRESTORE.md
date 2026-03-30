# Error: «Firestore transactions require all reads to be executed before all writes»

Este mensaje aparece en el **WMS** (no en el POS) dentro de `runTransaction` / `db.runTransaction` al aplicar **aplicar-venta-ensamble**.

## Regla de Firestore

En **una sola transacción** hay que:

1. **Leer todo** lo necesario (`transaction.get` / `tx.get`).
2. **Después** hacer **todas** las escrituras (`set`, `update`, `delete`).

No se puede intercalar: *get → set → get → set*.

## Patrón incorrecto (típico)

```ts
await db.runTransaction(async (tx) => {
  for (const item of componentes) {
    const snap = await tx.get(saldoRef); // read
    tx.set(saldoRef, { ... });            // write
    tx.set(movRef, { ... });              // write — y en la siguiente vuelta otro get → ERROR
  }
});
```

## Patrón correcto

```ts
await db.runTransaction(async (tx) => {
  // --- Fase 1: solo lecturas ---
  const idemSnap = await tx.get(idemRef);
  const saldoSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
  for (const ref of saldoRefs) {
    saldoSnaps.push(await tx.get(ref));
  }
  // (cualquier otro get que haga falta para idempotencia o validación)

  // --- Fase 2: solo escrituras (sin más get) ---
  for (let i = 0; i < componentes.length; i++) {
    tx.set(saldoRefs[i], { ... }, { merge: true });
    tx.set(movRefs[i], { ... });
  }
  tx.set(idemRef, { ... }, { merge: true });
});
```

## Dónde tocar en el WMS

Archivo tipo `route.ts` (o servicio) de **`POST .../aplicar-venta-ensamble`**: localizar `runTransaction` y:

- Agrupar **todos** los `get` (saldos, idempotencia, etc.) **al inicio**.
- Calcular `cantidadAnterior` / `cantidadNueva` en memoria a partir de los snapshots ya leídos.
- Luego ejecutar **solo** `set` / `update` en bucle.

Tras desplegar el WMS, el POS dejará de recibir **HTTP 500** por este motivo y el saldo podrá actualizarse otra vez.
