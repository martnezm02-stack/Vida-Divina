import struct
import wave
from pathlib import Path

from app.services.audio_convert import wav_to_ogg_opus


def _make_silent_wav(path: Path, seconds: float = 0.2, sample_rate: int = 16000) -> None:
    n_samples = int(seconds * sample_rate)
    with wave.open(str(path), "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sample_rate)
        f.writeframes(struct.pack("<" + "h" * n_samples, *([0] * n_samples)))


def test_wav_to_ogg_opus_produces_valid_file(tmp_path):
    wav_path = tmp_path / "silence.wav"
    _make_silent_wav(wav_path)

    ogg_path = wav_to_ogg_opus(wav_path)

    assert ogg_path.exists()
    assert ogg_path.suffix == ".ogg"
    assert ogg_path.stat().st_size > 0
