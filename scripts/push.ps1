git add .
$nowTime = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
git commit -m $nowTime
git pull --rebase -X theirs
git push origin
