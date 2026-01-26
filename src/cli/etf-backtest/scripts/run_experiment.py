#!/usr/bin/env python3
"""
Single Experiment Runner for ETF Feature Selection

Combines backtest and prediction into one script.
Accepts input via stdin JSON, outputs results as JSON to stdout.

Input format:
{
    "ticker": "SPY",
    "featureIds": ["mom_1m", "mom_3m", "vol_1m", "px_sma50"],
    "seed": 42
}

Output format:
{
    "featureIds": [...],
    "metrics": { "sharpe": ..., "maxDrawdown": ..., "r2": ..., "mse": ..., "cagr": ... },
    "prediction": { "pred12mReturn": ..., "ci95Low": ..., "ci95High": ... }
}
"""

import json
import sys
import numpy as np
import pandas as pd
import torch
from pathlib import Path

from shared import (
    load_data,
    build_selected_features,
    add_forward_target,
    split_data,
    train_model,
    FORWARD_DAYS,
    ALL_FEATURE_IDS,
)

# === CONFIG ===
DATA_PATH = Path(__file__).parent.parent.parent.parent.parent / "tmp" / "etf-backtest" / "data.json"
COST_BPS = 5  # transaction cost in basis points


def set_seed(seed: int):
    """Set random seeds for reproducibility."""
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def standardize(
    train: pd.DataFrame,
    val: pd.DataFrame,
    test: pd.DataFrame,
    feature_cols: list[str],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Standardize features using train mean/std only."""
    X_train = train[feature_cols].values
    X_val = val[feature_cols].values
    X_test = test[feature_cols].values

    y_train = train["target"].values
    y_val = val["target"].values
    y_test = test["target"].values

    mean = X_train.mean(axis=0)
    std = X_train.std(axis=0)
    std[std == 0] = 1

    X_train = (X_train - mean) / std
    X_val = (X_val - mean) / std
    X_test = (X_test - mean) / std

    return X_train, X_val, X_test, y_train, y_val, y_test, mean, std


def run_backtest(test_df: pd.DataFrame, predictions: np.ndarray) -> dict:
    """Run backtest and compute metrics."""
    df = test_df.copy()
    df["pred"] = predictions

    # Signal: pred > 0 -> long
    df["signal"] = (df["pred"] > 0).astype(int)

    # Position with 1-day lag (avoids lookahead)
    df["position"] = df["signal"].shift(1).fillna(0)

    # Need daily returns for backtest
    df["daily_ret"] = df["price"].pct_change()

    # Strategy returns
    df["strat_ret"] = df["position"] * df["daily_ret"]

    # Transaction costs
    df["trade"] = df["position"].diff().abs().fillna(0)
    df["cost"] = df["trade"] * (COST_BPS / 10000)
    df["strat_ret_net"] = df["strat_ret"] - df["cost"]

    # Equity curve
    df["equity"] = (1 + df["strat_ret_net"]).cumprod()

    # Metrics
    returns = df["strat_ret_net"].dropna().values
    equity = df["equity"].dropna().values

    if len(equity) < 2:
        return {"sharpe": 0, "maxDrawdown": 0, "cagr": 0, "totalReturn": 0}

    total_return = equity[-1] / equity[0] - 1
    n_days = len(returns)
    years = n_days / 252
    cagr = (equity[-1] ** (1 / years)) - 1 if years > 0 else 0

    ann_vol = returns.std() * np.sqrt(252)
    sharpe = (returns.mean() * 252) / ann_vol if ann_vol > 0 else 0

    peak = np.maximum.accumulate(equity)
    drawdown = (equity - peak) / peak
    max_dd = drawdown.min()

    return {
        "sharpe": float(sharpe),
        "maxDrawdown": float(max_dd),
        "cagr": float(cagr),
        "totalReturn": float(total_return),
    }


def compute_prediction(
    model,
    df_raw: pd.DataFrame,
    feature_ids: list[str],
    mean: np.ndarray,
    std: np.ndarray,
    uncertainty: dict,
) -> dict:
    """Generate 12-month forward prediction with adjusted confidence interval."""
    device = next(model.parameters()).device

    # Build features for latest data point
    df = build_selected_features(df_raw, feature_ids)
    df = df.dropna(subset=feature_ids)

    if len(df) == 0:
        raise ValueError("No valid feature rows for prediction")

    latest = df.iloc[-1]
    features = latest[feature_ids].values.astype(np.float64)

    # Standardize using training statistics
    features_std = (features - mean) / std
    features_t = torch.tensor(features_std, dtype=torch.float32, device=device)

    model.eval()
    with torch.no_grad():
        prediction = model(features_t).item()

    # Use adjusted std for more realistic confidence intervals
    adjusted_std = uncertainty["adjustedStd"]

    return {
        "pred12mReturn": float(prediction),
        "ci95Low": float(prediction - 1.96 * adjusted_std),
        "ci95High": float(prediction + 1.96 * adjusted_std),
        "uncertainty": uncertainty,
    }


def compute_test_metrics(y_test: np.ndarray, predictions: np.ndarray) -> dict:
    """Compute R² and MSE on test set."""
    mse = float(np.mean((y_test - predictions) ** 2))
    ss_res = np.sum((y_test - predictions) ** 2)
    ss_tot = np.sum((y_test - y_test.mean()) ** 2)
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
    return {"r2": r2, "mse": mse}


def compute_prediction_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """Metrics focused on 12-month prediction quality."""
    direction_accuracy = float(np.mean((y_true > 0) == (y_pred > 0)))
    mae = float(np.mean(np.abs(y_true - y_pred)))
    pred_std = y_pred.std()
    true_std = y_true.std()
    calibration_ratio = float(pred_std / true_std) if true_std > 0 else 0.0
    return {
        "directionAccuracy": direction_accuracy,
        "mae": mae,
        "calibrationRatio": calibration_ratio,
    }


def compute_non_overlapping_metrics(
    y_true: np.ndarray, y_pred: np.ndarray, forward_days: int = FORWARD_DAYS
) -> dict:
    """Evaluate on non-overlapping windows for honest assessment."""
    n = len(y_true)
    indices = list(range(0, n, forward_days))
    if len(indices) < 2:
        return {
            "r2NonOverlapping": 0.0,
            "directionAccuracyNonOverlapping": 0.0,
            "nonOverlappingSamples": len(indices),
        }

    y_true_no = y_true[indices]
    y_pred_no = y_pred[indices]

    # R² on non-overlapping samples
    ss_res = np.sum((y_true_no - y_pred_no) ** 2)
    ss_tot = np.sum((y_true_no - y_true_no.mean()) ** 2)
    r2_no = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0

    # Direction accuracy on non-overlapping samples
    dir_acc_no = float(np.mean((y_true_no > 0) == (y_pred_no > 0)))

    return {
        "r2NonOverlapping": r2_no,
        "directionAccuracyNonOverlapping": dir_acc_no,
        "nonOverlappingSamples": len(indices),
    }


def compute_uncertainty_adjusted(
    test_preds: np.ndarray,
    y_test: np.ndarray,
    latest_features: np.ndarray,
    train_mean: np.ndarray,
    train_std: np.ndarray,
) -> dict:
    """Uncertainty with extrapolation penalty and market floor."""
    residuals = y_test - test_preds
    base_std = float(residuals.std())

    # Extrapolation penalty if features are outside training distribution
    z_scores = np.abs((latest_features - train_mean) / train_std)
    max_z = float(z_scores.max())
    extrapolation_mult = 1.0 + 0.1 * max(0, max_z - 2)

    # Market floor: 12-month returns are inherently uncertain (~10% minimum)
    MARKET_FLOOR = 0.10
    adjusted_std = max(base_std * extrapolation_mult, MARKET_FLOOR)

    return {
        "baseStd": base_std,
        "adjustedStd": float(adjusted_std),
        "extrapolationMultiplier": float(extrapolation_mult),
        "isExtrapolating": bool(max_z > 2),
    }


def run_experiment(ticker: str, feature_ids: list[str], seed: int) -> dict:
    """Run a single experiment with given features."""
    set_seed(seed)

    # Load data
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Data file not found: {DATA_PATH}")

    df_raw = load_data(DATA_PATH)

    # Build features and add forward target
    df = build_selected_features(df_raw, feature_ids)
    df = add_forward_target(df, FORWARD_DAYS)

    # Drop NaN rows
    df = df.dropna(subset=feature_ids + ["target"]).reset_index(drop=True)

    if len(df) < 100:
        raise ValueError(f"Insufficient data: only {len(df)} valid rows")

    # Split data
    train, val, test = split_data(df)

    # Standardize
    X_train, X_val, X_test, y_train, y_val, y_test, mean, std = standardize(
        train, val, test, feature_ids
    )

    # Train model
    model = train_model(X_train, y_train, X_val, y_val)

    # Get test predictions
    device = next(model.parameters()).device
    X_test_t = torch.tensor(X_test, dtype=torch.float32, device=device)
    model.eval()
    with torch.no_grad():
        test_preds = model(X_test_t).cpu().numpy()

    # Compute model metrics (overlapping)
    model_metrics = compute_test_metrics(y_test, test_preds)
    prediction_metrics = compute_prediction_metrics(y_test, test_preds)

    # Compute non-overlapping metrics for honest assessment
    non_overlap_metrics = compute_non_overlapping_metrics(y_test, test_preds, FORWARD_DAYS)

    # Build features for latest data point to compute uncertainty
    df_latest = build_selected_features(df_raw, feature_ids)
    df_latest = df_latest.dropna(subset=feature_ids)
    latest_features = df_latest.iloc[-1][feature_ids].values.astype(np.float64)

    # Compute adjusted uncertainty
    uncertainty = compute_uncertainty_adjusted(test_preds, y_test, latest_features, mean, std)

    # Run backtest on test set (informational only)
    backtest_metrics = run_backtest(test, test_preds)

    # Generate forward prediction with adjusted uncertainty
    prediction = compute_prediction(model, df_raw, feature_ids, mean, std, uncertainty)

    return {
        "featureIds": feature_ids,
        "metrics": {
            # Backtest metrics (informational, not optimization target)
            "sharpe": backtest_metrics["sharpe"],
            "maxDrawdown": backtest_metrics["maxDrawdown"],
            "cagr": backtest_metrics["cagr"],
            # Prediction metrics (overlapping)
            "r2": model_metrics["r2"],
            "mse": model_metrics["mse"],
            "directionAccuracy": prediction_metrics["directionAccuracy"],
            "mae": prediction_metrics["mae"],
            "calibrationRatio": prediction_metrics["calibrationRatio"],
            # Non-overlapping metrics (honest assessment)
            "r2NonOverlapping": non_overlap_metrics["r2NonOverlapping"],
            "directionAccuracyNonOverlapping": non_overlap_metrics["directionAccuracyNonOverlapping"],
        },
        "prediction": prediction,
        "modelInfo": {
            "trainSamples": len(train),
            "valSamples": len(val),
            "testSamples": len(test),
        },
        "dataInfo": {
            "totalSamples": len(df),
            "nonOverlappingSamples": non_overlap_metrics["nonOverlappingSamples"],
            "effectiveIndependentPeriods": non_overlap_metrics["nonOverlappingSamples"],
        },
    }


def main():
    # Read input from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}), file=sys.stdout)
        sys.exit(1)

    ticker = input_data.get("ticker", "SPY")
    feature_ids = input_data.get("featureIds")
    if feature_ids is None:
        feature_ids = input_data.get("feature_ids", [])
    seed = input_data.get("seed", 42)

    # Validate featureIds
    if not feature_ids:
        print(json.dumps({"error": "featureIds is required and must not be empty"}), file=sys.stdout)
        sys.exit(1)

    invalid = [f for f in feature_ids if f not in ALL_FEATURE_IDS]
    if invalid:
        print(json.dumps({
            "error": f"Unknown featureIds: {invalid}",
            "validFeatures": ALL_FEATURE_IDS,
        }), file=sys.stdout)
        sys.exit(1)

    try:
        result = run_experiment(ticker, feature_ids, seed)
        print(json.dumps(result, indent=2), file=sys.stdout)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
