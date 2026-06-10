/**
 * Limitador de concurrencia en-proceso, sin dependencias.
 *
 * Crea una función `run(fn)` que ejecuta `fn` (que devuelve una promesa) pero nunca
 * deja correr más de `max` tareas a la vez: las extra se ENCOLAN (FIFO) y arrancan
 * a medida que se liberan slots. El slot se libera tanto si la tarea cumple como si
 * falla (finally), así un render que crashea no bloquea la cola.
 *
 * Uso aquí: topar cuántos Chromium (puppeteer.launch) corren en paralelo, para que una
 * ráfaga de cotizaciones se serialice en vez de agotar la memoria del contenedor.
 */
export function createConcurrencyLimit(max) {
  const limit = Number.isFinite(Number(max)) && Number(max) >= 1 ? Math.floor(Number(max)) : 1;
  let active = 0;
  const queue = [];

  function next() {
    if (active >= limit || queue.length === 0) {
      return;
    }
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  }

  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}
