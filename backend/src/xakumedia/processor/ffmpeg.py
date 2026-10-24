"""FFmpeg and FFprobe binary detection, stream multiplexing, and format conversion."""

import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ..core.config import default_config
from ..core.logging import get_logger
from ..exceptions.base import (
    DownloadCancelledError,
    FFmpegNotFoundError,
    FormatConversionError,
    StreamMergeError,
)

logger = get_logger("processor.ffmpeg")


def find_ffmpeg() -> Path | None:
    """Locate the FFmpeg executable dynamically from config, PATH, or standard paths."""
    # 0. Environment variable override
    env_ffmpeg = os.environ.get("FFMPEG_PATH")
    if env_ffmpeg and Path(env_ffmpeg).is_file():
        return Path(env_ffmpeg)

    # 1. Configured custom path
    if default_config.ffmpeg_binary and default_config.ffmpeg_binary.exists():
        return default_config.ffmpeg_binary

    # 2. Packaged relative resource locations (resources/bin/ffmpeg.exe)
    packaged_candidates = [
        Path(sys.executable).parent.parent / "bin" / "ffmpeg.exe",
        Path(sys.executable).parent / "bin" / "ffmpeg.exe",
        Path(__file__).resolve().parents[4] / "bin" / "ffmpeg.exe",
    ]
    for candidate in packaged_candidates:
        if candidate.is_file():
            return candidate

    # 3. System PATH lookup
    system_bin = shutil.which("ffmpeg")
    if system_bin:
        return Path(system_bin)

    # 4. Windows common installation locations
    if os.name == "nt":
        local_app = Path(os.environ.get("LOCALAPPDATA", ""))
        prog_files = Path(os.environ.get("ProgramFiles", "C:\\Program Files"))
        candidates = [
            Path("C:\\lib\\ffmpeg-n4.4-latest-win64-gpl-4.4\\bin\\ffmpeg.exe"),
            local_app / "Microsoft" / "WinGet" / "Links" / "ffmpeg.exe",
            prog_files / "FFmpeg" / "bin" / "ffmpeg.exe",
            Path("C:\\ffmpeg\\bin\\ffmpeg.exe"),
        ]
        for candidate in candidates:
            if candidate.is_file():
                return candidate

    return None


def find_ffprobe() -> Path | None:
    """Locate the FFprobe executable dynamically from config, PATH, or standard paths."""
    # 0. Environment variable override
    env_ffprobe = os.environ.get("FFPROBE_PATH")
    if env_ffprobe and Path(env_ffprobe).is_file():
        return Path(env_ffprobe)

    if default_config.ffprobe_binary and default_config.ffprobe_binary.exists():
        return default_config.ffprobe_binary

    packaged_candidates = [
        Path(sys.executable).parent.parent / "bin" / "ffprobe.exe",
        Path(sys.executable).parent / "bin" / "ffprobe.exe",
        Path(__file__).resolve().parents[4] / "bin" / "ffprobe.exe",
    ]
    for candidate in packaged_candidates:
        if candidate.is_file():
            return candidate

    system_bin = shutil.which("ffprobe")
    if system_bin:
        return Path(system_bin)

    if os.name == "nt":
        local_app = Path(os.environ.get("LOCALAPPDATA", ""))
        prog_files = Path(os.environ.get("ProgramFiles", "C:\\Program Files"))
        candidates = [
            Path("C:\\lib\\ffmpeg-n4.4-latest-win64-gpl-4.4\\bin\\ffprobe.exe"),
            local_app / "Microsoft" / "WinGet" / "Links" / "ffprobe.exe",
            prog_files / "FFmpeg" / "bin" / "ffprobe.exe",
            Path("C:\\ffmpeg\\bin\\ffprobe.exe"),
        ]
        for candidate in candidates:
            if candidate.is_file():
                return candidate

    return None


def get_ffmpeg_version(ffmpeg_path: Path | None = None) -> str | None:
    """Query and parse the version string of the installed FFmpeg binary."""
    binary = ffmpeg_path or find_ffmpeg()
    if not binary:
        return None

    try:
        proc = subprocess.run(
            [str(binary), "-version"],
            capture_output=True,
            text=True,
            check=False,
            timeout=5.0,
        )
        if proc.returncode == 0 and proc.stdout:
            first_line = proc.stdout.splitlines()[0]
            match = re.search(r"ffmpeg version\s+([^\s]+)", first_line, re.IGNORECASE)
            if match:
                return match.group(1)
            return first_line.strip()
    except Exception as exc:
        logger.warning(f"Failed to query FFmpeg version from {binary}: {exc}")

    return None


def get_ffmpeg_info() -> dict[str, Any]:
    """Retrieve system diagnostics regarding FFmpeg and FFprobe availability."""
    ffmpeg_bin = find_ffmpeg()
    ffprobe_bin = find_ffprobe()
    version = get_ffmpeg_version(ffmpeg_bin) if ffmpeg_bin else None

    return {
        "installed": ffmpeg_bin is not None,
        "version": version,
        "ffmpeg_path": str(ffmpeg_bin) if ffmpeg_bin else None,
        "ffprobe_path": str(ffprobe_bin) if ffprobe_bin else None,
    }


def inspect_media(file_path: Path, ffprobe_path: Path | None = None) -> dict[str, Any]:
    """Inspect media container, duration, format, and stream tracks via FFprobe.

    Returns:
        Structured dictionary containing container format details and stream tracks.
    """
    if not file_path.is_file():
        raise FileNotFoundError(f"Media file not found for inspection: {file_path}")

    probe_bin = ffprobe_path or find_ffprobe()
    if not probe_bin:
        raise FFmpegNotFoundError("ffprobe executable was not found on system PATH.")

    cmd = [
        str(probe_bin),
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=15.0,
        )
        if proc.returncode != 0:
            raise StreamMergeError(
                f"ffprobe failed to inspect {file_path.name}: {proc.stderr.strip()}"
            )

        data = json.loads(proc.stdout)
        format_info = data.get("format", {})
        streams = data.get("streams", [])

        video_tracks = [s for s in streams if s.get("codec_type") == "video"]
        audio_tracks = [s for s in streams if s.get("codec_type") == "audio"]

        return {
            "file_name": file_path.name,
            "format_name": format_info.get("format_name"),
            "duration_seconds": float(format_info.get("duration", 0.0)) or None,
            "size_bytes": int(format_info.get("size", 0)) or None,
            "bit_rate": int(format_info.get("bit_rate", 0)) or None,
            "video_stream": {
                "codec": video_tracks[0].get("codec_name"),
                "width": video_tracks[0].get("width"),
                "height": video_tracks[0].get("height"),
                "fps": eval(video_tracks[0].get("r_frame_rate", "0/1"))
                if "/" in video_tracks[0].get("r_frame_rate", "")
                else None,
            }
            if video_tracks
            else None,
            "audio_stream": {
                "codec": audio_tracks[0].get("codec_name"),
                "sample_rate": audio_tracks[0].get("sample_rate"),
                "channels": audio_tracks[0].get("channels"),
            }
            if audio_tracks
            else None,
            "stream_count": len(streams),
        }
    except json.JSONDecodeError as exc:
        raise StreamMergeError(f"Failed to parse ffprobe output: {exc}") from exc


def merge_video_audio(
    video_path: Path,
    audio_path: Path,
    output_path: Path,
    output_container: str | None = None,
    is_cancelled: Callable[[], bool] | None = None,
    ffmpeg_path: Path | None = None,
) -> Path:
    """Multiplex separate video and audio tracks into a single container without re-encoding.

    Args:
        video_path: Local path to the downloaded video-only stream file.
        audio_path: Local path to the downloaded audio-only stream file.
        output_path: Target destination path for the multiplexed media file.
        output_container: Optional explicit container extension (e.g. 'mp4', 'mkv').
        is_cancelled: Optional cancellation predicate polled during merge execution.
        ffmpeg_path: Optional explicit path to the FFmpeg binary.

    Returns:
        Path to the multiplexed file.
    """
    if not video_path.is_file():
        raise FileNotFoundError(f"Video stream file not found: {video_path}")
    if not audio_path.is_file():
        raise FileNotFoundError(f"Audio stream file not found: {audio_path}")

    bin_path = ffmpeg_path or find_ffmpeg()
    if not bin_path:
        raise FFmpegNotFoundError(
            "FFmpeg executable not found. Cannot multiplex separate video and audio streams."
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    container = (output_container or output_path.suffix.lstrip(".")).lower()

    # Step 1: Attempt lossless stream copy (-c:v copy -c:a copy)
    cmd = [
        str(bin_path),
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video_path),
        "-i",
        str(audio_path),
        "-c:v",
        "copy",
        "-c:a",
        "copy",
    ]

    # Web-friendly MP4 flags
    if container == "mp4":
        cmd.extend(["-movflags", "+faststart"])

    cmd.append(str(output_path))

    logger.info(f"Merging streams: {video_path.name} + {audio_path.name} -> {output_path.name}")

    def _execute_ffmpeg_proc(arguments: list[str]) -> tuple[int, str]:
        proc = subprocess.Popen(
            arguments,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        while proc.poll() is None:
            if is_cancelled and is_cancelled():
                logger.warning(f"Cancellation received during FFmpeg merge of {output_path.name}")
                proc.terminate()
                try:
                    proc.wait(timeout=2.0)
                except subprocess.TimeoutExpired:
                    proc.kill()
                if output_path.exists():
                    output_path.unlink()
                raise DownloadCancelledError("Stream merge cancelled by user")
            time.sleep(0.1)

        _, stderr = proc.communicate()
        return proc.returncode, stderr

    returncode, stderr = _execute_ffmpeg_proc(cmd)

    # Step 2: Fallback if lossless copy failed due to container/codec incompatibility
    # (e.g. YouTube Opus audio cannot be stream-copied into an MP4 container in some versions)
    if returncode != 0:
        logger.warning(
            f"Lossless copy failed for {output_path.name} ({stderr.strip()}). "
            "Falling back to AAC audio transcoding for MP4 compatibility..."
        )
        if output_path.exists():
            try:
                output_path.unlink()
            except OSError:
                pass

        fallback_cmd = [
            str(bin_path),
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(video_path),
            "-i",
            str(audio_path),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
        ]
        if container == "mp4":
            fallback_cmd.extend(["-movflags", "+faststart"])
        fallback_cmd.append(str(output_path))

        returncode, stderr = _execute_ffmpeg_proc(fallback_cmd)
        if returncode != 0:
            if output_path.exists():
                try:
                    output_path.unlink()
                except OSError:
                    pass
            raise StreamMergeError(f"FFmpeg stream merge failed: {stderr.strip()}")

    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise StreamMergeError(f"FFmpeg produced an empty or missing output file: {output_path}")

    size_bytes = output_path.stat().st_size
    logger.info(f"Stream merge completed successfully: {output_path} ({size_bytes} bytes)")
    return output_path


def convert_container(
    input_path: Path,
    output_path: Path,
    is_cancelled: Callable[[], bool] | None = None,
    ffmpeg_path: Path | None = None,
) -> Path:
    """Convert media container format using stream copy where possible."""
    if not input_path.is_file():
        raise FileNotFoundError(f"Source media file not found: {input_path}")

    bin_path = ffmpeg_path or find_ffmpeg()
    if not bin_path:
        raise FFmpegNotFoundError("FFmpeg executable not found for format conversion.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    container = output_path.suffix.lstrip(".").lower()

    cmd = [
        str(bin_path),
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(input_path),
        "-c",
        "copy",
    ]
    if container == "mp4":
        cmd.extend(["-movflags", "+faststart"])
    cmd.append(str(output_path))

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    while proc.poll() is None:
        if is_cancelled and is_cancelled():
            proc.terminate()
            try:
                proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                proc.kill()
            if output_path.exists():
                output_path.unlink()
            raise DownloadCancelledError("Format conversion cancelled by user")
        time.sleep(0.1)

    _, stderr = proc.communicate()
    if proc.returncode != 0:
        if output_path.exists():
            try:
                output_path.unlink()
            except OSError:
                pass
        raise FormatConversionError(f"FFmpeg container conversion failed: {stderr.strip()}")

    return output_path


def extract_audio(
    input_path: Path,
    output_path: Path,
    audio_format: str = "mp3",
    bitrate: str = "192k",
    is_cancelled: Callable[[], bool] | None = None,
    ffmpeg_path: Path | None = None,
) -> Path:
    """Extract audio track from video file and encode to MP3/M4A/WAV."""
    if not input_path.is_file():
        raise FileNotFoundError(f"Source media file not found: {input_path}")

    bin_path = ffmpeg_path or find_ffmpeg()
    if not bin_path:
        raise FFmpegNotFoundError("FFmpeg executable not found for audio extraction.")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    codec = "libmp3lame" if audio_format.lower() == "mp3" else "aac"
    cmd = [
        str(bin_path),
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(input_path),
        "-vn",
        "-c:a",
        codec,
        "-b:a",
        bitrate,
        str(output_path),
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    while proc.poll() is None:
        if is_cancelled and is_cancelled():
            proc.terminate()
            try:
                proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                proc.kill()
            if output_path.exists():
                output_path.unlink()
            raise DownloadCancelledError("Audio extraction cancelled by user")
        time.sleep(0.1)

    _, stderr = proc.communicate()
    if proc.returncode != 0:
        if output_path.exists():
            try:
                output_path.unlink()
            except OSError:
                pass
        raise FormatConversionError(f"Audio extraction failed: {stderr.strip()}")

    return output_path
