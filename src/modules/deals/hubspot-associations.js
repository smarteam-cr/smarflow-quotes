export function getAssociationIds(associations, ...keys) {
  const ids = keys.flatMap((key) =>
    (associations?.[key]?.results ?? []).map((result) => result.id),
  );
  return [...new Set(ids)];
}

export function resolvePrimaryQuoteId(associations) {
  const results = associations?.quotes?.results ?? [];
  const primary = results.find((r) => r.type === 'deal_to_primary_quote');
  return primary?.id ?? null;
}

export function resolvePrincipalContactId(associations) {
  const results = associations?.contacts?.results ?? [];
  const uniqueIds = [...new Set(results.map((r) => r.id))];

  if (uniqueIds.length === 0) return null;
  if (uniqueIds.length === 1) return uniqueIds[0];

  // 2+ contactos: usar el principal solo si hay exactamente uno con esa etiqueta.
  const principalIds = [
    ...new Set(results.filter((r) => r.type === 'principal').map((r) => r.id)),
  ];
  return principalIds.length === 1 ? principalIds[0] : null;
}
