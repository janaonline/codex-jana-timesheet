$root = $PSScriptRoot
$out = Join-Path $root ".codex-dev.out.log"
$err = Join-Path $root ".codex-dev.err.log"

Remove-Item $out, $err -ErrorAction SilentlyContinue

Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "npm start" `
  -WorkingDirectory $root `
  -RedirectStandardOutput $out `
  -RedirectStandardError $err `
  -PassThru
