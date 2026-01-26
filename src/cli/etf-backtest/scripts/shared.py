#!/usr/bin/env python3
"""
Shared utilities for ETF backtest and prediction scripts.

Contains common code for data loading, feature engineering, and model training.
"""

import json
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from pathlib import Path
from typing import Callable

# === CONFIG ===
TRAIN_RATIO = 0.70
VAL_RATIO = 0.15
# TEST_RATIO = 0.15 (implicit)

LAGS = 20          # number of lagged returns
MA_SHORT = 10      # short moving average window
MA_LONG = 50       # long moving average window
VOL_WINDOW = 20    # rolling volatility window

HIDDEN1 = 64
HIDDEN2 = 32
DROPOUT = 0.2
LR = 0.001
EPOCHS = 100
PATIENCE = 10      # early stopping patience
BATCH_SIZE = 32

FORWARD_DAYS = 252  # ~12 months for prediction target


# === DATA LOADING ===
def load_data(path: Path) -> pd.DataFrame:
    """Load JSON and convert to DataFrame with date and price."""
    with open(path) as f:
        data = json.load(f)

    series = data["series"]
    df = pd.DataFrame([
        {"date": item["date"], "cumret": item["value"]["raw"]}
        for item in series
    ])
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    # Convert cumulative % return to price (base=100)
    df["price"] = 100 * (1 + df["cumret"] / 100)
    return df


# === FEATURE ENGINEERING ===
def build_base_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build base features from price series.
    Does NOT set target - caller must add their own target column.
    """
    df = df.copy()

    # Daily returns
    df["ret"] = df["price"].pct_change()

    # Lagged returns: r(t-1), r(t-2), ..., r(t-LAGS)
    for i in range(1, LAGS + 1):
        df[f"ret_lag{i}"] = df["ret"].shift(i)

    # Moving average ratios
    df["ma_short"] = df["price"].rolling(MA_SHORT).mean()
    df["ma_long"] = df["price"].rolling(MA_LONG).mean()
    df["ma_ratio_short"] = df["price"] / df["ma_short"] - 1
    df["ma_ratio_long"] = df["price"] / df["ma_long"] - 1

    # Rolling volatility
    df["volatility"] = df["ret"].rolling(VOL_WINDOW).std()

    return df


def get_feature_cols() -> list[str]:
    """Return list of feature column names."""
    cols = [f"ret_lag{i}" for i in range(1, LAGS + 1)]
    cols += ["ma_ratio_short", "ma_ratio_long", "volatility"]
    return cols


# === TRAIN/VAL/TEST SPLIT ===
def split_data(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Chronological split into train/val/test."""
    n = len(df)
    train_end = int(n * TRAIN_RATIO)
    val_end = int(n * (TRAIN_RATIO + VAL_RATIO))

    train = df.iloc[:train_end].copy()
    val = df.iloc[train_end:val_end].copy()
    test = df.iloc[val_end:].copy()

    return train, val, test


def standardize(train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame,
                feature_cols: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray,
                                                   np.ndarray, np.ndarray, np.ndarray,
                                                   np.ndarray, np.ndarray]:
    """
    Standardize features using train mean/std only.
    Returns X_train, X_val, X_test, y_train, y_val, y_test, mean, std.
    """
    X_train = train[feature_cols].values
    X_val = val[feature_cols].values
    X_test = test[feature_cols].values

    y_train = train["target"].values
    y_val = val["target"].values
    y_test = test["target"].values

    # Compute mean/std from train only
    mean = X_train.mean(axis=0)
    std = X_train.std(axis=0)
    std[std == 0] = 1  # avoid division by zero

    X_train = (X_train - mean) / std
    X_val = (X_val - mean) / std
    X_test = (X_test - mean) / std

    return X_train, X_val, X_test, y_train, y_val, y_test, mean, std


# === MODEL ===
class MLP(nn.Module):
    """Simple MLP: Input -> 64 -> 32 -> 1"""
    def __init__(self, input_dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, HIDDEN1),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.Linear(HIDDEN1, HIDDEN2),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.Linear(HIDDEN2, 1)
        )

    def forward(self, x):
        return self.net(x).squeeze(-1)


def train_model(X_train: np.ndarray, y_train: np.ndarray,
                X_val: np.ndarray, y_val: np.ndarray) -> MLP:
    """Train MLP with early stopping."""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    X_train_t = torch.tensor(X_train, dtype=torch.float32, device=device)
    y_train_t = torch.tensor(y_train, dtype=torch.float32, device=device)
    X_val_t = torch.tensor(X_val, dtype=torch.float32, device=device)
    y_val_t = torch.tensor(y_val, dtype=torch.float32, device=device)

    model = MLP(X_train.shape[1]).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    criterion = nn.MSELoss()

    best_val_loss = float("inf")
    patience_counter = 0
    best_state = None

    n_batches = (len(X_train_t) + BATCH_SIZE - 1) // BATCH_SIZE

    for epoch in range(EPOCHS):
        model.train()
        indices = torch.randperm(len(X_train_t))

        for i in range(n_batches):
            batch_idx = indices[i*BATCH_SIZE : (i+1)*BATCH_SIZE]
            X_batch = X_train_t[batch_idx]
            y_batch = y_train_t[batch_idx]

            optimizer.zero_grad()
            pred = model(X_batch)
            loss = criterion(pred, y_batch)
            loss.backward()
            optimizer.step()

        # Validation
        model.eval()
        with torch.no_grad():
            val_pred = model(X_val_t)
            val_loss = criterion(val_pred, y_val_t).item()

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            best_state = model.state_dict()
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                print(f"Early stopping at epoch {epoch+1}")
                break

    if best_state:
        model.load_state_dict(best_state)

    return model


# === FEATURE REGISTRY ===
def compute_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Compute Relative Strength Index."""
    delta = prices.diff()
    gain = delta.where(delta > 0, 0.0).rolling(period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def compute_bb_width(prices: pd.Series, period: int = 20, num_std: float = 2) -> pd.Series:
    """Compute Bollinger Band width (normalized by middle band)."""
    sma = prices.rolling(period).mean()
    std = prices.rolling(period).std()
    upper = sma + num_std * std
    lower = sma - num_std * std
    return (upper - lower) / sma


def compute_rolling_mdd(df: pd.DataFrame, window: int) -> pd.Series:
    """Compute rolling maximum drawdown over a window."""
    def mdd_func(x):
        peak = np.maximum.accumulate(x)
        dd = (x - peak) / peak
        return dd.min()
    return df["price"].rolling(window).apply(mdd_func, raw=True)


# Feature registry: maps feature_id to a function that computes the feature
FEATURE_REGISTRY: dict[str, Callable[[pd.DataFrame], pd.Series]] = {
    # Momentum (returns over periods)
    "mom_1m": lambda df: df["price"].pct_change(21),
    "mom_3m": lambda df: df["price"].pct_change(63),
    "mom_6m": lambda df: df["price"].pct_change(126),
    "mom_12m": lambda df: df["price"].pct_change(252),

    # Trend (price vs moving averages)
    "px_sma50": lambda df: df["price"] / df["price"].rolling(50).mean() - 1,
    "px_sma200": lambda df: df["price"] / df["price"].rolling(200).mean() - 1,
    "sma50_sma200": lambda df: df["price"].rolling(50).mean() / df["price"].rolling(200).mean() - 1,
    "dist_52w_high": lambda df: df["price"] / df["price"].rolling(252).max() - 1,

    # Risk (volatility and drawdown)
    "vol_1m": lambda df: df["price"].pct_change().rolling(21).std(),
    "vol_3m": lambda df: df["price"].pct_change().rolling(63).std(),
    "vol_6m": lambda df: df["price"].pct_change().rolling(126).std(),
    "dd_current": lambda df: df["price"] / df["price"].cummax() - 1,
    "mdd_12m": lambda df: compute_rolling_mdd(df, 252),

    # Oscillators
    "rsi_14": lambda df: compute_rsi(df["price"], 14),
    "bb_width": lambda df: compute_bb_width(df["price"], 20, 2),
}

ALL_FEATURE_IDS = list(FEATURE_REGISTRY.keys())


def build_selected_features(df: pd.DataFrame, feature_ids: list[str]) -> pd.DataFrame:
    """
    Build only the selected features from the registry.
    Returns DataFrame with price, date, and selected feature columns.
    """
    df = df.copy()

    # Validate feature_ids
    invalid = [f for f in feature_ids if f not in FEATURE_REGISTRY]
    if invalid:
        raise ValueError(f"Unknown feature_ids: {invalid}")

    # Compute each selected feature
    for feature_id in feature_ids:
        df[feature_id] = FEATURE_REGISTRY[feature_id](df)

    return df


def add_forward_target(df: pd.DataFrame, forward_days: int = FORWARD_DAYS) -> pd.DataFrame:
    """Add forward return target for prediction."""
    df = df.copy()
    df["target"] = df["price"].shift(-forward_days) / df["price"] - 1
    return df
