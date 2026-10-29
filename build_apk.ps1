$ErrorActionPreference = "Stop"
$proj = "C:\FLY BRAIN GAME\android-project"
$outDir = "C:\FLY BRAIN GAME\apk"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$androidSdk = "$env:LOCALAPPDATA\Android\Sdk"
$buildTools = "$androidSdk\build-tools\36.0.0"
$androidJar = "$androidSdk\platforms\android-37.0\android.jar"
$jbr = "C:\Program Files\Android\Android Studio\jbr"
$env:JAVA_HOME = $jbr
$env:PATH = "$jbr\bin;$env:PATH"

Write-Host ">>> [1/7] Compiling Android resources with AAPT2..."
New-Item -ItemType Directory -Path "$proj\build" -Force | Out-Null
& "$buildTools\aapt2.exe" compile --dir "$proj\res" -o "$proj\build\compiled_res.zip"

Write-Host ">>> [1.5/7] Syncing sound assets..."
Copy-Item "C:\FLY BRAIN GAME\sounds" "$proj\assets\sounds" -Recurse -Force

Write-Host ">>> [2/7] Linking APK with Android SDK 37 and game assets..."
& "$buildTools\aapt2.exe" link `
    -o "$proj\build\unaligned.apk" `
    -I $androidJar `
    --manifest "$proj\AndroidManifest.xml" `
    "$proj\build\compiled_res.zip" `
    -A "$proj\assets" `
    --java "$proj\gen" `
    --auto-add-overlay

Write-Host ">>> [3/7] Compiling Java Activity and Native Bridge..."
New-Item -ItemType Directory -Path "$proj\build\classes" -Force | Out-Null
$javaFiles = Get-ChildItem -Path "$proj\gen", "$proj\src" -Recurse -Filter "*.java" | Select-Object -ExpandProperty FullName
& "$jbr\bin\javac.exe" -source 8 -target 8 -cp $androidJar -d "$proj\build\classes" $javaFiles

Write-Host ">>> [4/7] Generating Dalvik Executable (classes.dex) with D8..."
New-Item -ItemType Directory -Path "$proj\build\dex" -Force | Out-Null
$classFiles = Get-ChildItem -Path "$proj\build\classes" -Recurse -Filter "*.class" | Select-Object -ExpandProperty FullName
& "$buildTools\d8.bat" --output "$proj\build\dex" $classFiles

Write-Host ">>> [5/7] Bundling classes.dex into APK container..."
& "$jbr\bin\jar.exe" -uf "$proj\build\unaligned.apk" -C "$proj\build\dex" classes.dex

Write-Host ">>> [6/7] 4-byte Page Alignment (zipalign)..."
$alignedApk = "$proj\build\aligned.apk"
if (Test-Path $alignedApk) { Remove-Item $alignedApk -Force }
& "$buildTools\zipalign.exe" -v -p 4 "$proj\build\unaligned.apk" $alignedApk

Write-Host ">>> [7/7] Signing APK with Release Key (apksigner v1, v2, v3)..."
$keystore = "$proj\release.keystore"
if (-not (Test-Path $keystore)) {
    & "$jbr\bin\keytool.exe" -genkeypair `
        -keystore $keystore `
        -alias killthefly `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -storepass killthefly2026 `
        -keypass killthefly2026 `
        -dname "CN=Chandan Bagh, OU=Game Studio, O=Neural Hunter, L=Bhubaneswar, ST=Odisha, C=IN"
}

$finalApk = "$outDir\KillTheFly-NeuralHunter.apk"
if (Test-Path $finalApk) { Remove-Item $finalApk -Force }
& "$buildTools\apksigner.bat" sign `
    --ks $keystore `
    --ks-pass pass:killthefly2026 `
    --out $finalApk `
    $alignedApk

Write-Host ">>> Verifying APK digital signature..."
& "$buildTools\apksigner.bat" verify -v $finalApk

# Also copy to root and alias
Copy-Item $finalApk "$outDir\kill-the-fly.apk" -Force
Copy-Item $finalApk "C:\FLY BRAIN GAME\KillTheFly-NeuralHunter.apk" -Force
Copy-Item $finalApk "C:\FLY BRAIN GAME\kill-the-fly.apk" -Force

Write-Host ">>> SUCCESS! APK Generated:"
Get-Item $finalApk | Select-Object Name, Length, LastWriteTime
