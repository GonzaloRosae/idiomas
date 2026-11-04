# Pruebas automáticas de Declinario

Abren la app en un Chromium real (con [Playwright](https://playwright.dev)), la usan como un alumno y comparan sus tablas con una **lista de formas de
referencia** (`formas.js`), escrita aparte del código de la app y por columnas (la app guarda las tablas por filas): así una errata de teclado en uno de los
dos sitios salta.

Cubren: la coherencia de los datos (filas, columnas, celdas, frases y sustantivos de las frases), más de 1.100 formas contra la referencia, que cada forma se
acepte a sí misma con sus alternativas y sin acentos donde no son obligatorios, la política de acentos (polaco ta / tą, ł, ß, griego…), las frases con
elisión (francés, italiano, catalán), la pantalla de inicio, el selector de idioma, la ayuda, la teoría de los 39 temas, los tres modos de práctica, un barrido
de todos los temas y que no se desborde en el móvil.

## Cómo ejecutarlas

Hace falta [Node.js](https://nodejs.org) 18 o más. La primera vez:

```bash
cd Declinario/_pruebas
npm install
npx playwright install chromium
```

Después, siempre:

```bash
npm test
```

Tardan unos 10 segundos. Si todo va bien termina con `TODO OK`; cada fallo sale como `FALLA` con lo obtenido y lo esperado.
Para ejecutar solo las pruebas cuyo nombre contenga un texto: `node run.js acentos`.

## Qué tocan y qué no

- No guardan nada: usan el navegador de pruebas, que se descarta al terminar, y bloquean todo lo que no sea su servidor local.
- Declinario no guarda progreso (solo el tema claro u oscuro).
- `DL_ROOT=ruta node run.js` prueba otra copia de la carpeta `Declinario` (sirve para comprobar que las pruebas detectan un fallo: rompe algo a propósito y deben saltar).

## Importante: qué demuestran y qué no

Las pruebas comprueban que **la app y la lista de referencia coinciden** y que todo funciona, pero las dos las ha escrito la misma mano. Si una forma está mal
en las dos (un error de gramática, no de teclado), las pruebas no lo ven. Las tablas conviene revisarlas con una gramática.

## Añadir o corregir formas

Cada tema está en `index.html` como `topic('idioma', 'id', 'Nombre', 'Grupo', 'tipo', 'explicación', [tablas], [consejos], {opciones})` y cada tabla como
`G('título', filas, columnas, líneas)`: las celdas de una línea se separan con « ; »; `a|b` son alternativas, `(e)` una letra opcional y `—` que no existe.
Para que una tabla entre en las pruebas de referencia, añade su entrada en `formas.js`: `add(idioma, tema, tabla, columna, [forma de cada fila])`.
