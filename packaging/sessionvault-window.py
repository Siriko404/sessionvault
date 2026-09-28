#!/usr/bin/env python3
"""SessionVault app window.

This is an in-process GTK + WebKit window for the loopback-only SessionVault UI.
It does not launch Chromium, another browser profile, a terminal, or any system
URL opener. Closing the window returns control to sessionvault-app.sh, whose EXIT trap
stops the server.
"""
import sys

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")

from gi.repository import Gtk, WebKit2  # noqa: E402


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5191/"
    win = Gtk.Window(title="SessionVault")
    win.set_default_size(1280, 900)
    view = WebKit2.WebView()
    view.load_uri(url)
    win.add(view)
    win.connect("destroy", Gtk.main_quit)
    win.show_all()
    Gtk.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
