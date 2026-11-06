"""Servidor de pruebas (puerto 8768) para emular entornos restringidos con el mismo index.html.
  /ql        -> como la vista previa de Archivos de iOS: sin JavaScript y sin recursos externos (CSP)
  /normal    -> sin restricciones
  /noapi     -> JS activo, pero sin localStorage / speechSynthesis / matchMedia (se inyecta un script antes de todo)
  /boom      -> JS activo, pero el script principal lanza una excepción a mitad (simula un fallo de arranque)
  ?f=NAME    -> sirve ese archivo (de la carpeta de pruebas) en lugar del index.html del proyecto
"""
import http.server, os, urllib.parse, io
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.join(HERE, "..", "index.html")
QL_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'"
NOAPI = """<script>
try{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('The operation is insecure.','SecurityError')}})}catch(e){}
try{delete window.speechSynthesis}catch(e){}
try{Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true})}catch(e){}
try{window.matchMedia=undefined}catch(e){}
</script>"""

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        src = PROJECT
        if "f" in q:
            src = os.path.join(HERE, os.path.basename(q["f"][0]))
        if u.path in ("/contrast_audit.js", "/theme_walk.js"):      # herramientas de prueba de la sesión
            p = os.path.join(HERE, "serve", os.path.basename(u.path))
            data = io.open(p, "rb").read()
            self.send_response(200); self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(data))); self.send_header("Cache-Control", "no-store")
            self.end_headers(); self.wfile.write(data); return
        if u.path not in ("/ql", "/normal", "/noapi", "/boom"):
            self.send_response(404); self.end_headers(); return
        html = io.open(src, encoding="utf-8").read()
        headers = {}
        if u.path == "/ql":
            headers["Content-Security-Policy"] = QL_CSP
        elif u.path == "/noapi":
            html = html.replace("<head>", "<head>" + NOAPI, 1)
        elif u.path == "/boom":
            # una excepción a mitad del script principal (antes de buildWelcome)
            marker = "const BUILD_LEVEL = 4;"
            assert marker in html
            html = html.replace(marker, marker + "\nnull.boom();", 1)
        data = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in headers.items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(data)

http.server.ThreadingHTTPServer(("127.0.0.1", 8768), H).serve_forever()
