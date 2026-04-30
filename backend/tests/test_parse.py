# test_parse.py — tests de parse_message_data en app.py
# Paso 1: función pura, sin DB ni red

import sys
import os

import pytest

# parse_message_data vive en app.py; lo importamos directamente.
# Añadimos el directorio backend al path para evitar ejecutar el módulo entero.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import parse_message_data


# ── Formatos CSV válidos (7 longitudes aceptadas) ───────────────────────────
# Cada tupla: (descripción, csv_string, longitud_esperada)

VALID_CSV_CASES = [
    (
        "9 campos",
        "23.4,65.2,1013.2,180,45,5.5,90,1,0",
        9,
    ),
    (
        "11 campos",
        "23.4,65.2,1013.2,180,45,5.5,90,1,0,100,3600",
        11,
    ),
    (
        "14 campos",
        "23.4,65.2,1013.2,180,45,5.5,90,1,0,100,3600,2.8,11.5,1",
        14,
    ),
    (
        "15 campos",
        "23.4,65.2,1013.2,180,45,5.5,90,1,0,100,3600,2.8,11.5,1,2",
        15,
    ),
    (
        "16 campos",
        "23.4,65.2,1013.2,180,45,5.5,90,1,0,100,3600,2.8,11.5,1,2,-68",
        16,
    ),
    (
        "17 campos",
        "23.4,65.2,1013.2,180,45,5.5,90,1,0,100,3600,2.8,11.5,1,2,-68,180000",
        17,
    ),
    (
        "18 campos",
        "23.4,65.2,1013.2,180,45,5.5,90,1,0,100,3600,2.8,11.5,1,2,-68,180000,0",
        18,
    ),
]


@pytest.mark.parametrize("description,csv,expected_len", VALID_CSV_CASES)
def test_valid_csv_returns_list_of_floats(description, csv, expected_len):
    result = parse_message_data(csv)
    assert result is not None, f"parse_message_data devolvió None para formato de {description}"
    assert isinstance(result, list)
    assert len(result) == expected_len


@pytest.mark.parametrize("description,csv,_", VALID_CSV_CASES)
def test_valid_csv_all_values_are_floats(description, csv, _):
    result = parse_message_data(csv)
    assert all(isinstance(v, float) for v in result), (
        f"No todos los valores son float para formato de {description}"
    )


@pytest.mark.parametrize("description,csv,_", VALID_CSV_CASES)
def test_valid_csv_with_leading_trailing_whitespace(description, csv, _):
    """Los mensajes del ESP32 pueden llegar con salto de línea al final."""
    result = parse_message_data("  " + csv + "\r\n")
    assert result is not None, f"Falló con espacios en formato {description}"


# ── Formatos inválidos ───────────────────────────────────────────────────────

@pytest.mark.parametrize("bad_csv", [
    "",                             # vacío
    "23.4,65.2",                    # demasiado corto (2 campos)
    ",".join(["1.0"] * 10),         # longitud 10 — no válida
    ",".join(["1.0"] * 13),         # longitud 13 — no válida
    ",".join(["1.0"] * 19),         # longitud 19 — demasiado largo
    "23.4,abc,1013.2,180,45,5.5,90,1,0",  # valor no numérico
    "23.4,,1013.2,180,45,5.5,90,1,0",     # campo vacío
])
def test_invalid_csv_returns_none(bad_csv):
    assert parse_message_data(bad_csv) is None


def test_non_numeric_field_returns_none():
    """Un campo con texto en medio de un CSV de longitud válida → None."""
    csv = "23.4,FALLO,1013.2,180,45,5.5,90,1,0"  # 9 campos pero con texto
    assert parse_message_data(csv) is None


def test_negative_values_are_accepted():
    """Valores negativos (e.g. RSSI, temperatura en invierno) son numéricos válidos."""
    csv = "−5.0,65.2,1013.2,180,45,5.5,90,1,0,100,3600,2.8,11.5,1,2,-68,180000"
    # el guion largo (−) no es ASCII, provoca ValueError → None
    # con guion ASCII normal el resultado debe ser una lista
    csv_ascii = "-5.0,65.2,1013.2,180,45,5.5,90,1,0,100,3600,2.8,11.5,1,2,-68,180000"
    result = parse_message_data(csv_ascii)
    assert result is not None
    assert result[0] == -5.0
    assert result[15] == -68.0


def test_float_values_preserved_precisely():
    """Los valores científicos pequeños deben mantenerse correctamente."""
    csv = "23.456,65.789,1013.25,180.0,45.1,5.55,90.0,1.0,0.0"
    result = parse_message_data(csv)
    assert result is not None
    assert result[0] == pytest.approx(23.456)
    assert result[1] == pytest.approx(65.789)
