# Pruebas automáticas de Conjugario

Abren la app en un Chromium real (con [Playwright](https://playwright.dev)), la usan como un alumno y comparan lo que conjuga cada idioma con una
**tabla de formas de referencia** escrita a mano (`formas.js`), separada del código de la app.

Cubren: las formas de los 8 idiomas (más de 1800), el corrector de acentos, la mezcla de irregulares, la repetición adaptativa, los 10 tiempos de
imperativo y subjuntivo (teoría, cuatro modos de práctica y test final), los exámenes que ya existían, un barrido de los 68 tiempos, que no se
desborde en el móvil, el progreso guardado (botón dorado al superar el test final y formas falladas que vuelven otro día), los dorados por idioma en el inicio, que el código no use nada posterior a Safari 15.4 (**no se prueba en un Safari real**), la voz del altavoz (solo con acento europeo, **con voces simuladas** del navegador: lo que se comprueba es qué voz elige la app, no cómo suena), «Mezclar tiempos», la ventana «Cómo funciona», la lista desplegable de idiomas y el desplegable de webs con el logo de cada app (que solo aparece al abrir los archivos del disco: esas pruebas abren `file://` y necesitan las carpetas `Vocabulando`, `Conjugario` y `Declinario` juntas).

## Cómo ejecutarlas

Hace falta [Node.js](https://nodejs.org) 18 o más. La primera vez:

```bash
cd Conjugario/_pruebas
npm install
npx playwright install chromium
```

Después, siempre:

```bash
npm test
```

Tardan unos 20 segundos. Si todo va bien termina con `TODO OK`; cada fallo sale como `FALLA` con lo obtenido y lo esperado.
Para ejecutar solo las pruebas cuyo nombre contenga un texto: `node run.js acentos`.

## Qué tocan y qué no

- No guardan nada: usan el navegador de pruebas, que se descarta al terminar, y bloquean todo lo que no sea su servidor local.
- Conjugario guarda **dos cosas** en el navegador: los tiempos cuyo test final se ha superado (`conjugario:progreso`; 95 de 100 en los exámenes por fases, 80 % en los
  tests cerrados) y las formas falladas (`conjugario:fallos`; verbo, persona y tiempo, hasta 40 por tiempo y 45 días). Las pruebas vigilan que la práctica suelta y un
  test suspendido **no den dorados**, que acertar una forma pendiente la borre, que lo guardado ilegible, ajeno o caducado se ignore, que funcione aunque el navegador
  no deje guardar y que dos pestañas abiertas se enteren una de otra.
- `CJ_ROOT=ruta node run.js` prueba otra copia de la carpeta `Conjugario` (sirve para comprobar que las pruebas detectan un fallo: rompe algo a propósito y deben saltar).

## Añadir formas a la tabla de referencia

En `formas.js`, cada tiempo es `GOLD.<idioma>["<tiempo>"] = { verbo: { persona: forma } }`. La persona es el número de fila en la lista de pronombres del idioma
(0 = primera). Las alternativas aceptadas se separan con `|` y los grupos opcionales van entre paréntesis: `'komm|komme'`, `'suis allé(e)'`.
Los tiempos de dos huecos (condicionales) usan `«tiempo@1»` para el segundo hueco. **Escribe la forma que sabes que es correcta, no la que da la app.**
