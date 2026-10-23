$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"

function New-Jar {
  $dir = Join-Path $env:TEMP ("sts-test-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $dir | Out-Null
  return $dir
}

$adminJar = New-Jar
$judgeJar = New-Jar
$publicJar = New-Jar

function Invoke-Api($Method, $Path, $Body, $Jar) {
  $uri = "$base$Path"
  $args = @{ Uri = $uri; Method = $Method; UseBasicParsing = $true; ContentType = "application/json" }
  if ($Jar) { $args.SessionVariable = $null; $args.WebSession = (Get-Variable -Name "$Jar" -ValueOnly -ErrorAction SilentlyContinue) }
  if ($null -ne $Body) { $args.Body = ($Body | ConvertTo-Json -Compress) }
  try {
    $resp = Invoke-WebRequest @args
    return @{ Status = [int]$resp.StatusCode; Data = ($resp.Content | ConvertFrom-Json) }
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $msg = ""
    try { $stream = $_.Exception.Response.GetResponseStream(); $reader = New-Object System.IO.StreamReader($stream); $msg = $reader.ReadToEnd() } catch {}
    return @{ Status = $code; Data = ($msg | ConvertFrom-Json -ErrorAction SilentlyContinue); Raw = $msg }
  }
}

# Use curl-style with cookie jars via .NET
$adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$judgeSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$publicSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function Call($Method, $Path, $Body, $Session) {
  $uri = "$base$Path"
  $p = @{ Uri = $uri; Method = $Method; UseBasicParsing = $true; ContentType = "application/json"; WebSession = $Session }
  if ($null -ne $Body) { $p.Body = ($Body | ConvertTo-Json -Compress) }
  try {
    $r = Invoke-WebRequest @p
    return @{ S = [int]$r.StatusCode; D = ($r.Content | ConvertFrom-Json) }
  } catch {
    $c = 0; $raw = ""
    if ($_.Exception.Response) {
      $c = [int]$_.Exception.Response.StatusCode
      try { $st = $_.Exception.Response.GetResponseStream(); $sr = New-Object System.IO.StreamReader($st); $raw = $sr.ReadToEnd() } catch {}
    }
    $d = $null
    try { $d = $raw | ConvertFrom-Json } catch {}
    return @{ S = $c; D = $d; Raw = $raw }
  }
}

$results = [System.Collections.ArrayList]::new()
function Check($Name, $Cond, $Detail) {
  $ok = [bool]$Cond
  [void]$results.Add([pscustomobject]@{ Test = $Name; Pass = $ok; Detail = $Detail })
  $mark = if ($ok) { "PASS" } else { "FAIL" }
  Write-Host "[$mark] $Name -- $Detail"
}

Write-Host "=== 1. Auth ==="
$r = Call POST "/auth/login" @{ username = "admin"; password = "admin-spotlight-2026" } $adminSession
Check "Admin login" ($r.S -eq 200 -and $r.D.user.role -eq "admin") "status=$($r.S) role=$($r.D.user.role)"

$r = Call POST "/auth/login" @{ username = "judge01"; password = "judge-spotlight-2026" } $judgeSession
Check "Judge login" ($r.S -eq 200 -and $r.D.user.role -eq "judge") "status=$($r.S) role=$($r.D.user.role)"

$r = Call POST "/auth/login" @{ username = "admin"; password = "wrong" } $publicSession
Check "Bad password rejected" ($r.S -eq 401) "status=$($r.S)"

Write-Host "`n=== 2. Access control ==="
$r = Call GET "/state/admin" $null $judgeSession
Check "Judge cannot read admin state" ($r.S -eq 403) "status=$($r.S)"

$r = Call GET "/state/admin" $null $publicSession
Check "Anonymous cannot read admin state" ($r.S -eq 403) "status=$($r.S)"

$r = Call POST "/event/open-voting" @{} $judgeSession
Check "Judge cannot open voting" ($r.S -eq 403) "status=$($r.S)"

$r = Call GET "/participants" $null $publicSession
Check "Anonymous cannot list participants" ($r.S -eq 401) "status=$($r.S)"

Write-Host "`n=== 3. Public state has no scores ==="
$r = Call GET "/state" $null $publicSession
$props = ($r.D | Get-Member -MemberType NoteProperty).Name -join ","
Check "Public state lacks leaderboard" (-not ($props -match "leaderboard")) "props=$props"
Check "Public state lacks scores field" (-not ($props -match "scores")) "props=$props"

Write-Host "`n=== 4. Select participant + voting flow ==="
$r = Call GET "/state/admin" $null $adminSession
$p1 = $r.D.participants | Where-Object { $_.number -eq 1 } | Select-Object -First 1
Check "Participants seeded" ($null -ne $p1) "p1 id=$($p1.id) name=$($p1.name)"

$order = @($r.D.participants | ForEach-Object { $_.id })
$swapped = @($order[1], $order[0]) + $order[2..($order.Count - 1)]
$r = Call PUT "/participants/reorder" @{ order = $swapped } $adminSession
Check "Reorder participants accepted" ($r.S -eq 200) "status=$($r.S)"
$r = Call GET "/state/admin" $null $adminSession
Check "Reorder applied" (($r.D.participants | Select-Object -First 2 | ForEach-Object { $_.number }) -join "," -eq "2,1") "first two=$(($r.D.participants | Select-Object -First 2 | ForEach-Object { $_.number }) -join ',')"
$r = Call PUT "/participants/reorder" @{ order = $order } $adminSession
Check "Reorder restored" ($r.S -eq 200) "status=$($r.S)"

$r = Call POST "/event/select-participant" @{ participantId = $p1.id } $adminSession
Check "Select participant 1" ($r.S -eq 200) "status=$($r.S)"

$r = Call GET "/state" $null $publicSession
Check "Audience sees active participant" ($r.D.activeParticipant.id -eq $p1.id) "name=$($r.D.activeParticipant.name)"

$r = Call POST "/event/open-voting" @{} $adminSession
Check "Open voting" ($r.S -eq 200 -and $r.D.status -eq "voting_open") "status=$($r.D.status)"
Check "No auto-close deadline" ($null -eq $r.D.voting_deadline_at) "deadline=$($r.D.voting_deadline_at)"

$r = Call POST "/event/open-voting" @{} $adminSession
Check "Double-open rejected" ($r.S -eq 409) "status=$($r.S)"

Write-Host "`n=== 5. Score submission ==="
$r = Call POST "/scores" @{ participantId = $p1.id; score = 50 } $judgeSession
Check "Out-of-range score rejected" ($r.S -eq 422) "status=$($r.S) err=$($r.D.error)"

$r = Call POST "/scores" @{ participantId = $p1.id; score = 8 } $judgeSession
Check "Valid score accepted" ($r.S -eq 201) "status=$($r.S) score=$($r.D.score)"

$r = Call POST "/scores" @{ participantId = $p1.id; score = 9 } $judgeSession
Check "Duplicate submission rejected" ($r.S -eq 409) "status=$($r.S) err=$($r.D.error)"

$r = Call GET "/state/judge" $null $judgeSession
Check "Judge sees own locked submission" ($r.D.mySubmission.score -eq 8) "score=$($r.D.mySubmission.score)"

Write-Host "`n=== 5b. Anonymous audience voting ==="
$r = Call POST "/audience/vote" @{ voterId = "device-alpha-1111"; score = 4 } $publicSession
Check "Audience vote accepted without login" ($r.S -eq 200) "status=$($r.S) err=$($r.D.error)"
$r = Call POST "/audience/vote" @{ voterId = "device-alpha-1111"; score = 9 } $publicSession
Check "Same device cannot vote twice in a round" ($r.S -eq 409) "status=$($r.S)"
$r = Call POST "/audience/vote" @{ voterId = "device-bravo-2222"; score = 10 } $publicSession
Check "Second audience device can vote" ($r.S -eq 200) "status=$($r.S) err=$($r.D.error)"

$r = Call GET "/state/admin" $null $adminSession
$lb = $r.D.leaderboard | Where-Object { $_.participant.id -eq $p1.id }
Check "Admin leaderboard uses 80/20 weighting" ($lb.average -eq 7.8) "avg=$($lb.average) rank=$($lb.rank)"
$aud = $lb.scores | Where-Object { $_.judgeId -eq -1 }
Check "Audience votes appear as one averaged row" ($null -ne $aud -and $aud.score -eq 7) "audience=$($aud.score) name=$($aud.judgeName)"

$r = Call GET "/state" $null $publicSession
Check "Audience still cannot see score" (-not ($r.D | Get-Member -MemberType NoteProperty | Where-Object Name -match "score|leaderboard|average")) "public props clean"

Write-Host "`n=== 6. Late submission rejected ==="
Call POST "/event/close-voting" @{} $adminSession | Out-Null
$r = Call POST "/scores" @{ participantId = $p1.id; score = 3 } $judgeSession
Check "Score after close rejected" ($r.S -eq 403) "status=$($r.S) err=$($r.D.error)"

Write-Host "`n=== 7. Missing-score marking ==="
$r = Call GET "/state/admin" $null $adminSession
$lb = $r.D.leaderboard | Where-Object { $_.participant.id -eq $p1.id }
Check "Scoring judge is not marked missing" (-not ($lb.missingJudgeNames -contains "Judge 01")) "missing=$($lb.missingJudgeNames -join ',')"

$p2 = $r.D.participants | Where-Object { $_.number -eq 2 } | Select-Object -First 1
Call POST "/event/select-participant" @{ participantId = $p2.id } $adminSession | Out-Null
Call POST "/event/open-voting" @{} $adminSession | Out-Null
Write-Host "  waiting 3s to confirm voting stays open..."
Start-Sleep -Seconds 3
$r = Call GET "/state" $null $publicSession
Check "Voting stays open until crew closes it" ($r.D.status -eq "voting_open") "status=$($r.D.status)"

$r = Call POST "/audience/vote" @{ voterId = "device-alpha-1111"; score = 6 } $publicSession
Check "Same device can vote again in a new round" ($r.S -eq 200) "status=$($r.S) err=$($r.D.error)"
$r = Call POST "/audience/vote" @{ voterId = "device-alpha-1111"; score = 8 } $publicSession
Check "Duplicate vote rejected in new round" ($r.S -eq 409) "status=$($r.S)"

Call POST "/event/close-voting" @{} $adminSession | Out-Null

$r = Call GET "/state/admin" $null $adminSession
$lb2 = $r.D.leaderboard | Where-Object { $_.participant.id -eq $p2.id }
Check "Unscored participant marked missing" ($lb2.missingJudgeNames.Count -gt 0) "missing=$($lb2.missingJudgeNames.Count) avg=$($lb2.average)"

Write-Host "`n=== 8. Score correction (admin only) ==="
$sid = $lb.scores[0].id
$r = Call POST "/scores/$sid/correct" @{ newScore = 9; reason = "test correction" } $judgeSession
Check "Judge cannot correct scores" ($r.S -eq 403) "status=$($r.S)"

$r = Call POST "/scores/$sid/correct" @{ newScore = 9; reason = "judge pressed wrong digit" } $adminSession
Check "Admin correction works" ($r.S -eq 200 -and $r.D.score -eq 9) "status=$($r.S) new=$($r.D.score)"

$r = Call POST "/scores/$sid/correct" @{ newScore = 9; reason = "" } $adminSession
Check "Correction without reason rejected" ($r.S -eq 422) "status=$($r.S)"

Write-Host "`n=== 9. Results publish gate ==="
$r = Call GET "/results" $null $publicSession
Check "Results hidden before publish" ($r.S -eq 404) "status=$($r.S)"

$r = Call POST "/event/publish-results" @{} $adminSession
Check "Publish results" ($r.S -eq 200) "status=$($r.S)"

$r = Call GET "/results" $null $publicSession
Check "Results public after publish" ($r.S -eq 200 -and $r.D.winners.Count -ge 1) "winners=$($r.D.winners.Count)"
Check "Winner has rank 1" ($r.D.winners[0].rank -eq 1) "first=$($r.D.winners[0].participant.name)"

Write-Host "`n=== 10. Reset with confirmation path ==="
$r = Call POST "/event/reset" @{} $judgeSession
Check "Judge cannot reset" ($r.S -eq 403) "status=$($r.S)"

$r = Call POST "/event/reset" @{} $adminSession
Check "Admin reset works" ($r.S -eq 200) "status=$($r.S)"

$r = Call GET "/state/admin" $null $adminSession
Check "Reset clears scores" (($r.D.leaderboard | Where-Object { $_.average -ne $null }).Count -eq 0) "non-null averages=$(($r.D.leaderboard | Where-Object { $_.average -ne $null }).Count)"
Check "Reset clears publish" (-not $r.D.resultsPublished) "published=$($r.D.resultsPublished)"

Write-Host "`n=== 11. Audit trail ==="
$r = Call GET "/audit" $null $adminSession
Check "Event audit recorded" ($r.S -eq 200 -and $r.D.Count -gt 0) "entries=$($r.D.Count)"
$actions = ($r.D | Select-Object -ExpandProperty action -Unique) -join ", "
Write-Host "  audit actions: $actions"

Write-Host "`n=== 12. Multi-judge management ==="
$r = Call GET "/judges" $null $adminSession
Check "Judge list readable by admin" ($r.S -eq 200 -and $r.D.Count -ge 1) "judges=$($r.D.Count)"
$beforeCount = $r.D.Count

$r = Call POST "/judges" @{ username = "judge2"; displayName = "Second Judge"; password = "judge2-password-2026" } $adminSession
Check "Create second judge" ($r.S -eq 201) "status=$($r.S)"
$judge2 = $r.D

$r = Call POST "/judges" @{ username = "judge2"; password = "judge2-password-2026" } $adminSession
Check "Duplicate judge username rejected" ($r.S -eq 409) "status=$($r.S)"

$r = Call POST "/judges" @{ username = "bad name!"; password = "some-password-1" } $adminSession
Check "Invalid judge username rejected" ($r.S -eq 422) "status=$($r.S)"

$r = Call POST "/judges" @{ username = "judge3"; password = "short" } $adminSession
Check "Short judge password rejected" ($r.S -eq 422) "status=$($r.S)"

$r = Call POST "/judges" @{ username = "judge2"; password = "judge2-password-2026" } $judgeSession
Check "Judge cannot create judges" ($r.S -eq 403) "status=$($r.S)"

$r = Call GET "/judges" $null $judgeSession
Check "Judge cannot list judges" ($r.S -eq 403) "status=$($r.S)"

$judge2Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$r = Call POST "/auth/login" @{ username = "judge2"; password = "judge2-password-2026" } $judge2Session
Check "New judge can sign in" ($r.S -eq 200 -and $r.D.user.display_name -eq "Second Judge") "status=$($r.S) name=$($r.D.user.display_name)"

$r = Call GET "/state/judge" $null $judge2Session
Check "New judge sees judge state" ($r.S -eq 200) "status=$($r.S)"

$r = Call GET "/state/admin" $null $adminSession
Check "Admin state exposes judge roster" ($r.D.judges.Count -ge 2) "judges=$($r.D.judges.Count)"

# both judges score the same performer
$r = Call GET "/state/admin" $null $adminSession
$p = $r.D.participants | Where-Object { $_.number -eq 3 } | Select-Object -First 1
Call POST "/event/select-participant" @{ participantId = $p.id } $adminSession | Out-Null
Call POST "/event/open-voting" @{ durationSec = 20 } $adminSession | Out-Null
$r = Call POST "/scores" @{ participantId = $p.id; score = 6 } $judgeSession
Check "Judge 1 scores" ($r.S -eq 201) "status=$($r.S)"
$r = Call POST "/scores" @{ participantId = $p.id; score = 9 } $judge2Session
Check "Judge 2 scores the same performer" ($r.S -eq 201) "status=$($r.S)"

$r = Call GET "/state/admin" $null $adminSession
$entry = $r.D.leaderboard | Where-Object { $_.participant.id -eq $p.id }
Check "Two scores averaged together" ($entry.average -eq 7.5) "avg=$($entry.average) scores=$($entry.scores.Count)"
$scored = @($entry.scores | Where-Object { -not $_.isMissing -and $null -ne $_.score })
Check "Both judges appear on the scorecard" ($scored.Count -eq 2) "scores=$($scored.Count)"
Check "Scoring judges are not marked missing" ((-not ($entry.missingJudgeNames -contains "Judge 01")) -and (-not ($entry.missingJudgeNames -contains "Second Judge"))) "missing=$($entry.missingJudgeNames -join ',')"

$r = Call DELETE "/judges/$($judge2.id)" $null $adminSession
Check "Judge with scores cannot be removed" ($r.S -eq 409) "status=$($r.S)"

Call POST "/event/close-voting" @{} $adminSession | Out-Null

$r = Call POST "/judges/$($judge2.id)/reset-password" @{ newPassword = "judge2-new-password" } $adminSession
Check "Admin resets judge password" ($r.S -eq 200) "status=$($r.S)"

$judge2Session2 = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$r = Call POST "/auth/login" @{ username = "judge2"; password = "judge2-new-password" } $judge2Session2
Check "Judge signs in with new password" ($r.S -eq 200) "status=$($r.S)"

$r = Call POST "/auth/login" @{ username = "judge2"; password = "judge2-password-2026" } $judge2Session2
Check "Old judge password no longer works" ($r.S -eq 401) "status=$($r.S)"

$r = Call POST "/judges/$($judge2.id)/reset-password" @{ newPassword = "short" } $adminSession
Check "Reset with short password rejected" ($r.S -eq 422) "status=$($r.S)"

# adding a judge mid-round must be blocked
Call POST "/event/open-voting" @{ durationSec = 20 } $adminSession | Out-Null
$r = Call POST "/judges" @{ username = "judge4"; password = "judge4-password-2026" } $adminSession
Check "Cannot add judge while voting is open" ($r.S -eq 409) "status=$($r.S)"
Call POST "/event/close-voting" @{} $adminSession | Out-Null

# a judge with no scores can be removed
$r = Call POST "/judges" @{ username = "tempjudge"; password = "tempjudge-password" } $adminSession
$temp = $r.D
$r = Call DELETE "/judges/$($temp.id)" $null $adminSession
Check "Judge without scores can be removed" ($r.S -eq 200) "status=$($r.S)"

# cleanup
Call POST "/event/reset" @{} $adminSession | Out-Null
$r = Call DELETE "/judges/$($judge2.id)" $null $adminSession
Check "Second judge cleaned up" ($r.S -eq 200) "status=$($r.S)"

$r = Call GET "/judges" $null $adminSession
Check "Judge roster back to baseline" ($r.D.Count -eq $beforeCount) "judges=$($r.D.Count) expected=$beforeCount"

$passed = ($results | Where-Object Pass).Count
$failed = ($results | Where-Object { -not $_.Pass }).Count
Write-Host "`n================================"
Write-Host "TOTAL: $passed passed, $failed failed (of $($results.Count))"
if ($failed -gt 0) {
  Write-Host "FAILURES:"
  $results | Where-Object { -not $_.Pass } | ForEach-Object { Write-Host "  - $($_.Test): $($_.Detail)" }
}
