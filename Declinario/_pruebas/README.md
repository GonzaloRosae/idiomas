# Pruebas automáticas de Declinario

Abren la app en un Chromium real (con [Playwright](https://playwright.dev)), la usan como un alumno y comparan sus tablas con una **lista de formas de
referencia** (`formas.js`), escrita aparte del código de la app y por columnas (la app guarda las tablas por filas): así una errata de teclado en uno de los
dos sitios salta.

Cubren: la coherencia de los datos (filas, columnas, celdas, frases y sustantivos de las frases), más de 1.100 formas contra la referencia, que cada forma se
acepte a sí misma con sus alternativas y sin acentos donde no son obligatorios, la política de acentos (polaco ta / tą, ł, ß, griego…), las frases con
elisión (francés, italiano, catalán), las frases de hueco de los 39 temas con cada uno de sus sustantivos (más de 2.500 combinaciones) y una **lista de
oraciones completas de referencia** (`frases.js`, escrita aparte), que los sustantivos estén equilibrados por género, la pantalla de inicio, el selector de
idioma, el desplegable de webs (solo se ve al abrir los archivos del disco), la ayuda, la teoría de los 39 temas, los tres modos de práctica, el **progreso
guardado** (test final de 10 preguntas, tema dorado con el 80 %, formas falladas que se recuerdan, guardados ilegibles, navegador sin almacenamiento,
sincronización entre pestañas y borrado con confirmación), un barrido de todos los temas y que no se desborde en el móvil.

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

- No tocan tu progreso: usan un navegador de pruebas desechable (su `localStorage` es propio y se descarta al terminar) y bloquean todo lo que no sea su
  servidor local. Declinario guarda en el navegador `declinario:progreso` (temas dorados) y `declinario:fallos` (formas falladas).
- El desplegable de webs solo aparece con `file://`, así que esas pruebas abren los archivos del disco (necesitan las carpetas `Vocabulando`, `Conjugario` y
  `Declinario` juntas, tal como están en el repositorio).
- `DL_ROOT=ruta node run.js` prueba otra copia de la carpeta `Declinario` (sirve para comprobar que las pruebas detectan un fallo: rompe algo a propósito y deben saltar).

## Importante: qué demuestran y qué no

Las pruebas comprueban que **la app y la lista de referencia coinciden** y que todo funciona, pero las dos las ha escrito la misma mano. Si una forma está mal
en las dos (un error de gramática, no de teclado), las pruebas no lo ven. Las tablas conviene revisarlas con una gramática.

## Añadir o corregir formas

Cada tema está en `index.html` como `topic('idioma', 'id', 'Nombre', 'Grupo', 'tipo', 'explicación', [tablas], [consejos], {opciones})` y cada tabla como
`G('título', filas, columnas, líneas)`: las celdas de una línea se separan con « ; »; `a|b` son alternativas, `(e)` una letra opcional y `—` que no existe.
Para que una tabla entre en las pruebas de referencia, añade su entrada en `formas.js`: `add(idioma, tema, tabla, columna, [forma de cada fila])`.

### Frases de «Rellena el hueco»

Las frases se buscan, por este orden, en la tabla (`G(..., {frames})`), en el tema (`{frames}`) y en las del idioma para ese tipo de tema (`addLang`):
`frames: { fila: ['texto con {}'] }`. Una frase lleva un hueco `{}` y, si hace falta, `{n}` (un sustantivo), `{a}` (su artículo) y alternancias `[singular|plural]`
que se eligen según el número de la casilla (`pl: ['clave', …]` lista las filas o columnas de plural).

Los sustantivos van en `nouns` (de la tabla o del tema), por fila o por columna: `clave: 'texto'`, `{ t, v, a }` o una lista; `v` elige la variante de la respuesta
que corresponde a ese sustantivo (`le|l'` ante vocal) y `a` es su artículo. Si cambian con el caso, `clave: { fila: … }` o una lista de mapas por caso. Hay que
poner **al menos dos sustantivos básicos por lista y los mismos masculinos, femeninos y neutros** (la prueba lo exige). `hint: 'none'` quita la etiqueta de la
columna, `hints: { col: 'texto' }` la sustituye y `noRow: true` quita el nombre de la fila del título (cuando delataría la respuesta).
Cada frase nueva conviene añadirla, con la oración completa, a `frases.js`.
