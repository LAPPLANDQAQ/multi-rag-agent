from fastapi.testclient import TestClient

from app.main import app


def test_metrics_endpoint_returns_prometheus_text():
    client = TestClient(app)

    response = client.get("/metrics")

    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert "http_requests_total" in response.text


def test_metrics_endpoint_does_not_expose_query_values():
    client = TestClient(app)
    secret_value = "sk-test-secret-value"

    client.get(f"/api/v1/agentops/runs?token={secret_value}")
    client.get(f"/unmatched/{secret_value}")
    response = client.get("/metrics")

    assert secret_value not in response.text
