"""
test_rows_to_dict.py — Tests de la función pura rows_to_dict en app.py.

Valida que los campos agrometeo (dew_point, heat_index, abs_humidity) se
serializan correctamente y devuelven None cuando el dato no está en DB.
No requiere infraestructura: sin DB, sin MQTT, sin Docker.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import rows_to_dict


# ── Fila mínima válida: todos los campos requeridos presentes ─────────────────

def _base_row(**overrides):
    """Devuelve un dict que simula una fila de home_weather_station."""
    row = {
        "timestamp": "2024-01-15T12:00:00",
        "temperature": 22.5,
        "temperature_barometer": 21.0,
        "humidity": 65.0,
        "pressure": 1013.0,
        "temperature_source": "HDC1080",
        "pressure_source": "BMP280",
        "bmp280_ok": True,
        "bmp280_temperature": 21.3,
        "bmp280_pressure": 1013.2,
        "windSpeed": 0.0,
        "windDirection": 0.0,
        "windSpeedFiltered": 0.0,
        "windDirectionFiltered": 0.0,
        "light": 500.0,
        "dht_temperature": None,
        "dht_humidity": None,
        "rssi": -65,
        "free_heap": 180000,
        "uptime_s": 3600,
        "relay_active": 0,
        "pipeline_pressure": 2.8,
        "pipeline_flow": 11.5,
        "soil_moisture": None,
        "dew_point": None,
        "heat_index": None,
        "abs_humidity": None,
    }
    row.update(overrides)
    return row


class TestRowsToDictAgrometeoFields:

    def test_dew_point_present_in_output_keys(self):
        result = rows_to_dict([_base_row()])
        assert "dew_point" in result

    def test_heat_index_present_in_output_keys(self):
        result = rows_to_dict([_base_row()])
        assert "heat_index" in result

    def test_abs_humidity_present_in_output_keys(self):
        result = rows_to_dict([_base_row()])
        assert "abs_humidity" in result

    def test_dew_point_serializes_value(self):
        result = rows_to_dict([_base_row(dew_point=14.3)])
        assert result["dew_point"] == [14.3]

    def test_heat_index_serializes_value(self):
        result = rows_to_dict([_base_row(heat_index=28.7)])
        assert result["heat_index"] == [28.7]

    def test_abs_humidity_serializes_value(self):
        result = rows_to_dict([_base_row(abs_humidity=11.2)])
        assert result["abs_humidity"] == [11.2]

    def test_dew_point_returns_none_when_null_in_db(self):
        result = rows_to_dict([_base_row(dew_point=None)])
        assert result["dew_point"] == [None]

    def test_heat_index_returns_none_when_null_in_db(self):
        result = rows_to_dict([_base_row(heat_index=None)])
        assert result["heat_index"] == [None]

    def test_abs_humidity_returns_none_when_null_in_db(self):
        result = rows_to_dict([_base_row(abs_humidity=None)])
        assert result["abs_humidity"] == [None]

    def test_empty_rows_returns_empty_lists_for_agrometeo_fields(self):
        result = rows_to_dict([])
        assert result["dew_point"] == []
        assert result["heat_index"] == []
        assert result["abs_humidity"] == []

    def test_multiple_rows_all_agrometeo_fields_serialized(self):
        rows = [
            _base_row(dew_point=10.0, heat_index=25.0, abs_humidity=9.5),
            _base_row(dew_point=11.5, heat_index=27.2, abs_humidity=10.1),
            _base_row(dew_point=None, heat_index=None, abs_humidity=None),
        ]
        result = rows_to_dict(rows)
        assert result["dew_point"]    == [10.0, 11.5, None]
        assert result["heat_index"]   == [25.0, 27.2, None]
        assert result["abs_humidity"] == [9.5, 10.1, None]

    def test_output_list_length_matches_input_rows(self):
        rows = [_base_row(dew_point=i * 1.0) for i in range(7)]
        result = rows_to_dict(rows)
        assert len(result["dew_point"]) == 7
        assert len(result["heat_index"]) == 7
        assert len(result["abs_humidity"]) == 7

    @pytest.mark.parametrize("field,value", [
        ("dew_point",    0.0),
        ("heat_index",   0.0),
        ("abs_humidity", 0.0),
    ])
    def test_zero_values_not_treated_as_null(self, field, value):
        result = rows_to_dict([_base_row(**{field: value})])
        assert result[field] == [0.0]
