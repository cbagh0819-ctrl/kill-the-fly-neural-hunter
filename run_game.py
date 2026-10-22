import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # Keep console clean

os.chdir(os.path.dirname(os.path.abspath(__file__)))

try:
    with socketserver.TCPServer(("", PORT), QuietHandler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 65)
        print("  KILL THE FLY: Neural Hunter - 3D FPS Web Game")
        print("=" * 65)
        print(f"  Game running at: {url}")
        print("  Opening game in your web browser...")
        print("  Press Ctrl+C to stop the game server.")
        print("=" * 65)
        webbrowser.open(url)
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nGame server stopped.")
    sys.exit(0)
except Exception as e:
    # If 8000 is occupied, try 8080
    PORT = 8080
    with socketserver.TCPServer(("", PORT), QuietHandler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print(f"  Game running at: {url}")
        webbrowser.open(url)
        httpd.serve_forever()
