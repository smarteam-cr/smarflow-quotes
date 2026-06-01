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
  const principal = results.find((r) => r.type === 'principal');
  return principal?.id ?? null;
}
