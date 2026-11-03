"""Busca en index.html sintaxis y APIs que fallan en Safari/iPadOS antiguos (15, 16.0-16.3...)."""
import re, sys, io
path = sys.argv[1]
s = io.open(path, encoding="utf-8").read()
BS = "\\"
checks = [
 ("regex lookbehind (Safari 16.4+)", r"\(\?<[=!]"),
 ("regex grupos con nombre (Safari 11.1+)", r"\(\?<[A-Za-z_]"),
 ("optional chaining ?. (Safari 13.1+)", r"[\w\)\]]\?\.(?![0-9])"),
 ("nullish ?? (Safari 13.1+)", r"\?\?(?!=)"),
 ("asignación lógica ??= ||= &&= (Safari 14+)", r"(\?\?|\|\||&&)="),
 (".at() (Safari 15.4+)", r"\.at\("),
 (".replaceAll() (Safari 13.1+)", r"\.replaceAll\("),
 ("Object.hasOwn (Safari 15.4+)", r"Object\.hasOwn"),
 ("structuredClone (Safari 15.4+)", r"structuredClone"),
 (".findLast (Safari 15.4+)", r"\.findLast"),
 ("toSorted/toReversed/toSpliced (Safari 16+)", r"\.(toSorted|toReversed|toSpliced)\("),
 ("campo privado #x (Safari 15+)", r"(?<![\w$&\"'#])#[a-zA-Z_]\w*\s*[=;(]"),
 ("static { } (Safari 16.4+)", r"static\s*\{"),
 ("propiedad unicode " + BS + "p{ (Safari 11.1+)", BS + BS + r"p\{"),
 ("unidades dvh/svh/lvh (Safari 15.4+)", r"\d(dvh|svh|lvh)"),
 (":has( (Safari 15.4+)", r":has\("),
 ("aspect-ratio (Safari 15+)", r"aspect-ratio"),
 ("inset: (Safari 14.1+)", r"[;{\s]inset\s*:"),
 ("color-mix (Safari 16.2+)", r"color-mix\("),
 ("@container (Safari 16+)", r"@container"),
 ("text-wrap (Safari 17.5+)", r"text-wrap"),
 ("@layer (Safari 15.4+)", r"@layer"),
 ("CSS nesting (Safari 16.5+)", r"^\s+&[\s.:\[]"),
 ("Intl.Segmenter (Safari 14.1+)", r"Intl\.Segmenter"),
 ("BigInt (Safari 14+)", r"\b\d+n\b"),
 ("Array flat/flatMap (Safari 12+)", r"\.(flat|flatMap)\("),
 ("Object.fromEntries (Safari 12.1+)", r"Object\.fromEntries"),
 ("matchAll (Safari 13+)", r"\.matchAll\("),
 ("Promise.allSettled/any (Safari 13/14+)", r"Promise\.(allSettled|any)"),
 ("flag s (dotAll) /s (Safari 11.1+)", r"/[gimuy]*s[gimuy]*[;,\)\.]"),
 ("<dialog> (Safari 15.4+)", r"<dialog"),
 ("scrollTo({ (Safari 14+)", r"scrollTo\(\{"),
 ("scrollend / ResizeObserver", r"ResizeObserver|scrollend"),
]
# se examinan por separado el script principal y el CSS
i0 = s.index('<script>\n"use strict";')
js = s[i0:]
css = s[s.index("<style>"):s.index("</style>")]
for label, pat in checks:
    for zone, text in (("JS", js), ("CSS", css)):
        ms = list(re.finditer(pat, text, re.M))
        if ms:
            ex = [re.sub(r"\s+", " ", text[max(0, m.start()-40):m.end()+40]) for m in ms[:2]]
            print(f"[{zone}] {label}: {len(ms)}  ej: {ex}")
print("--- fin del escaneo")
