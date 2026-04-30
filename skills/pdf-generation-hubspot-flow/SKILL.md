
---

# 🧠 SKILL 3 — Generación de PDF + Integración HubSpot

```md
# skill: pdf-generation-hubspot-flow

## Objetivo
Implementar flujo completo:

HubSpot → API → PDF → Storage → Update HubSpot

---

## Flujo Obligatorio

1. Recibir dealId
2. Obtener datos desde HubSpot:
   - Deal
   - Company
   - Contact
   - Line Items
3. Transformar datos
4. Generar PDF con React + Puppeteer
5. Subir archivo (SFTP o storage)
6. Obtener URL
7. Actualizar HubSpot

---

## 1. Endpoint

POST /pdf/generate

Body:

```json
{
  "dealId": "123"
}
```

---

### 2. Service Flow

```js
async function generatePdf(dealId) {
  const deal = await hubspot.getDeal(dealId);
  const company = await hubspot.getCompany(deal);
  const contact = await hubspot.getContact(deal);
  const items = await hubspot.getLineItems(deal);

  const html = await buildTemplate({ deal, company, contact, items });

  const pdfBuffer = await puppeteerGenerate(html);

  const url = await storage.upload(pdfBuffer);

  await hubspot.updateDeal(dealId, { url_cotizacion_pdf: url });

  return url;
}
```
---

### 3. PDF con React
Usar renderToStaticMarkup
NO usar frontend runtime

---

### 4. Puppeteer

```js
await page.setContent(html);
await page.pdf({ format: 'A4' });
```

---

### 5. Storage
Preferible: R2 de cloudfare

---

### 6. HubSpot API
Usar batch endpoints si aplica
Manejar retries (429)

---

### 7. Reglas

- No mezclar lógica de PDF en controller
- No generar HTML en controller
- Todo en service

Output esperado

- Endpoint funcional
- PDF generado
- URL guardada en HubSpot

