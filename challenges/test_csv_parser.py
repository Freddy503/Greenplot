"""Tests for CSV parser fix."""

import sys
sys.path.insert(0, ".")
from csv_parser import parse_csv_line, parse_csv_content


def test_normal_line():
    assert parse_csv_line("a,b,c") == ["a", "b", "c"]


def test_quoted_commas():
    assert parse_csv_line('"hello, world",b') == ["hello, world", "b"]


def test_trailing_newline():
    content = "a,b\nc,d\ne,f\n"
    result = parse_csv_content(content)
    assert len(result) == 3


def test_empty_file():
    assert parse_csv_content("") == []


def test_single_row_no_newline():
    content = "x,y,z"
    result = parse_csv_content(content)
    assert len(result) == 1


def test_multiple_trailing_newlines():
    content = "a,b\nc,d\n\n\n"
    result = parse_csv_content(content)
    assert len(result) == 2
