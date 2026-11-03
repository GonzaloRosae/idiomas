# Pantalla en blanco en el iPad · resumen (21/10/2026)

## Qué pasaba
Al abrir `index.html` en el iPad solo se veía la cabecera, la tarjeta «¿Qué idioma vas a practicar?» y el pie: **no aparecían los botones de idioma**.

## Causa (reproducida)
- Era la **vista previa de Archivos de iOS (Quick Look)**: arriba pone «index.html ⌄ … OK».
- Esa vista previa **no ejecuta JavaScript ni carga recursos externos**. Los botones los crea JavaScript, así que la zona quedaba vacía y el título salía con la fuente de respaldo.
- Ningún cambio de código puede hacer que la app funcione *dentro* de esa vista previa. Hay que abrirla en un navegador (Safari…) o desde una dirección web.

## Qué se ha cambiado en `index.html`
- **Mensaje claro** cuando no se ejecuta JavaScript: «ábrelo en un navegador, no en la vista previa» (en vez de una tarjeta vacía).
- **Aviso visible** (con el error y el dispositivo) si la página falla al arrancar o el archivo está incompleto.
- Las **tipografías de Google ya no bloquean el arranque** si la red va mal.
- Los **botones** tienen color de texto propio (Safari de iOS los pinta azules por defecto).
- **Arreglos de iPad:** campos de 16 px (sin zoom al escribir), autocorrector desactivado en las respuestas, el teclado ya no salta solo, botones táctiles de ~44 px, `:hover` solo con ratón, verbos irregulares en 2 columnas en horizontal, aviso de voz con la ruta de Ajustes del iPad («Contenido leído › Voces»), «Copiar mis fallos» con alternativa.
- Arranque **a prueba de navegadores** sin voz, sin almacenamiento o sin `matchMedia`.

## Cómo se comprobó (solo Chromium; **no hay prueba en un iPad real**)
322 pantallas en claro y oscuro sin errores, contraste idéntico al de antes, sin desbordamiento horizontal a 744 y 820 px, y los escenarios `/ql` (vista previa bloqueada), `/noapi`, `/boom`, archivo cortado y JavaScript desactivado. Dos auditorías independientes (7 revisores) y sus hallazgos aplicados.

## Qué falta (decides tú)
**Cómo usarlo en el iPad:** lo más fiable es publicarlo como página web (GitHub Pages, Netlify…) y abrirlo con Safari («Añadir a pantalla de inicio»). Abrir el archivo con otra app (Edge, Koder, Textastic) lo mencionan usuarios, sin verificar. No se ha publicado nada.

## Archivos de esta carpeta
- `serve_ipad.py` · servidor de pruebas (puerto 8768): `/normal`, `/ql`, `/noapi`, `/boom`; `?f=archivo` sirve otro fichero.
- `compat_scan.py` · escáner de sintaxis/APIs nuevas.
- `audit_ipad_ux.json` · hallazgos de usabilidad en iPad (ya aplicados).

Puedes borrar esta carpeta cuando quieras.
