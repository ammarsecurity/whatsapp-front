# Run after uploading v18 and pm2 restart
$base = 'https://whatsapp-backend.smartstick-iq.com'
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST `
  -Body '{"username":"ammar33","password":"ammar33"}' -ContentType 'application/json'
$token = $login.token
$h = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }

$health = Invoke-RestMethod -Uri "$base/health"
Write-Host "apiBuild: $($health.apiBuild) (expect 2026-06-02-v18)"

$status = Invoke-RestMethod -Uri "$base/api/accounts/hope/status" -Headers $h
Write-Host "hope status: $($status.status) sessionActive=$($status.sessionActive)"

if ($status.sessionActive -ne $true) {
  Write-Host 'SKIP send/check — link hope via QR first'
  exit 1
}

$phone = '9647807110011'
foreach ($name in @('check-number', 'send')) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    if ($name -eq 'check-number') {
      $r = Invoke-RestMethod -Uri "$base/api/messages/check-number" -Method POST -Headers $h `
        -Body (@{ accountId = 'hope'; phoneNumber = $phone } | ConvertTo-Json) -TimeoutSec 15
    } else {
      $r = Invoke-RestMethod -Uri "$base/api/messages/send" -Method POST -Headers $h `
        -Body (@{ accountId = 'hope'; phoneNumbers = @($phone); message = 'v18 verify' } | ConvertTo-Json) -TimeoutSec 60
    }
    $sw.Stop()
    Write-Host "$name OK in $($sw.ElapsedMilliseconds)ms"
    $r | ConvertTo-Json -Depth 3
  } catch {
    $sw.Stop()
    Write-Host "$name FAIL in $($sw.ElapsedMilliseconds)ms — $($_.Exception.Message)"
  }
}
