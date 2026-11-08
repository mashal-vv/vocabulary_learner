Set-Location 'D:\voc_llm'
$result = & "D:\voc_llm\node_modules\.bin\tsc" --noEmit -p "D:\voc_llm\tsconfig.app.json" 2>&1
Write-Output "EXIT:$LASTEXITCODE"
$result | ForEach-Object { Write-Output $_ }
