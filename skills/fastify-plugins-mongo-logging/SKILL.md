
---

# 🧠 SKILL 2 — Fastify Plugins + Mongo + Logging Profesional

```md
# skill: fastify-plugins-mongo-logging

## Objetivo
Implementar correctamente:
- MongoDB con Fastify
- Logger con Pino + Winston
- Persistencia de logs en Mongo
- Uso de requestId (PID lógico)

---

## 1. Logger (OBLIGATORIO)

Inicialización:

```js
const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
})
```
---

### 2. Request ID (TRACE)

Cada request debe tener un ID único:

```js
app.addHook('onRequest', async (req) => {
  req.requestId = crypto.randomUUID();
});
```

---
### 3. Winston para persistencia

Se debe usar Winston adicionalmente para guardar logs en Mongo.

Tipos de logs:

- request
- response
- error

---

### 4. Hook de logging

```js
app.addHook('onResponse', async (req, reply) => {
  await logToMongo({
    requestId: req.requestId,
    url: req.url,
    method: req.method,
    body: req.body,
    response: reply.statusCode,
  });
});
```

---

### 5. Mongo Plugin (según docs oficiales)

Referencia:
https://fastify.dev/docs/latest/Guides/Database/

Implementación:

```js
import fp from 'fastify-plugin';
import { MongoClient } from 'mongodb';

export default fp(async (fastify) => {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();

  const db = client.db('pdf_generator');

  fastify.decorate('mongo', db);
});
```

---

### 6. Reglas

- Nunca abrir conexión fuera del plugin
- Reutilizar conexión
- No usar mongoose (usar driver nativo)

---

### 7. Logs a guardar

---

Colección: logs

Estructura:

```json
{
  "requestId": "",
  "url": "",
  "method": "",
  "body": {},
  "response": {},
  "status": 200,
  "createdAt": "date"
}
```

Output esperado

- Logger en consola + Mongo
- Request tracing completo
- Plugins desacoplados




