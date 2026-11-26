$ErrorActionPreference = "Stop"

# Piccolo server HTTP limitato a localhost: serve i file del gioco senza esporre il PC in rete.
$root = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$listener = $null
$port = 8765

for ($candidate = 8765; $candidate -le 8795; $candidate++) {
    $tryListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
    try {
        $tryListener.Start()
        $listener = $tryListener
        $port = $candidate
        break
    } catch {
        try { $tryListener.Stop() } catch {}
    }
}

if ($null -eq $listener) {
    Write-Host "Non riesco ad aprire una porta locale libera." -ForegroundColor Red
    Read-Host "Premi INVIO per chiudere"
    exit 1
}

$url = "http://127.0.0.1:$port/"
Write-Host ""
Write-Host "VICE COAST sta partendo..." -ForegroundColor Cyan
Write-Host "Indirizzo locale: $url" -ForegroundColor Green
Write-Host "Per chiudere il server, torna qui e premi CTRL+C." -ForegroundColor Yellow
Write-Host ""

Start-Process ($url + "index.html")

function Send-Response($stream, [int]$status, [string]$reason, [string]$contentType, [byte[]]$body, [bool]$headOnly) {
    $crlf = [string][char]13 + [string][char]10
    $header = "HTTP/1.1 $status $reason" + $crlf +
      "Content-Type: $contentType" + $crlf +
      "Content-Length: " + $body.Length + $crlf +
      "Cache-Control: no-cache" + $crlf +
      "X-Content-Type-Options: nosniff" + $crlf +
      "Connection: close" + $crlf + $crlf
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if (-not $headOnly -and $body.Length -gt 0) {
        $stream.Write($body, 0, $body.Length)
    }
    $stream.Flush()
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

            $parts = $requestLine.Split(' ')
            $method = $parts[0].ToUpperInvariant()
            $headOnly = $method -eq "HEAD"
            while ($true) {
                $line = $reader.ReadLine()
                if ($null -eq $line -or $line -eq "") { break }
            }

            if ($method -ne "GET" -and -not $headOnly) {
                $body = [System.Text.Encoding]::UTF8.GetBytes("Metodo non supportato")
                Send-Response $stream 405 "Method Not Allowed" "text/plain; charset=utf-8" $body $false
                continue
            }

            $rawPath = ($parts[1] -split '\?')[0]
            $relative = [System.Uri]::UnescapeDataString($rawPath).TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }
            $relative = $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

            if (-not $filePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes("Accesso negato")
                Send-Response $stream 403 "Forbidden" "text/plain; charset=utf-8" $body $headOnly
                continue
            }
            if (Test-Path -LiteralPath $filePath -PathType Container) {
                $filePath = Join-Path $filePath "index.html"
            }
            if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes("File non trovato")
                Send-Response $stream 404 "Not Found" "text/plain; charset=utf-8" $body $headOnly
                continue
            }

            $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            $contentType = switch ($extension) {
                ".html" { "text/html; charset=utf-8" }
                ".js"   { "text/javascript; charset=utf-8" }
                ".mjs"  { "text/javascript; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".svg"  { "image/svg+xml" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".webp" { "image/webp" }
                ".ico"  { "image/x-icon" }
                ".woff" { "font/woff" }
                ".woff2" { "font/woff2" }
                default { "application/octet-stream" }
            }
            $body = [System.IO.File]::ReadAllBytes($filePath)
            Send-Response $stream 200 "OK" $contentType $body $headOnly
        } catch {
            Write-Host ("Richiesta non completata: " + $_.Exception.Message) -ForegroundColor DarkYellow
        } finally {
            if ($null -ne $client) { $client.Close() }
        }
    }
} finally {
    $listener.Stop()
}
