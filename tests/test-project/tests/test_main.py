"""Tests for core functionality."""

import pytest
from src.main import greet, process_data


def test_greet():
    result = greet("Test")
    assert "Test" in result
    assert "Hello" in result


def test_greet_default():
    result = greet("World")
    assert "World" in result


def test_process_data():
    data = ["item1", "item2", "item3"]
    result = process_data(data)
    
    assert result["count"] == 3
    assert result["items"] == data
    assert result["processed"] is True


def test_process_data_empty():
    result = process_data([])
    assert result["count"] == 0
    assert result["items"] == []
