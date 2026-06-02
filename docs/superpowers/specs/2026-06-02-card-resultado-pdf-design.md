# Card "Enviar Cotización" — resultado accionable (enlace al PDF)

- Fecha: 2026-06-02
- Rama: dfer/new-feature
- Alcance: quick win funcional (aprobado por el usuario)

## Problema
El card (`src/app/cards/send-quote-app-card.tsx`) genera el PDF correctamente,
pero tras generar solo muestra el Deal ID en un toast efímero. El `pdf.url` que
devuelve el backend se descarta, así que el asesor no tiene forma de abrir la
cotización desde el card.

## Objetivo
Hacer accionable el resultado: tras generar, mostrar un enlace al PDF y un
estado claro de éxito/error, sin cambiar el flujo de generación ni el backend.

## Diseño
- Estado único; el botón "Enviar cotización" siempre visible.
- Éxito: `Alert` verde "Cotización generada" con la fecha (`generatedAt`) y un
  `Link` externo "Abrir cotización (PDF)" → abre `pdf.url` en pestaña nueva.
- Error: `Alert` rojo con mensaje claro (distingue timeout de error genérico).
- Regenerar = el mismo botón otra vez (reemplaza el resultado).
- Se mantiene un toast (`addAlert`) breve de éxito como confirmación inmediata.

## Lo que se quita
- `EmptyState` + `imageName="building"` → `Flex` vertical compacto (el card vive
  en `crm.record.sidebar`, panel estrecho).
- El `Text "Deal ID: {id}"` (dato interno, no aporta al asesor).

## Estado nuevo (React)
- `result: { url, generatedAt } | null`
- `errorMsg: string | null`
- (además del `isLoading` actual)

## Fuera de alcance (YAGNI)
- Leer la última cotización al abrir (no se lee la propiedad del deal). El
  resultado solo persiste durante la sesión del card.
- Históricos, tablas, datos del deal.

## No cambia (garantía de no-daño)
- Backend, endpoint `/deals/send-quote`, scopes, `permittedUrls`.
- La llamada `hubspot.fetch` (método, body, timeout) es idéntica.
- `send-quote-hsmeta.json` y el `location` del card no se tocan.

## Verificación
Manual (no hay tests de UI en el proyecto): re-subir con `hs project upload`,
abrir un deal, generar y confirmar el enlace; provocar un error y ver el Alert.

## Nota detectada (no se aborda aquí)
El código declara tipos `crm.record.tab` mientras el `location` es
`crm.record.sidebar`. Funciona (solo se usa `crm.objectId` y `addAlert`), pero
queda como mejora pendiente alinearlo.
