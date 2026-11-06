param(
  [int]$Port = 8765,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootFull = [System.IO.Path]::GetFullPath($root)
$rootPrefix = $rootFull.TrimEnd('\') + '\'

function Get-Mime([string]$path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8' }
    '.htm'  { 'text/html; charset=utf-8' }
    '.js'   { 'application/javascript; charset=utf-8' }
    '.mjs'  { 'application/javascript; charset=utf-8' }
    '.css'  { 'text/css; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.webmanifest' { 'application/manifest+json; charset=utf-8' }
    '.wasm' { 'application/wasm' }
    '.png'  { 'image/png' }
    '.jpg'  { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.webp' { 'image/webp' }
    '.svg'  { 'image/svg+xml' }
    '.ico'  { 'image/x-icon' }
    '.tflite' { 'application/octet-stream' }
    default { 'application/octet-stream' }
  }
}

function Send-Response($stream, [int]$status, [string]$statusText, [byte[]]$body, [string]$contentType, [bool]$headOnly) {
  $len = 0
  if ($null -ne $body) { $len = $body.Length }
  $header = "HTTP/1.1 $status $statusText`r`nContent-Type: $contentType`r`nContent-Length: $len`r`nConnection: close`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nContent-Security-Policy: connect-src 'self' blob: data:`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if (-not $headOnly -and $len -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

$listener = $null
$actualPort = $Port
for ($p = $Port; $p -lt ($Port + 20); $p++) {
  try {
    $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $p)
    $candidate.Start()
    $listener = $candidate
    $actualPort = $p
    break
  } catch {
    $listener = $null
  }
}

if ($null -eq $listener) {
  Write-Host "No free port found. Close another program and try again."
  exit 1
}

$url = "http://localhost:$actualPort/"
Write-Host ""
Write-Host "  ID Photo Tool is running."
Write-Host "  Local:  $url"
try {
  $ips = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress -Unique
  foreach ($ip in $ips) {
    Write-Host "  Phone (same Wi-Fi): http://$ip`:$actualPort/"
  }
} catch { }
Write-Host ""
Write-Host "  Keep this window open. Press Ctrl+C to stop."
Write-Host ""

if (-not $NoBrowser) {
  try { Start-Process $url | Out-Null } catch { }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 15000
      $stream = $client.GetStream()
      $stream.ReadTimeout = 15000
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { break }
      }

      $parts = $requestLine -split ' '
      if ($parts.Count -lt 2) { continue }
      $method = $parts[0].ToUpperInvariant()
      $target = $parts[1]
      $pathOnly = ($target -split '\?')[0]
      try { $pathOnly = [System.Uri]::UnescapeDataString($pathOnly) } catch { }
      if ($pathOnly -eq '/') { $pathOnly = '/index.html' }
      $relative = $pathOnly.TrimStart('/').Replace('/', '\')
      $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $relative))

      # Serve only the files the app actually needs. This keeps .git/,
      # .work/, tests/ and local deployment zips off the LAN.
      $allowedFiles = @(
        'index.html', 'styles.css', 'app.js', 'specs.js', 'sw.js',
        'manifest.webmanifest', 'docs\images\bg-variants.png'
      )
      $allowedDirs = @('icons\', 'vendor\')
      $inside = ($full.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) -or ($full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase))
      $allowed = $false
      if ($inside) {
        $rel = $full.Substring($rootFull.Length).TrimStart('\')
        if ($allowedFiles -contains $rel) {
          $allowed = $true
        } else {
          foreach ($prefix in $allowedDirs) {
            if ($rel.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
              $allowed = $true
              break
            }
          }
        }
      }

      if ($method -ne 'GET' -and $method -ne 'HEAD') {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
        Send-Response $stream 405 'Method Not Allowed' $body 'text/plain; charset=utf-8' $false
      } elseif (-not $inside) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
        Send-Response $stream 403 'Forbidden' $body 'text/plain; charset=utf-8' ($method -eq 'HEAD')
      } elseif (-not $allowed) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        Send-Response $stream 404 'Not Found' $body 'text/plain; charset=utf-8' ($method -eq 'HEAD')
      } elseif (Test-Path -LiteralPath $full -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        Send-Response $stream 200 'OK' $bytes (Get-Mime $full) ($method -eq 'HEAD')
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        Send-Response $stream 404 'Not Found' $body 'text/plain; charset=utf-8' ($method -eq 'HEAD')
      }
    } catch {
      # Ignore per-connection errors (browser aborts, timeouts, etc.)
    } finally {
      if ($null -ne $client) { $client.Close() }
    }
  }
} finally {
  if ($null -ne $listener) { $listener.Stop() }
}
