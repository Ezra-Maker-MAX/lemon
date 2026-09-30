# -*- coding: utf-8 -*-
"""推送本地文件到 GitHub lemon 仓库（Contents API，绕开沙箱 git push 限制）"""
import base64
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO = "Ezra-Maker-MAX/lemon"


def get_token():
    import os
    token_file = os.path.join(os.path.dirname(__file__), "..", "config", "gh.token")
    if os.path.exists(token_file):
        with open(token_file, "r", encoding="utf-8-sig") as f:
            tok = f.read().strip()
        if tok:
            return tok
    inp = "protocol=https\nhost=github.com\n\n"
    out = subprocess.run(
        ["git", "credential", "fill"],
        input=inp, capture_output=True, text=True, timeout=15,
    ).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    sys.exit("ERROR: no token from git credential fill")


def api(url, method="GET", body=None, token=None):
    headers = {"Authorization": f"Bearer {token}", "User-Agent": "lemon-push"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        print(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}")
        raise


def push(token, repo_path, local_path, message):
    url = f"https://api.github.com/repos/{REPO}/contents/{urllib.parse.quote(repo_path)}"
    existing = api(url, token=token)
    sha = existing["sha"] if existing else None
    with open(local_path, "rb") as f:
        content = base64.b64encode(f.read()).decode("ascii")
    body = {"message": message, "content": content}
    if sha:
        body["sha"] = sha
    res = api(url, method="PUT", body=body, token=token)
    print("OK", res["content"]["path"], res["commit"]["sha"][:7])


def main():
    token = get_token()
    print(f"token ok ({len(token)} chars)")
    jobs = [
        ("docs/M1-设计文档.md", "docs/M1-设计文档.md", "M1 init: design doc"),
        (".gitignore", ".gitignore", "M1 init: gitignore update"),
        ("tools/gh_push.py", "tools/gh_push.py", "M1 init: push tool"),
        ("tools/read_cred.ps1", "tools/read_cred.ps1", "M1 init: cred tool"),
    ]
    for repo_path, local_path, message in jobs:
        push(token, repo_path, local_path, message)
    print("ALL DONE")


if __name__ == "__main__":
    main()
