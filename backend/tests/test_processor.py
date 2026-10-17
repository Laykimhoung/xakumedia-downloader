"""Unit tests for FFmpeg detection, media inspection, stream multiplexing, and format conversion."""

import subprocess
from pathlib import Path

import pytest

from xakumedia.exceptions.base import (
    DownloadCancelledError,
    StreamMergeError,
)
from xakumedia.processor.ffmpeg import (
    convert_container,
    find_ffmpeg,
    find_ffprobe,
    get_ffmpeg_info,
    get_ffmpeg_version,
    inspect_media,
    merge_video_audio,
)
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest


def test_ffmpeg_and_ffprobe_discovery():
    """Verify that FFmpeg and FFprobe binaries are found on the system."""
    ffmpeg_bin = find_ffmpeg()
    ffprobe_bin = find_ffprobe()

    assert ffmpeg_bin is not None, "FFmpeg binary should be detected on system PATH"
    assert ffmpeg_bin.exists()
    assert ffprobe_bin is not None, "FFprobe binary should be detected on system PATH"
    assert ffprobe_bin.exists()

    version = get_ffmpeg_version(ffmpeg_bin)
    assert version is not None
    assert len(version) > 0

    info = get_ffmpeg_info()
    assert info["installed"] is True
    assert info["version"] == version
    assert info["ffmpeg_path"] == str(ffmpeg_bin)
    assert info["ffprobe_path"] == str(ffprobe_bin)


def test_merge_video_audio_missing_inputs(tmp_path: Path):
    """Verify that FileNotFoundError is raised when input tracks do not exist."""
    fake_v = tmp_path / "non_existent_video.mp4"
    fake_a = tmp_path / "non_existent_audio.m4a"
    out = tmp_path / "out.mp4"

    with pytest.raises(FileNotFoundError):
        merge_video_audio(fake_v, fake_a, out)


def test_merge_video_audio_cancelled(tmp_path: Path):
    """Verify that cancellation immediately aborts processing and cleans up."""
    # Create empty dummy files
    v = tmp_path / "v.mp4"
    a = tmp_path / "a.m4a"
    v.write_bytes(b"dummy video data")
    a.write_bytes(b"dummy audio data")
    out = tmp_path / "cancelled_out.mp4"

    with pytest.raises((DownloadCancelledError, StreamMergeError)):
        merge_video_audio(v, a, out, is_cancelled=lambda: True)

    assert not out.exists()


def test_inspect_media_missing_file(tmp_path: Path):
    """Verify FileNotFoundError when inspecting missing file."""
    with pytest.raises(FileNotFoundError):
        inspect_media(tmp_path / "does_not_exist.mp4")


@pytest.fixture(scope="module")
def sample_media_tracks(tmp_path_factory) -> tuple[Path, Path]:
    """Generate synthetic 1-second video and audio test tracks using FFmpeg."""
    ffmpeg_bin = find_ffmpeg()
    if not ffmpeg_bin:
        pytest.skip("FFmpeg not available on system")

    temp_dir = tmp_path_factory.mktemp("ffmpeg_samples")
    video_path = temp_dir / "sample_video.mp4"
    audio_path = temp_dir / "sample_audio.m4a"

    # Generate 1s test video: 320x240, 10fps
    v_cmd = [
        str(ffmpeg_bin),
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=1:size=320x240:rate=10",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(video_path),
    ]
    subprocess.run(v_cmd, capture_output=True, check=True)

    # Generate 1s test audio: 1000Hz sine wave
    a_cmd = [
        str(ffmpeg_bin),
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=1000:duration=1",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        str(audio_path),
    ]
    subprocess.run(a_cmd, capture_output=True, check=True)

    return video_path, audio_path


def test_real_stream_merge_and_inspect(tmp_path: Path, sample_media_tracks):
    """Multiplex real synthetic video and audio tracks, then inspect the result with ffprobe."""
    video_path, audio_path = sample_media_tracks
    output_path = tmp_path / "merged_synthetic.mp4"

    result = merge_video_audio(
        video_path=video_path,
        audio_path=audio_path,
        output_path=output_path,
        output_container="mp4",
    )

    assert result.is_file()
    assert result.stat().st_size > 0

    # Inspect the merged output with ffprobe
    details = inspect_media(result)
    assert details["file_name"] == "merged_synthetic.mp4"
    assert details["duration_seconds"] is not None
    assert details["duration_seconds"] > 0.5
    assert details["video_stream"] is not None
    assert details["video_stream"]["width"] == 320
    assert details["video_stream"]["height"] == 240
    assert details["audio_stream"] is not None
    assert details["audio_stream"]["codec"] == "aac"


def test_real_container_conversion(tmp_path: Path, sample_media_tracks):
    """Test converting container format from mp4 to mkv using stream copy."""
    video_path, _ = sample_media_tracks
    converted_path = tmp_path / "converted.mkv"

    result = convert_container(video_path, converted_path)
    assert result.is_file()
    assert result.stat().st_size > 0

    details = inspect_media(result)
    assert "matroska" in details["format_name"]
    assert details["video_stream"]["width"] == 320


def test_dispatcher_ffmpeg_handlers():
    """Verify that FFmpeg RPC handlers in dispatcher return valid responses."""
    dispatcher = RpcDispatcher()

    # Test get_ffmpeg_info RPC
    req = JsonRpcRequest(id=1, method="get_ffmpeg_info", params={})
    resp = dispatcher.dispatch(req)
    assert resp.error is None
    assert resp.result["installed"] is True
    assert "ffmpeg_path" in resp.result
    assert "version" in resp.result
