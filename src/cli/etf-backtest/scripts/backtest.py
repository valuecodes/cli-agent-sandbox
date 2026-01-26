#!/usr/bin/env python3
"""
Minimal Neural Network ETF Backtest

A self-contained backtest using a PyTorch MLP to predict next-day returns.
Designed to be readable and avoid common pitfalls:
  1. Lookahead bias: signal at t -> position at t+1
  2. Data leakage: standardize using train stats only
  3. Time series shuffling: chronological split, no random shuffle
"""

import numpy as np
import pandas as pd
import torch
from pathlib import Path

from shared import (
    load_data,
    build_base_features,
    get_feature_cols,
    split_data,
    standardize,
    train_model,
)

# === CONFIG ===
DATA_PATH = Path(__file__).parent.parent.parent.parent.parent / "tmp" / "etf-backtest" / "data.json"
COST_BPS = 5       # transaction cost in basis points


# === FEATURE ENGINEERING ===
def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build feature matrix with next-day return as target."""
    df = build_base_features(df)

    # Label: next-day return (shift -1)
    df["target"] = df["ret"].shift(-1)

    # Drop rows with NaN
    df = df.dropna().reset_index(drop=True)

    return df


# === BACKTEST ===
def backtest(test_df: pd.DataFrame, predictions: np.ndarray) -> pd.DataFrame:
    """
    Run backtest with 1-day lag and transaction costs.
    Signal at t -> position at t+1 (avoids lookahead).
    """
    df = test_df.copy()
    df["pred"] = predictions

    # Signal: pred > 0 -> want to be long
    df["signal"] = (df["pred"] > 0).astype(int)

    # Position: apply signal with 1-day lag (position at t+1)
    df["position"] = df["signal"].shift(1).fillna(0)

    # Strategy returns
    df["strat_ret"] = df["position"] * df["target"]

    # Transaction costs: cost when position changes
    df["trade"] = df["position"].diff().abs().fillna(0)
    df["cost"] = df["trade"] * (COST_BPS / 10000)
    df["strat_ret_net"] = df["strat_ret"] - df["cost"]

    # Equity curve (growth of $1)
    df["equity"] = (1 + df["strat_ret_net"]).cumprod()

    return df


# === METRICS ===
def compute_metrics(df: pd.DataFrame) -> dict:
    """Compute backtest performance metrics."""
    returns = df["strat_ret_net"].values
    equity = df["equity"].values

    # Total return
    total_return = equity[-1] / equity[0] - 1

    # CAGR (252 trading days)
    n_days = len(returns)
    years = n_days / 252
    cagr = (equity[-1] ** (1 / years)) - 1 if years > 0 else 0

    # Annualized volatility
    ann_vol = returns.std() * np.sqrt(252)

    # Sharpe ratio (risk-free = 0)
    sharpe = (returns.mean() * 252) / ann_vol if ann_vol > 0 else 0

    # Max drawdown
    peak = np.maximum.accumulate(equity)
    drawdown = (equity - peak) / peak
    max_dd = drawdown.min()

    # Calmar ratio
    calmar = cagr / abs(max_dd) if max_dd != 0 else 0

    return {
        "total_return": total_return,
        "cagr": cagr,
        "ann_volatility": ann_vol,
        "sharpe": sharpe,
        "max_drawdown": max_dd,
        "calmar": calmar,
    }


def print_metrics(metrics: dict):
    """Print metrics in a readable format."""
    print("\n" + "=" * 40)
    print("BACKTEST RESULTS")
    print("=" * 40)
    print(f"Total Return:      {metrics['total_return']:>10.2%}")
    print(f"CAGR:              {metrics['cagr']:>10.2%}")
    print(f"Ann. Volatility:   {metrics['ann_volatility']:>10.2%}")
    print(f"Sharpe Ratio:      {metrics['sharpe']:>10.2f}")
    print(f"Max Drawdown:      {metrics['max_drawdown']:>10.2%}")
    print(f"Calmar Ratio:      {metrics['calmar']:>10.2f}")
    print("=" * 40)


# === MAIN ===
def main():
    print("Loading data...")
    df = load_data(DATA_PATH)
    print(f"  Loaded {len(df)} rows ({df['date'].min()} to {df['date'].max()})")

    print("Building features...")
    df = build_features(df)
    print(f"  Features built, {len(df)} rows after dropping NaN")

    print("Splitting data...")
    train, val, test = split_data(df)
    print(f"  Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")

    print("Standardizing features...")
    feature_cols = get_feature_cols()
    X_train, X_val, X_test, y_train, y_val, y_test, _, _ = standardize(
        train, val, test, feature_cols
    )
    print(f"  {len(feature_cols)} features: {feature_cols[:3]}...")

    print("Training model...")
    model = train_model(X_train, y_train, X_val, y_val)

    print("Generating predictions on test set...")
    device = next(model.parameters()).device
    X_test_t = torch.tensor(X_test, dtype=torch.float32, device=device)
    model.eval()
    with torch.no_grad():
        predictions = model(X_test_t).cpu().numpy()

    print("Running backtest...")
    results = backtest(test, predictions)

    metrics = compute_metrics(results)
    print_metrics(metrics)

    # Print pitfall avoidance notes
    print("\nPITFALL AVOIDANCE:")
    print("  1. Lookahead: signal at t -> position at t+1")
    print("  2. Leakage: standardized with train mean/std only")
    print("  3. No shuffle: chronological train/val/test split")


if __name__ == "__main__":
    main()
