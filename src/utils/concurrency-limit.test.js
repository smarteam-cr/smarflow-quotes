import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConcurrencyLimit } from './concurrency-limit.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('ejecuta la tarea y devuelve su resultado', async () => {
  const limit = createConcurrencyLimit(2);
  assert.equal(await limit(() => Promise.resolve('ok')), 'ok');
});

test('nunca corre más de `max` tareas en paralelo (las extra se encolan)', async () => {
  const limit = createConcurrencyLimit(2);
  let active = 0;
  let peak = 0;
  const releases = [];

  const makeTask = () =>
    limit(() => {
      active += 1;
      peak = Math.max(peak, active);
      return new Promise((resolve) => {
        releases.push(() => {
          active -= 1;
          resolve();
        });
      });
    });

  const all = [makeTask(), makeTask(), makeTask(), makeTask(), makeTask()];

  await tick();
  assert.equal(peak, 2, 'solo 2 tareas deben arrancar de inicio');

  // Libera de a una; cada liberación debe permitir que arranque una encolada,
  // sin superar nunca el tope de 2 simultáneas.
  while (releases.length) {
    releases.shift()();
    await tick();
  }

  await Promise.all(all);
  assert.equal(peak, 2, 'el pico nunca debe superar el máximo');
  assert.equal(active, 0, 'todas las tareas deben haber terminado');
});

test('una tarea que falla libera el slot y no bloquea a las siguientes', async () => {
  const limit = createConcurrencyLimit(1);
  await assert.rejects(limit(() => Promise.reject(new Error('boom'))), /boom/);
  // Si el slot no se liberara, con max=1 esta segunda tarea quedaría colgada.
  assert.equal(await limit(() => Promise.resolve('ok')), 'ok');
});

test('procesa la cola en orden FIFO', async () => {
  const limit = createConcurrencyLimit(1);
  const order = [];
  const tasks = [1, 2, 3].map((n) =>
    limit(async () => {
      order.push(n);
    }),
  );
  await Promise.all(tasks);
  assert.deepEqual(order, [1, 2, 3]);
});

test('un `max` inválido (0, negativo, NaN) cae a 1 (serial) en vez de romper', async () => {
  for (const bad of [0, -3, undefined, NaN]) {
    const limit = createConcurrencyLimit(bad);
    assert.equal(await limit(() => Promise.resolve('ok')), 'ok');
  }
});
