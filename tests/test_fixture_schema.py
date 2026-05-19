import pytest

from app.agentops.eval import evaluate_offline_fixtures
from scripts.install_demo_fixture import validate_fixture


def test_valid_real_sse_fixture_passes(sample_real_sse_fixture):
    metadata = validate_fixture(sample_real_sse_fixture)

    assert metadata["source"] == "real_sse"


def test_fake_fixture_source_is_skipped():
    report = evaluate_offline_fixtures(
        [
            (
                "fake.json",
                {
                    "metadata": {"source": "synthetic", "event_count": 1},
                    "events": [{"data": {"type": "complete"}}],
                },
            )
        ],
        [],
    )

    assert report.summary.sample_size == 0
    assert report.skipped
    assert "metadata.source" in report.skipped[0].reason


def test_event_list_is_required():
    fixture = {"metadata": {"source": "real_sse", "event_count": 1}, "events": []}

    with pytest.raises(ValueError, match="events"):
        validate_fixture(fixture)


def test_event_count_must_be_positive(sample_real_sse_fixture):
    sample_real_sse_fixture["metadata"]["event_count"] = 0

    with pytest.raises(ValueError, match="greater than zero"):
        validate_fixture(sample_real_sse_fixture)
