import http.server, urllib.request, os, sys
ROOT='/tmp/rp/www'; CACHE='/tmp/rp/cache'; BASE='https://raw.githubusercontent.com/abdulrehman043/humanforge/main/assets/human/'
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def log_message(s,*a): pass
    def do_GET(s):
        if s.path.startswith('/human/'):
            rel=s.path[7:].split('?')[0]; f=os.path.join(CACHE,rel.replace('/','__'))
            if not os.path.exists(f):
                try: data=urllib.request.urlopen(BASE+rel,timeout=60).read()
                except Exception as e:
                    sys.stderr.write(f'MISS {rel} {e}\n'); s.send_error(404); return
                open(f,'wb').write(data)
            data=open(f,'rb').read(); s.send_response(200); s.send_header('Content-Length',str(len(data))); s.end_headers(); s.wfile.write(data); return
        return super().do_GET()
http.server.ThreadingHTTPServer(('127.0.0.1',8795),H).serve_forever()
