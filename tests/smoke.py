#!/usr/bin/env python3
"""Headless smoke tests for ID Photo Studio.

Runs the browser's built-in self-tests plus a demo-mode and Service Worker check.
The static server mounts the repo at /id-photo-studio/ to mirror GitHub Pages.
No GPU, model download, or network access beyond the local static server is required.

Usage:
    python -m pip install -r tests/requirements.txt
    python -m playwright install chromium
    python tests/smoke.py
"""

from __future__ import annotations

import functools
import http.server
import pathlib
import socketserver
import sys
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]

CHECKS: list[tuple[str, str]] = []


PREFIX = "/id-photo-studio"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):  # noqa: D401 - silence request logs
        pass

    def translate_path(self, path):
        # 模拟 GitHub Pages 的项目子路径 /id-photo-studio/，让 CI 能抓到
        # 只在根路径可用、部署到子路径后 404 的资源。
        if path == PREFIX or path.startswith(PREFIX + "/"):
            path = path[len(PREFIX):] or "/"
        return super().translate_path(path)


def start_server() -> tuple[socketserver.ThreadingTCPServer, str]:
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    host, port = httpd.server_address[:2]
    return httpd, f"http://{host}:{port}{PREFIX}"


def record(name: str, ok: bool, detail: str = "") -> None:
    CHECKS.append((name, "PASS" if ok else "FAIL"))
    line = f"[{'PASS' if ok else 'FAIL'}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)


def wait_for_text(page, selector: str, expected: str, timeout: int = 30000) -> str:
    page.wait_for_selector(selector, timeout=timeout)
    text = page.locator(selector).inner_text()
    if expected not in text:
        raise AssertionError(f"{selector} does not contain {expected!r}: {text[:400]}")
    return text


def run(base: str) -> int:
    failures = 0
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception:
            browser = p.chromium.launch(channel="chrome")

        context = browser.new_context()
        page = context.new_page()
        page_errors: list[str] = []
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))

        # 1. Built-in unit tests
        try:
            page.goto(f"{base}/index.html?selftest=1", wait_until="load")
            text = wait_for_text(page, "#selftest", "SELFTEST PASS", timeout=20000)
            record("selftest (9 checks)", True, text.strip().splitlines()[-1])
        except Exception as exc:
            record("selftest (9 checks)", False, str(exc))
            failures += 1

        # 2. Full export chain
        try:
            page.goto(f"{base}/index.html?exporttest=1", wait_until="load")
            text = wait_for_text(page, "#exporttest", "EXPORTTEST PASS", timeout=20000)
            record("exporttest (JPEG+PNG / dims / DPI)", True, text.strip().splitlines()[-1])
        except Exception as exc:
            record("exporttest (JPEG+PNG / dims / DPI)", False, str(exc))
            failures += 1

        # 3. Demo mode: solid-background detection + rendered canvas + export enabled
        try:
            page.goto(f"{base}/index.html?demo=1", wait_until="load")
            page.wait_for_function(
                "document.getElementById('statusLine')?.textContent?.includes('纯色背景')",
                timeout=20000,
            )
            state = page.evaluate(
                """() => {
                    const canvas = document.getElementById('view');
                    const ctx = canvas.getContext('2d');
                    let nonEmpty = false;
                    if (canvas.width && canvas.height) {
                        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                        for (let i = 3; i < d.length; i += 4 * 997) {
                            if (d[i] !== 0) { nonEmpty = true; break; }
                        }
                    }
                    return {
                        status: document.getElementById('statusLine').textContent,
                        exportEnabled: !document.getElementById('btnExport').disabled,
                        nonEmpty,
                    };
                }"""
            )
            ok = state["exportEnabled"] and state["nonEmpty"]
            record("demo mode (background detect / canvas / export)", ok, state["status"])
            if not ok:
                failures += 1
        except Exception as exc:
            record("demo mode (background detect / canvas / export)", False, str(exc))
            failures += 1

        # 4. PNG disables controls that only apply to JPEG
        try:
            page.goto(f"{base}/index.html?demo=1", wait_until="load")
            page.wait_for_selector("#formatSelect", timeout=20000)
            page.select_option("#formatSelect", "png")
            state = page.evaluate(
                """() => ({
                    quality: document.getElementById('quality').disabled,
                    target: document.getElementById('chkTargetKb').disabled,
                    targetInput: document.getElementById('targetKb').disabled,
                    info: document.getElementById('exportInfo').textContent,
                })"""
            )
            ok = state["quality"] and state["target"] and state["targetInput"] and "PNG" in state["info"]
            record("PNG disables JPG-only export controls", ok, f"quality={state['quality']} target={state['target']} info={state['info'][:80]}")
            if not ok:
                failures += 1
        except Exception as exc:
            record("PNG disables JPG-only export controls", False, str(exc))
            failures += 1

        # 5. Service Worker registration + cache entries
        try:
            page.goto(f"{base}/index.html?swtest=1", wait_until="load")
            page.wait_for_function(
                "document.title === 'SWTEST PASS' || document.title === 'SWTEST FAIL'",
                timeout=45000,
            )
            title = page.title()
            text = page.locator("#swtest").inner_text() if page.locator("#swtest").count() else ""
            ok = title == "SWTEST PASS"
            record("service worker (cache / offline shell)", ok, text.strip())
            if not ok:
                failures += 1
        except Exception as exc:
            record("service worker (cache / offline shell)", False, str(exc))
            failures += 1

        if page_errors:
            record("no uncaught page errors", False, "; ".join(page_errors[:3]))
            failures += 1
        else:
            record("no uncaught page errors", True)

        context.close()
        browser.close()

    print()
    print(f"{len(CHECKS) - failures}/{len(CHECKS)} checks passed")
    return 1 if failures else 0


def main() -> int:
    httpd, base = start_server()
    try:
        return run(base)
    finally:
        httpd.shutdown()
        httpd.server_close()


if __name__ == "__main__":
    sys.exit(main())
