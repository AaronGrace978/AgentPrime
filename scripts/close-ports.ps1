# Close AgentPrime-related ports
# Run in PowerShell (as Administrator if you get "Access denied"):
#   .\scripts\close-ports.ps1
# Or: powershell -ExecutionPolicy Bypass -File .\scripts\close-ports.ps1

$ports = @(8000, 11434, 11435)
$closed = 0

foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $pids = $conn.OwningProcess | Select-Object -Unique
        foreach ($pid in $pids) {
            try {
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($proc) {
                    Stop-Process -Id $pid -Force -ErrorAction Stop
                    Write-Host "Closed port $port (PID $pid - $($proc.ProcessName))"
                    $closed++
                }
            } catch {
                Write-Host "Access denied for PID $pid on port $port. Run as Administrator."
            }
        }
    } else {
        Write-Host "Port $port - nothing listening"
    }
}

if ($closed -eq 0) {
    Write-Host "`nNo processes were stopped. If you saw 'Access denied', run PowerShell as Administrator."
} else {
    Write-Host "`nClosed $closed process(es)."
}
