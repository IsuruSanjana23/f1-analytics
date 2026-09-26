import math

import pandas as pd


def is_missing(value):
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def value_or_none(value):
    if is_missing(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def seconds_or_none(value):
    if is_missing(value):
        return None
    if hasattr(value, "total_seconds"):
        return round(value.total_seconds(), 3)
    return round(float(value), 3)


def rounded_or_none(value, places=3):
    if is_missing(value):
        return None
    return round(float(value), places)

