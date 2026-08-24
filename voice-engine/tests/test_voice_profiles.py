import pytest

from app.models import voice_profiles


def test_manuel_es_mx_profile_exists():
    assert voice_profiles.profile_exists("manuel_es_mx") is True


def test_manuel_es_mx_resolves_to_reference_mono():
    profile = voice_profiles.get_profile("manuel_es_mx")

    assert profile.reference_path.exists()
    assert profile.reference_path.name == "reference.wav"

    reference_mono = profile.reference_path.parent.parent.parent / "voice-reference" / "reference-mono.wav"
    assert reference_mono.exists()
    # El perfil es una copia dedicada de reference-mono.wav -- mismo contenido,
    # archivo fisico distinto (no depende de la carpeta de pruebas exploratorias).
    assert profile.reference_path.stat().st_size == reference_mono.stat().st_size


def test_manuel_es_mx_metadata():
    profile = voice_profiles.get_profile("manuel_es_mx")
    public = profile.public_dict()

    assert public["voice_profile_id"] == "manuel_es_mx"
    assert public["owner"] == "Manuel"
    assert public["language"] == "es-MX"
    assert public["identity"] == "authentic_user_voice"
    assert public["style"] == "neutral"
    assert public["status"] == "active"
    # La ruta fisica nunca debe estar en la representacion publica.
    assert "reference_path" not in public
    assert not any("wav" in str(v).lower() for v in public.values() if v)


def test_nonexistent_profile_raises_controlled_error():
    with pytest.raises(voice_profiles.ProfileNotFoundError):
        voice_profiles.get_profile("no_existe_este_perfil")


def test_path_traversal_attempt_is_rejected():
    with pytest.raises(voice_profiles.ProfileNotFoundError):
        voice_profiles.get_profile("../../../../etc/passwd")

    with pytest.raises(voice_profiles.ProfileNotFoundError):
        voice_profiles.get_profile("manuel_es_mx/../../../etc/passwd")
