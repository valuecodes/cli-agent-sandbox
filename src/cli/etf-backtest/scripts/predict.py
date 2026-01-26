#!/usr/bin/env python3
"""
12-Month ETF Return Prediction

Predicts cumulative returns for the next ~252 trading days (12 months)
from the most recent data point using a PyTorch MLP.

Outputs prediction with confidence intervals to tmp/etf-backtest/prediction.json.
"""

import json
import numpy as np
import pandas as pd
import torch
from pathlib import Path
from datetime import datetime

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
OUTPUT_PATH = Path(__file__).parent.parent.parent.parent.parent / "tmp" / "etf-backtest" / "prediction.json"

FORWARD_DAYS = 252  # ~12 months of trading days


# === FEATURE ENGINEERING ===
def build_prediction_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build feature matrix with 252-day forward return as target."""
    df = build_base_features(df)

    # Target: cumulative return over next 252 trading days
    df["target"] = df["price"].shift(-FORWARD_DAYS) / df["price"] - 1

    # Drop rows with NaN (keeps only rows where we have forward return data)
    df = df.dropna().reset_index(drop=True)

    return df


def get_latest_features(df_raw: pd.DataFrame, feature_cols: list[str]) -> tuple[np.ndarray, str]:
    """
    Get features for the most recent data point (for forward prediction).
    Uses raw data with base features, not the training df (which excludes recent rows).
    """
    df = build_base_features(df_raw)
    df = df.dropna(subset=feature_cols)

    if len(df) == 0:
        raise ValueError("No valid feature rows after processing")

    latest = df.iloc[-1]
    latest_date = latest["date"].strftime("%Y-%m-%d")
    features = latest[feature_cols].values.astype(np.float64)

    return features, latest_date


def estimate_uncertainty(model, X_test: np.ndarray, y_test: np.ndarray) -> float:
    """
    Estimate prediction uncertainty using test set residuals.
    Returns standard deviation of prediction errors for confidence intervals.
    """
    device = next(model.parameters()).device
    X_test_t = torch.tensor(X_test, dtype=torch.float32, device=device)

    model.eval()
    with torch.no_grad():
        preds = model(X_test_t).cpu().numpy()

    residuals = y_test - preds
    return float(residuals.std())


def compute_test_metrics(y_test: np.ndarray, predictions: np.ndarray) -> dict:
    """Compute R² and MSE on test set."""
    mse = float(np.mean((y_test - predictions) ** 2))
    ss_res = np.sum((y_test - predictions) ** 2)
    ss_tot = np.sum((y_test - y_test.mean()) ** 2)
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
    return {"mse": mse, "r2": r2}


def print_prediction(result: dict):
    """Print prediction in a readable format."""
    print("\n" + "=" * 50)
    print("12-MONTH RETURN PREDICTION")
    print("=" * 50)
    print(f"Prediction Date:    {result['prediction_date']}")
    print(f"Horizon:            {result['horizon_days']} trading days (~12 months)")
    print()
    print(f"Predicted Return:        {result['predicted_return_pct']:>+.1f}%")
    ci = result["confidence_interval_95"]
    print(f"95% Confidence:     {ci['low']:>+.1f}% to {ci['high']:>+.1f}%")
    print()
    print("Model Quality:")
    model_info = result["model_info"]
    print(f"  Test R²:          {model_info['test_r2']:.3f}")
    print(f"  Test MSE:         {model_info['test_mse']:.6f}")
    print(f"  Training samples: {model_info['train_samples']}")
    print()
    print("IMPORTANT CAVEATS:")
    for caveat in result["caveats"]:
        print(f"  - {caveat}")
    print("=" * 50)


# === MAIN ===
def main():
    print("Loading data...")
    df_raw = load_data(DATA_PATH)
    print(f"  Loaded {len(df_raw)} rows ({df_raw['date'].min()} to {df_raw['date'].max()})")

    print("Building features with 252-day forward target...")
    df = build_prediction_features(df_raw)
    print(f"  Features built, {len(df)} rows with valid forward returns")

    if len(df) < 100:
        print(f"WARNING: Only {len(df)} training samples. Need more historical data for reliable predictions.")

    print("Splitting data...")
    train, val, test = split_data(df)
    print(f"  Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")

    print("Standardizing features...")
    feature_cols = get_feature_cols()
    X_train, X_val, X_test, y_train, y_val, y_test, mean, std = standardize(
        train, val, test, feature_cols
    )
    print(f"  {len(feature_cols)} features: {feature_cols[:3]}...")

    print("Training model...")
    model = train_model(X_train, y_train, X_val, y_val)

    print("Evaluating on test set...")
    device = next(model.parameters()).device
    X_test_t = torch.tensor(X_test, dtype=torch.float32, device=device)
    model.eval()
    with torch.no_grad():
        test_predictions = model(X_test_t).cpu().numpy()

    test_metrics = compute_test_metrics(y_test, test_predictions)
    print(f"  Test R²: {test_metrics['r2']:.3f}, MSE: {test_metrics['mse']:.6f}")

    print("Estimating prediction uncertainty...")
    pred_std = estimate_uncertainty(model, X_test, y_test)
    print(f"  Prediction std: {pred_std:.4f} ({pred_std*100:.1f}%)")

    print("Getting latest features for forward prediction...")
    latest_features, latest_date = get_latest_features(df_raw, feature_cols)
    print(f"  Latest date: {latest_date}")

    # Standardize latest features using training statistics
    latest_features_std = (latest_features - mean) / std
    latest_features_t = torch.tensor(latest_features_std, dtype=torch.float32, device=device)

    print("Generating 12-month forward prediction...")
    model.eval()
    with torch.no_grad():
        prediction = model(latest_features_t).item()

    # Build result
    result = {
        "prediction_date": latest_date,
        "horizon_days": FORWARD_DAYS,
        "predicted_return_pct": round(prediction * 100, 2),
        "confidence_interval_95": {
            "low": round((prediction - 1.96 * pred_std) * 100, 2),
            "high": round((prediction + 1.96 * pred_std) * 100, 2),
        },
        "model_info": {
            "features": feature_cols,
            "train_samples": len(train),
            "val_samples": len(val),
            "test_samples": len(test),
            "test_mse": round(test_metrics["mse"], 6),
            "test_r2": round(test_metrics["r2"], 3),
        },
        "caveats": [
            "Prediction based on historical patterns only",
            "Confidence interval estimated from test set errors",
            "Past performance does not guarantee future results",
            "This is not financial advice",
        ],
        "generated_at": datetime.now().isoformat(),
    }

    # Write to output file
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\nPrediction saved to: {OUTPUT_PATH}")

    # Print human-readable summary
    print_prediction(result)


if __name__ == "__main__":
    main()
