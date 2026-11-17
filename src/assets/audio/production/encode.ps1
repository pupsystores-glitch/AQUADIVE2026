# AQUADIVE audio encoder (Phase 7, step A6). See ../CREDITS.md.
#
# Encodes every WAV master in -Masters to AAC-LC in an MPEG-4 container (.m4a)
# in -Out, with the AAC encoder that ships with Windows (Media Foundation,
# through the WinRT MediaTranscoder). Mono, 48 kHz. Windows PowerShell 5.1.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File encode.ps1 -Masters <dir> -Out <dir>
#
# Every cue is encoded at 96 kbit/s.
param(
  [Parameter(Mandatory = $true)][string]$Masters,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Bitrate = 96000,
  [int]$SampleRate = 48000
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType = WindowsRuntime]

$methods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1
}
$asOperation = ($methods | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asProgress = ($methods | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1' })[0]
function Wait-Operation($operation, [Type]$type) {
  $task = $asOperation.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait() | Out-Null
  $task.Result
}

$Masters = (Resolve-Path $Masters).Path
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$folder = Wait-Operation ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($Out)) ([Windows.Storage.StorageFolder])

foreach ($master in Get-ChildItem $Masters -Filter *.wav | Sort-Object Name) {
  $name = $master.BaseName + ".m4a"
  $source = Wait-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($master.FullName)) ([Windows.Storage.StorageFile])
  $target = Wait-Operation ($folder.CreateFileAsync($name, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
  $quality = [Windows.Media.MediaProperties.AudioEncodingQuality]::Medium
  $profile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateM4a($quality)
  $profile.Audio.ChannelCount = 1
  $profile.Audio.SampleRate = $SampleRate
  $profile.Audio.Bitrate = $Bitrate
  $transcoder = New-Object Windows.Media.Transcoding.MediaTranscoder
  $transcoder.AlwaysReencode = $true
  $prepared = Wait-Operation ($transcoder.PrepareFileTranscodeAsync($source, $target, $profile)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
  if (-not $prepared.CanTranscode) { throw "${name}: cannot transcode ($($prepared.FailureReason))" }
  $task = $asProgress.MakeGenericMethod([double]).Invoke($null, @($prepared.TranscodeAsync()))
  $task.Wait() | Out-Null
  "{0,-28} {1,7} bytes  {2} {3} bit/s  {4} ch  {5} Hz" -f $name, (Get-Item (Join-Path $Out $name)).Length, $profile.Audio.Subtype, $profile.Audio.Bitrate, $profile.Audio.ChannelCount, $profile.Audio.SampleRate
}
