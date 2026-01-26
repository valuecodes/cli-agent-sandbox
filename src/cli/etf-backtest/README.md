# ETF Backtest

Iterative feature selection optimization agent for realistic 12-month ETF return predictions.

The agent selects price-only features, runs experiments, and optimizes for **prediction accuracy** (not trading performance). It uses non-overlapping evaluation windows for honest assessment.

## Requirements

- Python 3 with `numpy`, `pandas`, and `torch` installed (see repo README for setup)
- ETF data at `tmp/etf-backtest/data.json`

## Run

```bash
# Run optimization (default: 5 iterations max)
pnpm run:etf-backtest

# With options
pnpm run:etf-backtest --ticker=SPY --maxIterations=5 --seed=42 --verbose
```

## Arguments

| Argument          | Default | Description                     |
| ----------------- | ------- | ------------------------------- |
| `--ticker`        | `SPY`   | ETF ticker symbol               |
| `--maxIterations` | `5`     | Maximum optimization iterations |
| `--seed`          | `42`    | Random seed for reproducibility |
| `--verbose`       | `false` | Enable verbose logging          |

## Feature Menu

The agent selects 8-12 features from these categories:

| Category    | Features                                                 |
| ----------- | -------------------------------------------------------- |
| Momentum    | `mom_1m`, `mom_3m`, `mom_6m`, `mom_12m`                  |
| Trend       | `px_sma50`, `px_sma200`, `sma50_sma200`, `dist_52w_high` |
| Risk        | `vol_1m`, `vol_3m`, `vol_6m`, `dd_current`, `mdd_12m`    |
| Oscillators | `rsi_14`, `bb_width`                                     |

## How It Works

1. **Agent selects features** from the menu (starts with 8-12)
2. **Runs experiment** via `run_experiment.py` (backtest + prediction)
3. **Analyzes results**: R² (non-overlapping), direction accuracy, MAE
4. **Decides**: continue with tweaked features or stop
5. **Stops early** if no improvement for 2 iterations

## Metrics

### Prediction Accuracy (Primary - Optimization Target)

| Metric                               | Description                                        |
| ------------------------------------ | -------------------------------------------------- |
| `r2NonOverlapping`                 | R² on non-overlapping 12-month windows (honest)    |
| `directionAccuracyNonOverlapping` | Sign prediction accuracy on independent periods    |
| `mae`                                | Mean absolute error of 12-month return predictions |
| `calibrationRatio`                  | Predicted std / actual std (target: 0.8-1.2)       |

### Backtest Metrics (Informational Only)

| Metric         | Description                            |
| -------------- | -------------------------------------- |
| `sharpe`       | Sharpe ratio of daily trading strategy |
| `maxDrawdown` | Maximum peak-to-trough decline         |
| `cagr`         | Compound annual growth rate            |

### Why Non-Overlapping?

With 252-day (12-month) forward targets, consecutive data points overlap by 99.6%. This inflates apparent R² because the model sees nearly identical targets. Non-overlapping evaluation uses truly independent periods (~10 samples per decade) for realistic performance assessment.

## Output

```
============================================================
OPTIMIZATION COMPLETE
============================================================
Iterations: 3
Best iteration: 2
Stop reason: No improvement for 2 consecutive iterations

Best Feature Set:
  - mom_1m
  - mom_3m
  - vol_1m
  - px_sma50
  ...

Prediction Accuracy (Non-Overlapping - Honest Assessment):
  R²:                0.045
  Direction Accuracy: 60.0%
  Independent Samples: 10

Prediction Accuracy (Overlapping - Inflated):
  R²:                0.152
  Direction Accuracy: 58.5%
  MAE:               12.3%
  Calibration:       0.95

Backtest Metrics (Informational):
  Sharpe Ratio:   0.85
  Max Drawdown:   -18.5%
  CAGR:           12.3%

12-Month Prediction:
  Expected Return: 8.5%
  95% CI:          [-12.5%, 29.5%]

Uncertainty Details:
  Base Std:        8.2%
  Adjusted Std:    10.5%
  Extrapolation:   Yes (features outside training range)

Confidence: MODERATE
Note: Non-overlapping metrics use only 10 independent periods.
Past performance does not guarantee future results.
============================================================
```

## Scripts

| Script              | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `run_experiment.py` | Unified experiment runner (backtest + prediction) |
| `shared.py`         | Feature registry and model training utilities     |
| `backtest.py`       | Legacy: standalone backtest                       |
| `predict.py`        | Legacy: standalone prediction                     |

## Uncertainty Estimation

The 95% confidence interval uses adjusted uncertainty that accounts for:

1. **Base uncertainty**: Standard deviation of test set residuals
2. **Extrapolation penalty**: Increased when current features are >2 std from training mean
3. **Market floor**: Minimum 10% std (12-month returns are inherently uncertain)

## Pitfall Avoidance

- **Overlapping windows**: Evaluation uses non-overlapping periods for honest metrics
- **Lookahead**: Signal at t → position at t+1
- **Data leakage**: Standardize using train mean/std only
- **No shuffle**: Chronological train/val/test split
- **Extrapolation**: Confidence intervals widen when features are outside training range

## Data Format

Expects `tmp/etf-backtest/data.json`:

```json
{
  "series": [
    { "date": "YYYY-MM-DD", "value": { "raw": <cumulative_pct_return> } }
  ]
}
```
