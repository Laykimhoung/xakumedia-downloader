# XakuMedia Security Architecture & Threat Model

This document outlines the security architecture, threat model, and defense-in-depth mitigations implemented across the XakuMedia Windows desktop application.

---

## 1. Threat Model & Trust Boundaries

XakuMedia operates as a local-first Windows desktop application consisting of two primary tiers:
1. **Desktop Shell (Electron / Node.js & React UI)**: Manages OS integration, window lifecycle, privileged file dialogue, and UI presentation.
2. **Backend Engine (Python 3.12 Runtime)**: Handles URL scanning, extraction via `yt-dlp` and `gallery-dl`, chunked streaming downloads, database persistence, and FFmpeg media processing.

Communication between the Electron desktop shell and the Python engine occurs exclusively over bidirectional **stdio pipes** using structured **JSON-RPC 2.0**.

```
+-----------------------------------------------------------------------+
|  UNTRUSTED INPUT                                                      |
|  - User-submitted URLs & Batch paste                                  |
|  - Remote web responses (metadata, headers, redirects)                |
|  - Filenames derived from remote creators/titles                      |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  ELECTRON DESKTOP LAYER                                               |
|  - Context Isolation: ON, Node Integration: OFF                      |
|  - Strict Content Security Policy (CSP)                               |
|  - Custom protocol: media-loader:// (extension whitelist, no UNC/ADS) |
|  - Path validation on app:openPath (showItemInFolder for files)       |
+-----------------------------------------------------------------------+
                                   | stdio (JSON-RPC 2.0)
                                   v
+-----------------------------------------------------------------------+
|  PYTHON ENGINE LAYER                                                  |
|  - SSRF Defense Engine (IP literal parser, DNS pre-check, CGNAT block)|
|  - Path Traversal & Windows Device Name Defense (paths.py)            |
|  - Sequential Filename Sanitizer (naming.py)                          |
|  - Local SQLite with parameterized queries                            |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  LOCAL FILESYSTEM (Windows OS)                                        |
|  - Confined to user-approved download directory                       |
|  - Non-executable media formats only                                  |
+-----------------------------------------------------------------------+
```

---

## 2. Server-Side Request Forgery (SSRF) Protection

When users scan URLs or download remote assets, the application issues HTTP/HTTPS requests to external servers. To prevent an attacker or malicious web redirect from accessing local services, cloud metadata APIs, or intranet devices, XakuMedia enforces strict SSRF verification in `backend/src/xakumedia/utils/security.py`.

### 2.1 Protocol Whitelisting
- Only `http://` and `https://` schemes are accepted.
- Dangerous protocols like `file://`, `ftp://`, `gopher://`, `dict://`, `data:`, or `javascript:` are rejected immediately at URL classification.

### 2.2 IP Literal & Alternate Encoding Parser (`parse_ip_literal`)
Attackers frequently use alternate IP encoding representations to bypass naïve regex or string matching filters. XakuMedia normalizes and parses:
- **Standard Dotted Quads & IPv6**: `127.0.0.1`, `::1`
- **Integer IPv4 Literals**: e.g. `2130706433` (evaluates to `127.0.0.1`), `3232235521` (`192.168.0.1`)
- **Hexadecimal IPv4 Literals**: e.g. `0x7f000001` (`127.0.0.1`)
- **Octal & Mixed Dotted Quads**: e.g. `0177.0.0.1`, `0x7f.0.0.1`
- **IPv4-Mapped IPv6**: e.g. `::ffff:127.0.0.1`, `[::ffff:7f00:1]`
- **Unspecified IPv4**: `0.0.0.0`

### 2.3 Comprehensive Non-Global IP Range Filtering
An IP address is rejected if it fails any of the following checks in `is_ip_private_or_local()`:
- `ip.is_private` (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- `ip.is_loopback` (`127.0.0.0/8`, `::1`)
- `ip.is_link_local` (`169.254.0.0/16`, `fe80::/10`)
- `ip.is_reserved` (IETF reserved ranges, including `240.0.0.0/4`)
- `ip.is_multicast` (`224.0.0.0/4`, `ff00::/8`)
- `ip.is_unspecified` (`0.0.0.0`, `::`)
- `not ip.is_global` (Blocks Carrier-Grade NAT `100.64.0.0/10` / RFC 6598 used by Alibaba Cloud metadata `100.100.100.200`, documentation test nets `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, and benchmarking ranges `198.18.0.0/15`).

### 2.4 Cloud Metadata & Intranet Hostname Blocking
- **Hostname Blacklist**: `localhost`, `127.0.0.1`, `[::1]`, `instance-data`, `metadata.google.internal`, `metadata.goog`.
- **Intranet TLD Suffix Blacklist**: `.localhost`, `.local`, `.internal`, `.lan`, `.home.arpa`.
- **Pre-Request DNS Resolution**: Hostnames undergo DNS resolution prior to HTTP connection. If any returned A/AAAA record resolves to a non-global or private address, the request is aborted with `SSRFBlockedError`.

---

## 3. Filesystem Security & Path Traversal Defenses

XakuMedia writes downloaded media files directly to the Windows filesystem. Because filenames and author names may originate from untrusted remote websites, rigorous validation is enforced in `backend/src/xakumedia/utils/paths.py` and `backend/src/xakumedia/utils/naming.py`.

### 3.1 Path Traversal Prevention
- All destination paths are verified using `validate_destination_path(target_path, allowed_root)`.
- The target path is resolved using `Path.resolve()`, and evaluated with `resolved_target.relative_to(resolved_root)`. Any attempt to write outside the user-configured download directory throws `InvalidDestinationError`.

### 3.2 NTFS Alternate Data Stream (`ADS`) Protection
Windows NTFS supports Alternate Data Streams via the syntax `filename:streamname:$DATA`. Attackers can use ADS to hide executable payloads or tamper with system metadata.
- **Defense**: Any colon (`:`) occurring in `target_path.name` triggers an immediate `InvalidDestinationError`.

### 3.3 Windows Reserved Device Names
Windows reserves specific DOS device names regardless of file extension:
`CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, `LPT1` through `LPT9`.
Writing to these names can lock up disk operations or cause denial of service.
- **Path Validation**: `validate_destination_path` checks every path component against `WINDOWS_RESERVED_NAMES`.
- **Username Sanitization**: `sanitize_username` in `naming.py` detects reserved stems and prefixes them with `user_` (e.g. `con` becomes `user_con_img_001.jpg`).

### 3.4 UNC Network Path Rejection
UNC network paths (`\\server\share\...`) can trigger automatic SMB authentication, leaking Windows NTLM password hashes across local or internet networks.
- **Defense**: Paths starting with `\\` or `//` are strictly prohibited for file storage.

### 3.5 Null-Byte (`\0`) Poisoning
Null bytes in paths can cause string truncation in C-based filesystem APIs.
- **Defense**: Paths containing `\0` are rejected immediately.

---

## 4. Electron Desktop & IPC Hardening

### 4.1 Process Isolation & Context Bridging
- `contextIsolation: true`: The renderer process operates in a completely isolated JavaScript context.
- `nodeIntegration: false`: Renderer has no direct access to Node.js APIs (`fs`, `child_process`, `net`, etc.).
- Preload script (`desktop/preload/index.ts`) exposes only a tightly validated `window.electronAPI` bridge via `contextBridge.exposeInMainWorld`.

### 4.2 Content Security Policy (CSP) & HTTP Response Headers
Enforced globally via `session.defaultSession.webRequest.onHeadersReceived`:
- `default-src 'self'`
- `script-src 'self'`
- `style-src 'self' 'unsafe-inline'`
- `img-src 'self' data: blob: media-loader: https:`
- `media-src 'self' blob: media-loader:`
- `connect-src 'self' ws: http://localhost:* http://127.0.0.1:*` (for Vite HMR in dev)
- `object-src 'none'`
- `base-uri 'self'`
- `form-action 'self'`
- `frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`

### 4.3 Navigation & Window Creation Restrictions
- All `will-navigate` events from the renderer are intercepted and prevented.
- `setWindowOpenHandler` blocks unauthorized popups and redirects external links to the default system web browser via `shell.openExternal`.

### 4.4 `media-loader://` Custom Streaming Protocol
To allow previewing downloaded local audio/video/image assets without granting broad filesystem access:
- **Strict Extension Whitelist**: Only valid media formats (`.mp4`, `.webm`, `.mkv`, `.avi`, `.mov`, `.flv`, `.ts`, `.mp3`, `.m4a`, `.wav`, `.aac`, `.flac`, `.ogg`, `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.ico`, `.bmp`, `.avif`, `.svg`, `.part`, `.tmp`) are loaded.
- **Security Checks**: Rejects non-absolute paths, UNC paths, paths containing null bytes, and NTFS Alternate Data Streams (`:`). Verifies `stat.isFile()` before streaming.

### 4.5 `app:openPath` IPC Hardening
- Rejects UNC paths and relative paths.
- For directories: Opens the folder via `shell.openPath`.
- For files: Uses `shell.showItemInFolder(targetPath)` to select/reveal the file in Windows Explorer **without** invoking the default application or executing binaries.

---

## 5. Subprocess & Python Communication Safety

- **No Shell Execution**: The Python engine is spawned directly via `child_process.spawn(pythonPath, ["-m", "xakumedia.server"])` with `shell: false`. Arguments are never concatenated into shell strings.
- **Stdio Pipe Isolation**: Commands are transmitted solely via `stdin`/`stdout`.
- **Clean Lifecycle**: When the desktop application terminates, a clean shutdown sequence is sent to Python's `stdin`. If the engine does not exit within 3000ms, it is terminated safely via process signals.
