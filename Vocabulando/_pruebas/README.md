# Pruebas automáticas de Vocabulando

Abren la app en un Chromium real (con [Playwright](https://playwright.dev)) y la usan como tú: pulsan, escriben, cambian la hora, desconectan el servidor…
Cubren la pestaña Mazo (lista por tramos, buscador sin acentos, filtros, orden y editar o borrar desde ella), las últimas añadidas de Crear, la racha general (meta diaria y día de gracia) y el resumen del selector, el modo «escribir la respuesta», las frases con hueco y el dictado, «En tus otros idiomas», la sección «Hoy» de Actividad, pausar entradas y las difíciles, el guardado y la carpeta de datos, los repasos (doble pulsación, tope diario de nuevas, deshacer), el día de estudio de las 4:00
en tres zonas horarias y con el cambio de hora, la tarjeta inversa, la pronunciación, la importación (JSON y listas), las estadísticas, el funcionamiento sin conexión, el botón «IPA» (transcripción fonética con acento europeo; **con páginas del Wiktionary simuladas**, escritas a mano a partir de su marcado: no son respuestas reales del servicio), el botón «+» que importa una entrada a otro idioma (menú de idiomas, formulario rellenado sin guardar con servicios simulados, vuelta al punto de partida) y el desplegable de webs con el logo de cada app (solo aparece al abrir los archivos del disco: esas pruebas abren `file://` y necesitan las carpetas `Vocabulando`, `Conjugario` y `Declinario` juntas).

## Cómo ejecutarlas

Hace falta [Node.js](https://nodejs.org) 18 o más. La primera vez:

```bash
cd Vocabulando/_pruebas
npm install
npx playwright install chromium
```

Después, siempre:

```bash
npm test
```

Tardan unos 30 segundos. Si todo va bien termina con `TODO OK`; cada fallo sale como `FALLA` con lo que se obtuvo y lo que se esperaba.
Para ejecutar solo las pruebas cuyo nombre contenga un texto: `node run.js deshacer`.

## Qué tocan y qué no

- **Tus datos están a salvo:** usan mazos inventados en el almacenamiento temporal del navegador de pruebas. El servidor propio ni siquiera sirve archivos `.json`.
- **Sin internet:** bloquean todo lo que no sea el servidor local (Wikcionario, Tatoeba, fuentes), así que dan el mismo resultado con o sin conexión.
- `VOC_ROOT=ruta node run.js` prueba otra copia de la carpeta `Vocabulando` (sirve para comprobar que las pruebas detectan un fallo: rompe algo a propósito y deben saltar).

## Añadir una prueba

En `run.js` cada prueba es `test("nombre", async () => { ... })`. `open({...})` abre la app con los mazos y preferencias que le pases
(`seed`, `prefs`, `now` para fijar la hora, `speech` para simular voces, `picker` para simular la carpeta de datos…) y `eq`/`ok` comprueban.
`gen.js` fabrica los mazos de prueba.
