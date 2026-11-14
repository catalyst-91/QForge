# Uploads QForge to GitHub and creates the v1.5.0 release with the three app builds.
# Needs the GitHub CLI:  winget install GitHub.cli   (and Git:  winget install Git.Git)
# Usage (PowerShell):  .\publish-to-github.ps1 [-ZipDir "C:\path\to\zips"]     (default: your Downloads folder)
param([string]$ZipDir = (Join-Path $env:USERPROFILE 'Downloads'))
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$Repo = 'QForge'; $Tag = 'v1.5.0'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Write-Host 'Install the GitHub CLI first: winget install GitHub.cli'; exit 1 }
gh auth status 2>$null | Out-Null; if ($LASTEXITCODE -ne 0) { gh auth login }
$Owner = gh api user --jq .login
gh repo view "$Owner/$Repo" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Repository $Owner/$Repo already exists - pushing to it"
  git remote remove origin 2>$null
  git remote add origin "https://github.com/$Owner/$Repo.git"
  git push -u origin main
} else {
  Write-Host "Creating private repository $Owner/$Repo"
  gh repo create "$Owner/$Repo" --private --source . --remote origin --push --description "QForge - QLab-style show playback for Windows and macOS by Booth Productions"
}
$assets = @()
foreach ($f in 'QForge-Windows-x64.zip','QForge-mac-AppleSilicon.zip','QForge-mac-Intel.zip') {
  $p = Join-Path $ZipDir $f
  if (Test-Path $p) { $assets += $p } else { Write-Host "Not found (skipped): $p" }
}
gh release view $Tag -R "$Owner/$Repo" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { if ($assets.Count) { gh release upload $Tag @assets -R "$Owner/$Repo" --clobber } }
else { gh release create $Tag @assets -R "$Owner/$Repo" --title 'QForge 1.5.0' --notes-file docs/release-notes-1.5.0.md }
Write-Host "`nDone: https://github.com/$Owner/$Repo/releases/tag/$Tag"
