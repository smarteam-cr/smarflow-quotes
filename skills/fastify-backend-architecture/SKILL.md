# skill: fastify-backend-architecture

## Objetivo
Construir APIs backend con Fastify siguiendo:
- Principios SOLID
- Arquitectura MVC adaptada a backend
- Uso correcto de plugins de Fastify
- Código limpio, desacoplado y escalable

---

## Reglas Obligatorias

### 1. Estructura de Carpetas

Usar SIEMPRE esta estructura mínima:

src/
  app.js
  server.js

  config/
    env.js

  plugins/
    logger.plugin.js
    mongo.plugin.js

  modules/
    pdf/
      pdf.controller.js
      pdf.service.js
      pdf.repository.js
      pdf.routes.js

    hubspot/
      hubspot.service.js

    storage/
      storage.service.js

  utils/
    logger.js
    errors.js

---

### 2. Separación de Responsabilidades (SOLID)

- Controller → solo HTTP (req, reply)
- Service → lógica de negocio
- Repository → acceso a datos (Mongo)
- Plugins → infraestructura (DB, logger)

❌ PROHIBIDO:
- lógica en controllers
- llamadas HTTP directas dentro de controllers
- acceso a DB fuera de repository

---

### 3. Fastify Plugins (OBLIGATORIO)

Todo debe registrarse como plugin:

- DB → plugin
- Logger → plugin
- Servicios externos → plugin si es reusable

Ejemplo:

```js
export default async function (fastify) {
  fastify.decorate('myService', myServiceInstance);
}
```

---

### 4. Registro Modular

En app.js:

await app.register(import('./plugins/logger.plugin.js'));
await app.register(import('./plugins/mongo.plugin.js'));

await app.register(import('./modules/pdf/pdf.routes.js'), { prefix: '/pdf' });

---

### 5. Manejo de Errores
Usar throw new Error controlado
Centralizar errores en Fastify

---

### 6. Código Limpio
Funciones pequeñas
Nombres claros
No lógica duplicada
Output esperado de la IA

Cada vez que se cree código:

✔ Debe respetar esta arquitectura
✔ Debe usar plugins
✔ Debe separar controller/service/repository
✔ No debe meter lógica en routes























